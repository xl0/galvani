<script lang="ts">
	/** Left: the per-step pipeline as a loop. Right: forward Euler stepping along a curve. */
	const steps = ['modifiers', 'Na/K pump', 'per-ion GHK + gap junctions', 'Ca²⁺ pump', 'gated channels', 'substance network', 'apply fluxes', 'charge → Vm'];
	const curve = Array.from({ length: 41 }, (_, i) => { const x = i / 40; return `${340 + x * 190},${170 - 110 * (1 - Math.exp(-3 * x))}`; }).join(' ');
	const euler = (() => { const pts: string[] = []; let x = 0, y = 0; const h = 0.2; for (let i = 0; i <= 5; i++) { pts.push(`${340 + x * 190},${170 - 110 * y}`); y += h * 3 * (1 - y); x += h; } return pts; })();
</script>

<figure>
	<svg viewBox="0 0 560 250" class="text-foreground" fill="currentColor" font-size="13" font-family="ui-sans-serif, system-ui, sans-serif">
		<defs>
			<marker id="as" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker>
		</defs>
		{#each steps as s, i (s)}
			<rect x="60" y={18 + i * 27} width="200" height="22" rx="4" class="fill-muted stroke-border" />
			<text x="160" y={33 + i * 27} text-anchor="middle" font-size="12">{i + 1}. {s}</text>
		{/each}
		<path d="M260 218 H 290 V 29 H 262" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#as)" />
		<text x="296" y="128" font-size="12" font-family="ui-monospace, monospace">t += dt</text>
		<!-- Euler -->
		<line x1="340" y1="170" x2="540" y2="170" class="stroke-border" /><line x1="340" y1="40" x2="340" y2="170" class="stroke-border" />
		<polyline points={curve} fill="none" class="stroke-muted-foreground" stroke-width="1.5" stroke-dasharray="4 3" />
		<polyline points={euler.join(' ')} fill="none" stroke="#e6194b" stroke-width="2" />
		{#each euler as p (p)}<circle cx={p.split(',')[0]} cy={p.split(',')[1]} r="3" fill="#e6194b" />{/each}
		<text x="440" y="190" text-anchor="middle" font-size="12" class="fill-muted-foreground">time, in steps of dt</text>
		<text x="440" y="30" text-anchor="middle" font-size="12">forward Euler: <tspan fill="#e6194b">x += rate(x)·dt</tspan></text>
		<text x="440" y="212" text-anchor="middle" font-size="12" class="fill-muted-foreground">dashed: exact. Steps lag; too big a dt overshoots</text>
	</svg>
	<figcaption>Every step runs the same pipeline in this order, then advances time. Rates are evaluated once, at the start of the step, which is simple, matches BETSE, and limits how large dt can be.</figcaption>
</figure>
