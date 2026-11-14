/** Wilson score interval: honest confidence bounds for small samples. */
export function wilsonInterval(successes: number, total: number, z = 1.96): [number, number] {
  if (total <= 0) return [0, 0];
  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

/** Nearest-rank percentile; returns 0 for an empty sample. */
export function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
}
