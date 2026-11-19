#!/bin/sh
# Tests installing ruwebos directly on Linux (no VM) in a plain Debian 13 arm64 container: makes the
# bundle (native/pack.sh), runs install.sh in the container (which also fetches Node.js), starts ruwebos
# as the ruwebos user (no systemd in the container), and runs every app's test from this machine.
#   native/test-docker.sh          the container is removed afterwards
#   native/test-docker.sh --keep   it keeps running on http://localhost:8710/ (docker rm -f ruwebos-native-test)
set -e
cd "$(dirname "$0")/.."
port=8710 name=ruwebos-native-test keep=
[ "$1" = --keep ] && keep=yes
native/pack.sh
docker rm -f $name >/dev/null 2>&1 || true
echo "== container $name (debian:trixie-slim, port $port)"
docker run -d --name $name --platform linux/arm64 -p $port:8700 debian:trixie-slim sleep infinity >/dev/null
docker cp out/ruwebos-native-arm64.tar.gz $name:/tmp/
docker exec $name tar -xzf /tmp/ruwebos-native-arm64.tar.gz -C /tmp
t0=$(date +%s)
docker exec $name /tmp/ruwebos-native-arm64/install.sh --bind 0.0.0.0
echo "   installed in $(( $(date +%s) - t0 )) s"
docker exec -d -u ruwebos $name sh -c '/usr/local/lib/ruwebos/start > /var/lib/ruwebos/log/rucloud.log 2>&1'
i=0
until curl -s -o /dev/null --max-time 2 http://localhost:$port/; do
    i=$((i + 1))
    if [ $i -ge 150 ]; then
        docker exec $name tail -n 30 /var/lib/ruwebos/log/rucloud.log
        exit 1
    fi
    sleep 0.2
done
docker exec $name head -n 1 /var/lib/ruwebos/log/rucloud.log
status=0
node apps/test.mjs http://localhost:$port || status=$?
if [ -n "$keep" ]; then
    echo "ruwebos: still running on http://localhost:$port/ (docker rm -f $name)"
else
    docker rm -f $name >/dev/null
fi
exit $status
