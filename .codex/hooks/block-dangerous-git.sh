#!/bin/bash
# Pocock-style git guardrails (customized for STARSCREENER).
#
# Blocks destructive git commands at the Claude Code PreToolUse stage.
# Note: regular `git push` is allowed — only force-pushes are blocked.
# Uses node for JSON parsing (jq not guaranteed on Windows dev boxes).

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | node -e "let b='';process.stdin.on('data',d=>b+=d);process.stdin.on('end',()=>{try{const j=JSON.parse(b);process.stdout.write((j.tool_input&&j.tool_input.command)||'')}catch(e){}})" 2>/dev/null)

DANGEROUS_PATTERNS=(
  "git reset --hard"
  "git clean -fd"
  "git clean -f"
  "git branch -D"
  "git checkout \."
  "git restore \."
  "push --force"
  "push -f "
  "reset --hard"
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "BLOCKED: '$COMMAND' matches dangerous pattern '$pattern'. The user has prevented you from doing this." >&2
    exit 2
  fi
done

exit 0