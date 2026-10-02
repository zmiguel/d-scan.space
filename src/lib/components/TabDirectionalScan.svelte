<script>
	import { untrack } from 'svelte';
	import { buildGroupStats, listGroups, sortCategories } from '$lib/utils/directional.js';
	import { buildInterestingItems } from '$lib/utils/interesting_items.js';
	import { GroupHighlight } from '$lib/utils/groupHighlight.svelte.js';
	import GroupSummary from '$lib/components/directional/GroupSummary.svelte';
	import GridColumn from '$lib/components/directional/GridColumn.svelte';
	import InterestingItemCard from '$lib/components/directional/InterestingItemCard.svelte';
	import CompositionBar from '$lib/components/directional/CompositionBar.svelte';

	let { data, interestingRules } = $props();

	const directional = $derived(data?.directional ?? {});
	const onGrid = $derived(directional?.on_grid ?? null);
	const offGrid = $derived(directional?.off_grid ?? null);

	const onGroups = $derived(sortCategories(listGroups(onGrid)));
	const offGroups = $derived(sortCategories(listGroups(offGrid)));
	const interestingItems = $derived(buildInterestingItems(onGrid, offGrid, interestingRules));
	const groupStats = $derived(buildGroupStats(onGrid, offGrid));

	const highlight = new GroupHighlight();

	// The page component is reused when navigating between scans: start each scan with
	// nothing highlighted.
	$effect(() => {
		data?.params?.scan;
		untrack(() => highlight.reset());
	});
</script>

{#if onGrid || offGrid}
	<div class="mb-3">
		<CompositionBar {groupStats} {onGrid} {offGrid} {highlight} />
	</div>
{/if}

<div class="relative grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-2">
	{#if !onGrid && !offGrid}
		<div class="text-md col-span-3 p-6 text-center text-gray-600 dark:text-gray-300">
			No directional data available.
		</div>
	{:else}
		<div class="col-span-1 pr-0 sm:pr-1">
			<div class="grid grid-cols-1 gap-2">
				{#each groupStats as group (group.id)}
					<GroupSummary {group} {highlight} />
				{/each}
			</div>
		</div>
		<div
			class="pointer-events-none absolute top-0 bottom-0 hidden w-0.5 bg-gray-600 sm:block"
			style="left: calc(33.333% - 0.15rem);"
			aria-hidden="true"
		></div>
		<div class="col-span-2 pl-0 sm:pl-1">
			{#if interestingItems.length > 0}
				<div class="mb-2 border-b-2 border-gray-600 pb-3">
					<h3
						class="mb-2 text-sm font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-300"
					>
						Interesting
					</h3>
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
						{#each interestingItems as item (item.id)}
							<InterestingItemCard {item} />
						{/each}
					</div>
				</div>
			{/if}

			<div class="relative grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-2">
				<div class="pr-0 sm:pr-1">
					<GridColumn
						title="On-grid"
						titleClass="text-gray-600 dark:text-gray-300"
						color="red"
						total={onGrid?.total_objects ?? 0}
						groups={onGroups}
						{highlight}
					/>
				</div>
				<div
					class="pointer-events-none absolute top-0 bottom-0 hidden w-0.5 bg-gray-600 sm:block"
					style="left: calc(50%);"
					aria-hidden="true"
				></div>
				<div class="pl-0 sm:pl-1">
					<GridColumn
						title="Off-grid"
						titleClass="text-gray-500 dark:text-gray-400"
						color="green"
						total={offGrid?.total_objects ?? 0}
						groups={offGroups}
						{highlight}
					/>
				</div>
			</div>
		</div>
	{/if}
</div>
