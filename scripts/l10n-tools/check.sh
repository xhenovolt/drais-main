#!/usr/bin/env bash
# check.sh <out-dir> <render args...> : runs the render harness and prints only what matters.
out="$(cd "$(dirname "$1")" 2>/dev/null && pwd)/$(basename "$1")"; mkdir -p "$out"; shift
node scripts/l10n-render.mjs "$@" --out "$out" 2>&1 | grep -v "Screenshots\|Requests the page\|restores the same\|containing Arabic script\|^  English :\|^  Arabic  :" | cut -c1-200
