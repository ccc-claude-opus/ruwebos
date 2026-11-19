# ruwebos (launcher)

[ruwebos](https://github.com/ccc-claude-opus/ruwebos) is a small OS whose user interface is the web browser: Debian 13 arm64, [rucloud](https://crates.io/crates/rucloud) (a self-hosted Cloudflare Workers platform) and a set of apps — files, photos, notes, calendar, contacts, music, an app installer — each a website on `http://<app>.localhost:8700/`.

This crate is its launcher:

```sh
cargo install ruvm ruwebos
ruwebos
```

The first time, it downloads the release files of its own version (the guest kernel, the initramfs and the system disk, about 100 MB) from the [GitHub Release](https://github.com/ccc-claude-opus/ruwebos/releases), checks them against `SHA256SUMS`, then boots the system in [ruvm](https://crates.io/crates/ruvm) and opens a browser on the home screen. Quitting the browser (or Ctrl-C) powers the system off. Your data (files, installed apps, settings) is in a data disk of its own, kept across versions; `ruwebos --where` prints the folder.

| Option | |
|---|---|
| `--headless` | keep running until Ctrl-C; use any browser on `http://localhost:8700/` |
| `--browser chrome\|firefox\|safari\|rubrowser\|<command>` | the browser (default: Chrome when installed, else [rubrowser](https://crates.io/crates/rubrowser)); Chrome and Firefox get a profile of their own |
| `--screenshot FILE` | render the home screen to a PNG, then power off |
| `--memory MB` | the VM's memory (default 2048) |
| `--accel hvf\|kvm\|tcg` | default: `hvf` on macOS/Apple Silicon (the launcher signs a copy of ruvm with the Hypervisor.framework entitlement), `kvm` on Linux/aarch64, else `tcg` (emulation, slow) |
| `--qemu` | boot in QEMU (`qemu-system-aarch64`) instead of ruvm |
| `--data-size 2g` | size of a new data disk (default 1g) |

Environment: `RUWEBOS_HOME` (the data folder), `RUVM_BIN`, `QEMU`, `RUBROWSER_BIN`, `RUWEBOS_ASSETS` (a folder or URL with the release files instead of the GitHub Release).

License: MIT. The release files contain Debian packages under their own licenses, listed in `licenses.md` of the release.
