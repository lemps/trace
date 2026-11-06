#!/usr/bin/env bash
# OS-specific code belongs in src-tauri/src/platform/ and src/platform/. Fails, naming
# each line, if any has leaked out. Tests may be OS-specific: they only exercise it.
set -euo pipefail
cd "$(dirname "$0")/.."

status=0

report() {
  local message="$1" found="$2"
  if [ -n "$found" ]; then
    echo "$message"
    echo "$found"
    status=1
  fi
}

# Skips: the adapters themselves, test modules, and Tauri's standard Windows attribute.
rust_sources() {
  find src-tauri/src -name '*.rs' \
    -not -path 'src-tauri/src/platform/*' \
    -not -path '*/tests/*' \
    -not -name 'tests.rs' \
    -not -name 'main.rs'
}

report "OS checks outside platform/ (add to a port instead):" \
  "$(rust_sources | xargs grep -nE 'cfg!?\((all\()?(not\()?(unix|windows|target_os)' | grep -v 'cfg(all(test' || true)"
report "OS APIs outside platform/ (add to a port instead):" \
  "$(rust_sources | xargs grep -nE 'std::os::|libc::' || true)"

# The UI asks src/platform/ what OS it's on.
report "OS checks outside src/platform/:" \
  "$(grep -rnE 'navigator\.(platform|userAgent)' src --include='*.ts' --include='*.tsx' \
    | grep -v '^src/platform/' || true)"

if [ "$status" -eq 0 ]; then
  echo "Platform boundary OK."
fi
exit "$status"
