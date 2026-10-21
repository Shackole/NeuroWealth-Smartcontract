import { yieldComparison, YieldComparisonResult } from "./yieldComparison";

// Configurable freshness window (ms) for APY samples before allocation decisions.
const APY_FRESHNESS_WINDOW_MS = Number(process.env.APY_FRESHNESS_WINDOW_MS ?? 5 * 60 * 1000);

interface AllocationDecision {
  action: "rebalance" | "skip";
  target?: string;
  reason?: string;
  comparison: YieldComparisonResult;
}

function decideAllocation(comparison: YieldComparisonResult): AllocationDecision {
  const fresh = comparison.samples.filter(
    (s) => Date.now() - s.observedAt <= APY_FRESHNESS_WINDOW_MS
  );

  if (fresh.length === 0) {
    return {
      action: "skip",
      reason: "no-fresh-data: all APY samples outside freshness window",
      comparison,
    };
  }

  const best = fresh.reduce((a, b) => (b.apy > a.apy ? b : a));
  return { action: "rebalance", target: best.source, comparison };
}

export async function runCycle(): Promise<AllocationDecision> {
  const comparison = await yieldComparison();
  const decision = decideAllocation(comparison);

  if (decision.action === "skip") {
    console.warn(`[allocation] skip: ${decision.reason}`);
  } else {
    console.log(`[allocation] rebalance to ${decision.target}`);
  }

  return decision;
}
