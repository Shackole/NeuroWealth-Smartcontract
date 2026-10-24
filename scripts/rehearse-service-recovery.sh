#!/usr/bin/env bash
# =============================================================================
# NeuroWealth Vault — Controlled Staging Service Recovery Rehearsal (#527)
# =============================================================================
#
# Executes the controlled staging recovery exercise after a simultaneous Redis
# queue and PostgreSQL/Supabase database interruption, validating:
#   1. Queued transactions: recovered services do not duplicate financial actions.
#   2. Event checkpoints & worker restart: measured recovery timing is recorded
#      against the 5-minute RTO budget (300,000 ms).
#   3. Chain reconciliation & data-gap gating: unresolved data gaps block
#      declaring recovery complete (`recoveryComplete: false`).
#   4. Gap resolution: once missing ledger events are backfilled and stroop
#      totals reconcile, recovery completes cleanly.
#
# Usage:
#   ./scripts/rehearse-service-recovery.sh [--output <path>]
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPORT_PATH="${1:-$REPO_ROOT/infra/recovery-rehearsal-evidence.json}"

mkdir -p "$(dirname "$REPORT_PATH")"

echo "=== NeuroWealth Staging Service Recovery Rehearsal (#527) ==="
echo "Environment: staging-testnet-isolated"
echo "Network Passphrase: Test SDF Network ; September 2015"
echo "Monetary Unit: 7-decimal USDC stroops (1 USDC = 10,000,000 stroops)"
echo ""

cd "$REPO_ROOT/agent"
npx ts-node --transpile-only -e "
import { runControlledStagingRehearsal } from './src/serviceRecovery';
import * as fs from 'node:fs';

async function main() {
  const reportPath = process.argv[1];
  const summary = await runControlledStagingRehearsal();
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  const s1 = summary.scenarios.duplicatePreventionAndBackfill;
  const s2 = summary.scenarios.blockedOnUnresolvedDataGap;
  const s3 = summary.scenarios.resolvedAfterGapBackfill;

  console.log('--- Scenario 1: Queued Tx Deduplication & Checkpoint Backfill ---');
  console.log('  Status:                     ', s1.status);
  console.log('  Recovery Complete:          ', s1.recoveryComplete);
  console.log('  Duplicate Actions Prevented:', s1.queueSummary.duplicateActionsPrevented.length, s1.queueSummary.duplicateActionsPrevented);
  console.log('  Fresh Actions Executed:     ', s1.queueSummary.executedActions.length, s1.queueSummary.executedActions.map(a => a.jobId));
  console.log('  Checkpoint Advanced:        ', s1.checkpoint.previousLedger, '->', s1.checkpoint.reconciledLedger, '(backfilled:', s1.checkpoint.backfilledEventCount, 'event)');
  console.log('  Total Recovery Timing (ms): ', s1.timing.totalRecoveryDurationMs, '(RTO budget:', s1.timing.rtoBudgetMs, 'ms, within budget:', s1.timing.withinRtoBudget + ')');
  console.log('');
  console.log('--- Scenario 2: Unresolved Data Gap Gate ---');
  console.log('  Status:                     ', s2.status);
  console.log('  Recovery Complete:          ', s2.recoveryComplete);
  console.log('  Worker Resumed:             ', s2.workerResumed);
  console.log('  Unresolved Gaps Detected:   ', s2.unresolvedGaps.map(g => g.kind));
  console.log('');
  console.log('--- Scenario 3: Post-Backfill Chain Reconciliation ---');
  console.log('  Status:                     ', s3.status);
  console.log('  Recovery Complete:          ', s3.recoveryComplete);
  console.log('  Unresolved Gaps Remaining:  ', s3.unresolvedGaps.length);
  console.log('  Checkpoint Advanced:        ', s3.checkpoint.previousLedger, '->', s3.checkpoint.reconciledLedger);
  console.log('  Assets Delta (stroops):     ', s3.accounting.assetsDeltaStroops);
  console.log('');
  console.log('Evidence report written to:', reportPath);

  if (!summary.allCriteriaPassed) {
    console.error('FAIL: One or more recovery rehearsal acceptance criteria failed.');
    process.exit(1);
  }
  console.log('PASS: All #527 staging service recovery acceptance criteria verified.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
" "$REPORT_PATH"
