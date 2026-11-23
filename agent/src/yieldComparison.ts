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
  /** Source observation time in epoch milliseconds when supplied by the adapter. */
  fetchedAt?: number;
}

// Bump when ranking or the rebalance decision formula changes.
export const YIELD_MODEL_REVISION = 'yield-ranking-v1';

export interface StrategyDecisionInputs {
  modelRevision: string;
  riskFreeRate: number;
  minImprovementThreshold: number;
  observations: Array<Omit<ProtocolYieldData, 'fetchedAt'> & { fetchedAt: number | null }>;
}

export interface YieldOpportunity {
  protocolId: string;
  name: string;
  netApy: number;
  riskAdjustedScore: number;
  recommendedAllocationPercent: number;
}

export class YieldComparisonEngine {
  private readonly minImprovementThreshold: number;
  private readonly riskFreeRate: number;

  constructor(minImprovementThreshold = 0.005, riskFreeRate = 0.04) {
    this.minImprovementThreshold = minImprovementThreshold;
    this.riskFreeRate = riskFreeRate;
  }

  public snapshotInputs(protocols: readonly ProtocolYieldData[]): StrategyDecisionInputs {
    return {
      modelRevision: YIELD_MODEL_REVISION,
      riskFreeRate: this.riskFreeRate,
      minImprovementThreshold: this.minImprovementThreshold,
      observations: protocols.map((protocol) => ({
        ...protocol,
        fetchedAt: protocol.fetchedAt ?? null,
      })),
    };
  }

  public calculateSharpeRatio(apy: number, volatility: number): number {
    if (volatility <= 0) return apy / 0.01;
    return (apy - this.riskFreeRate) / volatility;
  }

  public rankOpportunities(protocols: ProtocolYieldData[]): YieldOpportunity[] {
    return protocols
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
        };
      })
      .sort((a, b) => b.riskAdjustedScore - a.riskAdjustedScore);
  }

  public shouldRebalance(currentApy: number, targetApy: number): boolean {
    return targetApy - currentApy >= this.minImprovementThreshold;
  }
}
