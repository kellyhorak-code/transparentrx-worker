export function generateInsight(data: any) {
  const percentile = Math.min(99,
    Math.round((data.userPrice - data.min) / (data.max - data.min) * 100)
  );

  let message = "";

  if (percentile > 85) {
    message = "You are significantly overpaying compared to the market.";
  } else if (percentile > 60) {
    message = "Your price is above average and could be optimized.";
  } else {
    message = "Your price is within a reasonable range.";
  }

  return {
    percentile,
    message
  };
}
