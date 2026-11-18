#!/bin/sh
# Builds the ruwebos system disk out/system.ext4 (read-only: booted with snapshot=on, replaced as a
# whole on update) and out/licenses.md. The data disk out/data.ext4 is created by ./ruwebos and is
# never touched here.
#   image/build.sh            uses ../ruvm and ../rucloud (or RUVM=..., RUCLOUD=...)
# Needs docker (linux/arm64 images) and cargo-zigbuild.
set -e
cd "$(dirname "$0")/.."
root=$PWD
ruvm=$(cd "${RUVM:-../ruvm}" && pwd)
rucloud=$(cd "${RUCLOUD:-../rucloud}" && pwd)
stage=out/stage
mkdir -p $stage/ruwebos

echo "== rucloud (aarch64-unknown-linux-gnu)"
(cd "$rucloud" && cargo zigbuild -q --release --target aarch64-unknown-linux-gnu)
cp "$rucloud/target/aarch64-unknown-linux-gnu/release/rucloud" $stage/rucloud
(cd "$rucloud" && cargo tree -q -e normal --target aarch64-unknown-linux-gnu --prefix none -f '{p} {l}') |
    sed 's/ ([^)]*)//' | sort -u > $stage/crates.txt

echo "== busybox from ruvm's initramfs"
gunzip -c "$ruvm/tests/guest/out/linux/root/arm64/initramfs.cpio.gz" | (cd $stage && cpio -id --quiet bin/busybox)
mv $stage/bin/busybox $stage/busybox

echo "== apps"
cp image/init image/licenses.sh $stage/
cp image/rucloud.toml $stage/ruwebos/
node apps/_shared/gen.mjs
node image/gen-home.mjs "$rucloud"
node image/gen-packages.mjs "$rucloud"
# only what the apps serve: no node_modules, local state or real secrets (.dev.vars)
ex="--exclude=node_modules --exclude=.wrangler --exclude=.rucloud --exclude=.dev.vars --exclude=.git --exclude=test.mjs --exclude=dev.toml"
rsync -a --delete $ex home/ $stage/ruwebos/home/
rsync -a --delete $ex --exclude=/installer/samples apps/ $stage/ruwebos/apps/
# rucloud's other examples are the installer's bundled packages (gen-packages.mjs); App Builder stays a system app
mkdir -p $stage/ruwebos/examples/apps
rm -rf $stage/ruwebos/examples/sites
rsync -a --delete $ex "$rucloud/apps/app-builder/" $stage/ruwebos/examples/apps/app-builder/

echo "== docker image ruwebos-system"
docker build -q --platform linux/arm64 -t ruwebos-system -f image/Dockerfile $stage >/dev/null

echo "== out/system.ext4"
cid=$(docker create --platform linux/arm64 ruwebos-system)
docker export "$cid" | docker run -i --rm --platform linux/arm64 -v "$root/out:/out" ruwebos-system sh -c '
    set -e
    mkdir /r && tar -xf - -C /r
    used=$(du -sm /r | cut -f1)
    mke2fs -F -q -t ext4 -m 0 -L ruwebos-system -d /r /out/system.ext4.new $((used * 5 / 4 + 64))M
    echo "   $used MB of files"'
docker rm "$cid" >/dev/null
mv out/system.ext4.new out/system.ext4
docker run --rm --platform linux/arm64 ruwebos-system cat /usr/share/doc/ruwebos/licenses.md > out/licenses.md
ls -lh out/system.ext4 | awk '{print "   " $5 " out/system.ext4"}'
echo "   $(grep -c '^| ' out/licenses.md) rows in out/licenses.md"
