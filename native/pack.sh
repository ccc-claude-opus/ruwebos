#!/bin/sh
# Makes the bundle for installing ruwebos directly on a Linux machine (no VM):
#   native/pack.sh        → out/ruwebos-native-arm64.tar.gz (unpack it on the machine, run sudo ./install.sh)
# The apps are the same as on the system disk (image/build.sh --stage-only prepares them); Node.js is
# the version the system disk uses (install.sh downloads it on the machine when needed).
set -e
cd "$(dirname "$0")/.."
image/build.sh --stage-only
name=ruwebos-native-arm64
dir=out/native/$name
rm -rf "$dir"
mkdir -p "$dir"
cp -R out/stage/ruwebos "$dir/ruwebos"
cp out/stage/rucloud out/stage/crates.txt "$dir/"
cp image/licenses.sh native/install.sh native/start.sh native/ruwebos.service "$dir/"
echo arm64 > "$dir/ARCH"
docker run --rm --platform linux/arm64 node:24-trixie-slim node --version > "$dir/NODE_VERSION"
# no macOS extended attributes or ._ files in the archive (GNU tar on Linux warns about them)
COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -czf "out/$name.tar.gz" -C out/native "$name"
ls -lh "out/$name.tar.gz" | awk '{ print "   " $5 " " $NF }'
