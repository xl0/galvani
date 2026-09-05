<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	let { title, blurb = '', open = true, children, actions }: { title: string; blurb?: string; open?: boolean; children: Snippet; actions?: Snippet } = $props();
	// svelte-ignore state_referenced_locally
	let isOpen = $state(open);
</script>

<div class="border-b border-border">
	<div class="flex items-center gap-1 px-2 py-1">
		<button class="flex flex-1 items-center gap-1 text-left text-xs font-medium" onclick={() => (isOpen = !isOpen)}>
			<ChevronRight class="size-3 transition-transform {isOpen ? 'rotate-90' : ''}" />
			{title}
		</button>
		{#if actions}{@render actions()}{/if}
	</div>
	{#if isOpen}
		<div class="flex flex-col gap-1 px-2 pb-2">
			{#if blurb}<div class="mb-0.5 text-[11px] leading-snug text-muted-foreground">{blurb}</div>{/if}
			{@render children()}
		</div>
	{/if}
</div>
