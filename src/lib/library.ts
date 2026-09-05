/** Saved experiments in localStorage ("my presets"). */
import { ExperimentSchema, type Experiment } from './core/experiment';

const KEY = 'galvani-library';

export function loadLibrary(): Experiment[] {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return [];
		return (JSON.parse(raw) as unknown[]).flatMap((x) => { const r = ExperimentSchema.safeParse(x); return r.success ? [r.data] : []; });
	} catch { return []; }
}

export function saveToLibrary(exp: Experiment): Experiment[] {
	const lib = loadLibrary().filter((e) => e.name !== exp.name);
	lib.push(exp);
	localStorage.setItem(KEY, JSON.stringify(lib));
	return lib;
}

export function removeFromLibrary(name: string): Experiment[] {
	const lib = loadLibrary().filter((e) => e.name !== name);
	localStorage.setItem(KEY, JSON.stringify(lib));
	return lib;
}
