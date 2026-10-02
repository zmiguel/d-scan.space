<script>
	import CountBadge from './CountBadge.svelte';

	/**
	 * Group total (name, on-/off-grid counts). Hover/focus highlights the group's items,
	 * click / Enter / Space toggles a sticky selection (several groups can be selected).
	 * @type {{ group: { id: number, name: string, on: number, off: number }, highlight: import('$lib/utils/groupHighlight.svelte.js').GroupHighlight }}
	 */
	let { group, highlight } = $props();

	const highlighted = $derived(highlight.isHighlighted(group.name));
	const selected = $derived(highlight.isSelected(group.name));
</script>

<button
	type="button"
	aria-pressed={selected}
	class={[
		'grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-2 rounded px-2 py-1 text-left',
		highlighted ? 'bg-primary-100 dark:bg-gray-600' : 'bg-white dark:bg-gray-800'
	]}
	onmouseenter={() => highlight.hover(group.name)}
	onmouseleave={() => highlight.unhover(group.name)}
	onfocus={() => highlight.hover(group.name)}
	onblur={() => highlight.unhover(group.name)}
	onclick={() => highlight.toggle(group.name)}
>
	<span class="flex min-w-0 items-center gap-2">
		<span class="min-w-0 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
			{group.name}
		</span>
	</span>
	<span class="flex items-center gap-1">
		{#if group.on > 0}
			<CountBadge count={group.on} color="red" label="On Grid" />
		{/if}
		{#if group.off > 0}
			<CountBadge count={group.off} color="green" label="Off Grid" />
		{/if}
	</span>
</button>
