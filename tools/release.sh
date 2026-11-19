#!/usr/bin/env bash
# Publishes a ruwebos release: the GitHub Release v<version> with the files the launcher downloads
# (`cargo install ruvm ruwebos` fetches the ones of its own version), then the launcher crate on crates.io.
#   tools/release.sh [-y] [--dry-run]
#     -y         do not ask before the steps that cannot be undone
#     --dry-run  build and check everything into out/release, publish nothing
# The version is the launcher's (launcher/Cargo.toml). Needs: everything committed and pushed, the tag
# v<version> pushed, `gh auth login`, `cargo login`, Docker (image/build.sh), zstd, and ../ruvm with the
# guest kernel and initramfs (tools/linux/fetch-debian.sh, tools/linux/mkroot.sh arm64).
#
# Files of the release:
#   linux                         the guest kernel (Debian 13 linux-signed-arm64)
#   initramfs.cpio.gz             loads the storage modules and mounts the disks (Debian busybox-static)
#   system.ext4.zst               the system disk (image/build.sh), zstd-compressed
#   ruwebos-native-arm64.tar.gz   install directly on Linux arm64 without a VM (native/install.sh)
#   licenses.md                   every package on the system disk and its license
#   SHA256SUMS
set -euo pipefail
cd "$(dirname "$0")/.."
yes=0 dry=0
for a in "$@"; do
    case $a in
        -y) yes=1 ;;
        --dry-run) dry=1 ;;
        *) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
    esac
done
die() { echo "release.sh: $*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

v=$(sed -n 's/^version = "\(.*\)"/\1/p' launcher/Cargo.toml | head -1)
tag="v$v"
ruvm=$(cd "${RUVM:-../ruvm}" && pwd)
kernel=$ruvm/tests/guest/out/linux/debian/arm64/linux
initrd=$ruvm/tests/guest/out/linux/root/arm64/initramfs.cpio.gz
out=out/release

step "checks: ruwebos $v, release $tag"
[ -f "$kernel" ] && [ -f "$initrd" ] || die "the guest kernel and initramfs are built in ruvm (tools/linux/fetch-debian.sh, tools/linux/mkroot.sh arm64)"
command -v zstd >/dev/null || die "zstd not found (brew install zstd)"
if [ $dry = 0 ]; then
    [ -z "$(git status --porcelain)" ] || { git status --short >&2; die "commit your changes first"; }
    git fetch -q origin --tags || die "git fetch failed"
    branch=$(git rev-parse --abbrev-ref HEAD)
    [ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$branch" 2>/dev/null)" ] || die "push $branch first"
    [ "$(git rev-parse "$tag^{commit}" 2>/dev/null)" = "$(git rev-parse HEAD)" ] || die "tag $tag must be this commit (git tag $tag; git push origin $tag)"
    git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null || die "push the tag first (git push origin $tag)"
    gh auth status >/dev/null 2>&1 || die "gh is not logged in (gh auth login)"
fi

step "system disk and native bundle"
image/build.sh
native/pack.sh

step "files into $out"
mkdir -p "$out"
cp "$kernel" "$out/linux"
cp "$initrd" "$out/initramfs.cpio.gz"
zstd -q -19 -T0 -f out/system.ext4 -o "$out/system.ext4.zst"
cp out/ruwebos-native-arm64.tar.gz out/licenses.md "$out/"
(cd "$out" && shasum -a 256 linux initramfs.cpio.gz system.ext4.zst ruwebos-native-arm64.tar.gz licenses.md > SHA256SUMS)
ls -lh "$out" | awk 'NR > 1 { print "   " $5 "\t" $9 }'

step "the launcher, with these files (RUWEBOS_ASSETS)"
(cd launcher && cargo publish --dry-run --allow-dirty --quiet && cargo build --release --quiet)
home=$(mktemp -d)
[ -x "$ruvm/target/release/ruvm" ] && export RUVM_BIN=$ruvm/target/release/ruvm
RUWEBOS_HOME=$home RUWEBOS_ASSETS=$PWD/$out launcher/target/release/ruwebos --headless > "$home/launcher.log" 2>&1 &
lpid=$!
ok=0
for _ in $(seq 1 600); do
    if curl -s -o /dev/null --max-time 2 http://127.0.0.1:8700/; then ok=1; break; fi
    kill -0 $lpid 2>/dev/null || break
    sleep 0.5
done
kill -INT $lpid 2>/dev/null || true
wait $lpid 2>/dev/null || true
[ $ok = 1 ] || die "the launcher did not boot the release files (see $home/launcher.log and $home/run/console.log)"
echo "   booted from the release files"

notes=$(cat <<EOF
ruwebos $v: a small OS whose user interface is the web browser (Debian 13 arm64, rucloud, the ruwebos apps).

Run it on macOS (Apple Silicon) or Linux:

    cargo install ruvm ruwebos
    ruwebos

The launcher downloads the files below the first time (about $(cat "$out/linux" "$out/initramfs.cpio.gz" "$out/system.ext4.zst" | wc -c | awk "{ printf \"%d\", \$1 / 1048576 }") MB), checks them against SHA256SUMS and keeps your data in a data disk of its own (\`ruwebos --where\`). To install directly on a Linux arm64 machine without a VM, see native/install.sh in ruwebos-native-arm64.tar.gz.

Licenses: every package on the system disk is listed in licenses.md. The guest kernel (\`linux\`) is Debian 13's linux-signed-arm64 6.12.107-1 and the initramfs contains Debian's busybox-static 1.37.0-6 and kernel modules, all GPL-2.0; their sources are at https://sources.debian.org/src/linux/ and https://sources.debian.org/src/busybox/.
EOF
)
if [ $dry = 1 ]; then
    step "dry run: nothing published"
    echo "$notes"
    exit 0
fi
if [ $yes = 0 ]; then
    printf '\nPublish release %s on GitHub and ruwebos %s on crates.io? (a crates.io version cannot be published twice) [y/N] ' "$tag" "$v"
    read -r answer
    [ "$answer" = y ] || die "stopped"
fi

step "GitHub release $tag"
if gh release view "$tag" >/dev/null 2>&1; then
    gh release upload "$tag" "$out"/* --clobber
else
    gh release create "$tag" "$out"/* --title "ruwebos $v" --notes "$notes"
fi

step "crates.io: ruwebos $v"
(cd launcher && cargo publish)
echo "done: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/tag/$tag"
