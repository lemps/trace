#!/usr/bin/env bash
# gh, as trace's agents in a sandbox see it: the real gh, plus a note to trace
# (trace-hook pr) of each PR `gh pr create` opens, so trace links the PR to the
# session whatever branch it came from. Written by trace on every start.
self_dir="$(cd "$(dirname "$0")" && pwd)"
real=""
IFS=: read -ra dirs <<< "$PATH"
for d in "${dirs[@]}"; do
  [ "$d" = "$self_dir" ] && continue
  if [ -x "$d/gh" ]; then real="$d/gh"; break; fi
done
[ -n "$real" ] || { echo "gh: not installed" >&2; exit 127; }

# The first two words that aren't `-R <repo>` / `--repo <repo>`: `pr create`?
words=()
skip=""
for a in "$@"; do
  if [ -n "$skip" ]; then skip=""; continue; fi
  case "$a" in
    -R|--repo) skip=1 ;;
    -R*|--repo=*) ;;
    *) words+=("$a") ;;
  esac
  [ "${#words[@]}" -ge 2 ] && break
done
case "${words[0]:-} ${words[1]:-}" in
  "pr create"|"pr new") ;;
  *) exec "$real" "$@" ;;
esac

out="$(mktemp)"
"$real" "$@" | tee "$out"
status=${PIPESTATUS[0]}
url="$(grep -Eo 'https://github\.com/[^/ ]+/[^/ ]+/pull/[0-9]+' "$out" | tail -n 1)"
rm -f "$out"
if [ -n "$url" ]; then
  printf '{"url":"%s"}' "$url" | "$self_dir/trace-hook" pr >/dev/null 2>&1
fi
exit "$status"
