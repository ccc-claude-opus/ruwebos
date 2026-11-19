#!/bin/sh
# Prints the licenses of everything on the ruwebos system disk as GitHub markdown (run inside the image).
# RUWEBOS_NATIVE=1 (native/install.sh): what ruwebos installed on a Linux machine; the machine's own
# Debian packages, kernel and BusyBox are not ours to list. RUWEBOS_DOC: where crates.txt is.
set -e
doc=${RUWEBOS_DOC:-/usr/share/doc/ruwebos}
native=${RUWEBOS_NATIVE:-}
node_prefix=$(dirname "$(dirname "$(command -v node)")")
lic() {
    [ -f "$1" ] || { echo "（缺少 copyright 檔）"; return; }
    l=$(grep -h '^License:' "$1" | sed 's/^License: *//' | sort -u | paste -sd ';' - | sed 's/;/; /g')
    echo "${l:-不是機器可讀格式，見 $1}"
}
if [ -n "$native" ]; then
    echo "# ruwebos 安裝的元件的授權清單"
    echo
    echo "由 native/install.sh 在安裝時產生（image/licenses.sh）。這台機器本身的作業系統與套件不在這裡。"
else
    echo "# ruwebos 系統碟的授權清單"
    echo
    echo "由 image/licenses.sh 在建置時產生。Debian 套件的授權取自各自的 /usr/share/doc/<套件>/copyright。"
fi
echo
echo "## 不是 Debian 套件的元件"
echo
echo "| 元件 | 版本 | 授權 | 來源 |"
echo "|---|---|---|---|"
echo "| Node.js | $(node --version) | MIT（內含的第三方元件見原始碼的 LICENSE） | https://github.com/nodejs/node/blob/$(node --version)/LICENSE |"
for d in "$node_prefix"/lib/node_modules/*; do
    [ -f "$d/package.json" ] || continue
    n=$(basename "$d")
    v=$(node -p "require('$d/package.json').version")
    l=$(node -p "require('$d/package.json').license")
    echo "| $n（隨 Node 附帶） | $v | $l | $d/LICENSE |"
done
for d in /opt/yarn-*; do
    [ -d "$d" ] || continue
    v=$(node -p "require('$d/package.json').version")
    l=$(node -p "require('$d/package.json').license")
    echo "| yarn（隨 Node 附帶） | $v | $l | $d/LICENSE |"
done
echo "| rucloud | $(rucloud --version | cut -d' ' -f2) | MIT | https://github.com/ccc-claude-opus/rucloud |"
echo "| ruwebos 的應用 /opt/ruwebos/apps、home | — | MIT | https://github.com/ccc-claude-opus/ruwebos |"
echo "| rucloud 的範例應用：App Builder（/opt/ruwebos/examples），以及安裝程式的預裝套件 myshop、friendbook、markpedia、music、boardgame、webportal、ccc（/opt/ruwebos/apps/installer/public/packages，每個套件裡附 LICENSE） | — | MIT（隨 rucloud 的 repo 發布；myshop、friendbook、markpedia 取自 test-apps） | https://github.com/ccc-claude-opus/rucloud |"
echo "| Leaflet（地圖應用執行時從 unpkg.com 載入，不在映像裡） | 1.9.4 | BSD-2-Clause | https://leafletjs.com/ |"
if [ -z "$native" ]; then
    echo "| BusyBox /opt/busybox（靜態，來自 ruvm 的 initramfs） | $(/opt/busybox | head -1 | cut -d' ' -f2) | GPL-2.0 | https://busybox.net/ |"
    echo "| Linux 核心與 initramfs（不在系統碟，由 ruvm 載入） | Debian 13 linux-image-arm64 | GPL-2.0 | https://github.com/ccc-claude-opus/ruvm |"
fi
echo
echo "## rucloud 編進執行檔的 Rust crate"
echo
echo "| crate | 版本 | 授權 |"
echo "|---|---|---|"
sed 's/^\([^ ]*\) v\([^ ]*\) \(.*\)$/| \1 | \2 | \3 |/' $doc/crates.txt
[ -n "$native" ] && exit 0
echo
echo "## Debian 套件"
echo
echo "| 套件 | 版本 | 授權（copyright 檔裡的 License 欄位） |"
echo "|---|---|---|"
dpkg-query -W -f '${Package} ${Version}\n' | while read -r p v; do
    f=/usr/share/doc/${p%%:*}/copyright
    echo "| $p | $v | $(lic "$f") |"
done
