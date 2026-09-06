<!-- Three channel states (closed / open / inactivated) with the transitions that make a spike. -->
<script lang="ts">
	const states: { x: number; name: string; gates: string; note: string }[] = [
		{ x: 80, name: 'closed', gates: 'm ≈ 0, h ≈ 1', note: 'armed' },
		{ x: 280, name: 'open', gates: 'm ≈ 1, h ≈ 1', note: 'Na⁺ floods in' },
		{ x: 480, name: 'inactivated', gates: 'm ≈ 1, h ≈ 0', note: 'cannot reopen yet' }
	];
</script>

<figure>
	<svg viewBox="0 0 560 250" class="text-foreground" fill="currentColor" font-size="13" font-family="ui-sans-serif, system-ui, sans-serif">
		<defs>
			<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker><marker id="ag-f58231" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#f58231" /></marker>
		</defs>
		{#each states as { x, name, gates, note } (name)}
			<!-- membrane slab with pore -->
			<rect x={x - 45} y="50" width="90" height="26" class="fill-amber-200/60 dark:fill-amber-900/40 stroke-border" />
			<rect x={x - 12} y="50" width="24" height="26" class="fill-background stroke-border" />
			<!-- activation gate flap (m) -->
			{#if name === 'closed'}
				<line x1={x - 12} y1="76" x2={x + 12} y2="76" stroke="#f58231" stroke-width="4" />
			{:else}
				<line x1={x - 12} y1="76" x2={x - 12} y2="88" stroke="#f58231" stroke-width="4" />
			{/if}
			<!-- inactivation ball (h) -->
			{#if name === 'inactivated'}
				<circle cx={x} cy="44" r="9" fill="#911eb4" />
			{:else}
				<circle cx={x + 30} cy="34" r="9" fill="#911eb4" /><path d="M{x + 22} 42 Q {x + 10} 46 {x + 10} 50" fill="none" stroke="#911eb4" stroke-width="2" />
			{/if}
			<!-- ion arrow when open -->
			{#if name === 'open'}<path d="M{x} 20 V 100" stroke="#f58231" stroke-width="2" marker-end="url(#ag-f58231)" style="color:#f58231" />{/if}
			<text x={x} y="120" text-anchor="middle" font-weight="600">{name}</text>
			<text x={x} y="138" text-anchor="middle" font-size="12" font-family="ui-monospace, monospace">{gates}</text>
			<text x={x} y="156" text-anchor="middle" font-size="12" class="fill-muted-foreground">{note}</text>
		{/each}
		<!-- transitions -->
		<g stroke="currentColor" stroke-width="1.5" fill="none" marker-end="url(#ag)">
			<path d="M135 60 H 225" /><path d="M335 60 H 425" />
			<path d="M480 175 Q 280 230 90 175" />
		</g>
		<text x="180" y="52" text-anchor="middle" font-size="12">depolarize · fast</text>
		<text x="380" y="52" text-anchor="middle" font-size="12">stays high · slower</text>
		<text x="285" y="225" text-anchor="middle" font-size="12">repolarize, then h recovers · slow</text>
		<text x="20" y="246" font-size="12"><tspan fill="#f58231">■</tspan> m gate <tspan fill="#911eb4">●</tspan> h gate</text>
	</svg>
	<figcaption>A sodium channel opens fast when the voltage rises (m), then shuts itself with a slower gate (h) that only resets after repolarization. The potassium channel has just the slow m gate, which is why it ends the spike.</figcaption>
</figure>
