#!/usr/bin/env bash
# trace-keepalive, in a sandbox: keeps it running while its agent works, and
# stops it (which saves it, for Start to resume) once nothing has happened for
# a while, so a session left with trace closed neither dies mid-turn nor runs
# on for nothing. Started by trace on every start; one runs at a time. Its
# calls carry no token: the sandbox's network adds one for this session's
# extend and stop alone. Settings come from the env trace starts it with.
dir="$HOME/.trace"
mkdir -p "$dir"
pidfile="$dir/keepalive.pid"
if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
  exit 0
fi
echo $$ > "$pidfile"

every=${TRACE_KEEPALIVE_EVERY:-60}
idle_limit=${TRACE_IDLE_SECS:-300}
max=${TRACE_MAX_SECS:-21600}
extend_every=${TRACE_EXTEND_EVERY:-600}
extend_ms=${TRACE_EXTEND_MS:-900000}
started=$(date +%s)
last_busy=$started
last_extend=0

log() { echo "$(date -u +%FT%TZ) $*" >> "$dir/keepalive.log"; }

call() {
  curl -sS -m 20 -o /dev/null -w '%{http_code}' -X POST \
    -H 'Authorization: Bearer trace-egress-injects-the-vercel-token' \
    -H 'Content-Type: application/json' -d "$2" "$1" 2>/dev/null
}

# Someone's watching (a terminal attached, trace's heartbeat), or Claude is in
# a turn, or a turn ended with background work still going.
working() {
  tmux list-clients 2>/dev/null | grep -q . && return 0
  if [ -f "$dir/attached" ]; then
    [ $(( $(date +%s) - $(stat -c %Y "$dir/attached") )) -lt 300 ] && return 0
  fi
  pgrep -x claude >/dev/null 2>&1 || return 1
  last=$(grep -E '^[0-9]+ (prompt|stop) ' "$dir/events.log" 2>/dev/null | tail -n 1)
  case "$last" in
    *" prompt "*) return 0 ;;
    *" stop "*)
      echo "${last##* }" | base64 -d 2>/dev/null | grep -Eq '"background_tasks": ?\[ ?\{' && return 0
      ;;
  esac
  return 1
}

log "started"
while :; do
  now=$(date +%s)
  if [ $(( now - started )) -ge "$max" ]; then
    log "ran $max s: stopping ($(call "$TRACE_KEEPALIVE_STOP" '{}'))"
    exit 0
  fi
  if working; then
    last_busy=$now
    if [ $(( now - last_extend )) -ge "$extend_every" ]; then
      log "working: extend $(call "$TRACE_KEEPALIVE_EXTEND" "{\"duration\":$extend_ms}")"
      last_extend=$now
    fi
  elif [ $(( now - last_busy )) -ge "$idle_limit" ]; then
    log "idle $idle_limit s: stopping ($(call "$TRACE_KEEPALIVE_STOP" '{}'))"
    exit 0
  fi
  sleep "$every"
done
