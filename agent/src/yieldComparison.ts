export interface ProtocolYieldData {
  protocolId: string;
  name: string;
  type: 'blend' | 'dex_lp' | 'other';
  currentApy: number; // e.g. 0.085 for 8.5%
  historicalApy7d: number;
  historicalApy30d: number;
  tvlUsdc: number;
  volatility: number; // annualized volatility e.g. 0.02
  riskScore: number;  // 1-100 from risk scoring engine
  // Freshness metadata: when the APY sample was observed and where it came from.
  observedAt?: number | Date; // epoch ms or Date of the APY observation
  source?: string;           // identifier of the data source (e.g. 'blend-api', 'dex:xy')
}

export interface YieldOpportunity {
  protocolId: string;
  name: string;
  netApy: number;
  riskAdjustedScore: number;
  recommendedAllocationPercent: number;
  observedAt: number | null; // epoch ms of the sample used, null if unknown
  source: string | null;     // source identifier of the sample used
  isFresh: boolean;          // whether the sample passed the freshness window
}

export interface YieldComparisonResult {
  opportunities: YieldOpportunity[];
  // Mixed source timestamps surfaced for operators/callers.
  sourceTimestamps: Array<{
    protocolId: string;
    source: string | null;
    observedAt: number | null;
    ageMs: number | null;
    isFresh: boolean;
  }>;
  // Recorded skip reason when no fresh data is available for allocation.
  skipReason: string | null;
}

export class YieldComparisonEngine {
  private readonly minImprovementThreshold: number;
  private readonly riskFreeRate: number;
  private readonly maxSampleAgeMs: number;

  constructor(
    minImprovementThreshold = 0.005,
    riskFreeRate = 0.04,
    maxSampleAgeMs = 15 * 60 * 1000,
  ) {
    this.minImprovementThreshold = minImprovementThreshold;
    this.riskFreeRate = riskFreeRate;
    this.maxSampleAgeMs = maxSampleAgeMs;
  }

  public calculateSharpeRatio(apy: number, volatility: number): number {
    if (volatility <= 0) return apy / 0.01;
    return (apy - this.riskFreeRate) / volatility;
  }

  private toEpochMs(observedAt: number | Date | undefined): number | null {
    if (observedAt === undefined || observedAt === null) return null;
    const ms = observedAt instanceof Date ? observedAt.getTime() : observedAt;
    return Number.isFinite(ms) ? ms : null;
  }

  public isFresh(p: ProtocolYieldData, now: number = Date.now()): boolean {
    const observedMs = this.toEpochMs(p.observedAt);
    if (observedMs === null) return false;
    const age = now - observedMs;
    // Reject future-dated samples and samples older than the window.
    return age >= 0 && age <= this.maxSampleAgeMs;
  }

  public rankOpportunities(
    protocols: ProtocolYieldData[],
    now: number = Date.now(),
  ): YieldOpportunity[] {
    return protocols
      .filter((p) => this.isFresh(p, now))
      .map((p) => {
        const sharpe = this.calculateSharpeRatio(p.currentApy, p.volatility);
        // Risk-adjusted metric combines sharpe with inverse risk penalty
        const riskPenalty = (100 - p.riskScore) / 100;
        const riskAdjustedScore = sharpe * riskPenalty;

        return {
          protocolId: p.protocolId,
          name: p.name,
          netApy: p.currentApy,
          riskAdjustedScore: Math.round(riskAdjustedScore * 100) / 100,
          recommendedAllocationPercent: 0,
          observedAt: this.toEpochMs(p.observedAt),
          source: p.source ?? null,
          isFresh: true,
        };
      })
      .sort((a, b) => b.riskAdjustedScore - a.riskAdjustedScore);
  }

  public compare(
    protocols: ProtocolYieldData[],
    now: number = Date.now(),
  ): YieldComparisonResult {
    const sourceTimestamps = protocols.map((p) => {
      const observedMs = this.toEpochMs(p.observedAt);
      return {
        protocolId: p.protocolId,
        source: p.source ?? null,
        observedAt: observedMs,
        ageMs: observedMs === null ? null : now - observedMs,
        isFresh: this.isFresh(p, now),
      };
    });

    const opportunities = this.rankOpportunities(protocols, now);
    const skipReason =
      opportunities.length === 0
        ? protocols.length === 0
          ? 'no-yield-data'
          : 'no-fresh-apy-samples'
        : null;

    return { opportunities, sourceTimestamps, skipReason };
  }

  public shouldRebalance(currentApy: number, targetApy: number): boolean {
    return targetApy - currentApy >= this.minImprovementThreshold;
  }
}
