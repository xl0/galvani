<script lang="ts">
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import Eq from '$lib/components/learn/Eq.svelte';
	import Lesson from '$lib/components/learn/Lesson.svelte';
	import FigNernst from '$lib/learn/figures/FigNernst.svelte';
	import MiniChart from '$lib/components/learn/MiniChart.svelte';
	import Slider from '$lib/components/learn/Slider.svelte';
	import { F, R } from '$lib/core/params';
	import { si } from '$lib/format';

	const T = 310;
	let ion = $state<'K' | 'Na' | 'Ca'>('K');
	const z = $derived(ion === 'Ca' ? 2 : 1);
	let cIn = $state(139);
	let cOut = $state(5);
	const E = $derived(((R * T) / (z * F)) * Math.log(cOut / cIn) * 1e3);
	const curve = $derived.by(() => {
		const x: number[] = [], y: number[] = [];
		for (let r = -5.5; r <= 5.5; r += 0.05) { x.push(r); y.push(((R * T) / (z * F)) * Math.log(10 ** r) * 1e3); }
		return { x, y };
	});
	function pick(name: 'K' | 'Na' | 'Ca') {
		ion = name;
		if (name === 'K') { cIn = 139; cOut = 5; } else if (name === 'Na') { cIn = 12; cOut = 145; } else { cIn = 0.0001; cOut = 2; }
	}
</script>

<Lesson title="1 · Ions, gradients and the Nernst voltage">
	<p>The cytosol and the extracellular fluid are both salt solutions, but with different recipes. Cytosol is potassium-rich: about 140 mM K⁺ against 5 mM outside. Extracellular fluid is sodium-rich: about 145 mM Na⁺ against 12 mM inside. Chloride follows the same pattern as sodium, and free Ca²⁺ is held at roughly 100 nM in the cytosol against 2 mM outside, a 10⁴-fold gradient. These asymmetries are maintained by pumps (chapter 3) and are the energy store that every bioelectric phenomenon draws on.</p>
	<h3>An ion gradient is a voltage in waiting</h3>
	<p>Suppose the membrane were permeable only to K⁺. K⁺ diffuses outward down its concentration gradient, but each ion that crosses carries one positive charge out, leaving the cytosol with a net negative charge. That charge builds an electric field across the membrane that opposes further efflux. Within microseconds the electrical pull inward equals the diffusive push outward and net flux stops. The voltage at which the two balance is the ion's <b>equilibrium potential</b>, also called its Nernst potential:</p>
	<FigNernst />
	<Eq tex={String.raw`E_N = \frac{RT}{zF}\,\ln\frac{c_\text{out}}{c_\text{in}}`} />
	<p>R·T/F is the thermal voltage, about 26.7 mV at 37 °C; z is the ion's valence. By convention the membrane potential V<sub>m</sub> is inside minus outside. For K⁺ at 139 mM in and 5 mM out, E<sub>K</sub> ≈ −89 mV. For Na⁺, E<sub>Na</sub> ≈ +67 mV. Ca²⁺ combines a huge gradient with z = 2, so E<sub>Ca</sub> is near +130 mV.</p>
	<h3>What to take from this</h3>
	<ul>
		<li>Each ion has its own equilibrium potential. Whenever V<sub>m</sub> differs from it, that ion carries net current across any pathway open to it, toward its E<sub>N</sub>.</li>
		<li>The <b>driving force</b> on an ion is V<sub>m</sub> − E<sub>N</sub>. At rest (≈ −60 mV) K⁺ is nearly at equilibrium while Na⁺ and Ca²⁺ are far from it, which is why opening Na⁺ or Ca²⁺ channels has such dramatic effects.</li>
		<li>Setting the voltage takes a vanishingly small number of ions; the bulk concentrations do not measurably change (chapter 4 puts a number on it).</li>
		<li>The resting potential is not one ion's E<sub>N</sub> but a permeability-weighted compromise between several. That is chapter 2.</li>
	</ul>
	<p>Try it: drag the concentrations. A tenfold concentration ratio is always worth 61 mV for a monovalent ion and 30.5 mV for a divalent one, because the equation is logarithmic in the ratio.</p>
	{#snippet demo()}
		<ToggleGroup.Root type="single" variant="outline" size="sm" spacing={1} class="mb-2" value={ion} onValueChange={(v) => v && pick(v as 'K' | 'Na' | 'Ca')}>
			{#each ['K', 'Na', 'Ca'] as n (n)}<ToggleGroup.Item value={n}>{n}{n === 'Ca' ? '²⁺' : '⁺'}</ToggleGroup.Item>{/each}
		</ToggleGroup.Root>
		<Slider label="inside" bind:value={cIn} min={ion === 'Ca' ? 1e-5 : 1} max={ion === 'Ca' ? 10 : 200} log format={(v) => si(v * 1e-3, 'M')} />
		<Slider label="outside" bind:value={cOut} min={ion === 'Ca' ? 1e-5 : 1} max={ion === 'Ca' ? 10 : 200} log format={(v) => si(v * 1e-3, 'M')} />
		<div class="my-3 text-center font-mono text-2xl tabular-nums">E<sub>N</sub> = {E.toFixed(1)} mV</div>
		<MiniChart series={[{ label: 'Nernst', color: '#4363d8', x: curve.x, y: curve.y }]} xlabel="log10(out / in)" ylabel="mV" marker={{ x: Math.log10(cOut / cIn), y: E, color: '#e6194b' }} height={200} />
	{/snippet}
</Lesson>
