<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	/** Compact single-value shadcn Select over a flat item list; the trigger shows the selected label. */
	let {
		items, value, onchange, class: cls = '', size = 'sm', title = '', placeholder = ''
	}: { items: { value: string; label: string; title?: string }[]; value: string; onchange: (v: string) => void; class?: string; size?: 'sm' | 'default'; title?: string; placeholder?: string } = $props();
	const label = $derived(items.find((i) => i.value === value)?.label ?? placeholder);
</script>

<Select.Root type="single" {value} onValueChange={(v) => { if (v !== value) onchange(v); }}>
	<Select.Trigger class="text-sm {cls}" {size} {title}>{label}</Select.Trigger>
	<Select.Content>
		{#each items as it (it.value)}<Select.Item value={it.value} label={it.label} title={it.title} />{/each}
	</Select.Content>
</Select.Root>
