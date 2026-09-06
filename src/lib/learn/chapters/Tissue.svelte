<script lang="ts">
	import { onDestroy } from 'svelte';
	import { fmt } from '$lib/format';
	import Lesson from '$lib/components/learn/Lesson.svelte';
	import FigTissue from '$lib/learn/figures/FigTissue.svelte';
	import MiniChart from '$lib/components/learn/MiniChart.svelte';
	import MiniCluster from '$lib/components/learn/MiniCluster.svelte';
	import Slider from '$lib/components/learn/Slider.svelte';
	import { MiniSim } from '$lib/learn/minisim.svelte';
	import { strip } from '$lib/learn/meshes';
	import { Button } from '$lib/components/ui/button';

	const N = 24;
	const sim = new MiniSim({ mesh: strip(N), params: { dt: 1e-4 }, initialVm: -0.06, channels: [{ type: 'KLeak', maxDm: 1e-17 }, { type: 'Nav1p3', maxDm: 2e-14 }, { type: 'Kv1p5', maxDm: 1e-15 }], speed: 0.1, traceEvery: 5, traceLen: 2000 });
	onDestroy(() => sim.destroy());
	// cells sorted left to right
	const order = Array.from({ length: sim.mesh.nCells }, (_, i) => i).sort((a, b) => sim.mesh.cellCentres[2 * a] - sim.mesh.cellCentres[2 * b]);
	const probes = [order[0], order[Math.floor(order.length / 3)], order[Math.floor((2 * order.length) / 3)], order[order.length - 1]];
	const colors = ['#e6194b', '#f58231', '#3cb44b', '#4363d8'];
	let gj = $state(5e-8);
	const series = $derived.by(() => { void sim.traceVersion; return probes.map((c, k) => ({ label: `cell ${c}`, color: colors[k], x: sim.trace.t, y: sim.trace.vm.map((v) => v[c]) })); });
	/** conduction speed from first-crossing times of −20 mV at the two ends */
	const speed = $derived.by(() => {
		void sim.traceVersion;
		const cross = (c: number) => { const i = sim.trace.vm.findIndex((v) => v[c] > -20); return i < 0 ? null : sim.trace.t[i]; };
		const a = cross(probes[0]), b = cross(probes[3]);
		if (a === null || b === null || b <= a) return null;
		const dx = Math.abs(sim.mesh.cellCentres[2 * probes[3]] - sim.mesh.cellCentres[2 * probes[0]]);
		return (dx / (b - a)) * 1e3; // mm/s
	});
	function fire() { sim.stimulate('Na', 200, 0.01, [order[0], order[1]]); }
</script>

<Lesson title="7 · A tissue: waves and regions">
	<p>Combine chapters 5 and 6 along a row of {N} cells and you get the phenomenon bioelectricity is built on: a signal that <b>propagates</b>. Each firing cell depolarises the next through its junctions, the next crosses threshold and regenerates the spike, and so on. No ion travels the length of the tissue; only the pattern does.</p>
	<FigTissue />
	<h3>What sets conduction velocity</h3>
	<ul>
		<li><b>Coupling.</b> More junctional conductance brings the neighbour to threshold sooner. Below a critical coupling the current spreads too thinly and the wave decrements and dies after a few cells: conduction block.</li>
		<li><b>Excitability.</b> More Na⁺ channels, or a resting potential closer to threshold, steepens the upstroke and speeds propagation.</li>
		<li><b>Cell size.</b> Small cells have less capacitance to charge (chapter 4), so a wave crosses each one faster, but there are more junctions per millimetre, and each junction costs time.</li>
	</ul>
	<p>Real excitable tissue conducts at millimetres per second (smooth muscle) to metres per second (myelinated axons). This toy strip, with gap junctions only and no specialised structures, sits at the low end of that range, as it should.</p>
	<h3>Regions</h3>
	<p>The workbench lets you paint a <b>region</b> of the cluster and give it different channels, pump rates or coupling. A region without Na⁺ channels is inexcitable: the wave stops at it. A region with weak coupling is a delay line. A region with an extra K⁺ leak sits at a more negative resting potential and needs a larger stimulus. Combinations of these are how the simulator represents distinct tissues, injuries, or pharmacological treatments.</p>
	<h3>Try it</h3>
	<ul>
		<li>Run and Stimulate the left end. Watch the wave cross the strip; the four traces are cells at 0, ⅓, ⅔ and the far end. The velocity readout uses the interval between the first and last cell crossing −20 mV.</li>
		<li>Reduce coupling until conduction fails. Find the threshold.</li>
		<li>Then open the <a class="underline" href="/">workbench</a>: the default experiment is this same excitable tissue as a 2-D sheet, with a trigger region and a timed stimulus, where you can paint regions and cut cells.</li>
	</ul>
	{#snippet demo()}
		<div class="mb-2 flex items-center gap-2">
			{#if sim.running}<Button size="sm" variant="secondary" onclick={() => sim.pause()}>Pause</Button>{:else}<Button size="sm" onclick={() => sim.run()}>Run</Button>{/if}
			<Button size="sm" variant="ghost" onclick={() => sim.reset()}>Reset</Button>
			<Button size="sm" onclick={fire}>Stimulate left end</Button>
			<span class="ml-auto font-mono text-sm text-muted-foreground">t = {(sim.t * 1e3).toFixed(0)} ms</span>
		</div>
		<MiniCluster mesh={sim.mesh} values={sim.vm} range={[-80, 40]} height={70} onclick={(c) => sim.stimulate('Na', 200, 0.01, [c])} />
		<Slider label="junction area" bind:value={gj} min={1e-9} max={1e-6} log format={(v) => (v >= 1e-6 ? `${fmt(v * 1e6, 2)} ppm` : `${fmt(v * 1e9, 2)} ppb`)} onchange={(v) => (sim.params.gjSurface = v)} />
		<div class="my-1 font-mono text-sm text-muted-foreground">conduction speed: {speed === null ? '–' : `${speed.toFixed(2)} mm/s`}</div>
		<MiniChart {series} xlabel="time (s)" ylabel="mV" height={200} />
	{/snippet}
</Lesson>
