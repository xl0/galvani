<script lang="ts">
	/** Number line of Nernst potentials with the GHK compromise; weights show relative permeability. */
	let { pK = 1e-18, pNa = 1e-18, v = 0 }: { pK?: number; pNa?: number; v?: number } = $props();
	const X = (mv: number) => 60 + ((mv + 100) / 200) * 440;
	const wK = $derived(Math.max(6, Math.min(30, 10 * Math.sqrt(pK / 1e-18))));
	const wNa = $derived(Math.max(6, Math.min(30, 10 * Math.sqrt(pNa / 1e-18))));
</script>

<figure>
	<svg viewBox="0 0 560 150" class="text-foreground" fill="currentColor" font-size="13" font-family="ui-sans-serif, system-ui, sans-serif">
		<line x1="60" y1="80" x2="500" y2="80" class="stroke-border" stroke-width="2" />
		{#each [-100, -50, 0, 50, 100] as mv (mv)}
			<line x1={X(mv)} y1="74" x2={X(mv)} y2="86" class="stroke-border" />
			<text x={X(mv)} y="104" text-anchor="middle" class="fill-muted-foreground" font-size="12">{mv} mV</text>
		{/each}
		<!-- K⁺ anchor -->
		<circle cx={X(-89)} cy="80" r={wK} fill="#3cb44b" opacity="0.85" />
		<text x={X(-89)} y="50" text-anchor="middle" fill="#3cb44b" font-weight="600">E<tspan font-size="10" dy="3">K</tspan><tspan dy="-3">&#160;= −89 mV</tspan></text>
		<!-- Na⁺ anchor -->
		<circle cx={X(67)} cy="80" r={wNa} fill="#f58231" opacity="0.85" />
		<text x={X(67)} y="50" text-anchor="middle" fill="#f58231" font-weight="600">E<tspan font-size="10" dy="3">Na</tspan><tspan dy="-3">&#160;= +67 mV</tspan></text>
		<!-- rope -->
		<line x1={X(-89)} y1="80" x2={X(67)} y2="80" stroke="currentColor" stroke-width="3" stroke-dasharray="6 4" opacity="0.5" />
		<!-- GHK pointer -->
		<path d="M{X(v) - 8} 128 L{X(v)} 112 L{X(v) + 8} 128 Z" fill="#e6194b" />
		<text x={X(v)} y="144" text-anchor="middle" fill="#e6194b" font-weight="600">V<tspan font-size="10" dy="3">GHK</tspan><tspan dy="-3"> = {v.toFixed(0)} mV</tspan></text>
	</svg>
	<figcaption>Each permeant ion pulls the voltage toward its own Nernst potential; the size of each circle is its permeability. The membrane settles where the pulls balance.</figcaption>
</figure>
