#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
canonical="$repo_root/neurowealth-vault/contracts"
legacy_alias="$repo_root/contracts"

if [[ ! -L "$legacy_alias" ]]; then
  echo "Expected contracts/ to remain a symlink to the canonical contract tree." >&2
  exit 1
fi

if [[ "$(readlink -f "$legacy_alias")" != "$(readlink -f "$canonical")" ]]; then
  echo "contracts/ must resolve to neurowealth-vault/contracts/." >&2
  exit 1
fi

echo "Legacy contracts/ path resolves to the canonical workspace source."
