/** Physical / model parameters. SI units throughout (m, s, V, mol/m3, F/m2). */
export interface Params {
	dt: number;
	/** temperature [K] */
	T: number;
	/** membrane capacitance [F/m2] */
	cm: number;
	/** membrane thickness [m] */
	tm: number;
	/** bath volume for the well-mixed environment [m3] */
	volEnv: number;
	/** gap junction: fraction of membrane area that is junction */
	gjSurface: number;
	/** Harris gating: transjunctional voltage threshold [mV] and minimum open fraction */
	gjVthresh: number;
	gjMin: number;
	vSensitiveGj: boolean;
	/** Na/K-ATPase max rate [mol/m2 s] and Michaelis constants [mmol/L] */
	alphaNaK: number;
	KmNK_Na: number;
	KmNK_K: number;
	KmNK_ATP: number;
	/** ATP hydrolysis free energy [J/mol] and metabolite concentrations [mmol/L] */
	deltaGATP: number;
	cATP: number;
	cADP: number;
	cPi: number;
	/** Ca-ATPase max rate [mol/m2 s] and Michaelis constants [mmol/L] (used when a Ca ion exists) */
	alphaCa: number;
	KmCa_Ca: number;
	KmCa_ATP: number;
}

export interface Ion {
	name: string;
	/** valence */
	z: number;
	/** free diffusion constant [m2/s] */
	Dfree: number;
	/** membrane permeability (diffusion constant through membrane) [m2/s] */
	Dm: number;
	/** initial concentrations [mol/m3] */
	cCell: number;
	cEnv: number;
}

export const F = 96485;
export const R = 8.314;
