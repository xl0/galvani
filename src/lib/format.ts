/** Compact number formatting for the UI. */
export function fmt(x: number, digits = 3): string {
	if (!Number.isFinite(x)) return '–';
	if (x === 0) return '0';
	const a = Math.abs(x);
	if (a >= 1e4 || a < 1e-2) return x.toExponential(digits - 1);
	return x.toPrecision(digits).replace(/\.?0+$/, '');
}
