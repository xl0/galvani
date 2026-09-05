<script lang="ts">
	import Lesson from '$lib/components/learn/Lesson.svelte';
	import MiniChart from '$lib/components/learn/MiniChart.svelte';
	import Slider from '$lib/components/learn/Slider.svelte';
	import { oneCell } from '$lib/learn/meshes';
	import { F } from '$lib/core/params';
	import { fmt } from '$lib/format';

	const mesh = oneCell();
	let vm = $state(-60);
	let cm = $state(0.05);
	// rho = Vm * Cm / diviterm ; concentration offset = rho / F
	const div = mesh.diviterm[0];
	const rho = $derived((vm * 1e-3 * cm) / div);
	const dc = $derived(rho / F); // mol/m3 = mM
	const ionsPerCell = $derived(Math.abs(dc) * mesh.cellVol[0] * 6.022e23);
	const curve = $derived.by(() => { const x: number[] = [], y: number[] = []; for (let v = -100; v <= 60; v += 2) { x.push(v); y.push(((v * 1e-3 * cm) / div / F) * 1e3); } return { x, y }; });
</script>

<Lesson title="4 · Voltage from charge: the membrane as a capacitor">
	<p>Chapters 1–3 talked about voltage as if it were a separate thing from the ion concentrations. In this simulator it isn't. There is no cable equation and no circuit: the voltage is <i>computed from the charge</i>.</p>
	<h3>The rule</h3>
	<p>Add up the charge of every ion in a cell: <code>ρ = F · Σ z<sub>i</sub> c<sub>i</sub></code>. If the cell were exactly neutral, ρ = 0 and V<sub>m</sub> = 0. Any excess sits on the membrane, which is a capacitor: a thin insulator with conductors on both sides. Charge per membrane area over capacitance per area gives the voltage:</p>
	<div class="eq">V<sub>m</sub> = σ / C<sub>m</sub>,&nbsp;&nbsp; σ = ρ · (cell volume / membrane area)</div>
	<p>C<sub>m</sub> is about 0.01 F/m² for real membranes; BETSE uses 0.05. Every membrane segment of a cell shares that cell's charge, so in the basic model all segments of one cell have the same voltage.</p>
	<h3>How little charge that is</h3>
	<p>This is the surprising part. To hold a 5 µm cell at −60 mV you need a net anion excess of only a few micromolar, against ion concentrations of 100+ mM. Around a hundred thousand extra ions in a cell that holds about 10¹⁰. That is why the concentrations in chapter 1 "barely change" while the voltage swings fully, and why a small pump current can polarize a cell in seconds.</p>
	<h3>Why it matters for what you see</h3>
	<ul>
		<li>Lower C<sub>m</sub> → the same ion movement produces a bigger voltage swing, and the cell responds faster.</li>
		<li>Bigger cells have more volume per membrane area, so the same concentration imbalance gives more voltage.</li>
		<li>The workbench's "Initial V<sub>m</sub>" setting is literally this: it adds the computed anion excess to each cell at t = 0.</li>
	</ul>
	{#snippet demo()}
		<Slider label="target Vm" bind:value={vm} min={-100} max={60} step={1} unit="mV" format={(v) => v.toFixed(0)} />
		<Slider label="Cm" bind:value={cm} min={0.005} max={0.2} log unit="F/m²" format={(v) => fmt(v, 2)} />
		<div class="my-3 grid grid-cols-2 gap-2 text-center font-mono text-sm">
			<div class="rounded border border-border p-2">net anion excess<br /><span class="text-xl">{fmt(-dc * 1e3, 3)} µM</span></div>
			<div class="rounded border border-border p-2">≈ ions per cell<br /><span class="text-xl">{ionsPerCell.toExponential(2)}</span></div>
		</div>
		<div class="mb-2 text-xs text-muted-foreground">for one cell of radius 5 µm, height 10 µm (volume {(mesh.cellVol[0] * 1e18).toFixed(0)} µm³), compared with ~150 mM of each major ion</div>
		<MiniChart series={[{ label: 'imbalance', color: '#4363d8', x: curve.x, y: curve.y }]} xlabel="Vm (mV)" ylabel="µM" marker={{ x: vm, y: dc * 1e3, color: '#e6194b' }} height={180} />
	{/snippet}
</Lesson>
