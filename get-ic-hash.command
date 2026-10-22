#!/usr/bin/env bash
# Reads Yashpreet's ic_hash from clinic 8001 local SQLite and prints it
DB="$HOME/.medilink-demo/melaka/medilink.db"
if [ ! -f "$DB" ]; then
  echo "ERROR: $DB not found. Is the demo running?"
  read -r -p "Press Return to close…" _; exit 1
fi
RESULT=$(sqlite3 "$DB" "SELECT id, name, ic_hash FROM users WHERE role='patient' LIMIT 5;")
echo "Patient rows from clinic 8001 (melaka):"
echo "$RESULT"
echo ""
IC_HASH=$(sqlite3 "$DB" "SELECT ic_hash FROM users WHERE role='patient' AND name LIKE '%YASHPREET%' LIMIT 1;")
echo "Yashpreet ic_hash: $IC_HASH"
echo "$IC_HASH" | pbcopy
echo "Copied to clipboard."
read -r -p "Press Return to close…" _
