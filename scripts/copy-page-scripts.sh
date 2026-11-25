#!/bin/bash
# browser bundles injected into pages are read from assets at runtime, in dev and in releases alike
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
resolve() { node -e 'console.log(require.resolve(process.argv[2],{paths:[process.argv[1]]}))' "$ROOT/browser" "$1"; }
mkdir -p "$ROOT/assets/react-grab" "$ROOT/assets/darkreader"
cp "$(resolve react-grab/dist/index.global.js)" "$ROOT/assets/react-grab/index.global.js"
cp "$(resolve darkreader/darkreader.js)" "$ROOT/assets/darkreader/darkreader.js"
