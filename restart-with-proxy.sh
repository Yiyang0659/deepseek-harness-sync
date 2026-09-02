#!/bin/bash
# Robust restart for DSH Web (PID on :3080), detached scheduler.
# 1) kill the current :3080 listener  2) wait for the host (ChatGPT/Codex) to
# respawn it OR start a fallback with the Clash proxy env vars.
set -uo pipefail
PROXY="${DSH_PROXY_HTTP:-http://127.0.0.1:7897}"
LOG="$HOME/.dsh/restart-with-proxy.log"
ts() { date '+%F %T'; }

OLD=$(lsof -nP -iTCP:3080 -sTCP:LISTEN -t 2>/dev/null | head -1 || true)
if [ -n "$OLD" ]; then
  echo "[$(ts)] killing old dsh web pid=$OLD" >> "$LOG"
  kill "$OLD" 2>/dev/null || true
  for i in $(seq 1 20); do
    kill -0 "$OLD" 2>/dev/null || break
    sleep 0.5
  done
fi
# wait until the port is actually free
for i in $(seq 1 20); do
  if ! lsof -nP -iTCP:3080 -sTCP:LISTEN >/dev/null 2>&1; then break; fi
  sleep 0.5
done

export HTTPS_PROXY="$PROXY"
export HTTP_PROXY="$PROXY"
export ALL_PROXY="socks5://127.0.0.1:7897"
export NO_PROXY="127.0.0.1,localhost"

if lsof -nP -iTCP:3080 -sTCP:LISTEN >/dev/null 2>&1; then
  NEW=$(lsof -nP -iTCP:3080 -sTCP:LISTEN -t 2>/dev/null | head -1)
  echo "[$(ts)] port already re-listened by host-spawned pid=$NEW (no fallback start)" >> "$LOG"
else
  nohup "$HOME/.npm-global/bin/dsh" web --no-open >> "$LOG" 2>&1 &
  echo "[$(ts)] fallback: started dsh web with proxy via nohup pid=$!" >> "$LOG"
fi

# final readiness check
for i in $(seq 1 40); do
  if lsof -nP -iTCP:3080 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "[$(ts)] READY: 127.0.0.1:3080 listening (pid $(lsof -nP -iTCP:3080 -sTCP:LISTEN -t 2>/dev/null | head -1))" >> "$LOG"
    exit 0
  fi
  sleep 1
done
echo "[$(ts)] WARN: :3080 not listening after 40s" >> "$LOG"
exit 1