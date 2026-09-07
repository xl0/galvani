import type { MeshGeom, Snapshot } from '$lib/sim/protocol';
import type { Ion } from '$lib/core/params';
import { channelModels } from '$lib/core/channels';

/**
 * Values of a display field from a snapshot: per cell, or per membrane for fields native to
 * membranes (vm, channel P, gj, pump, imem). Fields: 'vm', an ion name, 'venv' (environment
 * voltage: the grid is the field, cells carry none), 'gj', 'pump', 'imem', 'P:<channel id>',
 * 'S:<substance>'. Returns null when the field does not exist in this snapshot.
 */
export function fieldValues(s: Snapshot, g: MeshGeom, ions: Ion[], f: string, membranes: boolean): Float32Array | null {
	if (f === 'venv') return membranes ? null : s.env ? Float32Array.from(s.env.v, (v) => v * 1e3) : null;
	if (membranes) return f === 'vm' ? Float32Array.from(s.vm, (v) => v * 1e3) : f.startsWith('P:') ? (s.channels.find((ch) => ch.id === f.slice(2))?.P ?? null) : f === 'gj' ? s.gjOpen : f === 'pump' ? s.pump : f === 'imem' ? s.iMem : null;
	const out = new Float32Array(g.nCells);
	if (f === 'vm') for (let c = 0; c < g.nCells; c++) out[c] = s.vmAve[c] * 1e3;
	else if (f.startsWith('P:') || f === 'gj' || f === 'pump' || f === 'imem') {
		const mv = fieldValues(s, g, ions, f, true);
		if (!mv) return null;
		const n = new Int32Array(g.nCells);
		for (let m = 0; m < g.nMems; m++) { out[g.memToCell[m]] += mv[m]; n[g.memToCell[m]]++; }
		for (let c = 0; c < g.nCells; c++) out[c] /= Math.max(1, n[c]);
	} else if (f.startsWith('S:')) {
		const sub = s.subs.find((x) => x.name === f.slice(2));
		if (!sub) return null;
		out.set(sub.cells);
	} else {
		const i = ions.findIndex((x) => x.name === f);
		if (i < 0) return null;
		for (let c = 0; c < g.nCells; c++) out[c] = s.cc[i * g.nCells + c];
	}
	return out;
}

/** display unit of a field */
export function fieldUnit(f: string): string {
	return f === 'vm' || f === 'venv' ? 'mV' : f.startsWith('P:') || f === 'gj' ? 'open' : f === 'pump' ? 'mol/m²·s' : f === 'imem' ? 'A/m²' : 'mM';
}

/** human label of a field */
export function fieldLabel(f: string, s: Snapshot | null): string {
	if (f === 'vm') return 'Vm';
	if (f === 'venv') return 'V env';
	if (f === 'gj') return 'GJ open';
	if (f === 'pump') return 'pump rate';
	if (f === 'imem') return 'membrane current';
	if (f.startsWith('P:')) { const t = s?.channels.find((c) => c.id === f.slice(2))?.type; return `open ${(t && channelModels[t]?.label) ?? t ?? f.slice(2)}`; }
	if (f.startsWith('S:')) return `[${f.slice(2)}]`;
	return `[${f}]`;
}

/** min/max of an array (Infinity/-Infinity if empty) */
export function extentOf(a: ArrayLike<number> | null, lo = Infinity, hi = -Infinity): [number, number] {
	if (a) for (let i = 0; i < a.length; i++) { const v = a[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
	return [lo, hi];
}
