/**
 * Cell-cluster mesh: cells (polygons / polyhedra) whose borders are membranes.
 * Dimension-agnostic: `dim` = 2 or 3, coordinates interleaved (x,y[,z]).
 * Every membrane belongs to exactly one cell; a membrane facing another cell
 * has a partner membrane on that cell (a gap junction). Boundary membranes
 * face the bath and are their own partner (BETSE convention, nn_i[i] == i).
 */
export interface Mesh {
	dim: number;
	nCells: number;
	nMems: number;
	/** cell centres, dim*nCells */
	cellCentres: Float64Array;
	/** polygon vertices for rendering, flattened; cell c uses verts [vertStart[c], vertStart[c+1]) */
	verts: Float64Array;
	vertStart: Int32Array;
	/** membrane midpoints and outward unit normals, dim*nMems */
	memMids: Float64Array;
	memNormals: Float64Array;
	/** membrane surface area [m2] (edge length * cell height in 2D) */
	memSa: Float64Array;
	/** distance from cell centre to membrane midpoint [m] */
	rRads: Float64Array;
	/** wedge volume behind each membrane, 1/2 * rRads * memSa [m3] */
	memVol: Float64Array;
	/** per-cell totals */
	cellSa: Float64Array;
	cellVol: Float64Array;
	/** cellVol / cellSa: converts charge density to surface charge (BETSE "diviterm") */
	diviterm: Float64Array;
	numMems: Int32Array;
	memToCell: Int32Array;
	/** partner membrane index (self if boundary) */
	memPartner: Int32Array;
	/** boundary membrane indices */
	boundaryMems: Int32Array;
	/** gap-junction length [m] (cell spacing) */
	gjLen: number;
	/** per-membrane default GJ weight (1 unless the generator says otherwise) */
	gjWeights: Float64Array;
}

/** Derive per-cell totals and diviterm from per-membrane arrays. */
export function finishMesh(m: Omit<Mesh, 'cellSa' | 'cellVol' | 'diviterm' | 'numMems' | 'memVol'>): Mesh {
	const { nCells, nMems } = m;
	const memVol = new Float64Array(nMems);
	const cellSa = new Float64Array(nCells);
	const cellVol = new Float64Array(nCells);
	const numMems = new Int32Array(nCells);
	for (let i = 0; i < nMems; i++) {
		memVol[i] = 0.5 * m.rRads[i] * m.memSa[i];
		const c = m.memToCell[i];
		cellSa[c] += m.memSa[i];
		cellVol[c] += memVol[i];
		numMems[c]++;
	}
	const diviterm = new Float64Array(nCells);
	for (let c = 0; c < nCells; c++) diviterm[c] = cellVol[c] / cellSa[c];
	return { ...m, memVol, cellSa, cellVol, diviterm, numMems };
}
