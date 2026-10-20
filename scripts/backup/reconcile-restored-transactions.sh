#!/usr/bin/env bash
# Compare confirmed rows in a restored staging snapshot with Stellar testnet.
set -Eeuo pipefail
: "${STAGING_DATABASE_URL:?STAGING_DATABASE_URL is required}"
: "${STELLAR_HORIZON_URL:?STELLAR_HORIZON_URL must target a non-production test network}"

case "$STELLAR_HORIZON_URL" in
  https://horizon-testnet.stellar.org|https://horizon-testnet.stellar.org/) ;;
  *) echo 'Refusing chain reconciliation outside Stellar testnet' >&2; exit 2 ;;
esac

rows_file="$(mktemp)"
trap 'rm -f "$rows_file"' EXIT
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 -AtF $'\t' \
  -c "SELECT tx_hash, ledger FROM transactions WHERE status = 'confirmed' ORDER BY created_at DESC LIMIT 100" > "$rows_file"
mapfile -t confirmed_rows < "$rows_file"
if (( ${#confirmed_rows[@]} == 0 )); then
  echo 'No confirmed testnet transactions are present in the sanitized staging snapshot' >&2
  exit 1
fi

checked=0
for row in "${confirmed_rows[@]}"; do
  IFS=$'\t' read -r tx_hash expected_ledger <<< "$row"
  if [[ ! "$tx_hash" =~ ^[[:xdigit:]]{64}$ || ! "$expected_ledger" =~ ^[0-9]+$ ]]; then
    echo "Invalid confirmed transaction record in restored snapshot: $tx_hash / $expected_ledger" >&2
    exit 1
  fi
  response="$(curl --fail --silent --show-error --retry 3 --retry-delay 2 --max-time 20 \
    "${STELLAR_HORIZON_URL%/}/transactions/${tx_hash}")"
  actual_ledger="$(jq -r '.ledger' <<< "$response")"
  if [[ "$actual_ledger" != "$expected_ledger" ]]; then
    echo "Ledger mismatch for $tx_hash: restored=$expected_ledger chain=$actual_ledger" >&2
    exit 1
  fi
  checked=$((checked + 1))
done

echo "Reconciled $checked confirmed transaction(s) against Stellar testnet"
