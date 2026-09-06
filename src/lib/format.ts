/** Compact number formatting for the UI. */
export function fmt(x: number, digits = 3): string {
	if (!Number.isFinite(x)) return '–';
	if (x === 0) return '0';
	const a = Math.abs(x);
	if (a >= 1e4 || a < 1e-2) return x.toExponential(digits - 1);
	if (a >= 10 ** digits) return x.toFixed(0);
	return x.toPrecision(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/** SI-prefixed value, x in the base unit: si(2e-7, 'mol/m²·s') → '200 nmol/m²·s'. */
export function si(x: number, unit: string, digits = 3): string {
	if (!Number.isFinite(x) || x === 0) return `${fmt(x)} ${unit}`;
	const prefixes: [string, number][] = [['p', -12], ['n', -9], ['µ', -6], ['m', -3], ['', 0], ['k', 3]];
	let pick = prefixes[0];
	for (const p of prefixes) if (Math.abs(x) >= 10 ** p[1]) pick = p;
	return `${fmt(x / 10 ** pick[1], digits)} ${pick[0]}${unit}`;
}
