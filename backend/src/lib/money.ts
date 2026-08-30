/** Money helpers — all amounts are integer minor units. */

export function toMinor(amount: number | string, decimals = 2): number {
  const v = typeof amount === 'string' ? parseFloat(amount) : amount;
  return Math.round(v * Math.pow(10, decimals));
}

export function toMajor(minor: number, decimals = 2): number {
  return minor / Math.pow(10, decimals);
}

export function percentBpsOf(bps: number, minor: number): number {
  // percent_bps=150 → 1.5%  — round half-up to integer minor units
  return Math.round((minor * bps) / 10000);
}

export function assertPositiveInt(n: unknown, field: string): number {
  const v = Number(n);
  if (!Number.isInteger(v) || v <= 0) throw new Error(`${field} must be a positive integer (minor units)`);
  return v;
}
