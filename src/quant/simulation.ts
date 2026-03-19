export function monteCarloPrice(current: number, volatility: number, runs = 1000) {
  const results: number[] = [];

  for (let i = 0; i < runs; i++) {
    let price = current;

    for (let t = 0; t < 30; t++) {
      const rand = (Math.random() - 0.5) * volatility;
      price *= (1 + rand);
    }

    results.push(price);
  }

  results.sort((a, b) => a - b);

  return {
    expected: results[Math.floor(runs * 0.5)],
    low: results[Math.floor(runs * 0.1)],
    high: results[Math.floor(runs * 0.9)]
  };
}
