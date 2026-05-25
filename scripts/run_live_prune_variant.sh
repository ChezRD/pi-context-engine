#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 6 ]; then
  echo "usage: $0 <home_dir> <session_dir> <include_context:true|false> <head_chars> <tail_chars> <label>" >&2
  exit 1
fi

HOME_DIR="$1"
SESSION_DIR="$2"
INCLUDE_CONTEXT="$3"
HEAD_CHARS="$4"
TAIL_CHARS="$5"
LABEL="$6"

ROOT="/home/chez/projects/pi-extensions"
EXT="$ROOT/pi-context-engine"
BASE_CONFIG="/home/chez/.pi/agent/context-engine.json"
AUTH_JSON="/home/chez/.pi/agent/auth.json"
SETTINGS_JSON="/home/chez/.pi/agent/settings.json"
PROMPT="Use read on pi-context-engine/src/projection/tool-pruner.ts and pi-context-engine/src/projection/batch-capture.ts, then answer in 2 short bullets."

mkdir -p "$HOME_DIR/.pi/agent" "$SESSION_DIR"
cp "$AUTH_JSON" "$HOME_DIR/.pi/agent/auth.json"
cp "$SETTINGS_JSON" "$HOME_DIR/.pi/agent/settings.json"

jq \
  --argjson include_context "$INCLUDE_CONTEXT" \
  --argjson head_chars "$HEAD_CHARS" \
  --argjson tail_chars "$TAIL_CHARS" \
  --arg label "$LABEL" \
  '
    .pruneIncludeContext = $include_context
    | .pruneBatchSize = 2
    | .persistDiagnostics = true
    | .hugeResultHeadChars = $head_chars
    | .hugeResultTailChars = $tail_chars
  ' "$BASE_CONFIG" > "$HOME_DIR/.pi/agent/context-engine.json"

env HOME="$HOME_DIR" pi \
  --session-dir "$SESSION_DIR" \
  --extension "$EXT" \
  --model deepseek/deepseek-v4-flash \
  --thinking low \
  -p "$PROMPT" > "$SESSION_DIR/turn1.out" 2>&1

env HOME="$HOME_DIR" pi \
  --session-dir "$SESSION_DIR" \
  --continue \
  --extension "$EXT" \
  --model deepseek/deepseek-v4-flash \
  --thinking low \
  -p "$PROMPT" > "$SESSION_DIR/turn2.out" 2>&1

