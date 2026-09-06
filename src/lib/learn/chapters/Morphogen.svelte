<script lang="ts">
	import { onDestroy } from 'svelte';
	import { fmt } from '$lib/format';
	import Eq from '$lib/components/learn/Eq.svelte';
	import Lesson from '$lib/components/learn/Lesson.svelte';
	import FigMorphogen from '$lib/learn/figures/FigMorphogen.svelte';
	import MiniChart from '$lib/components/learn/MiniChart.svelte';
	import MiniCluster from '$lib/components/learn/MiniCluster.svelte';
	import Slider from '$lib/components/learn/Slider.svelte';
	import { MiniSim } from '$lib/learn/minisim.svelte';
	import { strip } from '$lib/learn/meshes';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';

	const N = 24;
	const mesh = strip(N);
	const order = Array.from({ length: mesh.nCells }, (_, i) => i).sort((a, b) => mesh.cellCentres[2 * a] - mesh.cellCentres[2 * b]);
	const source = order.slice(0, 3);
	const sim = new MiniSim({
		mesh, params: { dt: 1e-2 }, initialVm: -0.02, speed: 60, traceEvery: 50, traceLen: 500,
		profiles: { source },
		network: {
			substances: [{ name: 'M', z: 0, Dm: 0, Do: 1e-10, Dgj: 1e-13, cCell: 0, cEnv: 0, updateIntra: false,
				growth: { rProd: 0.2, rDecay: 0.01, profile: 'source', activators: [], inhibitors: [] },
				gating: { ions: ['K'], HillK: 0.5, HillN: 2, peak: 0, extracellular: false, activators: [], inhibitors: [] } }],
			reactions: [], modulators: [], affectCharge: true
		}
	});
	onDestroy(() => sim.destroy());
	const sub = () => sim.network!.subs[0].cfg;
	let decay = $state(0.01);
	let dgj = $state(1e-13);
	let gates = $state(false);
	const x0 = mesh.cellCentres[2 * order[0]];
	const xs = order.map((c) => (mesh.cellCentres[2 * c] - x0) * 1e6);
	const profM = $derived.by(() => { void sim.traceVersion; const m = sim.subs[0]; return m ? order.map((c) => m[c]) : order.map(() => 0); });
	const profV = $derived.by(() => { void sim.traceVersion; return order.map((c) => sim.vm[c]); });
	/** decay length from a log-linear fit over cells outside the source with more than 1 % of the peak */
	const lambda = $derived.by(() => {
		const peak = Math.max(...profM);
		const pts = xs.map((x, i) => [x, profM[i]] as const).filter(([, m], i) => i >= 3 && m > 0.01 * peak);
		if (pts.length < 4) return null;
		let sx = 0, sy = 0, sxx = 0, sxy = 0;
		for (const [x, m] of pts) { const y = Math.log(m); sx += x; sy += y; sxx += x * x; sxy += x * y; }
		const n = pts.length, slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
		return slope < 0 ? -1 / slope : null;
	});
</script>

<Lesson title="8 · Morphogens and gene networks">
	<p>Everything so far moved ions. Tissues also traffic <b>small molecules and proteins</b>: signalling molecules, second messengers, transcription factors. In the model these are <b>substances</b>: each has a concentration in every cell (optionally a membrane-side copy and a bath value), and rules for how it is made, destroyed, moved and what it does. That is enough to express a morphogen gradient, a gene regulatory network, or a chemical that opens ion channels. BETSE calls this machinery the general network; here it lives in the "Substances & reactions" dialog.</p>
	<h3>Production, decay, transport</h3>
	<p>A substance's concentration in a cell changes by a production rate (optionally restricted to a region and modulated by Hill functions of other substances or ions: the gene-regulation part), minus first-order decay, plus what diffuses in from neighbours through gap junctions and, if it is membrane-permeant, across the plasma membrane. Reactions convert substances into one another with Michaelis–Menten or thermodynamic kinetics.</p>
	<Eq tex={String.raw`\frac{dM}{dt} = k_\text{prod}\,\phi(\ldots) - k_\text{decay}\,M + \nabla\!\cdot(D_\text{gj}\nabla M)`} />
	<FigMorphogen />
	<p>The stationary solution of production at one end, decay everywhere and junctional diffusion is an exponential with decay length λ = √(D/k): the classic French-flag gradient. Cells can read their position off it. Note what λ does not depend on: the production rate, which only scales the amplitude.</p>
	<h3>From chemistry back to voltage</h3>
	<p>Substances can act on the bioelectric state. The network supports three couplings: a substance can <b>gate</b> ion channels (its concentration opens a permeability for chosen ions through a Hill function), <b>modulate</b> the Na⁺/K⁺ pump or the gap junctions, and, if charged, its own charge enters the cell's charge balance and therefore Vm. Conversely ions can act as regulators of production, so a Ca²⁺ or K⁺ level can switch a gene on. That closes the loop between electrical and chemical patterning, which is the point of the whole exercise.</p>
	<h3>Try it</h3>
	<ul>
		<li>Run. The three source cells (left) produce M; watch the gradient form over a few minutes of simulated time (the demo runs at 60×). The fitted decay length is shown.</li>
		<li>Raise the decay rate: the gradient gets shorter; raise junctional diffusivity: longer. Both by √.</li>
		<li>Tick "M opens K⁺ channels": where M is high the membrane becomes K⁺-selective and Vm falls toward E<sub>K</sub>. The chemical gradient becomes a voltage gradient, which the workbench's "Morphogen gradient" preset shows on a 2-D sheet.</li>
	</ul>
	{#snippet demo()}
		<div class="mb-2 flex items-center gap-2">
			{#if sim.running}<Button size="sm" variant="secondary" onclick={() => sim.pause()}>Pause</Button>{:else}<Button size="sm" onclick={() => sim.run()}>Run</Button>{/if}
			<Button size="sm" variant="ghost" onclick={() => sim.reset()}>Reset</Button>
			<span class="ml-auto font-mono text-sm text-muted-foreground">t = {sim.t.toFixed(0)} s · 60× real time</span>
		</div>
		<MiniCluster {mesh} values={sim.subs[0] ?? new Float64Array(mesh.nCells)} range={[0, Math.max(1e-3, Math.max(...profM))]} height={60} />
		<Slider label="decay rate" bind:value={decay} min={2e-3} max={0.5} log unit="1/s" format={(v) => fmt(v, 2)} onchange={(v) => (sub().growth!.rDecay = v)} />
		<Slider label="junction diffusivity" bind:value={dgj} min={1e-16} max={1e-13} log unit="m²/s" format={(v) => v.toExponential(1)} onchange={(v) => (sub().Dgj = v)} />
		<Label class="gap-2 py-1 text-sm font-normal"><Checkbox bind:checked={gates} onCheckedChange={(v) => (sub().gating!.peak = v === true ? 2e-17 : 0)} /> M opens K⁺ channels (peak permeability 2e-17 m²/s)</Label>
		<div class="my-1 font-mono text-sm text-muted-foreground">decay length λ: {lambda === null ? '–' : `${lambda.toFixed(0)} µm`}</div>
		<MiniChart series={[{ label: '[M]', color: '#9467bd', x: xs, y: profM }]} xlabel="position (µm)" ylabel="mM" height={150} />
		<MiniChart series={[{ label: 'Vm', color: '#e6194b', x: xs, y: profV }]} xlabel="position (µm)" ylabel="mV" height={150} />
	{/snippet}
</Lesson>
