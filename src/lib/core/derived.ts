import { F, R, type Ion } from './params';

/** Nernst potential of one ion [V] (inside relative to outside). */
export function nernst(ion: Ion, cCell: number, cEnv: number, T: number): number {
	return ((R * T) / (ion.z * F)) * Math.log(cEnv / cCell);
}

/**
 * Goldman-Hodgkin-Katz resting potential estimate [V] from permeabilities and
 * concentrations (monovalent ions only; others ignored).
 */
export function ghkVoltage(ions: Ion[], cCell: number[], cEnv: number[], T: number): number {
	let num = 0, den = 0;
	ions.forEach((ion, i) => {
		if (Math.abs(ion.z) !== 1 || ion.Dm <= 0) return;
		if (ion.z > 0) { num += ion.Dm * cEnv[i]; den += ion.Dm * cCell[i]; }
		else { num += ion.Dm * cCell[i]; den += ion.Dm * cEnv[i]; }
	});
	if (num <= 0 || den <= 0) return NaN;
	return ((R * T) / F) * Math.log(num / den);
}
