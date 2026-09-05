/** Small colormap library: sampled stops, linearly interpolated, 256-entry LUTs. */
type RGB = [number, number, number];

const STOPS: Record<string, RGB[]> = {
	viridis: [
		[68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142],
		[31, 158, 137], [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37]
	],
	// diverging, blue (negative) -> white -> red (positive)
	coolwarm: [
		[59, 76, 192], [98, 130, 234], [141, 176, 254], [184, 208, 249], [221, 221, 221],
		[245, 196, 173], [244, 154, 123], [222, 96, 77], [180, 4, 38]
	],
	magma: [
		[0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129], [181, 54, 122],
		[229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191]
	]
};
export type ColormapName = keyof typeof STOPS;
export const colormapNames = Object.keys(STOPS) as ColormapName[];

export function colormapLut(name: ColormapName, n = 256): string[] {
	const stops = STOPS[name];
	const out: string[] = [];
	for (let k = 0; k < n; k++) {
		const x = (k / (n - 1)) * (stops.length - 1);
		const i = Math.min(Math.floor(x), stops.length - 2);
		const f = x - i;
		const a = stops[i], b = stops[i + 1];
		const r = Math.round(a[0] + (b[0] - a[0]) * f);
		const g = Math.round(a[1] + (b[1] - a[1]) * f);
		const bl = Math.round(a[2] + (b[2] - a[2]) * f);
		out.push(`rgb(${r},${g},${bl})`);
	}
	return out;
}

/** CSS linear-gradient string for a colorbar. */
export function colormapGradient(name: ColormapName): string {
	const stops = STOPS[name].map((c, i, arr) => `rgb(${c.join(',')}) ${(100 * i) / (arr.length - 1)}%`);
	return `linear-gradient(to right, ${stops.join(', ')})`;
}
