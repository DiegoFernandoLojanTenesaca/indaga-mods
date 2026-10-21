#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

claude plugin validate "$root"
for plugin in "$root"/plugins/*/; do
  claude plugin validate "$plugin"
  claude plugin test "$plugin"
done
