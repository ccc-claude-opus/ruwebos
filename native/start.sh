#!/bin/sh
# Starts ruwebos on a Linux machine without a VM (installed by native/install.sh as
# /usr/local/lib/ruwebos/start): rucloud with the ruwebos apps, in the foreground. systemd runs it
# (ruwebos.service, which restarts it if it exits); without systemd run it as the ruwebos user.
# What the VM's /sbin/init does at boot, minus the disks and the network: the admin token, rucloud's
# config with this machine's paths, and the system facts the settings app shows.
set -e
export PATH=/opt/node/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin LANG=C.UTF-8
[ -f /etc/ruwebos/ruwebos.conf ] && . /etc/ruwebos/ruwebos.conf
state=${STATE:-/var/lib/ruwebos}
bind=${BIND:-127.0.0.1}
# systemd gives us /run/ruwebos (RuntimeDirectory); started by hand, the data folder holds it
run=${RUNTIME_DIRECTORY:-}
if [ -z "$run" ]; then
    run=/run/ruwebos
    mkdir -p "$run" 2>/dev/null && [ -w "$run" ] || run=$state/run
fi
mkdir -p "$run" "$state/rucloud" "$state/log"
chmod 700 "$run"

# the system's time zone: TZ, or the machine's
if [ -z "$TZ" ]; then
    TZ=$(cat /etc/timezone 2>/dev/null || readlink /etc/localtime 2>/dev/null | sed -n 's|.*zoneinfo/||p')
fi
case $TZ in *[!A-Za-z0-9_/+-]* | "") TZ=UTC ;; esac
export TZ

echo $(( $(cat "$state/log/boots" 2>/dev/null || echo 0) + 1 )) > "$state/log/boots"
[ -s "$state/admin-token" ] || od -An -tx1 -N24 /dev/urandom | tr -d ' \n' > "$state/admin-token"
chmod 600 "$state/admin-token"
token=$(cat "$state/admin-token")
sed -e "s|@ADMIN_TOKEN@|$token|" \
    -e "s|^state_dir = \"/data/rucloud\"|state_dir = \"$state/rucloud\"|" \
    -e "s|^bind = \"0.0.0.0\"|bind = \"$bind\"|" \
    -e "s|/run/ruwebos/system.env|$run/system.env|" \
    /opt/ruwebos/rucloud.toml > "$run/rucloud.toml"

. /etc/os-release
dev=$(ip route show default 2>/dev/null | awk '{ for (i = 1; i < NF; i++) if ($i == "dev") { print $(i + 1); exit } }')
cat > "$run/system.env" <<EOF
ADMIN_URL=http://127.0.0.1:8799
ADMIN_TOKEN=$token
SYS_PLATFORM=native
SYS_OS=$PRETTY_NAME
SYS_KERNEL=$(uname -r)
SYS_CPUS=$(nproc)
SYS_NODE=$(node --version)
SYS_RUCLOUD=$(rucloud --version 2>&1 | cut -d' ' -f2)
SYS_BOOT=$(cat "$state/log/boots")
SYS_BOOTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SYS_TZ=$TZ
SYS_NET_IF=$dev
SYS_NET_DRIVER=$( [ -n "$dev" ] && basename "$(readlink /sys/class/net/"$dev"/device/driver 2>/dev/null)" 2>/dev/null)
SYS_NET_MAC=$( [ -n "$dev" ] && cat /sys/class/net/"$dev"/address 2>/dev/null)
SYS_NET_IP=$( [ -n "$dev" ] && ip -4 -o addr show dev "$dev" 2>/dev/null | awk '{ print $4; exit }')
SYS_NET_GW=$(ip route show default 2>/dev/null | awk '{ print $3; exit }')
SYS_NET_DNS=$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf 2>/dev/null)
SYS_DATA=$(df -h "$state" | awk 'NR==2 { print $3 " 已用，" $4 " 可用（共 " $2 "）" }')
EOF
chmod 600 "$run/system.env"

echo "== ruwebos: $PRETTY_NAME, $(uname -r), $(nproc) CPUs, node $(node --version), $(rucloud --version 2>&1), start #$(cat "$state/log/boots"), http://localhost:8700/ (bind $bind)"
cd /opt/ruwebos
exec rucloud serve "$run/rucloud.toml"
