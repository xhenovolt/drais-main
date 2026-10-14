#!/usr/bin/env bash
# show.sh <file>... : exact source lines holding hardcoded text, plus what the extractor misses.
for f in "$@"; do
  echo "=================== $f ($(wc -l < "$f") lines)"
  node scripts/l10n-extract.mjs "$f" | grep -v " text-\| bg-\|setForm\|^==\|strings in\|^$" | awk '{print $1}' | sort -un | while read n; do
    sed -n "${n}p" "$f" | sed "s/^ */$n: /" | cut -c1-260
  done
  echo "-- extra"
  grep -nE "[a-zA-Z]rrors\.[a-zA-Z_]+ = ['\"]|throw new Error\(|\`[^\`]*[A-Za-z]{3,} [^\`]*\\$\{[^\`]*\`|\.length\}|\.size\}|toLocale|toFixed|const t = |\(t\) =>|\bt =>|[cC]ount\}|[tT]otal\}|%<|\}%" "$f" | cut -c1-230
  echo "-- structure"
  grep -nE "React\.FC|^export default function|^export function|^function |^const [A-Z][A-Za-z]* = \(|useI18n|^import .*lucide-react|^\} from 'lucide-react'" "$f" | cut -c1-150 | head -14
done
