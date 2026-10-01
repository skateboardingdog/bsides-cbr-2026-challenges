#!/bin/bash

set -euo pipefail
cd "$(dirname "$0")"

OUT="publish/grid-admin.zip"
mkdir -p publish
rm -f "$OUT"

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
cp -r src "$STAGING/grid-admin"

echo "skbdg{testflag}" > "$STAGING/grid-admin/flag.txt"

( cd "$STAGING" && zip -rqX grid-admin.zip grid-admin \
    -x '**/.DS_Store' '**/__pycache__/*' '*.pyc' )
mv "$STAGING/grid-admin.zip" "$OUT"

echo "built $OUT"
