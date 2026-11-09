#!/usr/bin/env bash
# trace-hook, in a sandbox: appends a Claude Code hook event (or a `pr` from the
# gh shim) to ~/.trace/events.log, which trace reads when it attaches. Written
# by trace on every start; not for manual use. Always exits 0: a failing Stop
# hook must never keep Claude from stopping.
dir="$HOME/.trace"
mkdir -p "$dir" 2>/dev/null || exit 0
# The event's JSON input rides along base64-encoded, keeping each line one line.
payload=""
if [ ! -t 0 ]; then
  payload="$(base64 -w0 2>/dev/null)"
fi
{
  flock 9 2>/dev/null
  log="$dir/events.log"
  n=0
  [ -f "$log" ] && n=$(wc -l < "$log")
  printf '%s %s %s\n' "$((n + 1))" "${1:-}" "$payload" >> "$log"
} 9>>"$dir/events.lock"
exit 0
