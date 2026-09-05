<script lang="ts">
	import { onDestroy } from 'svelte';
	import Lesson from '$lib/components/learn/Lesson.svelte';
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
	<p>Put chapters 5 and 6 together along a row of {N} cells and you get the thing bioelectricity is about: a signal that <b>propagates</b>. Each firing cell depolarizes the next through its junctions, the next crosses threshold and fires, and so on. Nothing travels except the pattern.</p>
	<h3>What sets the speed</h3>
	<ul>
		<li><b>Coupling.</b> More junction area means the neighbour reaches threshold sooner. Too little and the wave dies after a few cells.</li>
		<li><b>Excitability.</b> More sodium channels, or a resting potential closer to threshold, speeds the upstroke.</li>
		<li><b>Cell size.</b> Small cells charge faster (chapter 4), so a wave crosses them quicker, but there are more of them per millimetre.</li>
	</ul>
	<p>Real excitable tissue conducts at millimetres to metres per second; this toy strip is in that range at the low end, which is what you'd expect with only gap junctions and no specialised structures.</p>
	<h3>Regions</h3>
	<p>The workbench lets you paint a <b>region</b> and give it different channels, pumps or coupling. A region with no sodium channels is a block: the wave stops at it. A region with weak coupling is a delay line. A region with a K⁺ leak sits at a more negative voltage and needs a bigger push. Combining these is how the simulator represents different tissues, injuries, or drug treatments.</p>
	<h3>Try it</h3>
	<ul>
		<li>Run and Stimulate the left end. Watch the wave cross the strip; the four traces are cells at 0, ⅓, ⅔ and the far end. The speed readout uses the time between the first and last cell crossing −20 mV.</li>
		<li>Reduce coupling until the wave fails. Find the threshold.</li>
		<li>Then open the <a class="underline" href="/">workbench</a>: the default experiment is this same excitable tissue as a 2-D sheet, with a trigger region and a timed stimulus, where you can paint regions and cut cells.</li>
	</ul>
	{#snippet demo()}
		<div class="mb-2 flex items-center gap-2">
			{#if sim.running}<Button size="sm" variant="secondary" onclick={() => sim.pause()}>Pause</Button>{:else}<Button size="sm" onclick={() => sim.run()}>Run</Button>{/if}
			<Button size="sm" variant="ghost" onclick={() => sim.reset()}>Reset</Button>
			<Button size="sm" onclick={fire}>Stimulate left end</Button>
			<span class="ml-auto font-mono text-xs text-muted-foreground">t = {(sim.t * 1e3).toFixed(0)} ms</span>
		</div>
		<MiniCluster mesh={sim.mesh} values={sim.vm} range={[-80, 40]} height={70} onclick={(c) => sim.stimulate('Na', 200, 0.01, [c])} />
		<Slider label="junction area" bind:value={gj} min={1e-9} max={1e-6} log format={(v) => v.toExponential(1)} onchange={(v) => (sim.params.gjSurface = v)} />
		<div class="my-1 font-mono text-sm text-muted-foreground">conduction speed: {speed === null ? '–' : `${speed.toFixed(2)} mm/s`}</div>
		<MiniChart {series} xlabel="time (s)" ylabel="mV" height={200} />
	{/snippet}
</Lesson>
