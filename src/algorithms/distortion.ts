export interface DistortionParams {
  userPrice: number;
  trueMid: number;
  trueLow: number;
  trueHigh: number;
  dataFreshness: number;
  bestCashPrice: number;
  sampleSize: number;
  pharmacyCount: number;
}

export function calculateDistortionScore(params: DistortionParams): number {
  const {
    userPrice,
    trueLow,
    trueHigh,
    dataFreshness,
    bestCashPrice,
    sampleSize,
    pharmacyCount
  } = params;

  // Component 1 (45%): How much did user overpay vs best available cash price?
  // Capped at 300% overpayment = full score
  const bestRef = bestCashPrice > 0 ? bestCashPrice : trueLow;
  const overpaymentPct = bestRef > 0 ? Math.max(0, (userPrice - bestRef) / bestRef) : 0;
  const overpaymentScore = Math.min(overpaymentPct / 3, 1) * 100 * 0.45;

  // Component 2 (25%): Market volatility — spread relative to best price
  // Wide spread = higher distortion potential in the market
  const spread = trueHigh - trueLow;
  const volatilityRatio = bestRef > 0 ? Math.min(spread / bestRef, 10) / 10 : 0;
  const volatilityScore = volatilityRatio * 100 * 0.25;

  // Component 3 (20%): Geographic/market coverage
  // More observations = more confidence in distortion signal
  // Low sample = penalize score toward middle (less certainty)
  const coverageRatio = Math.min(pharmacyCount / 10, 1);
  const sampleRatio = Math.min(sampleSize / 20, 1);
  const geographicScore = ((coverageRatio + sampleRatio) / 2) * 100 * 0.20;

  // Component 4 (10%): Data freshness penalty
  const freshnessPenalty = (1 - dataFreshness) * 10;

  let score = overpaymentScore + volatilityScore + geographicScore - freshnessPenalty;
  score = Math.max(0, Math.min(100, score));

  return Math.round(score);
}