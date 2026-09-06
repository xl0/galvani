import { z } from 'zod';
import { defaultGenerator } from './generator';
import type { Mesh } from './mesh';
import type { SimState } from './state';
import { basicIons, basicParams } from './defaults';
import type { NetworkConfig } from './network';
import type { EcmConfig } from './ecm';

/** Named set of cells: a target for modifiers, channels and painting. */
export const ProfileSchema = z.object({
	id: z.string(),
	name: z.string(),
	color: z.string(),
	cells: z.array(z.number().int().nonnegative())
});
export type Profile = z.infer<typeof ProfileSchema>;

/**
 * A modifier changes membrane properties of a target region (`profile` = '' means all
 * cells) from `t` until `tEnd` (null = forever). Permanent region properties are just
 * modifiers with t = 0 and no end; timed interventions are the same thing with a window.
 * Permanent modifiers also apply during the initialisation phase; windowed ones do not.
 * Permeability modifiers either set an absolute value or scale by a factor; pump / GJ
 * modifiers are multiplicative and stack. A cut removes the region's cells at `t`.
 */
const timing = { profile: z.string(), t: z.number().nonnegative().default(0), tEnd: z.number().nullable().default(null), enabled: z.boolean().default(true) };
export const ModifierSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('perm'), ion: z.string(), value: z.number().nonnegative().optional(), factor: z.number().nonnegative().optional(), ...timing }),
	z.object({ kind: z.literal('pump'), factor: z.number().nonnegative(), ...timing }),
	z.object({ kind: z.literal('gj'), factor: z.number().nonnegative(), ...timing }),
	z.object({ kind: z.literal('cut'), ...timing }),
	/** hold the bath concentration of an ion at a value (or base × factor) while active; restored afterwards. `profile` is ignored.
	 *  With extracellular spaces this is the concentration held at the world edges. */
	z.object({ kind: z.literal('bath'), ion: z.string(), value: z.number().nonnegative().optional(), factor: z.number().nonnegative().optional(), ...timing }),
	/** voltage applied at two world edges (needs extracellular spaces): +peak on `pos`, −peak on `neg`, logistic ramps of `rate` seconds (BETSE "apply external voltage"). `profile` is ignored. */
	z.object({ kind: z.literal('voltage'), peak: z.number(), pos: z.enum(['T', 'B', 'L', 'R']), neg: z.enum(['T', 'B', 'L', 'R']), rate: z.number().positive(), ...timing })
]);
export type Modifier = z.infer<typeof ModifierSchema>;

/** Hill-type regulator of a rate: a substance or ion name (suffix '!' = independent activator), Km [mM], exponent, pool. */
export const InfluencerSchema = z.object({ name: z.string(), Km: z.number().positive(), n: z.number(), zone: z.enum(['cell', 'env']).default('cell') });

/** A voltage-gated channel population. `profile` = '' means every membrane. */
export const ChannelSchema = z.object({
	id: z.string(),
	type: z.string(),
	/** permeability when fully open [m2/s] */
	maxDm: z.number().nonnegative(),
	profile: z.string(),
	enabled: z.boolean().default(true),
	/** network substances that scale this channel's permeability */
	activators: z.array(InfluencerSchema).default([]),
	inhibitors: z.array(InfluencerSchema).default([])
});

const GrowthSchema = z.object({
	rProd: z.number().nonnegative(), rDecay: z.number().nonnegative(), profile: z.string().default(''),
	activators: z.array(InfluencerSchema).default([]), inhibitors: z.array(InfluencerSchema).default([]),
	decayMax: z.number().nonnegative().optional(), decayActivators: z.array(InfluencerSchema).optional(), decayInhibitors: z.array(InfluencerSchema).optional()
});
const GatingSchema = z.object({
	ions: z.array(z.string()), HillK: z.number().positive(), HillN: z.number(), peak: z.number().nonnegative(), extracellular: z.boolean().default(false),
	activators: z.array(InfluencerSchema).default([]), inhibitors: z.array(InfluencerSchema).default([])
});
export const SubstanceSchema = z.object({
	name: z.string().min(1), z: z.number(), Dm: z.number().nonnegative(), Do: z.number().nonnegative(), Dgj: z.number().nonnegative(),
	cCell: z.number().nonnegative(), cEnv: z.number().nonnegative(), scale: z.number().optional(), updateIntra: z.boolean().optional(),
	gjImpermeable: z.boolean().optional(), tjPermeable: z.boolean().optional(), tjFactor: z.number().nonnegative().optional(), growth: GrowthSchema.optional(), gating: GatingSchema.optional()
});
const ReactionSchema = z.object({
	name: z.string(), reactants: z.array(z.object({ name: z.string(), coeff: z.number(), Km: z.number().positive() })),
	products: z.array(z.object({ name: z.string(), coeff: z.number(), Km: z.number().positive() })),
	vmax: z.number().nonnegative(), deltaG: z.number().nullable().default(null),
	activators: z.array(InfluencerSchema).default([]), inhibitors: z.array(InfluencerSchema).default([])
});
const ModulatorSchema = z.object({
	name: z.string(), target: z.enum(['GJ', 'NaK']), max: z.number().nonnegative(),
	activators: z.array(InfluencerSchema).default([]), inhibitors: z.array(InfluencerSchema).default([])
});
/** Substance / reaction / modulator network (see core/network.ts). */
export const NetworkSchema: z.ZodType<NetworkConfig> = z.object({
	substances: z.array(SubstanceSchema).default([]),
	reactions: z.array(ReactionSchema).default([]),
	modulators: z.array(ModulatorSchema).default([]),
	affectCharge: z.boolean().default(true)
}) as unknown as z.ZodType<NetworkConfig>;
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
const MaskSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('circle'), radius: z.number().positive() }),
	z.object({ kind: z.literal('ellipse'), rx: z.number().positive(), ry: z.number().positive() }),
	z.object({ kind: z.literal('rect'), w: z.number().positive(), h: z.number().positive() }),
	z.object({ kind: z.literal('bitmap'), name: z.string(), w: z.number().int().positive(), h: z.number().int().positive(), bits: z.string() })
]);
const GeneratorSchema = z.object({
	seed: z.number(), worldSize: z.number(), cellRadius: z.number(), cellHeight: z.number(),
	cellSpacing: z.number(), disorder: z.number(), scaleCell: z.number(), mask: MaskSchema
});

/** Extracellular spaces (BETSE ECM); null = well-mixed bath. See `ecm.ts`. */
export const EcmSchema: z.ZodType<EcmConfig> = z.object({
	gridSize: z.number().int().min(10).max(60), tjScale: z.number().positive(), adhScale: z.number().positive(), tjRel: z.record(z.string(), z.number().nonnegative())
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
	/** initialisation: simulate this long with only permanent modifiers, then restart the clock at 0 (BETSE init phase) */
	initTime: z.number().nonnegative().default(0),
	profiles: z.array(ProfileSchema),
	modifiers: z.array(ModifierSchema).default([]),
	channels: z.array(ChannelSchema).default([]),
	/** starting membrane voltage [V]; realized by offsetting the balancing anion per cell */
	initialVm: z.number().default(0),
	network: NetworkSchema.nullable().default(null),
	ecm: EcmSchema.nullable().default(null)
});
export type Experiment = z.infer<typeof ExperimentSchema>;


/** BETSE's default configuration; presets are derived from it. */
export const baseExperiment: Experiment = {
	version: 1,
	name: 'BETSE basic',
	generator: defaultGenerator,
	ions: basicIons,
	params: basicParams,
	endTime: 60,
	initTime: 0,
	profiles: [],
	modifiers: [],
	channels: [],
	initialVm: 0,
	network: null,
	ecm: null
};

/** Changes to these require rebuilding mesh and state rather than a live update. */
export function needsReload(a: Experiment, b: Experiment): boolean {
	return (
		JSON.stringify(a.generator) !== JSON.stringify(b.generator) ||
		a.initialVm !== b.initialVm ||
		a.initTime !== b.initTime ||
		JSON.stringify(a.ecm) !== JSON.stringify(b.ecm) ||
		JSON.stringify(a.network?.substances.map((s) => [s.name, s.cCell, s.cEnv, s.z])) !== JSON.stringify(b.network?.substances.map((s) => [s.name, s.cCell, s.cEnv, s.z])) ||
		a.ions.length !== b.ions.length ||
		a.ions.some((x, i) => x.name !== b.ions[i].name || x.z !== b.ions[i].z || x.cCell !== b.ions[i].cCell || x.cEnv !== b.ions[i].cEnv || x.Dfree !== b.ions[i].Dfree)
	);
}

/** The experiment with only its permanent modifiers (t = 0, no end): what the initialisation phase sees. */
export function permanentOnly(exp: Experiment): Experiment {
	return { ...exp, modifiers: exp.modifiers.filter((m) => m.kind !== 'cut' && m.kind !== 'bath' && m.kind !== 'voltage' && m.t === 0 && m.tEnd === null) };
}

/** True if any modifier is windowed, so per-membrane factors must be refreshed every step. */
export function hasTimedModifiers(exp: Experiment): boolean {
	return exp.modifiers.some((m) => m.enabled && m.kind !== 'cut' && m.kind !== 'bath' && m.kind !== 'voltage' && (m.t > 0 || m.tEnd !== null));
}

/**
 * Write per-membrane permeabilities and pump/GJ block factors from ions and the
 * modifiers active at time t. Permeability: base value, then `value` modifiers set it
 * (later in the list wins), `factor` modifiers scale it; pump/GJ factors multiply.
 */
export function applyModulation(mesh: Mesh, exp: Experiment, s: SimState, t: number): void {
	const cellProfile = new Int32Array(mesh.nCells).fill(-1);
	exp.profiles.forEach((p, pi) => {
		for (const c of p.cells) if (c < mesh.nCells) cellProfile[c] = pi;
	});
	const active = exp.modifiers.filter((m) => m.enabled && m.kind !== 'cut' && m.kind !== 'bath' && m.kind !== 'voltage' && t >= m.t && (m.tEnd === null || t < m.tEnd));
	const matches = (mod: { profile: string }, prof: Profile | null) => mod.profile === '' || (prof !== null && prof.id === mod.profile);
	const nIons = exp.ions.length;
	const d = new Float64Array(nIons);
	for (let m = 0; m < mesh.nMems; m++) {
		const pi = cellProfile[mesh.memToCell[m]];
		const prof = pi >= 0 ? exp.profiles[pi] : null;
		let pump = 1, gj = 1;
		for (let i = 0; i < nIons; i++) d[i] = exp.ions[i].Dm;
		for (const mod of active) {
			if (!matches(mod, prof)) continue;
			if (mod.kind === 'bath' || mod.kind === 'voltage') continue;
			if (mod.kind === 'pump') pump *= mod.factor;
			else if (mod.kind === 'gj') gj *= mod.factor;
			else if (mod.kind === 'perm') {
				const i = exp.ions.findIndex((x) => x.name === mod.ion);
				if (i < 0) continue;
				if (mod.value !== undefined) d[i] = mod.value;
				if (mod.factor !== undefined) d[i] *= mod.factor;
			}
		}
		s.nakBlock[m] = pump;
		s.gjBlock[m] = gj;
		for (let i = 0; i < nIons; i++) s.Dm[i][m] = d[i];
	}
}
