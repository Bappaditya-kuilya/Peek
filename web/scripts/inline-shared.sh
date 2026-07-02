#!/bin/sh
# Inline shared utils into zero-build targets (receiver-src + public).
# Strips ES module exports so files load as classic scripts.
set -e
DIR=$(cd "$(dirname "$0")/.." && pwd)
SRC="$DIR/src/shared"
for target in "$DIR/public/receiver" "$DIR/public"; do
  for src in "$SRC"/*.js; do
    name=$(basename "$src")
    sed 's/^export //; /^import /d' "$src" > "$target/inlined-$name"
  done
done