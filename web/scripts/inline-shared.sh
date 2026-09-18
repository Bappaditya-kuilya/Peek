#!/bin/sh
# Inline shared utils into zero-build targets (receiver-src + public).
# Strips ES module exports so files load as classic scripts.
set -e
DIR=$(cd "$(dirname "$0")/.." && pwd)
SRC="$DIR/src/shared"
for target in "$DIR/public/receiver" "$DIR/public"; do
  # Explicit per-target lists: only what the pages import. Adding a new shared
  # util? Add its name here or its inlined copy won't exist.
  case "$target" in
    */receiver) files="format.js sanitize.js crypto.js packetProtocol.js clipboardCrypto.js";;
    *) files="crypto.js";;
  esac
  for name in $files; do
    sed 's/^export //; /^import /d' "$SRC/$name" > "$target/inlined-$name"
  done
done