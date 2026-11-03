#!/usr/bin/env bash
set -euo pipefail
tools="$1"
mkdir -p "$tools"
cd "$tools"
curl --fail --location --silent --show-error https://ftp.postgresql.org/pub/source/v17.5/postgresql-17.5.tar.bz2 -o postgresql-17.5.tar.bz2
echo 'fcb7ab38e23b264d1902cb25e6adafb4525a6ebcbd015434aeef9eda80f528d8  postgresql-17.5.tar.bz2' | sha256sum --check
tar -xjf postgresql-17.5.tar.bz2
cd postgresql-17.5
./configure --prefix="$tools/pg17.5" --without-readline --without-icu > "$tools/postgres-build.log" 2>&1
make -j2 >> "$tools/postgres-build.log" 2>&1
make install >> "$tools/postgres-build.log" 2>&1
cd "$tools"
curl --fail --location --silent --show-error https://github.com/PostgREST/postgrest/releases/download/v16.5/postgrest-v16.5-linux-static-x86-64.tar.xz -o postgrest-v16.5-linux-static-x86-64.tar.xz
echo '5099e7ada38f9f6846cd87c14c5f158b7c165f1e9959665ad412e61f4dceba95  postgrest-v16.5-linux-static-x86-64.tar.xz' | sha256sum --check
mkdir -p postgrest
tar -xJf postgrest-v16.5-linux-static-x86-64.tar.xz -C postgrest
"$tools/pg17.5/bin/postgres" --version
"$tools/postgrest/postgrest" --version
sha256sum postgresql-17.5.tar.bz2 postgrest-v16.5-linux-static-x86-64.tar.xz > provenance.sha256
