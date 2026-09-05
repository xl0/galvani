import type { Ion, Params } from './params';

/** BETSE default config values ("basic" ion profile, init-phase dt). */
export const basicParams: Params = {
	dt: 1e-2,
	T: 310,
	cm: 0.05,
	tm: 7.5e-9,
	volEnv: 2.25e-13,
	gjSurface: 5e-8,
	gjVthresh: 15,
	gjMin: 0.1,
	vSensitiveGj: true,
	alphaNaK: 1e-7,
	KmNK_Na: 12,
	KmNK_K: 0.2,
	KmNK_ATP: 0.5,
	deltaGATP: -37000,
	cATP: 1.5,
	cADP: 0.1,
	cPi: 0.1
};

export const basicIons: Ion[] = [
	{ name: 'Na', z: 1, Dfree: 1.33e-9, Dm: 2e-18, cCell: 12, cEnv: 145 },
	{ name: 'K', z: 1, Dfree: 1.96e-9, Dm: 1e-18, cCell: 139, cEnv: 5 },
	{ name: 'P', z: -1, Dfree: 0, Dm: 0, cCell: 135, cEnv: 10 },
	{ name: 'M', z: -1, Dfree: 1e-9, Dm: 1e-18, cCell: 16, cEnv: 140 }
];
