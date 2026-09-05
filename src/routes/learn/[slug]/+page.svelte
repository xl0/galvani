<script lang="ts">
	import { chapters } from '$lib/learn';
	import { Button } from '$lib/components/ui/button';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	let { data } = $props();
	const chapter = $derived(chapters[data.index]);
	const prev = $derived(chapters[data.index - 1]);
	const next = $derived(chapters[data.index + 1]);
</script>

<svelte:head><title>{chapter.title} · Galvani</title></svelte:head>

<div class="min-h-screen bg-background text-foreground">
	<header class="flex h-10 items-center gap-3 border-b border-border px-4">
		<a href="/" class="text-base font-semibold tracking-tight">Galvani</a>
		<span class="text-sm text-muted-foreground">/ How the model works</span>
		<a href="/" class="ml-auto text-sm underline decoration-dotted underline-offset-2">Workbench →</a>
	</header>
	<div class="mx-auto grid max-w-7xl gap-8 px-4 py-6 md:grid-cols-[13rem_minmax(0,1fr)]">
		<nav class="text-sm md:sticky md:top-4 md:self-start">
			<ol class="flex flex-col gap-1">
				{#each chapters as c, i (c.slug)}
					<li><a href="/learn/{c.slug}" class="block rounded px-2 py-1 {c.slug === chapter.slug ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/50'}">{i + 1}. {c.short}</a></li>
				{/each}
			</ol>
		</nav>
		<main class="min-w-0">
			{#key chapter.slug}
				<chapter.component />
			{/key}
			<div class="mt-10 flex items-center justify-between border-t border-border pt-4">
				{#if prev}<Button variant="outline" href="/learn/{prev.slug}"><ChevronLeft class="size-4" /> {prev.short}</Button>{:else}<span></span>{/if}
				{#if next}<Button href="/learn/{next.slug}">{next.short} <ChevronRight class="size-4" /></Button>{:else}<Button href="/">Open the workbench</Button>{/if}
			</div>
		</main>
	</div>
</div>
