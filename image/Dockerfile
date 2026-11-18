# ruwebos 系統碟的內容：Debian 13 + Node 24（官方 node 映像）+ rucloud + 預裝應用 + init。
# image/build.sh 把它匯出成 out/system.ext4；context 是 out/stage（build.sh 準備）。
FROM node:24-trixie-slim
# e2fsprogs：init 在第一次開機時格式化資料碟、需要時 e2fsck
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends e2fsprogs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
COPY rucloud /usr/local/bin/rucloud
COPY busybox /opt/busybox
COPY init /sbin/init
COPY ruwebos /opt/ruwebos
COPY licenses.sh crates.txt /usr/share/doc/ruwebos/
RUN sh /usr/share/doc/ruwebos/licenses.sh > /usr/share/doc/ruwebos/licenses.md \
    && cp /usr/share/doc/ruwebos/licenses.md /opt/ruwebos/apps/settings/public/licenses.md
