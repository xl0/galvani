import { ExperimentSchema, type Experiment } from './core/experiment';
import type { SimSession } from './sim/session.svelte';

function download(name: string, text: string, type: string): void {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(new Blob([text], { type }));
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Traces of all probes as CSV: t, then per probe Vm [mV] and each ion [mM]. */
export function exportTracesCsv(session: SimSession): void {
	const ions = session.experiment.ions.map((i) => i.name);
	const probes = session.probes;
	const head = ['t_s', ...probes.flatMap((c) => [`cell${c}_Vm_mV`, ...ions.map((n) => `cell${c}_${n}_mM`)])];
	const rows = [head.join(',')];
	const t = session.traceT;
	for (let j = 0; j < t.length; j++) {
		const row = [t[j].toPrecision(9)];
		for (const c of probes) {
			const tr = session.traces.get(c);
			const vm = tr?.vm[j];
			row.push(vm == null ? '' : (vm * 1e3).toPrecision(7));
			for (let i = 0; i < ions.length; i++) { const v = tr?.cc[i][j]; row.push(v == null ? '' : v.toPrecision(7)); }
		}
		rows.push(row.join(','));
	}
	download(`${slug(session.experiment.name)}-traces.csv`, rows.join('\n'), 'text/csv');
}

export function exportExperimentJson(exp: Experiment): void {
	download(`${slug(exp.name)}.galvani.json`, JSON.stringify(exp, null, 2), 'application/json');
}

/** Opens a file picker; resolves to the parsed experiment or null if cancelled. */
export function importExperimentJson(): Promise<Experiment | null> {
	return new Promise((resolve, reject) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json,application/json';
		input.onchange = async () => {
			const f = input.files?.[0];
			if (!f) return resolve(null);
			try { resolve(ExperimentSchema.parse(JSON.parse(await f.text()))); }
			catch (e) { reject(e); }
		};
		input.click();
	});
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'experiment';
