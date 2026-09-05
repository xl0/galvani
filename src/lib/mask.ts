/** Cluster shape masks: rasterize an SVG/PNG outline (or a built-in shape) to a packed bitmap. */
import type { Mask } from './core/generator';

const RES = 160;

/** Built-in outlines as SVG path data in a 100 x 100 box. */
export const builtinShapes: Record<string, { label: string; path: string }> = {
	planarian: {
		label: 'Planarian',
		// elongated body, rounded tail (left), slightly pointed head with auricles (right)
		path: 'M6,50 C6,36 22,30 40,31 C58,32 72,30 84,34 C90,36 96,42 97,50 C96,58 90,64 84,66 C72,70 58,68 40,69 C22,70 6,64 6,50 Z'
	},
	heart: { label: 'Heart', path: 'M50,88 C20,66 6,50 6,34 C6,20 18,12 30,12 C40,12 47,18 50,26 C53,18 60,12 70,12 C82,12 94,20 94,34 C94,50 80,66 50,88 Z' },
	ring: { label: 'Ring', path: 'M50,8 A42,42 0 1,0 50,92 A42,42 0 1,0 50,8 Z M50,30 A20,20 0 1,1 50,70 A20,20 0 1,1 50,30 Z' }
};

function pack(inside: Uint8Array, w: number, h: number, name: string): Mask {
	const bytes = new Uint8Array(Math.ceil((w * h) / 8));
	for (let i = 0; i < w * h; i++) if (inside[i]) bytes[i >> 3] |= 0x80 >> (i & 7);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return { kind: 'bitmap', name, w, h, bits: btoa(bin) };
}

/** Rasterize an SVG path (100 x 100 box) with even-odd fill, fitted to `fill` of the world. */
export function maskFromPath(path: string, name: string, fill = 0.9): Mask {
	const c = document.createElement('canvas');
	c.width = RES; c.height = RES;
	const ctx = c.getContext('2d')!;
	const s = (RES * fill) / 100;
	ctx.translate((RES - 100 * s) / 2, (RES - 100 * s) / 2);
	ctx.scale(s, s);
	ctx.fillStyle = '#000';
	ctx.fill(new Path2D(path), 'evenodd');
	const d = ctx.getImageData(0, 0, RES, RES).data;
	const inside = new Uint8Array(RES * RES);
	for (let i = 0; i < RES * RES; i++) inside[i] = d[4 * i + 3] > 127 ? 1 : 0;
	return pack(inside, RES, RES, name);
}

/** Rasterize an image file (SVG, PNG, ...): opaque, non-white pixels count as inside. */
export async function maskFromFile(file: File, fill = 0.9): Promise<Mask> {
	const url = URL.createObjectURL(file);
	try {
		const img = await new Promise<HTMLImageElement>((res, rej) => {
			const im = new Image();
			im.onload = () => res(im);
			im.onerror = () => rej(new Error(`could not decode ${file.name}`));
			im.src = url;
		});
		const c = document.createElement('canvas');
		c.width = RES; c.height = RES;
		const ctx = c.getContext('2d')!;
		const s = (RES * fill) / Math.max(img.naturalWidth, img.naturalHeight);
		const w = img.naturalWidth * s, h = img.naturalHeight * s;
		ctx.drawImage(img, (RES - w) / 2, (RES - h) / 2, w, h);
		const d = ctx.getImageData(0, 0, RES, RES).data;
		const inside = new Uint8Array(RES * RES);
		for (let i = 0; i < RES * RES; i++) {
			const r = d[4 * i], g = d[4 * i + 1], b = d[4 * i + 2], a = d[4 * i + 3];
			inside[i] = a > 127 && !(r > 200 && g > 200 && b > 200) ? 1 : 0;
		}
		return pack(inside, RES, RES, file.name.replace(/\.[^.]+$/, ''));
	} finally {
		URL.revokeObjectURL(url);
	}
}
