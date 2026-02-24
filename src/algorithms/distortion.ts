export interface DistortionParams {
  userPrice: number;
  trueMid: number;
  trueLow: number;
  trueHigh: number;
  dataFreshness: number;
}

export function calculateDistortionScore(params: DistortionParams): number {
  const {
    userPrice,
    trueMid,
    trueLow,
    trueHigh,
    dataFreshness
  } = params;

  const overpaymentPct = (userPrice - trueMid) / trueMid;
  const overpaymentScore = Math.min(Math.max(overpaymentPct * 100, 0), 100) * 0.45;

  const volatilitySpread = (trueHigh - trueLow) / trueMid;
  const volatilityScore = Math.min(volatilitySpread * 100, 100) * 0.35;

  const geographicScore = 5;

  const freshnessPenalty = (1 - dataFreshness) * 10;

  let score = overpaymentScore + volatilityScore + geographicScore - freshnessPenalty;
  
  score = Math.max(0, Math.min(100, score));

  return Math.round(score);
}