# ruwebos 系統碟的授權清單

由 image/licenses.sh 在建置時產生。Debian 套件的授權取自各自的 /usr/share/doc/<套件>/copyright。

## 不是 Debian 套件的元件

| 元件 | 版本 | 授權 | 來源 |
|---|---|---|---|
| Node.js | v24.22.3 | MIT（內含的第三方元件見原始碼的 LICENSE） | https://github.com/nodejs/node/blob/v24.22.3/LICENSE |
| corepack（隨 Node 映像附帶） | 0.36.0 | MIT | /usr/local/lib/node_modules/corepack/LICENSE |
| npm（隨 Node 映像附帶） | 11.19.1 | Artistic-2.0 | /usr/local/lib/node_modules/npm/LICENSE |
| yarn（隨 Node 映像附帶） | 1.22.22 | BSD-2-Clause | /opt/yarn-v1.22.22/LICENSE |
| rucloud | 1.7.1 | MIT | https://github.com/ccc-claude-opus/rucloud |
| 預裝應用 /opt/ruwebos/apps、sites、home | — | MIT（隨 rucloud 與 ruwebos 的 repo 發布；myshop、friendbook、markpedia 取自 test-apps） | /opt/ruwebos |
| BusyBox /opt/busybox（靜態，來自 ruvm 的 initramfs） | v1.37.0 | GPL-2.0 | https://busybox.net/ |
| Linux 核心與 initramfs（不在系統碟，由 ruvm 載入） | Debian 13 linux-image-arm64 | GPL-2.0 | https://github.com/ccc-claude-opus/ruvm |

## rucloud 編進執行檔的 Rust crate

| crate | 版本 | 授權 |
|---|---|---|
| adler2 | 2.0.1 | 0BSD OR MIT OR Apache-2.0 |
| alloc-no-stdlib | 3.0.0 | BSD-3-Clause |
| alloc-stdlib | 0.3.0 | BSD-3-Clause |
| anstream | 1.0.0 | MIT OR Apache-2.0 |
| anstyle | 1.0.14 | MIT OR Apache-2.0 |
| anstyle-parse | 1.0.0 | MIT OR Apache-2.0 |
| anstyle-query | 1.1.5 | MIT OR Apache-2.0 |
| anyhow | 1.0.104 | MIT OR Apache-2.0 |
| asn1-rs | 0.7.2 | MIT OR Apache-2.0 |
| asn1-rs-derive | 0.6.0 | MIT OR Apache-2.0 |
| asn1-rs-impl | 0.2.0 | MIT/Apache-2.0 |
| async-compression | 0.4.52 | MIT OR Apache-2.0 |
| async-trait | 0.1.92 | MIT OR Apache-2.0 |
| atomic-waker | 1.1.2 | Apache-2.0 OR MIT |
| axum | 0.8.9 | MIT |
| axum-core | 0.5.6 | MIT |
| base64 | 0.22.1 | MIT OR Apache-2.0 |
| base64 | 0.23.1 | MIT OR Apache-2.0 |
| bitflags | 2.13.2 | MIT OR Apache-2.0 |
| block-buffer | 0.10.4 | MIT OR Apache-2.0 |
| brotli | 9.1.1 | BSD-3-Clause AND MIT |
| brotli-decompressor | 6.2.0 | BSD-3-Clause/MIT |
| bytes | 1.12.1 | MIT |
| cfg-if | 1.0.5 | MIT OR Apache-2.0 |
| chrono | 0.4.45 | MIT OR Apache-2.0 |
| clap | 4.6.7 | MIT OR Apache-2.0 |
| clap_builder | 4.6.7 | MIT OR Apache-2.0 |
| clap_derive | 4.6.7 | MIT OR Apache-2.0 |
| clap_lex | 1.1.1 | MIT OR Apache-2.0 |
| colorchoice | 1.0.5 | MIT OR Apache-2.0 |
| compression-codecs | 0.4.47 | MIT OR Apache-2.0 |
| compression-core | 0.4.34 | MIT OR Apache-2.0 |
| cpufeatures | 0.2.17 | MIT OR Apache-2.0 |
| crc32fast | 1.5.4 | MIT OR Apache-2.0 |
| cron | 0.15.0 | MIT OR Apache-2.0 |
| crypto-common | 0.1.7 | MIT OR Apache-2.0 |
| data-encoding | 2.11.1 | MIT |
| der-parser | 10.0.0 | MIT OR Apache-2.0 |
| deranged | 0.5.9 | MIT OR Apache-2.0 |
| digest | 0.10.7 | MIT OR Apache-2.0 |
| displaydoc | 0.2.7 | MIT OR Apache-2.0 |
| displaydoc | 0.2.7 | MIT OR Apache-2.0 (*) |
| equivalent | 1.0.3 | Apache-2.0 OR MIT |
| errno | 0.3.14 | MIT OR Apache-2.0 |
| fallible-iterator | 0.3.0 | MIT/Apache-2.0 |
| fallible-streaming-iterator | 0.1.9 | MIT/Apache-2.0 |
| filetime | 0.2.29 | MIT/Apache-2.0 |
| flate2 | 1.1.10 | MIT OR Apache-2.0 |
| fnv | 1.0.7 | Apache-2.0 / MIT |
| foldhash | 0.1.5 | Zlib |
| form_urlencoded | 1.2.2 | MIT OR Apache-2.0 |
| futures-channel | 0.3.34 | MIT OR Apache-2.0 |
| futures-core | 0.3.34 | MIT OR Apache-2.0 |
| futures-macro | 0.3.34 | MIT OR Apache-2.0 |
| futures-sink | 0.3.34 | MIT OR Apache-2.0 |
| futures-task | 0.3.34 | MIT OR Apache-2.0 |
| futures-util | 0.3.34 | MIT OR Apache-2.0 |
| generic-array | 0.14.7 | MIT |
| getrandom | 0.2.17 | MIT OR Apache-2.0 |
| getrandom | 0.3.4 | MIT OR Apache-2.0 |
| h2 | 0.4.20 | MIT |
| hashbrown | 0.15.5 | MIT OR Apache-2.0 |
| hashbrown | 0.17.1 | MIT OR Apache-2.0 |
| hashlink | 0.10.0 | MIT OR Apache-2.0 |
| heck | 0.5.0 | MIT OR Apache-2.0 |
| hex | 0.4.3 | MIT OR Apache-2.0 |
| hmac | 0.12.1 | MIT OR Apache-2.0 |
| http | 1.5.0 | MIT OR Apache-2.0 |
| http-body | 1.1.0 | MIT |
| http-body-util | 0.1.5 | MIT |
| httparse | 1.10.1 | MIT OR Apache-2.0 |
| httpdate | 1.0.3 | MIT OR Apache-2.0 |
| hyper | 1.12.0 | MIT |
| hyper-rustls | 0.27.10 | Apache-2.0 OR ISC OR MIT |
| hyper-util | 0.1.21 | MIT |
| iana-time-zone | 0.1.65 | MIT OR Apache-2.0 |
| icu_collections | 2.1.1 | Unicode-3.0 |
| icu_locale_core | 2.1.1 | Unicode-3.0 |
| icu_normalizer | 2.1.1 | Unicode-3.0 |
| icu_normalizer_data | 2.1.1 | Unicode-3.0 |
| icu_properties | 2.1.2 | Unicode-3.0 |
| icu_properties_data | 2.1.2 | Unicode-3.0 |
| icu_provider | 2.1.1 | Unicode-3.0 |
| idna | 1.1.0 | MIT OR Apache-2.0 |
| idna_adapter | 1.2.1 | Apache-2.0 OR MIT |
| indexmap | 2.14.2 | Apache-2.0 OR MIT |
| instant-acme | 0.8.5 | Apache-2.0 |
| ipnet | 2.12.2 | MIT OR Apache-2.0 |
| is_terminal_polyfill | 1.70.2 | MIT OR Apache-2.0 |
| itoa | 1.0.18 | MIT OR Apache-2.0 |
| json5 | 0.4.1 | ISC |
| lazy_static | 1.5.1 | MIT OR Apache-2.0 |
| libc | 0.2.191 | MIT OR Apache-2.0 |
| libsqlite3-sys | 0.35.0 | MIT |
| linux-raw-sys | 0.12.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| litemap | 0.8.3 | Unicode-3.0 |
| lock_api | 0.4.14 | MIT OR Apache-2.0 |
| log | 0.4.35 | MIT OR Apache-2.0 |
| matchers | 0.2.0 | MIT |
| matchit | 0.8.4 | MIT AND BSD-3-Clause |
| md-5 | 0.10.6 | MIT OR Apache-2.0 |
| memchr | 2.8.3 | Unlicense OR MIT |
| mime | 0.3.17 | MIT OR Apache-2.0 |
| mime_guess | 2.0.5 | MIT |
| minimal-lexical | 0.2.1 | MIT/Apache-2.0 |
| miniz_oxide | 0.9.1 | MIT OR Zlib OR Apache-2.0 |
| mio | 1.2.4 | MIT |
| nom | 7.1.3 | MIT |
| nu-ansi-term | 0.50.3 | MIT |
| num-bigint | 0.4.8 | MIT OR Apache-2.0 |
| num-conv | 0.2.2 | MIT OR Apache-2.0 |
| num-integer | 0.1.47 | MIT OR Apache-2.0 |
| num-traits | 0.2.19 | MIT OR Apache-2.0 |
| oid-registry | 0.8.1 | MIT OR Apache-2.0 |
| once_cell | 1.21.4 | MIT OR Apache-2.0 |
| openssl-probe | 0.2.2 | MIT OR Apache-2.0 |
| parking_lot | 0.12.5 | MIT OR Apache-2.0 |
| parking_lot_core | 0.9.12 | MIT OR Apache-2.0 |
| pem | 4.0.0 | MIT |
| percent-encoding | 2.3.2 | MIT OR Apache-2.0 |
| pest | 2.9.5 | MIT OR Apache-2.0 |
| pest_derive | 2.9.5 | MIT OR Apache-2.0 |
| pest_generator | 2.9.5 | MIT OR Apache-2.0 |
| pest_meta | 2.9.5 | MIT OR Apache-2.0 |
| pest_stack_guard | 1.0.1 | MIT OR Apache-2.0 |
| pin-project-lite | 0.2.17 | Apache-2.0 OR MIT |
| potential_utf | 0.1.6 | Unicode-3.0 |
| powerfmt | 0.2.1 | MIT OR Apache-2.0 |
| ppv-lite86 | 0.2.21 | MIT OR Apache-2.0 |
| proc-macro2 | 1.0.107 | MIT OR Apache-2.0 |
| psm | 0.1.31 | MIT OR Apache-2.0 |
| quote | 1.0.47 | MIT OR Apache-2.0 |
| rand | 0.9.5 | MIT OR Apache-2.0 |
| rand_chacha | 0.9.0 | MIT OR Apache-2.0 |
| rand_core | 0.9.5 | MIT OR Apache-2.0 |
| rcgen | 0.14.10 | MIT OR Apache-2.0 |
| regex-automata | 0.4.18 | MIT OR Apache-2.0 |
| regex-syntax | 0.8.11 | MIT OR Apache-2.0 |
| reqwest | 0.12.28 | MIT OR Apache-2.0 |
| ring | 0.17.14 | Apache-2.0 AND ISC |
| rucloud | 1.7.1 | MIT |
| rusqlite | 0.37.0 | MIT |
| rusticata-macros | 4.1.0 | MIT/Apache-2.0 |
| rustix | 1.1.6 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| rustls | 0.23.46 | Apache-2.0 OR ISC OR MIT |
| rustls-native-certs | 0.8.5 | Apache-2.0 OR ISC OR MIT |
| rustls-pemfile | 2.2.0 | Apache-2.0 OR ISC OR MIT |
| rustls-pki-types | 1.15.1 | MIT OR Apache-2.0 |
| rustls-platform-verifier | 0.7.1 | MIT OR Apache-2.0 |
| rustls-webpki | 0.103.16 | ISC |
| ryu | 1.0.23 | Apache-2.0 OR BSL-1.0 |
| scopeguard | 1.2.0 | MIT OR Apache-2.0 |
| serde | 1.0.229 | MIT OR Apache-2.0 |
| serde_core | 1.0.229 | MIT OR Apache-2.0 |
| serde_derive | 1.0.229 | MIT OR Apache-2.0 |
| serde_json | 1.0.154 | MIT OR Apache-2.0 |
| serde_path_to_error | 0.1.20 | MIT OR Apache-2.0 |
| serde_spanned | 1.1.2 | MIT OR Apache-2.0 |
| serde_urlencoded | 0.7.1 | MIT/Apache-2.0 |
| sha2 | 0.10.9 | MIT OR Apache-2.0 |
| sharded-slab | 0.1.7 | MIT |
| signal-hook-registry | 1.4.8 | MIT OR Apache-2.0 |
| simd-adler32 | 0.3.10 | MIT |
| slab | 0.4.12 | MIT |
| smallvec | 1.16.4 | MIT OR Apache-2.0 |
| socket2 | 0.6.5 | MIT OR Apache-2.0 |
| stable_deref_trait | 1.2.1 | MIT OR Apache-2.0 |
| stacker | 0.1.25 | MIT OR Apache-2.0 |
| strsim | 0.11.1 | MIT |
| subtle | 2.6.1 | BSD-3-Clause |
| syn | 2.0.119 | MIT OR Apache-2.0 |
| syn | 3.0.9 | MIT OR Apache-2.0 |
| sync_wrapper | 1.0.2 | Apache-2.0 |
| synstructure | 0.13.2 | MIT |
| synstructure | 0.14.0 | MIT |
| tar | 0.4.46 | MIT OR Apache-2.0 |
| thiserror | 2.0.21 | MIT OR Apache-2.0 |
| thiserror-impl | 2.0.21 | MIT OR Apache-2.0 |
| thread_local | 1.1.10 | MIT OR Apache-2.0 |
| time | 0.3.55 | MIT OR Apache-2.0 |
| time-core | 0.1.9 | MIT OR Apache-2.0 |
| time-macros | 0.2.32 | MIT OR Apache-2.0 |
| tinystr | 0.8.5 | Unicode-3.0 |
| tokio | 1.54.1 | MIT |
| tokio-macros | 2.7.2 | MIT |
| tokio-rustls | 0.26.6 | MIT OR Apache-2.0 |
| tokio-util | 0.7.20 | MIT |
| toml | 0.9.12+spec-1.1.0 | MIT OR Apache-2.0 |
| toml_datetime | 0.7.5+spec-1.1.0 | MIT OR Apache-2.0 |
| toml_parser | 1.1.5+spec-1.1.0 | MIT OR Apache-2.0 |
| toml_writer | 1.2.0+spec-1.1.0 | MIT OR Apache-2.0 |
| tower | 0.5.3 | MIT |
| tower-http | 0.6.11 | MIT |
| tower-layer | 0.3.3 | MIT |
| tower-service | 0.3.3 | MIT |
| tracing | 0.1.44 | MIT |
| tracing-attributes | 0.1.31 | MIT |
| tracing-core | 0.1.36 | MIT |
| tracing-log | 0.2.0 | MIT |
| tracing-subscriber | 0.3.23 | MIT |
| try-lock | 0.2.5 | MIT |
| typenum | 1.20.1 | MIT OR Apache-2.0 |
| ucd-trie | 0.1.7 | MIT OR Apache-2.0 |
| unicase | 2.10.0 | MIT OR Apache-2.0 |
| unicode-ident | 1.0.27 | AND Unicode-3.0 |
| untrusted | 0.9.0 | ISC |
| url | 2.5.8 | MIT OR Apache-2.0 |
| urlencoding | 2.1.3 | MIT |
| utf8_iter | 1.1.0 | Apache-2.0 OR MIT |
| utf8parse | 0.2.2 | Apache-2.0 OR MIT |
| utf_types | 1.0.0 | Apache-2.0 OR MIT |
| want | 0.3.2 | MIT |
| webpki-roots | 1.0.11 | CDLA-Permissive-2.0 |
| winnow | 0.6.26 | MIT |
| winnow | 0.7.15 | MIT |
| winnow | 1.0.4 | MIT |
| writeable | 0.6.4 | Unicode-3.0 |
| x509-parser | 0.18.1 | MIT OR Apache-2.0 |
| xattr | 1.7.0 | MIT OR Apache-2.0 |
| yasna | 0.6.0 | MIT OR Apache-2.0 |
| yoke | 0.8.4 | Unicode-3.0 |
| yoke-derive | 0.8.4 | Unicode-3.0 |
| zerocopy | 0.8.63 | BSD-2-Clause OR Apache-2.0 OR MIT |
| zerofrom | 0.1.8 | Unicode-3.0 |
| zerofrom-derive | 0.1.8 | Unicode-3.0 |
| zeroize | 1.9.1 | Apache-2.0 OR MIT |
| zerotrie | 0.2.5 | Unicode-3.0 |
| zerovec | 0.11.9 | Unicode-3.0 |
| zerovec-derive | 0.11.7 | Unicode-3.0 |
| zmij | 1.0.23 | MIT |

## Debian 套件

| 套件 | 版本 | 授權（copyright 檔裡的 License 欄位） |
|---|---|---|
| adduser | 3.152 | GPL-2+ |
| apt | 3.0.4 | BSD-3-clause; Expat; GPL-2; GPL-2+; GPL-2+ and curl; curl |
| base-files | 13.8+deb13u7 | GPL-2+; verbatim |
| base-passwd | 3.6.7 | GPL-2; public-domain |
| bash | 5.2.37-2+b10 | BSD-4-clause-UC; BSD-4-clause-UC and MIT-like; GFDL-NIV-1.3; GPL-2+; GPL-3+; GPL-3+ with Bison exception; Latex2e; MIT-like; permissive |
| bsdutils | 1:2.41.5-0+deb13u1 | BSD-2-clause; BSD-3-clause; BSD-4-clause; BSLA; Expat; GPL-2; GPL-2+; GPL-3+; ISC; LGPL; LGPL-2+; LGPL-2.1+; LGPL-3+; public-domain |
| coreutils | 9.7-3 | BSD-4-clause-UC; FSFULLR; GFDL-NIV-1.3; GPL-3+; GPL-3+ and BSD-4-clause-UC; GPL-3+ and ISC; ISC |
| dash | 0.5.12-12 | BSD-3-Clause; BSD-3-clause; GPL-2+; public-domain |
| debconf | 1.5.91 | BSD-2-clause |
| debian-archive-keyring | 2025.1 | 不是機器可讀格式，見 /usr/share/doc/debian-archive-keyring/copyright |
| debianutils | 5.23.2 | GPL-2+; SMAIL-GPL; public-domain |
| diffutils | 1:3.10-4 | FSFAP; FSFULLR; GFDL-NIV-1.3; GPL-2+; GPL-3+; GPL-3+ and FSFULLR; GPL-3+ with autoconf exception; GPL-3+ with texinfo exception; LGPL-2.0+; LGPL-2.1+; LGPL-3.0+; LGPL-3.0+ or GPL-2+; X11; public-domain |
| dpkg | 1.22.22 | GPL-2+; public-domain-s-s-d |
| e2fsprogs | 1.47.2-3+b12 | 0BSD; Apache-2; BSD-3-Clause; BSD-3-Clause-Variant; BSD-4-Clause-CMU; Expat; GPL or MIT-US-export; GPL-2; GPL-2+; GPL-2+ with Texinfo exception; ISC; Kazlib; LGPL-2; Latex2e |
| findutils | 4.10.0-3 | BSD-3-clause; BSD-3-clause or GPL-3+; BSD-3-clause or LGPL-2.1+; BSD-3-clause or LGPL-3+; FSFAP; FSFULLR; FSFULLR or GPL or LGPL; GFDL-NIV-1.3+; GFDL-NIV-1.3+ or GFDL-NIV-1.3+; GPL; GPL with automake exception; GPL-2+; GPL-2+ with Autoconf-data exception; GPL-3+; GPL-3+ with Autoconf-data exception; GPL-3+ with Bison-2.2 exception; ISC; ISC or LGPL-2.1+; LGPL; LGPL-2+; LGPL-2.1+; LGPL-3; LGPL-3+; X11; public-domain |
| gcc-14-base | 14.2.0-19 | 不是機器可讀格式，見 /usr/share/doc/gcc-14-base/copyright |
| grep | 3.11-4+b1 | GPL-3+ |
| gzip | 1.13-1+deb13u1 | FSF-manpages; GFDL-1.3+-no-invariant; GPL-3+ |
| hostname | 3.25 | GPL-2 |
| init-system-helpers | 1.69~deb13u1 | BSD-3-clause; GPL-2+ |
| libacl1 | 2.3.2-2+b1 | GPL-2+; LGPL-2+ |
| libapt-pkg7.0 | 3.0.4 | BSD-3-clause; Expat; GPL-2; GPL-2+; GPL-2+ and curl; curl |
| libattr1 | 1:2.5.2-3 | GPL-2+; LGPL-2+ |
| libaudit-common | 1:4.0.2-2+deb13u1 | GPL-2; LGPL-2.1 |
| libaudit1 | 1:4.0.2-2+deb13u1 | GPL-2; LGPL-2.1 |
| libblkid1 | 2.41.5-0+deb13u1 | BSD-2-clause; BSD-3-clause; BSD-4-clause; BSLA; Expat; GPL-2; GPL-2+; GPL-3+; ISC; LGPL; LGPL-2+; LGPL-2.1+; LGPL-3+; public-domain |
| libbsd0 | 0.12.2-2 | BSD-2-clause; BSD-2-clause-NetBSD; BSD-2-clause-author; BSD-2-clause-verbatim; BSD-3-clause; BSD-3-clause-John-Birrell; BSD-3-clause-Regents; BSD-3-clause-Regents and BSD-2-clause-NetBSD; BSD-3-clause-author; BSD-5-clause-Peter-Wemm; Beerware; Expat; ISC; ISC-Original; public-domain |
| libbz2-1.0 | 1.0.8-6 | BSD-variant; GPL-2 |
| libc-bin | 2.41-12+deb13u4 | BSD-2-clause; BSD-2-clause or GPL-2; BSD-3-clause-Berkeley; BSD-3-clause-Berkeley and BSD-3-clause-WIDE; BSD-3-clause-Berkeley and DEC; BSD-3-clause-Berkeley and DEC and IBM and ISC; BSD-3-clause-Berkeley and DEC and ISC; BSD-3-clause-Berkeley and DEC and ISC and LGPL-2.1+; BSD-3-clause-Berkeley and DEC and LGPL-2.1+; BSD-3-clause-Berkeley and ISC; BSD-3-clause-Berkeley and LGPL-2.1+; BSD-3-clause-Berkeley and LGPL-2.1+ and Univ-Coimbra; BSD-3-clause-Carnegie; BSD-3-clause-Oracle; BSD-3-clause-WIDE; BSD-like-Spencer; BSL-1.0; CORE-MATH; Carnegie; Carnegie and LGPL-2.1+; DEC; FSFAP; GPL-2; GPL-2+; GPL-2+-with-link-exception; GPL-3+; IBM; IBM and ISC; ISC; ISC and LGPL-2.1+; Inner-Net; Inner-Net and LGPL-2.1+; LGPL-2+; LGPL-2.1+; LGPL-2.1+ and GPL-2; LGPL-2.1+ and SunPro; LGPL-2.1+-with-link-exception; LGPL-3+; MIT-like-Lord; PCRE; SunPro; Unicode-DFS-2016; Univ-Coimbra; public-domain |
| libc6 | 2.41-12+deb13u4 | BSD-2-clause; BSD-2-clause or GPL-2; BSD-3-clause-Berkeley; BSD-3-clause-Berkeley and BSD-3-clause-WIDE; BSD-3-clause-Berkeley and DEC; BSD-3-clause-Berkeley and DEC and IBM and ISC; BSD-3-clause-Berkeley and DEC and ISC; BSD-3-clause-Berkeley and DEC and ISC and LGPL-2.1+; BSD-3-clause-Berkeley and DEC and LGPL-2.1+; BSD-3-clause-Berkeley and ISC; BSD-3-clause-Berkeley and LGPL-2.1+; BSD-3-clause-Berkeley and LGPL-2.1+ and Univ-Coimbra; BSD-3-clause-Carnegie; BSD-3-clause-Oracle; BSD-3-clause-WIDE; BSD-like-Spencer; BSL-1.0; CORE-MATH; Carnegie; Carnegie and LGPL-2.1+; DEC; FSFAP; GPL-2; GPL-2+; GPL-2+-with-link-exception; GPL-3+; IBM; IBM and ISC; ISC; ISC and LGPL-2.1+; Inner-Net; Inner-Net and LGPL-2.1+; LGPL-2+; LGPL-2.1+; LGPL-2.1+ and GPL-2; LGPL-2.1+ and SunPro; LGPL-2.1+-with-link-exception; LGPL-3+; MIT-like-Lord; PCRE; SunPro; Unicode-DFS-2016; Univ-Coimbra; public-domain |
| libcap-ng0 | 0.8.5-4+b1 | GPL-2+; GPL-3; LGPL-2.1+ |
| libcap2 | 1:2.75-10+deb13u1+b3 | BSD-3-clause; BSD-3-clause or GPL-2; BSD-3-clause or GPL-2+; GPL-2; GPL-2+ |
| libcom-err2 | 1.47.2-3+b12 | 0BSD; Apache-2; BSD-3-Clause; BSD-3-Clause-Variant; BSD-4-Clause-CMU; Expat; GPL or MIT-US-export; GPL-2; GPL-2+; GPL-2+ with Texinfo exception; ISC; Kazlib; LGPL-2; Latex2e |
| libcrypt1 | 1:4.4.38-1 | 不是機器可讀格式，見 /usr/share/doc/libcrypt1/copyright |
| libdb5.3t64 | 5.3.28+dfsg2-9 | Artistic or BSD-3-clause; BSD-3-clause; BSD-3-clause-fjord; GPL; GPL or Artistic; GPL-3; MIT-old; Ms-PL; Sleepycat; Sleepycat and BSD-3-clause; TCL-like; X11; zlib |
| libdebconfclient0 | 0.280 | BSD-2-Clause; BSD-2-clause; GPL-2+ |
| libext2fs2t64 | 1.47.2-3+b12 | 0BSD; Apache-2; BSD-3-Clause; BSD-3-Clause-Variant; BSD-4-Clause-CMU; Expat; GPL or MIT-US-export; GPL-2; GPL-2+; GPL-2+ with Texinfo exception; ISC; Kazlib; LGPL-2; Latex2e |
| libgcc-s1 | 14.2.0-19 | 不是機器可讀格式，見 /usr/share/doc/libgcc-s1/copyright |
| libgmp10 | 2:6.3.0+dfsg-3 | GPL-2+; GPL-2+ or LGPL-3+; GPL-3+; GPL-3+ with Bison exception; LGPL-3+ |
| libhogweed6t64 | 3.10.1-1 | Expat; GAP; GPL-2; GPL-2+; GPL-3+ with Autoconf exception; LGPL-2+; LGPL-3+; LGPL-3+ or GPL-2+; public-domain |
| liblastlog2-2 | 2.41.5-0+deb13u1 | BSD-2-clause; BSD-3-clause; BSD-4-clause; BSLA; Expat; GPL-2; GPL-2+; GPL-3+; ISC; LGPL; LGPL-2+; LGPL-2.1+; LGPL-3+; public-domain |
| liblz4-1 | 1.10.0-4 | BSD-2-clause; BSD-2-clause or GPL-2+; GPL-2+ |
| liblzma5 | 5.8.1-1+deb13u2 | ; 0BSD; FSFUL; FSFULLR; GPL-2+; GPL-3.0-or-later-WITH-Autoconf-exception-macro; LGPL-2.1+; PD; PD-debian; noderivs; none; permissive-nowarranty |
| libmd0 | 1.1.0-2+b1 | BSD-2-clause; BSD-2-clause-NetBSD; BSD-3-clause; BSD-3-clause-Aaron-D-Gifford; Beerware; ISC; public-domain-md4; public-domain-md5; public-domain-sha1 |
| libmount1 | 2.41.5-0+deb13u1 | BSD-2-clause; BSD-3-clause; BSD-4-clause; BSLA; Expat; GPL-2; GPL-2+; GPL-3+; ISC; LGPL; LGPL-2+; LGPL-2.1+; LGPL-3+; public-domain |
| libnettle8t64 | 3.10.1-1 | Expat; GAP; GPL-2; GPL-2+; GPL-3+ with Autoconf exception; LGPL-2+; LGPL-3+; LGPL-3+ or GPL-2+; public-domain |
| libpam-modules | 1.7.0-5 | BSD-3-clause or GPL; BSD-tcp_wrappers; Beerware; GPL-2; GPL-2+; GPL-3; GPL-3+ with Bison exception; LGPL-2+; public-domain |
| libpam-modules-bin | 1.7.0-5 | BSD-3-clause or GPL; BSD-tcp_wrappers; Beerware; GPL-2; GPL-2+; GPL-3; GPL-3+ with Bison exception; LGPL-2+; public-domain |
| libpam-runtime | 1.7.0-5 | BSD-3-clause or GPL; BSD-tcp_wrappers; Beerware; GPL-2; GPL-2+; GPL-3; GPL-3+ with Bison exception; LGPL-2+; public-domain |
| libpam0g | 1.7.0-5 | BSD-3-clause or GPL; BSD-tcp_wrappers; Beerware; GPL-2; GPL-2+; GPL-3; GPL-3+ with Bison exception; LGPL-2+; public-domain |
| libpcre2-8-0 | 10.46-1~deb13u3 | BSD-2-clause; BSD-3-clause; BSD-3-clause-Cambridge with BINARY LIBRARY-LIKE PACKAGES exception; X11; public-domain |
| libseccomp2 | 2.6.0-2 | LGPL-2.1 |
| libselinux1 | 3.8.1-1 | GPL-2; public-domain |
| libsemanage-common | 3.8.1-1 | GPL-2; LGPL-2.1+ |
| libsemanage2 | 3.8.1-1 | GPL-2; LGPL-2.1+ |
| libsepol2 | 3.8.1-1 | GPL-2; GPL-2+; LGPL-2.1+; Zlib |
| libsmartcols1 | 2.41.5-0+deb13u1 | BSD-2-clause; BSD-3-clause; BSD-4-clause; BSLA; Expat; GPL-2; GPL-2+; GPL-3+; ISC; LGPL; LGPL-2+; LGPL-2.1+; LGPL-3+; public-domain |
| libsqlite3-0 | 3.46.1-7+deb13u2 | GPL-2+; public-domain |
| libss2 | 1.47.2-3+b12 | 0BSD; Apache-2; BSD-3-Clause; BSD-3-Clause-Variant; BSD-4-Clause-CMU; Expat; GPL or MIT-US-export; GPL-2; GPL-2+; GPL-2+ with Texinfo exception; ISC; Kazlib; LGPL-2; Latex2e |
| libssl3t64 | 3.5.7-1~deb13u3 | Apache-2.0; Artistic; Artistic or GPL-1+; GPL-1+ |
| libstdc++6 | 14.2.0-19 | 不是機器可讀格式，見 /usr/share/doc/libstdc++6/copyright |
| libsystemd0 | 257.13-1~deb13u1 | CC0-1.0; Expat; GPL-2 with Linux-syscall-note exception; GPL-2+; LGPL-2.1+; public-domain |
| libtinfo6 | 6.5+20250216-2 | BSD-3-clause; MIT/X11; X11 |
| libudev1 | 257.13-1~deb13u1 | CC0-1.0; Expat; GPL-2 with Linux-syscall-note exception; GPL-2+; LGPL-2.1+; public-domain |
| libuuid1 | 2.41.5-0+deb13u1 | BSD-2-clause; BSD-3-clause; BSD-4-clause; BSLA; Expat; GPL-2; GPL-2+; GPL-3+; ISC; LGPL; LGPL-2+; LGPL-2.1+; LGPL-3+; public-domain |
| libxxhash0 | 0.8.3-2 | BSD-2-clause; BSD-2-clause or GPL-2+; GPL-2+ |
| libzstd1 | 1.5.7+dfsg-1 | BSD-3-clause; BSD-3-clause or GPL-2; Expat; GPL-2; zlib |
| login | 1:4.16.0-2+really2.41.5-0+deb13u1 | BSD-2-clause; BSD-3-clause; BSD-4-clause; BSLA; Expat; GPL-2; GPL-2+; GPL-3+; ISC; LGPL; LGPL-2+; LGPL-2.1+; LGPL-3+; public-domain |
| login.defs | 1:4.17.4-2 | BSD-3-clause; GPL-1; GPL-2+ |
| logsave | 1.47.2-3+b12 | 0BSD; Apache-2; BSD-3-Clause; BSD-3-Clause-Variant; BSD-4-Clause-CMU; Expat; GPL or MIT-US-export; GPL-2; GPL-2+; GPL-2+ with Texinfo exception; ISC; Kazlib; LGPL-2; Latex2e |
| mawk | 1.3.4.20250131-1 | CC-BY-3.0; GPL-2.0-only; X11 |
| mount | 2.41.5-0+deb13u1 | BSD-2-clause; BSD-3-clause; BSD-4-clause; BSLA; Expat; GPL-2; GPL-2+; GPL-3+; ISC; LGPL; LGPL-2+; LGPL-2.1+; LGPL-3+; public-domain |
| ncurses-base | 6.5+20250216-2 | BSD-3-clause; MIT/X11; X11 |
| ncurses-bin | 6.5+20250216-2 | BSD-3-clause; MIT/X11; X11 |
| openssl-provider-legacy | 3.5.7-1~deb13u3 | Apache-2.0; Artistic; Artistic or GPL-1+; GPL-1+ |
| passwd | 1:4.17.4-2 | BSD-3-clause; GPL-1; GPL-2+ |
| perl-base | 5.40.1-6+deb13u1 | Artistic; Artistic or GPL-1+; Artistic or GPL-1+ or Artistic-dist; Artistic-2; Artistic-dist; BSD-3-clause; BSD-3-clause-GENERIC; BSD-3-clause-with-weird-numbering; BSD-4-clause-POWERDOG; BZIP; CC0-1.0; DONT-CHANGE-THE-GPL; Expat; Expat or GPL-1+ or Artistic; FSFAP; GPL-1+; GPL-1+ or Artistic; GPL-1+ or Artistic or Artistic-dist; GPL-1+ or Artistic, and BSD-3-clause-GENERIC; GPL-1+ or Artistic, and BSD-4-clause-POWERDOG; GPL-1+ or Artistic, and Expat; GPL-1+ or Artistic, and Unicode; GPL-2+; GPL-2+ or Artistic; GPL-3+-WITH-BISON-EXCEPTION; LGPL-2.1; REGCOMP; REGCOMP, and GPL-1+ or Artistic; SDBM-PUBLIC-DOMAIN; TEXT-TABS; Unicode; ZLIB |
| sed | 4.9-2+deb13u1 | BSD-4-clause-UC; BSL-1; GFDL-NIV-1.3+; GPL-3+; GPL-3+ and ISC; ISC; X11; pcre |
| sqv | 1.3.0-3+b2 | LGPL-2.0-or-later |
| sysvinit-utils | 3.14-4 | GPL-2.0; GPL-2.0+; GPL-3.0; LGPL-2.1+ |
| tar | 1.35+dfsg-3.1 | GPL-2+; GPL-3+; GPL-3+ with Bison exception; LGPL-2.1+; LGPL-3+ |
| tzdata | 2026f-0+deb13u1 | public-domain |
| util-linux | 2.41.5-0+deb13u1 | BSD-2-clause; BSD-3-clause; BSD-4-clause; BSLA; Expat; GPL-2; GPL-2+; GPL-3+; ISC; LGPL; LGPL-2+; LGPL-2.1+; LGPL-3+; public-domain |
| zlib1g | 1:1.3.dfsg+really1.3.1-1+b1 | Zlib |
