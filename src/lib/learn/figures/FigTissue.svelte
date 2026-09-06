<script lang="ts">
	/** Hexagonal stand-in for the Voronoi cluster, labelled with the objects the solver tracks. */
	const R = 40;
	const hex = (cx: number, cy: number) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i + Math.PI / 6; return `${cx + R * Math.cos(a)},${cy + R * Math.sin(a)}`; }).join(' ');
	const w = R * Math.sqrt(3);
	const cells: [number, number][] = [[200, 110], [200 + w, 110], [200 - w, 110], [200 + w / 2, 110 - 1.5 * R], [200 - w / 2, 110 - 1.5 * R], [200 + w / 2, 110 + 1.5 * R], [200 - w / 2, 110 + 1.5 * R]];
</script>

<figure>
	<svg viewBox="0 0 640 230" class="text-foreground" fill="currentColor" font-size="13" font-family="ui-sans-serif, system-ui, sans-serif">
		<defs>
			<marker id="at" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker><marker id="at-e6194b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#e6194b" /></marker><marker id="at-4363d8" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#4363d8" /></marker>
		</defs>
		<rect x="10" y="10" width="380" height="210" rx="8" class="fill-sky-100/60 dark:fill-sky-950/40 stroke-border" />
		<text x="20" y="210" font-size="12" class="fill-muted-foreground">bath (one well-mixed compartment)</text>
		{#each cells as [cx, cy], i (i)}
			<polygon points={hex(cx, cy)} class={i === 0 ? 'fill-amber-200/70 dark:fill-amber-900/50 stroke-foreground' : 'fill-muted stroke-foreground'} stroke-width="1.5" />
			<circle cx={cx} cy={cy} r="2.5" fill="currentColor" />
		{/each}
		<!-- highlight one membrane segment of the centre cell (its right edge) -->
		<line x1={200 + R * Math.cos(-Math.PI / 6)} y1={110 + R * Math.sin(-Math.PI / 6)} x2={200 + R * Math.cos(Math.PI / 6)} y2={110 + R * Math.sin(Math.PI / 6)} stroke="#e6194b" stroke-width="4" />
		<!-- outer membrane segment facing bath (top-left cell's outer edge) -->
		<line x1={200 - w / 2 + R * Math.cos(Math.PI * 7 / 6)} y1={110 - 1.5 * R + R * Math.sin(Math.PI * 7 / 6)} x2={200 - w / 2 + R * Math.cos(Math.PI * 3 / 2)} y2={110 - 1.5 * R + R * Math.sin(Math.PI * 3 / 2)} stroke="#4363d8" stroke-width="4" />
		<!-- labels -->
		<g font-size="12">
			<path d="M400 55 L 210 108" stroke="currentColor" stroke-width="1" fill="none" marker-end="url(#at)" />
			<text x="400" y="50">cell centre: concentrations</text>
			<path d="M400 97 L 240 110" stroke="#e6194b" stroke-width="1" fill="none" marker-end="url(#at-e6194b)" style="color:#e6194b" />
			<text x="400" y="92" fill="#e6194b">membrane segment: V<tspan font-size="9" dy="3">m</tspan><tspan dy="-3">, permeability,</tspan></text>
			<text x="400" y="108" fill="#e6194b">gates; gap junction to the neighbour</text>
			<path d="M400 150 L {200 - w / 2 - R * 0.75} {110 - 1.5 * R - R * 0.4}" stroke="#4363d8" stroke-width="1" fill="none" marker-end="url(#at-4363d8)" style="color:#4363d8" />
			<text x="400" y="145" fill="#4363d8">outer segment: exchanges</text>
			<text x="400" y="161" fill="#4363d8">ions with the bath</text>
		</g>
	</svg>
	<figcaption>What the solver tracks. Each cell is one set of concentrations; each edge is a membrane segment with its own voltage and permeabilities, facing either a neighbour (through gap junctions) or the bath. Real clusters are Voronoi polygons of jittered seed points, not hexagons.</figcaption>
</figure>
