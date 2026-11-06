#!/usr/bin/env bash
# One OS's part of latest.json. `updater-manifest.sh` merges them once every OS has built.
#   updater-fragment.sh <out.json> <target> <variant> <asset>
# e.g. updater-fragment.sh fragment.json windows-x86_64 nsis trace-v1.0.0-windows-setup.exe
# Reads RELEASE_TAG and GITHUB_REPOSITORY; the signature is expected at release-assets/<asset>.sig.
set -euo pipefail
out="$1" target="$2" variant="$3" asset="$4"

jq -n \
  --arg target "$target" \
  --arg variant "$target-$variant" \
  --arg url "https://github.com/${GITHUB_REPOSITORY}/releases/download/${RELEASE_TAG}/${asset}" \
  --arg signature "$(cat "release-assets/${asset}.sig")" \
  '{
    ($target): { url: $url, signature: $signature },
    ($variant): { url: $url, signature: $signature }
  }' > "$out"
