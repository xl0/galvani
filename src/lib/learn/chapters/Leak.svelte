<script lang="ts">
	import { onDestroy } from 'svelte';
	import Lesson from '$lib/components/learn/Lesson.svelte';
	import MiniChart from '$lib/components/learn/MiniChart.svelte';
	import Slider from '$lib/components/learn/Slider.svelte';
	import { MiniSim } from '$lib/learn/minisim.svelte';
	import { oneCell } from '$lib/learn/meshes';
	import { ghkVoltage } from '$lib/core/derived';
	import { fmt } from '$lib/format';
	import { Button } from '$lib/components/ui/button';

	const sim = new MiniSim({ mesh: oneCell(), params: { alphaNaK: 0, dt: 0.01 }, speed: 40, traceEvery: 2 });
	onDestroy(() => sim.destroy());
	let pK = $state(1e-18);
	let pNa = $state(2e-18);
	const ghk = $derived.by(() => { void sim.traceVersion; return ghkVoltage(sim.ions, sim.cc.map((a) => a[0]), Array.from(sim.ccEnv), sim.params.T) * 1e3; });
	const vmSeries = $derived.by(() => { void sim.traceVersion; return { x: sim.trace.t, y: sim.trace.vm.map((v) => v[0]) }; });
	const ghkLine = $derived({ x: [0, Math.max(1, sim.t)], y: [ghk, ghk] });
</script>

<Lesson title="2 · A leaky membrane: the GHK voltage">
	<p>Real membranes leak several ions at once, each with its own <b>permeability</b>. In this simulator permeability is a diffusion constant through the 7.5 nm membrane, so the numbers are small: 10⁻¹⁸ m²/s is a quiet membrane, 10⁻¹⁷ is leaky.</p>
	<h3>Flux across the membrane</h3>
	<p>For each ion, the flow across a patch of membrane depends on its permeability, the concentrations on both sides, and the voltage. The simulator uses the Goldman-Hodgkin-Katz flux equation:</p>
	<div class="eq">J = −P · α/d · (c<sub>in</sub> − c<sub>out</sub>·e<sup>−α</sup>) / (1 − e<sup>−α</sup>),&nbsp;&nbsp; α = z·F·V<sub>m</sub> / R·T</div>
	<p>At V<sub>m</sub> = 0 this is plain diffusion down the gradient. At the ion's Nernst voltage it is exactly zero. In between, voltage and gradient add or fight.</p>
	<h3>Where the voltage settles</h3>
	<p>With no pumps, the voltage drifts until the total charge flow is zero: the ions leaving balance the ions entering. That voltage is a permeability-weighted compromise between the Nernst potentials, the <b>GHK voltage</b>:</p>
	<div class="eq">V<sub>GHK</sub> = (R·T/F) · ln( (P<sub>K</sub>[K]<sub>out</sub> + P<sub>Na</sub>[Na]<sub>out</sub> + …) / (P<sub>K</sub>[K]<sub>in</sub> + P<sub>Na</sub>[Na]<sub>in</sub> + …) )</div>
	<p>A membrane that is mostly permeable to K⁺ sits near −89 mV; add Na⁺ permeability and it climbs toward 0 and beyond.</p>
	<h3>Try it</h3>
	<ul>
		<li>Run. With BETSE's defaults the two permeabilities are similar, and the GHK voltage is close to 0 mV: the cell barely polarizes.</li>
		<li>Raise K⁺ permeability tenfold. The predicted voltage (dashed) drops to about −60 mV and the cell follows it, with a delay set by how fast charge can move across the membrane.</li>
		<li>Without a pump the gradients slowly run down, so the target creeps over minutes of simulated time. Chapter 3 fixes that.</li>
	</ul>
	{#snippet demo()}
		<div class="mb-2 flex items-center gap-2">
			{#if sim.running}<Button size="sm" variant="secondary" onclick={() => sim.pause()}>Pause</Button>{:else}<Button size="sm" onclick={() => sim.run()}>Run</Button>{/if}
			<Button size="sm" variant="ghost" onclick={() => sim.reset()}>Reset</Button>
			<span class="ml-auto font-mono text-xs text-muted-foreground">t = {sim.t.toFixed(1)} s · 40× real time</span>
		</div>
		<Slider label="K⁺ permeability" bind:value={pK} min={1e-19} max={1e-16} log unit="m²/s" format={(v) => v.toExponential(1)} onchange={(v) => sim.setDm('K', v)} />
		<Slider label="Na⁺ permeability" bind:value={pNa} min={1e-19} max={1e-16} log unit="m²/s" format={(v) => v.toExponential(1)} onchange={(v) => sim.setDm('Na', v)} />
		<div class="my-2 grid grid-cols-2 gap-2 text-center font-mono text-sm">
			<div class="rounded border border-border p-2">V<sub>m</sub> now<br /><span class="text-xl">{fmt(sim.vm[0] ?? 0, 3)} mV</span></div>
			<div class="rounded border border-border p-2">GHK prediction<br /><span class="text-xl">{fmt(ghk, 3)} mV</span></div>
		</div>
		<MiniChart series={[{ label: 'Vm', color: '#e6194b', x: vmSeries.x, y: vmSeries.y }, { label: 'GHK', color: '#888', x: ghkLine.x, y: ghkLine.y, dash: [5, 3] }]} xlabel="time (s)" ylabel="mV" height={200} />
		{#if sim.error}<div class="mt-2 text-xs text-destructive">{sim.error}</div>{/if}
	{/snippet}
</Lesson>
