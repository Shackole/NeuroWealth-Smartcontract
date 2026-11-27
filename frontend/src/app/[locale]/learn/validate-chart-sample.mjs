/** @param {unknown} sample */
export function validateChartSample(sample) {
  if (!Array.isArray(sample) || sample.length < 2) {
    return 'expected at least two data points';
  }

  const labels = new Set();
  for (const [index, point] of sample.entries()) {
    if (!point || typeof point.label !== 'string' || !point.label.trim() || labels.has(point.label)) {
      return `point ${index + 1} must have a unique, non-empty label`;
    }
    if (typeof point.balance !== 'number' || !Number.isFinite(point.balance) || point.balance <= 0) {
      return `point ${index + 1} must have a positive, finite balance`;
    }
    labels.add(point.label);
  }

  return null;
}
