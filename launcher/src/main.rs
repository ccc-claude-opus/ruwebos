//! ruwebos launcher (`cargo install ruvm ruwebos`): downloads the system image of this version from the
//! GitHub Release, boots it in ruvm (or QEMU) and opens a browser on the home screen. Quitting the browser,
//! or Ctrl-C, powers the system off. The data disk (your files, apps and settings) stays in the data folder
//! across versions.
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, ExitCode, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

const VERSION: &str = env!("CARGO_PKG_VERSION");
const RELEASES: &str = "https://github.com/ccc-claude-opus/ruwebos/releases/download";
const PORT: u16 = 8700;
const USAGE: &str = "usage: ruwebos [options] [url]
  boots ruwebos in ruvm and opens a browser on its home screen (http://localhost:8700/);
  quitting the browser (or Ctrl-C) powers it off
  --headless          keep running until Ctrl-C; use any browser on http://localhost:8700/
  --screenshot FILE   render the home screen to a PNG (Chrome, Firefox or rubrowser), then power off
  --browser NAME      chrome (default when installed), firefox, safari, rubrowser, or a command given the URL
  --keyboard MODE     rubrowser's on-screen keyboard: auto, always, never
  --memory MB         the VM's memory (default 2048)
  --accel NAME        hvf, kvm or tcg (default: hvf on macOS/arm64, kvm on Linux/aarch64, else tcg)
  --qemu              boot in QEMU (qemu-system-aarch64) instead of ruvm
  --data-size SIZE    size of a new data disk, e.g. 2g (default 1g)
  --where             print the data folder and exit
environment: RUWEBOS_HOME (data folder), RUVM_BIN, QEMU, RUBROWSER_BIN, RUWEBOS_ASSETS (a folder or URL
with the release files, instead of the GitHub Release)";

/// The files of a release; the system disk is zstd-compressed
const ASSETS: &[&str] = &["linux", "initramfs.cpio.gz", "system.ext4.zst"];

struct Opts {
    mode: Mode,
    browser: Option<String>,
    keyboard: String,
    memory: u32,
    accel: Option<String>,
    qemu: bool,
    data_size: u64,
    url: String,
}

#[derive(PartialEq)]
enum Mode {
    Window,
    Headless,
    Screenshot(PathBuf),
}

fn die(msg: impl std::fmt::Display) -> ! {
    eprintln!("ruwebos: {msg}");
    std::process::exit(1)
}

fn parse_size(s: &str) -> Option<u64> {
    let s = s.trim().to_ascii_lowercase();
    let (num, mult) = match s.chars().last()? {
        'k' => (&s[..s.len() - 1], 1u64 << 10),
        'm' => (&s[..s.len() - 1], 1 << 20),
        'g' => (&s[..s.len() - 1], 1 << 30),
        _ => (&s[..], 1),
    };
    num.parse::<u64>().ok().map(|n| n * mult)
}

fn parse_args() -> Opts {
    let mut o = Opts {
        mode: Mode::Window,
        browser: None,
        keyboard: "auto".into(),
        memory: 2048,
        accel: None,
        qemu: false,
        data_size: 1 << 30,
        url: format!("http://localhost:{PORT}/"),
    };
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        let mut value = |name: &str| args.next().unwrap_or_else(|| die(format!("{name} needs a value")));
        match a.as_str() {
            "--headless" => o.mode = Mode::Headless,
            "--screenshot" => o.mode = Mode::Screenshot(PathBuf::from(value("--screenshot"))),
            "--browser" => o.browser = Some(value("--browser")),
            "--keyboard" => o.keyboard = value("--keyboard"),
            "--memory" => o.memory = value("--memory").parse().unwrap_or_else(|_| die("--memory takes megabytes, e.g. 8192")),
            "--accel" | "-accel" => o.accel = Some(value("--accel")),
            "--qemu" => o.qemu = true,
            "--data-size" => o.data_size = parse_size(&value("--data-size")).unwrap_or_else(|| die("--data-size takes a size like 2g")),
            "--where" => {
                println!("{}", home().display());
                std::process::exit(0);
            }
            "-V" | "--version" => {
                println!("ruwebos {VERSION}");
                std::process::exit(0);
            }
            "-h" | "--help" => {
                println!("{USAGE}");
                std::process::exit(0);
            }
            _ if a.starts_with('-') => die(format!("unknown option {a} (--help)")),
            _ => o.url = a,
        }
    }
    o
}

/// The data folder: RUWEBOS_HOME, else the platform's place for application data
fn home() -> PathBuf {
    if let Some(h) = std::env::var_os("RUWEBOS_HOME") {
        return PathBuf::from(h);
    }
    let user = PathBuf::from(std::env::var_os("HOME").unwrap_or_else(|| die("HOME is not set (or set RUWEBOS_HOME)")));
    if cfg!(target_os = "macos") {
        user.join("Library/Application Support/ruwebos")
    } else if let Some(x) = std::env::var_os("XDG_DATA_HOME") {
        PathBuf::from(x).join("ruwebos")
    } else {
        user.join(".local/share/ruwebos")
    }
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|p| std::env::split_paths(&p).map(|d| d.join(name)).find(|p| p.is_file()))
}

// ---------- the release files ----------

fn fetch(source: &str, name: &str) -> Result<Box<dyn Read>, String> {
    if source.starts_with("http://") || source.starts_with("https://") {
        let url = format!("{}/{name}", source.trim_end_matches('/'));
        let resp = ureq::get(&url).call().map_err(|e| format!("{url}: {e}"))?;
        Ok(Box::new(resp.into_body().into_reader()))
    } else {
        let path = Path::new(source).join(name);
        Ok(Box::new(File::open(&path).map_err(|e| format!("{}: {e}", path.display()))?))
    }
}

/// Downloads (once) and checks the files of this version into <home>/<version>/
fn assets(home: &Path) -> PathBuf {
    let dir = home.join(VERSION);
    let source = std::env::var("RUWEBOS_ASSETS").unwrap_or_else(|_| format!("{RELEASES}/v{VERSION}"));
    if dir.join("system.ext4").is_file() && dir.join("linux").is_file() && dir.join("initramfs.cpio.gz").is_file() {
        return dir;
    }
    fs::create_dir_all(&dir).unwrap_or_else(|e| die(format!("{}: {e}", dir.display())));
    let mut sums = String::new();
    fetch(&source, "SHA256SUMS")
        .and_then(|mut r| r.read_to_string(&mut sums).map_err(|e| e.to_string()))
        .unwrap_or_else(|e| die(format!("cannot get the list of release files ({e})")));
    let expected = |name: &str| {
        sums.lines()
            .find_map(|l| l.split_once(char::is_whitespace).filter(|(_, n)| n.trim().trim_start_matches('*') == name).map(|(h, _)| h.to_string()))
            .unwrap_or_else(|| die(format!("SHA256SUMS has no {name}")))
    };
    for name in ASSETS {
        let want = expected(name);
        let out = dir.join(name.trim_end_matches(".zst"));
        println!("ruwebos: downloading {name} (once, for ruwebos {VERSION})");
        let mut reader = fetch(&source, name).unwrap_or_else(|e| die(e));
        let part = out.with_extension("part");
        let mut file = File::create(&part).unwrap_or_else(|e| die(format!("{}: {e}", part.display())));
        // hash the file as downloaded; a .zst is unpacked as it streams in
        let mut hasher = Sha256::new();
        let mut hashing = HashingReader { inner: &mut reader, hasher: &mut hasher, bytes: 0, shown: 0 };
        let copied = if name.ends_with(".zst") {
            let mut dec = ruzstd::decoding::StreamingDecoder::new(&mut hashing).unwrap_or_else(|e| die(format!("{name}: {e}")));
            std::io::copy(&mut dec, &mut file)
        } else {
            std::io::copy(&mut hashing, &mut file)
        };
        copied.unwrap_or_else(|e| die(format!("{name}: {e}")));
        let got = format!("{:x}", hasher.finalize());
        if got != want {
            let _ = fs::remove_file(&part);
            die(format!("{name} does not match SHA256SUMS (got {got})"));
        }
        fs::rename(&part, &out).unwrap_or_else(|e| die(e));
    }
    dir
}

struct HashingReader<'a> {
    inner: &'a mut Box<dyn Read>,
    hasher: &'a mut Sha256,
    bytes: u64,
    shown: u64,
}

impl Read for HashingReader<'_> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.hasher.update(&buf[..n]);
        self.bytes += n as u64;
        if self.bytes - self.shown >= 20 << 20 {
            self.shown = self.bytes;
            println!("ruwebos:   {} MB", self.bytes >> 20);
        }
        Ok(n)
    }
}

// ---------- the VM ----------

/// ruvm with the Hypervisor.framework entitlement on macOS (needed for -accel hvf): a copy in the data
/// folder is signed ad hoc when the installed one is not
fn ruvm(home: &Path, hvf: bool) -> PathBuf {
    let bin = std::env::var_os("RUVM_BIN").map(PathBuf::from).or_else(|| find_on_path("ruvm")).unwrap_or_else(|| {
        die("ruvm not found: cargo install ruvm (or set RUVM_BIN)")
    });
    if !(cfg!(target_os = "macos") && hvf) {
        return bin;
    }
    let signed = |b: &Path| {
        Command::new("codesign")
            .args(["-d", "--entitlements", "-", "--xml"])
            .arg(b)
            .output()
            .is_ok_and(|o| String::from_utf8_lossy(&o.stdout).contains("com.apple.security.hypervisor"))
    };
    if signed(&bin) {
        return bin;
    }
    let copy = home.join("bin/ruvm");
    let fresh = fs::metadata(&copy).and_then(|c| Ok(c.modified()? >= fs::metadata(&bin)?.modified()?)).unwrap_or(false);
    if fresh && signed(&copy) {
        return copy;
    }
    let _ = fs::create_dir_all(home.join("bin"));
    let ent = home.join("bin/hvf.entitlements");
    let _ = fs::write(
        &ent,
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>com.apple.security.hypervisor</key><true/></dict></plist>
"#,
    );
    let ok = fs::copy(&bin, &copy).is_ok()
        && Command::new("codesign").args(["--sign", "-", "--force", "--entitlements"]).arg(&ent).arg(&copy).status().is_ok_and(|s| s.success());
    if ok {
        println!("ruwebos: signed a copy of ruvm for -accel hvf ({})", copy.display());
        copy
    } else {
        eprintln!("ruwebos: could not sign ruvm for -accel hvf; it will fall back to -accel tcg (slow)");
        bin
    }
}

struct Vm {
    child: Child,
    console: Option<ChildStdin>,
    log: PathBuf,
}

impl Vm {
    fn poweroff(&mut self) {
        if let Some(mut c) = self.console.take() {
            let _ = c.write_all(b"poweroff\n");
        }
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(10) {
            if let Ok(Some(_)) = self.child.try_wait() {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
        let log = fs::read_to_string(&self.log).unwrap_or_default();
        match log.lines().find(|l| l.contains("powered off")) {
            Some(l) => println!("{l}"),
            None => println!("ruwebos: stopped"),
        }
    }
}

fn http_ok() -> bool {
    let Ok(mut s) = TcpStream::connect_timeout(&([127, 0, 0, 1], PORT).into(), Duration::from_secs(2)) else { return false };
    let _ = s.set_read_timeout(Some(Duration::from_secs(5)));
    if s.write_all(b"GET / HTTP/1.0\r\nHost: localhost\r\n\r\n").is_err() {
        return false;
    }
    let mut buf = [0u8; 12];
    s.read(&mut buf).is_ok_and(|n| n >= 12 && buf.starts_with(b"HTTP/1."))
}

struct Boot<'a> {
    dir: &'a Path,
    data: &'a Path,
    run: &'a Path,
    tz: String,
    memory: u32,
}

fn start(b: &Boot, qemu: bool, vm_bin: &Path, accel: &str) -> Vm {
    let log = b.run.join("console.log");
    let out = File::create(&log).unwrap_or_else(|e| die(format!("{}: {e}", log.display())));
    let err = out.try_clone().unwrap();
    let (kernel, initrd, system) = (b.dir.join("linux"), b.dir.join("initramfs.cpio.gz"), b.dir.join("system.ext4"));
    let append = format!("console=ttyAMA0 rdinit=/init quiet ruwebos.tz={}", b.tz);
    let mut cmd = Command::new(vm_bin);
    if qemu {
        // virtio-mmio slots are handed out last-first: the data disk comes first to be /dev/vdb
        let cpu = if accel == "tcg" { "max" } else { "host" };
        cmd.args(["-M", "virt", "-accel", accel, "-cpu", cpu, "-smp", "4", "-m", &b.memory.to_string()])
            .args(["-display", "none", "-monitor", "none", "-serial", "stdio", "-kernel"])
            .arg(&kernel)
            .arg("-initrd")
            .arg(&initrd)
            .args(["-append", &append])
            .args(["-netdev", &format!("user,id=net,hostfwd=tcp::{PORT}-:{PORT}"), "-device", "virtio-net-device,netdev=net"])
            .args(["-object", "rng-random,id=rng,filename=/dev/urandom", "-device", "virtio-rng-device,rng=rng"])
            .args(["-drive", &format!("if=none,id=data,file={},format=raw", b.data.display()), "-device", "virtio-blk-device,drive=data"])
            .args(["-drive", &format!("if=none,id=sys,file={},format=raw,snapshot=on", system.display()), "-device", "virtio-blk-device,drive=sys"]);
    } else {
        cmd.args(["-M", "aarch64", "-m", &b.memory.to_string()]);
        if accel != "tcg" {
            cmd.args(["-accel", accel, "-smp", "4"]);
        }
        cmd.arg("-kernel")
            .arg(&kernel)
            .arg("-initrd")
            .arg(&initrd)
            .args(["-drive", &format!("file={},snapshot=on", system.display())])
            .args(["-drive", &format!("file={}", b.data.display())])
            .args(["-rng", "-nic", &format!("user,hostfwd=tcp::{PORT}-:{PORT}"), "-serial", "stdio", "-append", &append]);
    }
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::from(out))
        .stderr(Stdio::from(err))
        .spawn()
        .unwrap_or_else(|e| die(format!("cannot start {}: {e}", vm_bin.display())));
    let console = child.stdin.take();
    Vm { child, console, log }
}

/// Ready: the guest says so on its console and the home screen answers through the port forward
fn wait_ready(vm: &mut Vm, stop: &AtomicBool) -> bool {
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(180) {
        if stop.load(Ordering::Relaxed) || matches!(vm.child.try_wait(), Ok(Some(_))) {
            return false;
        }
        if fs::read_to_string(&vm.log).is_ok_and(|l| l.contains("RUWEBOS-READY")) && http_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    false
}

fn tail(path: &Path, n: usize) -> String {
    let text = fs::read_to_string(path).unwrap_or_default();
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(n)..].join("\n")
}

// ---------- browsers ----------

fn mac_app(name: &str, exe: &str) -> Option<PathBuf> {
    let p = PathBuf::from(format!("/Applications/{name}.app/Contents/MacOS/{exe}"));
    p.is_file().then_some(p)
}

fn chrome() -> Option<PathBuf> {
    mac_app("Google Chrome", "Google Chrome").or_else(|| ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].iter().find_map(|c| find_on_path(c)))
}

fn firefox() -> Option<PathBuf> {
    mac_app("Firefox", "firefox").or_else(|| find_on_path("firefox"))
}

fn rubrowser() -> PathBuf {
    std::env::var_os("RUBROWSER_BIN")
        .map(PathBuf::from)
        .or_else(|| find_on_path("rubrowser"))
        .unwrap_or_else(|| die("no browser found: install Chrome or Firefox, or cargo install rubrowser (or set RUBROWSER_BIN)"))
}

/// Waits for a browser child, or Ctrl-C
fn wait_child(mut c: Child, stop: &AtomicBool) {
    while !stop.load(Ordering::Relaxed) {
        if let Ok(Some(_)) = c.try_wait() {
            return;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    let _ = c.kill();
    let _ = c.wait();
}

fn main() -> ExitCode {
    let o = parse_args();
    let t0 = Instant::now();
    let home = home();
    let accel = o.accel.clone().unwrap_or_else(|| {
        match (std::env::consts::OS, std::env::consts::ARCH) {
            ("macos", "aarch64") => "hvf".into(),
            ("linux", "aarch64") if fs::OpenOptions::new().write(true).open("/dev/kvm").is_ok() => "kvm".into(),
            _ => "tcg".into(),
        }
    });
    // the browser, checked before the (maybe long) download
    let browser = o.browser.clone().unwrap_or_else(|| if chrome().is_some() { "chrome".into() } else { "rubrowser".into() });
    match browser.as_str() {
        "chrome" if chrome().is_none() => die("Chrome (or Chromium) not found"),
        "firefox" if firefox().is_none() => die("Firefox not found"),
        "safari" if !cfg!(target_os = "macos") => die("Safari is only on macOS"),
        _ => {}
    }
    if TcpStream::connect_timeout(&([127, 0, 0, 1], PORT).into(), Duration::from_millis(500)).is_ok() {
        die(format!("port {PORT} is already in use (is ruwebos already running?)"));
    }

    // the VM, also checked before the download
    let (vm_bin, name) = if o.qemu {
        let q = std::env::var_os("QEMU").map(PathBuf::from).or_else(|| find_on_path("qemu-system-aarch64"));
        (q.unwrap_or_else(|| die("qemu-system-aarch64 not found (e.g. brew install qemu, apt install qemu-system-arm)")), "qemu")
    } else {
        (ruvm(&home, accel == "hvf"), "ruvm")
    };
    let dir = assets(&home);
    let data = home.join("data.ext4");
    if !data.exists() {
        // an empty (sparse) disk: the system formats it on the first boot
        File::create(&data).and_then(|f| f.set_len(o.data_size)).unwrap_or_else(|e| die(format!("{}: {e}", data.display())));
    }
    let run = home.join("run");
    let _ = fs::create_dir_all(&run);
    // the host's time zone becomes the system's
    let tz = std::env::var("TZ")
        .ok()
        .or_else(|| fs::read_link("/etc/localtime").ok().and_then(|p| p.to_string_lossy().split("zoneinfo/").nth(1).map(String::from)))
        .filter(|t| !t.is_empty() && t.chars().all(|c| c.is_ascii_alphanumeric() || "_/+-".contains(c)))
        .unwrap_or_else(|| "UTC".into());
    let boot = Boot { dir: &dir, data: &data, run: &run, tz, memory: o.memory };

    let stop = Arc::new(AtomicBool::new(false));
    {
        let stop = stop.clone();
        let _ = ctrlc::set_handler(move || stop.store(true, Ordering::Relaxed));
    }
    let mut accel = accel;
    let mut vm = start(&boot, o.qemu, &vm_bin, &accel);
    if !wait_ready(&mut vm, &stop) {
        if stop.load(Ordering::Relaxed) {
            vm.poweroff();
            return ExitCode::from(130);
        }
        eprintln!("ruwebos: -accel {accel} did not boot:\n{}", tail(&vm.log, 5));
        let _ = vm.child.kill();
        let _ = vm.child.wait();
        if accel == "tcg" {
            return ExitCode::FAILURE;
        }
        eprintln!("ruwebos: falling back to -accel tcg");
        accel = "tcg".into();
        vm = start(&boot, o.qemu, &vm_bin, &accel);
        if !wait_ready(&mut vm, &stop) {
            eprintln!("{}", tail(&vm.log, 20));
            vm.poweroff();
            return ExitCode::FAILURE;
        }
    }
    let log = fs::read_to_string(&vm.log).unwrap_or_default();
    for l in log.lines().filter(|l| l.starts_with("== ruwebos")) {
        println!("{l}");
    }
    println!("ruwebos {VERSION}: ready after {:.2} s ({name}, -accel {accel}, {} MB), {}", t0.elapsed().as_secs_f64(), o.memory, o.url);
    let installer = format!("http://installer.localhost:{PORT}/");
    let profile = |n: &str| home.join(n);

    match &o.mode {
        Mode::Headless => {
            println!("ruwebos: Ctrl-C to power off");
            while !stop.load(Ordering::Relaxed) && !matches!(vm.child.try_wait(), Ok(Some(_))) {
                std::thread::sleep(Duration::from_millis(200));
            }
        }
        Mode::Screenshot(file) => {
            let abs = std::env::current_dir().unwrap_or_default().join(file);
            let _ = fs::remove_file(&abs);
            if browser == "chrome" {
                // headless Chrome writes the PNG but does not always exit: wait for the file, then stop it
                let c = Command::new(chrome().unwrap())
                    .arg("--headless=new")
                    .arg(format!("--user-data-dir={}", profile("chrome-profile").display()))
                    .args(["--hide-scrollbars", "--window-size=1280,800", "--virtual-time-budget=5000"])
                    .arg(format!("--screenshot={}", abs.display()))
                    .arg(&o.url)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn();
                if let Ok(mut c) = c {
                    let t = Instant::now();
                    while !abs.exists() && t.elapsed() < Duration::from_secs(60) && !matches!(c.try_wait(), Ok(Some(_))) {
                        std::thread::sleep(Duration::from_millis(100));
                    }
                    std::thread::sleep(Duration::from_millis(300));
                    let _ = c.kill();
                    let _ = c.wait();
                }
            } else if browser == "firefox" {
                let _ = fs::create_dir_all(profile("firefox-profile"));
                let _ = Command::new(firefox().unwrap())
                    .args(["--headless", "--profile"])
                    .arg(profile("firefox-profile"))
                    .args(["--window-size=1280,800", "--screenshot"])
                    .arg(&abs)
                    .arg(&o.url)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
            } else {
                let _ = Command::new(rubrowser())
                    .args(["--installer", &installer, "--keyboard", &o.keyboard, "--screenshot"])
                    .arg(&abs)
                    .args(["--width", "1280", "--height", "800", &o.url])
                    .status();
            }
            match abs.exists() {
                true => println!("ruwebos: {} rendered", file.display()),
                false => eprintln!("ruwebos: no screenshot was written"),
            }
        }
        Mode::Window => {
            // each waits until the browser quits (for Chrome and Firefox: quit the app, e.g. Cmd-Q)
            let child = match browser.as_str() {
                "chrome" => Command::new(chrome().unwrap())
                    .arg(format!("--user-data-dir={}", profile("chrome-profile").display()))
                    .args(["--no-first-run", "--no-default-browser-check", "--window-size=1280,900", "--new-window", &o.url])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn(),
                "firefox" => {
                    let _ = fs::create_dir_all(profile("firefox-profile"));
                    Command::new(firefox().unwrap())
                        .args(["--new-instance", "--profile"])
                        .arg(profile("firefox-profile"))
                        .arg(&o.url)
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .spawn()
                }
                "safari" => Command::new("open").args(["-W", "-a", "Safari", &o.url]).spawn(),
                "rubrowser" => Command::new(rubrowser()).args(["--installer", &installer, "--keyboard", &o.keyboard, &o.url]).spawn(),
                cmd => Command::new("sh").args(["-c", &format!("{cmd} \"$1\""), "ruwebos", &o.url]).spawn(),
            };
            match child {
                Ok(c) => wait_child(c, &stop),
                Err(e) => eprintln!("ruwebos: cannot start the browser: {e}"),
            }
        }
    }
    vm.poweroff();
    ExitCode::SUCCESS
}
