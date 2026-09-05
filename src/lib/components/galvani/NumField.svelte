<script lang="ts">
	/** Labeled numeric input. `scale` converts model units to display units (e.g. 1e6 for m -> µm). */
	let {
		label,
		value,
		onchange,
		unit = '',
		scale = 1,
		step = undefined as number | undefined,
		min = undefined as number | undefined,
		help = ''
	}: {
		label: string;
		value: number;
		onchange: (v: number) => void;
		unit?: string;
		scale?: number;
		step?: number;
		min?: number;
		/** plain-language tooltip: what it is, what raising it does */
		help?: string;
	} = $props();

	let text = $derived(String(+(value * scale).toPrecision(6)));

	function commit(e: Event) {
		const v = parseFloat((e.target as HTMLInputElement).value);
		if (Number.isFinite(v) && v / scale !== value) onchange(v / scale);
	}
</script>

<label class="flex min-w-0 items-center gap-1.5 text-sm" title={help}>
	<span class="w-20 shrink-0 truncate text-muted-foreground {help ? 'cursor-help underline decoration-dotted underline-offset-2' : ''}">{label}</span>
	<input
		type="number"
		class="h-7 w-full min-w-0 rounded border border-input bg-background px-1.5 font-mono text-sm tabular-nums outline-none focus:ring-1 focus:ring-ring"
		value={text}
		{step}
		{min}
		onchange={commit}
		onkeydown={(e) => e.key === 'Enter' && commit(e)}
	/>
	<span class="w-9 shrink-0 truncate text-muted-foreground">{unit}</span>
</label>
