<script lang="ts">
	import { onDestroy } from 'svelte';
	import Eq from '$lib/components/learn/Eq.svelte';
	import Lesson from '$lib/components/learn/Lesson.svelte';
	import FigLeak from '$lib/learn/figures/FigLeak.svelte';
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
	<p>A real membrane is permeable to several ions at once. Each ion's <b>permeability</b> summarises how easily it crosses, whatever the pathway: leak channels, the small background conductance of the bilayer, whatever is open at rest. This simulator expresses permeability as a diffusion coefficient across the 7.5 nm membrane, so the numbers look small: 10⁻¹⁸ m²/s (1 nm²/s, the unit the slider uses) is a tight membrane, 10⁻¹⁷ a leaky one. Think of it as conductance without committing to a channel count.</p>
	<h3>Flux across the membrane</h3>
	<p>For each ion, the flux through a patch of membrane depends on its permeability, the concentrations on the two sides and the voltage. Diffusion and electrical drift are handled together by the Goldman-Hodgkin-Katz (GHK) flux equation, which assumes a constant field across the membrane:</p>
	<Eq tex={String.raw`J = -\frac{P\,\alpha}{d}\;\frac{c_\text{in} - c_\text{out}\,e^{-\alpha}}{1 - e^{-\alpha}}, \qquad \alpha = \frac{zFV_m}{RT}`} />
	<p>At V<sub>m</sub> = 0 it reduces to Fick's law, plain diffusion down the gradient. At the ion's equilibrium potential it is exactly zero. Elsewhere it gives the net electrodiffusive flux, sign included.</p>
	<h3>Where the voltage settles</h3>
	<p>With no pumps, V<sub>m</sub> drifts until the total ionic current is zero: inward cation flux equals outward cation flux (with anions counted the opposite way). The zero-current voltage is a permeability-weighted mean of the equilibrium potentials, the <b>GHK voltage</b>:</p>
	<Eq tex={String.raw`V_\text{GHK} = \frac{RT}{F}\,\ln\frac{P_K[\mathrm{K}^+]_\text{out} + P_{Na}[\mathrm{Na}^+]_\text{out} + \cdots}{P_K[\mathrm{K}^+]_\text{in} + P_{Na}[\mathrm{Na}^+]_\text{in} + \cdots}`} />
	<FigLeak pK={pK} pNa={pNa} v={ghk} />
	<p>Textbook resting potentials of −60 to −90 mV come from a K⁺ permeability much larger than the Na⁺ permeability, typically P<sub>K</sub> : P<sub>Na</sub> ≈ 20 : 1 or more. Raise P<sub>Na</sub> and V<sub>m</sub> climbs toward E<sub>Na</sub>; that is what a sodium channel does when it opens.</p>
	<h3>Try it</h3>
	<ul>
		<li>Run. With BETSE's defaults the two permeabilities are of the same order, so V<sub>GHK</sub> is close to 0 mV and the cell barely polarises. That is deliberate: in BETSE the pump, not the leak ratio, does most of the polarising work (chapter 3).</li>
		<li>Raise P<sub>K</sub> tenfold. The predicted voltage (dashed) drops to about −60 mV and V<sub>m</sub> follows with a lag set by the membrane's RC time: how fast the leak currents can move charge onto the membrane capacitance.</li>
		<li>Without a pump the gradients dissipate, so the target creeps over minutes of simulated time. Chapter 3 fixes that.</li>
	</ul>
	{#snippet demo()}
		<div class="mb-2 flex items-center gap-2">
			{#if sim.running}<Button size="sm" variant="secondary" onclick={() => sim.pause()}>Pause</Button>{:else}<Button size="sm" onclick={() => sim.run()}>Run</Button>{/if}
			<Button size="sm" variant="ghost" onclick={() => sim.reset()}>Reset</Button>
			<span class="ml-auto font-mono text-sm text-muted-foreground">t = {sim.t.toFixed(1)} s · 40× real time</span>
		</div>
		<Slider label="K⁺ permeability" bind:value={pK} min={1e-19} max={1e-16} log unit="nm²/s" format={(v) => fmt(v * 1e18, 2)} onchange={(v) => sim.setDm('K', v)} />
		<Slider label="Na⁺ permeability" bind:value={pNa} min={1e-19} max={1e-16} log unit="nm²/s" format={(v) => fmt(v * 1e18, 2)} onchange={(v) => sim.setDm('Na', v)} />
		<div class="my-2 grid grid-cols-2 gap-2 text-center font-mono text-sm">
			<div class="rounded border border-border p-2">V<sub>m</sub> now<br /><span class="text-xl">{fmt(sim.vm[0] ?? 0, 3)} mV</span></div>
			<div class="rounded border border-border p-2">GHK prediction<br /><span class="text-xl">{fmt(ghk, 3)} mV</span></div>
		</div>
		<MiniChart series={[{ label: 'Vm', color: '#e6194b', x: vmSeries.x, y: vmSeries.y }, { label: 'GHK', color: '#888', x: ghkLine.x, y: ghkLine.y, dash: [5, 3] }]} xlabel="time (s)" ylabel="mV" height={200} />
		{#if sim.error}<div class="mt-2 text-sm text-destructive">{sim.error}</div>{/if}
	{/snippet}
</Lesson>
