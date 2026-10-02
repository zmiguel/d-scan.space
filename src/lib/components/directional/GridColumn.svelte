<script>
	import { Accordion, AccordionItem, Badge } from 'flowbite-svelte';
	import { collectAllLeaves, sortByTotal } from '$lib/utils/directional.js';
	import ItemRow from './ItemRow.svelte';

	/**
	 * On-grid or off-grid column: one open accordion per group, its types sorted by count.
	 * @type {{
	 *   title: string,
	 *   titleClass: string,
	 *   color: 'red' | 'green',
	 *   total: number,
	 *   groups: Array<{ id: number, name: string, total_objects?: number, objects: any[] }>,
	 *   highlight: import('$lib/utils/groupHighlight.svelte.js').GroupHighlight
	 * }}
	 */
	let { title, titleClass, color, total, groups, highlight } = $props();
</script>

<div class="mb-1 flex items-center justify-between border-b-2 border-gray-600 pb-2">
	<h3 class={['text-sm font-semibold tracking-wide uppercase', titleClass]}>{title}</h3>
	<Badge {color} size="xs">{total}</Badge>
</div>
<Accordion flush multiple>
	{#each groups as group (group.id)}
		<AccordionItem open classes={{ button: 'py-1', content: 'py-0 ms-2 me-4' }}>
			{#snippet header()}
				<div
					class="me-2 grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 rounded bg-white py-1 ps-2 dark:bg-gray-600"
				>
					<div class="min-w-0 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
						{group.name}
					</div>
					<Badge {color} size="xs">{group.total_objects ?? 0}</Badge>
				</div>
			{/snippet}
			<ul class="space-y-0.5 text-sm text-gray-600 dark:text-gray-300">
				{#each sortByTotal(collectAllLeaves({ objects: group.objects })) as item (item.id)}
					<ItemRow {item} highlighted={highlight.isItemHighlighted(item)} />
				{/each}
			</ul>
		</AccordionItem>
	{/each}
</Accordion>
