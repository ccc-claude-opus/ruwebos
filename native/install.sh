#!/bin/sh
# Installs ruwebos directly on a Linux machine, without a VM (Debian 13, Raspberry Pi OS; arm64), from
# the bundle native/pack.sh makes:
#   sudo ./install.sh [--bind ADDR] [--no-start]   install or update; data in /var/lib/ruwebos is kept
#   sudo ./install.sh --uninstall [--purge]        remove (--purge also deletes the data)
# Installs: Node.js (the official build, into /opt/node, unless a new enough one is there), rucloud
# (/usr/local/bin), the apps (/opt/ruwebos), a system user `ruwebos`, and the systemd service
# ruwebos.service (http://localhost:8700/; --bind 0.0.0.0 to reach it from other machines too).
# Without systemd (a container), start it with: su ruwebos -s /bin/sh -c /usr/local/lib/ruwebos/start
set -e
cd "$(dirname "$0")"
bind=127.0.0.1 start=yes action=install purge=
while [ $# -gt 0 ]; do
    case "$1" in
        --bind) bind=$2; shift ;;
        --no-start) start= ;;
        --uninstall) action=uninstall ;;
        --purge) purge=yes ;;
        -h | --help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "install.sh: unknown option $1" >&2; exit 2 ;;
    esac
    shift
done
[ "$(id -u)" = 0 ] || { echo "install.sh: run it as root (sudo)" >&2; exit 1; }
systemd=
[ -d /run/systemd/system ] && systemd=yes

if [ $action = uninstall ]; then
    if [ -n "$systemd" ]; then
        systemctl disable --now ruwebos.service 2>/dev/null || true
        rm -f /etc/systemd/system/ruwebos.service
        systemctl daemon-reload
    fi
    rm -rf /opt/ruwebos /usr/local/lib/ruwebos /etc/ruwebos /usr/local/bin/rucloud
    if [ -n "$purge" ]; then
        rm -rf /var/lib/ruwebos
        echo "ruwebos: removed, with its data"
    else
        echo "ruwebos: removed; the data is still in /var/lib/ruwebos (--purge deletes it)"
    fi
    exit 0
fi

arch=$(cat ARCH)
case "$(uname -m)" in
    aarch64 | arm64) [ "$arch" = arm64 ] ;;
    x86_64) [ "$arch" = x64 ] ;;
    *) false ;;
esac || { echo "install.sh: this bundle is for $arch, this machine is $(uname -m)" >&2; exit 1; }

# tools the install and the start script use; bubblewrap: rucloud cages installed apps ([isolation])
missing=
for c in curl:curl xz:xz-utils ip:iproute2 sha256sum:coreutils bwrap:bubblewrap; do
    command -v "${c%%:*}" >/dev/null 2>&1 || missing="$missing ${c#*:}"
done
if [ -n "$missing" ]; then
    echo "== installing$missing"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq && apt-get install -y -qq --no-install-recommends ca-certificates $missing >/dev/null
fi

# Node.js: rucloud needs 22.15 or newer; else the official build of the version the system disk uses
node_ok() {
    v=$("$1" --version 2>/dev/null | sed 's/^v//')
    [ -n "$v" ] || return 1
    major=${v%%.*} rest=${v#*.} minor=${rest%%.*}
    [ "$major" -gt 22 ] || { [ "$major" = 22 ] && [ "$minor" -ge 15 ]; }
}
if ! { command -v node >/dev/null && node_ok "$(command -v node)"; } && ! node_ok /opt/node/bin/node; then
    v=$(cat NODE_VERSION)
    f=node-$v-linux-$arch.tar.xz
    echo "== Node.js $v (https://nodejs.org/dist/$v/$f)"
    tmp=$(mktemp -d)
    curl -fsSL -o "$tmp/$f" "https://nodejs.org/dist/$v/$f"
    curl -fsSL -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/$v/SHASUMS256.txt"
    (cd "$tmp" && grep " $f\$" SHASUMS256.txt | sha256sum -c - >/dev/null) || { echo "install.sh: $f does not match its checksum" >&2; exit 1; }
    rm -rf /opt/node.new
    mkdir -p /opt/node.new
    tar -xJf "$tmp/$f" -C /opt/node.new --strip-components=1
    rm -rf /opt/node "$tmp"
    mv /opt/node.new /opt/node
fi
[ -x /opt/node/bin/node ] && ln -sf /opt/node/bin/node /usr/local/bin/node

echo "== rucloud, apps"
install -m 755 rucloud /usr/local/bin/rucloud
rm -rf /opt/ruwebos.new
cp -R ruwebos /opt/ruwebos.new
rm -rf /opt/ruwebos
mv /opt/ruwebos.new /opt/ruwebos
mkdir -p /usr/local/lib/ruwebos /etc/ruwebos
install -m 755 start.sh /usr/local/lib/ruwebos/start
echo "BIND=$bind" > /etc/ruwebos/ruwebos.conf
RUWEBOS_NATIVE=1 RUWEBOS_DOC=$PWD sh ./licenses.sh > /opt/ruwebos/apps/settings/public/licenses.md

id ruwebos >/dev/null 2>&1 || useradd --system --home-dir /var/lib/ruwebos --shell /usr/sbin/nologin ruwebos
mkdir -p /var/lib/ruwebos/log
chown ruwebos:ruwebos /var/lib/ruwebos /var/lib/ruwebos/log

if [ -n "$systemd" ]; then
    install -m 644 ruwebos.service /etc/systemd/system/ruwebos.service
    systemctl daemon-reload
    if [ -n "$start" ]; then
        systemctl enable ruwebos.service >/dev/null 2>&1
        systemctl restart ruwebos.service
        echo "ruwebos: running (systemctl status ruwebos), http://localhost:8700/"
    else
        echo "ruwebos: installed; start it with: systemctl enable --now ruwebos"
    fi
else
    echo "ruwebos: installed (no systemd here); start it with: su ruwebos -s /bin/sh -c /usr/local/lib/ruwebos/start"
fi
