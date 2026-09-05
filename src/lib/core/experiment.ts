import { z } from 'zod';
import { defaultGenerator } from './generator';
import type { Mesh } from './mesh';
import type { SimState } from './state';
import { basicIons, basicParams } from './defaults';

/** Named cell region with membrane-parameter overrides. */
export const ProfileSchema = z.object({
	id: z.string(),
	name: z.string(),
	color: z.string(),
	cells: z.array(z.number().int().nonnegative()),
	/** replace base membrane permeability per ion name [m2/s] */
	Dm: z.record(z.string(), z.number().nonnegative()).default({}),
	/** multipliers on Na/K pump rate and gap-junction conductance */
	pumpScale: z.number().nonnegative().default(1),
	gjScale: z.number().nonnegative().default(1)
});
export type Profile = z.infer<typeof ProfileSchema>;

/** Timed interventions on the run timeline. `profile` = '' means all cells. */
export const EventSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('cut'), t: z.number(), profile: z.string() }),
	z.object({ kind: z.literal('perm'), t: z.number(), tEnd: z.number(), ion: z.string(), profile: z.string(), factor: z.number().nonnegative() }),
	z.object({ kind: z.literal('pump'), t: z.number(), tEnd: z.number(), profile: z.string(), factor: z.number().nonnegative() }),
	z.object({ kind: z.literal('gj'), t: z.number(), tEnd: z.number(), profile: z.string(), factor: z.number().nonnegative() })
]);
export type SimEvent = z.infer<typeof EventSchema>;

/** A voltage-gated channel population. `profile` = '' means every membrane. */
export const ChannelSchema = z.object({
	id: z.string(),
	type: z.string(),
	/** permeability when fully open [m2/s] */
	maxDm: z.number().nonnegative(),
	profile: z.string(),
	enabled: z.boolean().default(true)
});
export type ChannelConfig = z.infer<typeof ChannelSchema>;

const IonSchema = z.object({
	name: z.string(), z: z.number(), Dfree: z.number(), Dm: z.number(), cCell: z.number(), cEnv: z.number()
});
const ParamsSchema = z.object({
	dt: z.number().positive(), T: z.number(), cm: z.number(), tm: z.number(), volEnv: z.number(),
	gjSurface: z.number(), gjVthresh: z.number(), gjMin: z.number(), vSensitiveGj: z.boolean(),
	alphaNaK: z.number(), KmNK_Na: z.number(), KmNK_K: z.number(), KmNK_ATP: z.number(),
	deltaGATP: z.number(), cATP: z.number(), cADP: z.number(), cPi: z.number(),
	alphaCa: z.number().default(5e-8), KmCa_Ca: z.number().default(1e-3), KmCa_ATP: z.number().default(0.5)
});
const GeneratorSchema = z.object({
	seed: z.number(), worldSize: z.number(), cellRadius: z.number(), cellHeight: z.number(),
	cellSpacing: z.number(), disorder: z.number(), scaleCell: z.number(), clipRadius: z.number()
});

/** The whole experiment definition: what gets serialized into the URL. */
export const ExperimentSchema = z.object({
	version: z.literal(1),
	name: z.string(),
	generator: GeneratorSchema,
	ions: z.array(IonSchema),
	params: ParamsSchema,
	/** run end time [s] */
	endTime: z.number().positive(),
	profiles: z.array(ProfileSchema),
	events: z.array(EventSchema),
	channels: z.array(ChannelSchema).default([]),
	/** starting membrane voltage [V]; realized by offsetting the balancing anion per cell */
	initialVm: z.number().default(0)
});
export type Experiment = z.infer<typeof ExperimentSchema>;

export const defaultExperiment: Experiment = {
	version: 1,
	name: 'BETSE basic',
	generator: defaultGenerator,
	ions: basicIons,
	params: basicParams,
	endTime: 60,
	profiles: [],
	events: [],
	channels: [],
	initialVm: 0
};

/** Changes to these require rebuilding mesh and state rather than a live update. */
export function needsReload(a: Experiment, b: Experiment): boolean {
	return (
		JSON.stringify(a.generator) !== JSON.stringify(b.generator) ||
		a.initialVm !== b.initialVm ||
		a.ions.length !== b.ions.length ||
		a.ions.some((x, i) => x.name !== b.ions[i].name || x.z !== b.ions[i].z || x.cCell !== b.ions[i].cCell || x.cEnv !== b.ions[i].cEnv || x.Dfree !== b.ions[i].Dfree)
	);
}

/**
 * Write per-membrane permeabilities and pump/GJ block factors from ions,
 * profiles and the events active at time t.
 */
export function applyModulation(mesh: Mesh, exp: Experiment, s: SimState, t: number): void {
	const cellProfile = new Int32Array(mesh.nCells).fill(-1);
	exp.profiles.forEach((p, pi) => {
		for (const c of p.cells) if (c < mesh.nCells) cellProfile[c] = pi;
	});
	const active = exp.events.filter((e) => e.kind !== 'cut' && t >= e.t && t < e.tEnd);
	const matches = (ev: { profile: string }, prof: Profile | null) => ev.profile === '' || (prof !== null && prof.id === ev.profile);
	for (let m = 0; m < mesh.nMems; m++) {
		const pi = cellProfile[mesh.memToCell[m]];
		const prof = pi >= 0 ? exp.profiles[pi] : null;
		let pump = prof?.pumpScale ?? 1;
		let gj = prof?.gjScale ?? 1;
		for (const ev of active) {
			if (ev.kind === 'pump' && matches(ev, prof)) pump *= ev.factor;
			if (ev.kind === 'gj' && matches(ev, prof)) gj *= ev.factor;
		}
		s.nakBlock[m] = pump;
		s.gjBlock[m] = gj;
		for (let i = 0; i < exp.ions.length; i++) {
			const ion = exp.ions[i];
			let d = prof?.Dm[ion.name] ?? ion.Dm;
			for (const ev of active) if (ev.kind === 'perm' && ev.ion === ion.name && matches(ev, prof)) d *= ev.factor;
			s.Dm[i][m] = d;
		}
	}
}
