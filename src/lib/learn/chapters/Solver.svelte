<script lang="ts">
	import Lesson from '$lib/components/learn/Lesson.svelte';
</script>

<Lesson title="8 · What the simulator does each step">
	<p>Everything in the earlier chapters is computed by one loop, repeated thousands of times. Knowing its order tells you what the numbers mean, what the time step buys you, and where the model stops.</p>
	<h3>State</h3>
	<p>The cluster is a list of cells and a list of membrane segments. Per cell: the concentration of every ion and substance. Per membrane: the voltage, the permeability to each ion, the gap-junction open fraction, channel gates. The bath is one well-mixed compartment. That is all there is; fields, currents and "the tissue" are derived.</p>
	<h3>One step, in order</h3>
	<ul>
		<li><b>Events</b> fire: permeability / pump / junction factors for the time window, cuts.</li>
		<li><b>Na/K pump</b> flux on every membrane, from the membrane-side Na⁺ and K⁺ and the current V<sub>m</sub>.</li>
		<li><b>Per ion</b>: GHK flux across the membrane; gap-junction gating update (Harris) and GHK flux to the neighbour; then the membrane-side concentration is set to the cell value.</li>
		<li><b>Ca²⁺ pump</b> flux, if calcium is present.</li>
		<li><b>Voltage-gated channels</b>: gates relax toward their steady state (implicit update), open fraction × max permeability × any substance regulation gives the extra flux, which is applied to concentrations at once.</li>
		<li><b>Substance network</b>: modulators of the pump / junctions; production, decay and reactions; substance-gated ion fluxes; substance transport across membranes and junctions; substances' charge.</li>
		<li><b>Apply the queued fluxes</b>: membrane fluxes change cells and bath, junction fluxes move ions between cells; negative concentrations are clamped to zero.</li>
		<li><b>Voltage</b>: net charge per cell → surface charge → V<sub>m</sub> = σ / C<sub>m</sub>.</li>
	</ul>
	<h3>Forward Euler and the time step</h3>
	<p>Each quantity advances by rate × dt using the values at the start of the step. That is the simplest possible scheme and it is what BETSE does, so results can be compared to it number for number. The price is a stability limit: the fastest process sets the largest usable dt. Voltage is the fastest. With default permeabilities 10 ms is fine; with strong Na⁺ channels you need 0.1 ms, which is why the excitable presets are slow. If a run "explodes", the simulator stops and says so; halve dt.</p>
	<h3>What is not in the model</h3>
	<ul>
		<li><b>Space outside the cells.</b> The bath has no geometry, so there are no extracellular voltage gradients and no externally applied fields. BETSE has an optional extracellular grid; it is not ported.</li>
		<li><b>Space inside a cell.</b> A cell is one concentration (optionally a membrane-side copy for substances). No organelles, no calcium stores.</li>
		<li><b>Mechanics.</b> No osmotic swelling, flow or deformation.</li>
		<li><b>Cable effects.</b> Voltage is the same on all membranes of a cell (the per-membrane values differ only through the nonce-level details of how charge is attributed).</li>
	</ul>
	<h3>How you know it is right</h3>
	<p>Five reference runs exported from BETSE (plain cluster, Na/K channels, calcium, calcium channels, a substance network) are replayed by this code in the test suite, and the trajectories agree to about 10⁻¹² V and 10⁻¹³ mM over 450 steps: round-off, not modelling error. When the model diverges from BETSE deliberately (the bath, the extracellular grid), the tests say so by not covering it.</p>
	{#snippet demo()}
		<div class="text-sm leading-relaxed">
			<div class="mb-2 font-semibold">Step loop</div>
			<ol class="list-decimal space-y-1 pl-5 font-mono text-xs">
				<li>fire events</li>
				<li>Na/K pump → queue</li>
				<li>for each ion: GHK membrane flux → queue; GJ gate; GJ flux → queue; c<sub>mem</sub> := c<sub>cell</sub></li>
				<li>Ca pump → queue</li>
				<li>channels: gates; flux applied now</li>
				<li>network: modulators; growth, reactions; gating (applied now + queued); transport; charge</li>
				<li>apply queues to cells, bath; clamp ≥ 0</li>
				<li>V<sub>m</sub> = ρ · (vol/area) / C<sub>m</sub></li>
			</ol>
			<div class="mt-4 text-xs text-muted-foreground">Same order as BETSE's <code>Simulator._run_sim_core_loop</code> and <code>MasterOfNetworks.run_loop</code>. Source: <code>src/lib/core/step.ts</code>, <code>network.ts</code>.</div>
		</div>
	{/snippet}
</Lesson>
