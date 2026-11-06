#!/usr/bin/env bash
# Build latest.json from each OS's fragment. Fails unless all of them are present, so a
# release can't tell one OS's users about an update that only exists for another's.
#   updater-manifest.sh <fragments-dir> <version> <pub-date> <notes-file> <out.json>
set -euo pipefail
dir="$1" version="$2" pub_date="$3" notes="$4" out="$5"

for os in macos linux windows; do
  if [ ! -f "$dir/$os.json" ]; then
    echo "::error::No updater fragment for $os; not publishing latest.json." >&2
    exit 1
  fi
done

jq -s \
  --arg version "$version" \
  --rawfile notes "$notes" \
  --arg pub_date "$pub_date" \
  '{
    version: $version,
    notes: ($notes | rtrimstr("\n")),
    pub_date: $pub_date,
    platforms: (add)
  }' "$dir/macos.json" "$dir/linux.json" "$dir/windows.json" > "$out"
