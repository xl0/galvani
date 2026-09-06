<script lang="ts">
	import * as InputGroup from '$lib/components/ui/input-group';
	/** Labeled numeric input. `scale` converts model units to display units (e.g. 1e6 for m -> µm). */
	let {
		label,
		value,
		onchange,
		unit = '',
		scale = 1,
		step = undefined as number | undefined,
		min = undefined as number | undefined,
		help = '',
		placeholder = '',
		onclear = undefined as (() => void) | undefined
	}: {
		label: string;
		/** undefined = unset; shows `placeholder` and calls `onclear` when the field is emptied */
		value: number | undefined;
		onchange: (v: number) => void;
		/** shown when value is undefined (typically the inherited default) */
		placeholder?: string;
		onclear?: () => void;
		unit?: string;
		scale?: number;
		step?: number;
		min?: number;
		/** plain-language tooltip: what it is, what raising it does */
		help?: string;
	} = $props();

	let text = $derived(value === undefined ? '' : String(+(value * scale).toPrecision(6)));

	function commit(e: Event) {
		const raw = (e.target as HTMLInputElement).value.trim();
		if (raw === '' && onclear) { onclear(); return; }
		const v = parseFloat(raw);
		if (Number.isFinite(v) && v / scale !== value) onchange(v / scale);
	}
</script>

<label class="flex min-w-0 items-center gap-1.5 text-sm" title={help}>
	{#if label}<span class="w-20 shrink-0 truncate text-muted-foreground {help ? 'cursor-help underline decoration-dotted underline-offset-2' : ''}">{label}</span>{/if}
	<InputGroup.Root class="h-7 min-w-0 flex-1">
		<InputGroup.Input type="number" class="h-7 px-1.5 font-mono tabular-nums" value={text} {step} {min} {placeholder} onchange={commit} onkeydown={(e) => e.key === 'Enter' && commit(e)} />
		{#if unit}<InputGroup.Addon align="inline-end"><InputGroup.Text class="font-normal">{unit}</InputGroup.Text></InputGroup.Addon>{/if}
	</InputGroup.Root>
</label>
