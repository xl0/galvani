import { ExperimentSchema, type Experiment } from './core/experiment';

/** Experiment <-> compressed base64url string for the URL hash. */
export async function encodeExperiment(exp: Experiment): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(exp));
	const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
	const buf = new Uint8Array(await new Response(stream).arrayBuffer());
	let bin = '';
	for (const b of buf) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function decodeExperiment(hash: string): Promise<Experiment> {
	const b64 = hash.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(b64);
	const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
	const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	const json = await new Response(stream).text();
	return ExperimentSchema.parse(JSON.parse(json));
}
