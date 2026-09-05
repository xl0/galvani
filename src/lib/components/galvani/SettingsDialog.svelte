<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import Settings2 from '@lucide/svelte/icons/settings-2';

	/**
	 * Sidebar card (title, blurb, summary) that opens a large dialog with the
	 * form on the left and the model explanation on the right.
	 */
	let { title, blurb, summary, form, explain, actions }: {
		title: string; blurb: string; summary: Snippet; form: Snippet; explain: Snippet; actions?: Snippet
	} = $props();
	let open = $state(false);
</script>

<div class="border-b border-border px-3 py-2.5">
	<div class="flex items-center gap-2">
		<span class="text-sm font-semibold">{title}</span>
		{#if actions}{@render actions()}{/if}
		<Button size="sm" variant="outline" class="ml-auto h-7 gap-1 px-2 text-xs" onclick={() => (open = true)}><Settings2 class="size-3.5" /> edit</Button>
	</div>
	<div class="mt-1 text-sm text-muted-foreground">{@render summary()}</div>
</div>

<Dialog.Root bind:open>
	<Dialog.Content class="flex h-[88vh] w-[min(96vw,72rem)] flex-col gap-0 p-0 sm:max-w-none">
		<Dialog.Header class="border-b border-border px-6 py-4">
			<Dialog.Title class="text-lg">{title}</Dialog.Title>
			<Dialog.Description class="text-sm">{blurb}</Dialog.Description>
		</Dialog.Header>
		<div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
			<div class="min-h-0 overflow-y-auto border-r border-border px-6 py-4">{@render form()}</div>
			<div class="prose-sm min-h-0 overflow-y-auto px-6 py-4 text-sm leading-relaxed [&_h4]:mt-4 [&_h4]:mb-1 [&_h4]:font-semibold [&_p]:mb-2 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5">{@render explain()}</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
