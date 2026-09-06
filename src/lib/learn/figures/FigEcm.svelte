<script lang="ts">
	/** The environment grid over a cluster: squares, membrane-to-square mapping, edge clamp, tight-junction ring. */
	const n = 9, d = 22, x0 = 60, y0 = 20;
	const R = 22, w = R * Math.sqrt(3);
	const hex = (cx: number, cy: number) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i + Math.PI / 6; return `${cx + R * Math.cos(a)},${cy + R * Math.sin(a)}`; }).join(' ');
	const cx0 = x0 + (n * d) / 2, cy0 = y0 + (n * d) / 2;
	const cells: [number, number][] = [[cx0, cy0], [cx0 + w, cy0], [cx0 - w, cy0], [cx0 + w / 2, cy0 - 1.5 * R], [cx0 - w / 2, cy0 - 1.5 * R], [cx0 + w / 2, cy0 + 1.5 * R], [cx0 - w / 2, cy0 + 1.5 * R]];
	/** squares touched by the cluster (rough): distance from centre under ~2.6 R */
	const inClust = (i: number, j: number) => Math.hypot(x0 + (j + 0.5) * d - cx0, y0 + (i + 0.5) * d - cy0) < 2.55 * R;
	const tj = (i: number, j: number) => { const r = Math.hypot(x0 + (j + 0.5) * d - cx0, y0 + (i + 0.5) * d - cy0); return r >= 1.7 * R && r < 2.55 * R; };
</script>

<figure>
	<svg viewBox="0 0 560 240" class="text-foreground" fill="currentColor" font-size="13" font-family="ui-sans-serif, system-ui, sans-serif">
		<defs>
			<marker id="ae" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker>
		</defs>
		{#each Array.from({ length: n }) as _, i (i)}
			{#each Array.from({ length: n }) as _2, j (j)}
				<rect x={x0 + j * d} y={y0 + i * d} width={d} height={d} class={i === 0 || j === 0 || i === n - 1 || j === n - 1 ? 'fill-sky-200/70 dark:fill-sky-900/50 stroke-border' : tj(i, j) ? 'fill-amber-200/60 dark:fill-amber-900/40 stroke-border' : inClust(i, j) ? 'fill-muted stroke-border' : 'fill-sky-100/40 dark:fill-sky-950/30 stroke-border'} />
			{/each}
		{/each}
		{#each cells as [cx, cy], k (k)}
			<polygon points={hex(cx, cy)} fill="none" class="stroke-foreground" stroke-width="1.5" />
		{/each}
		<!-- one membrane maps to one square -->
		<circle cx={cx0 + w + R * Math.cos(-Math.PI / 6)} cy={cy0 + R * Math.sin(-Math.PI / 6) + 8} r="3" fill="#e6194b" />
		<path d="M{cx0 + w + 20} {cy0 - 6} L {cx0 + w + 30} {cy0 - 30}" stroke="#e6194b" stroke-width="1.5" fill="none" marker-end="url(#ae)" style="color:#e6194b" />
		<g font-size="12">
			<text x="320" y="40">membrane midpoint → nearest square:</text>
			<text x="320" y="56">its flux enters that square</text>
			<text x="320" y="90"><tspan class="fill-amber-700 dark:fill-amber-300">■</tspan> tight junctions: diffusivity scaled</text>
			<text x="320" y="106">around the cluster boundary</text>
			<text x="320" y="140"><tspan class="fill-sky-700 dark:fill-sky-300">■</tspan> world edges: held at the bath</text>
			<text x="320" y="156">composition every step</text>
			<text x="320" y="190">inside: ions diffuse and drift along</text>
			<text x="320" y="206">the environmental field, square to square</text>
		</g>
	</svg>
	<figcaption>With extracellular spaces on, the bath becomes a grid. Membranes exchange with the square they map to, ions move between squares by electrodiffusion, and the edges are a reservoir at the bath composition. The environment also gets a voltage of its own, from the charge that accumulates around membranes and from any voltage applied at the edges.</figcaption>
</figure>
