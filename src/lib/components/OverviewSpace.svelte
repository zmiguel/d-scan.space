<script>
	import { Accordion, AccordionItem, Avatar, Badge, Tooltip } from 'flowbite-svelte';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		buildGroupStats,
		collectAllLeaves,
		listGroups,
		sortByTotal,
		sortCategories
	} from '$lib/utils/directional.js';
	import { buildInterestingItems } from '$lib/utils/interesting_items.js';

	let { data, interestingIds } = $props();

	const directional = $derived(data?.directional ?? {});
	const onGrid = $derived(directional?.on_grid ?? null);
	const offGrid = $derived(directional?.off_grid ?? null);

	let truncatedElements = $state({});
	let hoveredGroup = $state(null);
	let selectedGroups = new SvelteSet();

	const onGroups = $derived(sortCategories(listGroups(onGrid)));
	const offGroups = $derived(sortCategories(listGroups(offGrid)));

	const interestingItems = $derived.by(() =>
		buildInterestingItems(onGrid, offGrid, interestingIds)
	);

	const groupStats = $derived.by(() => buildGroupStats(onGrid, offGrid));

	onMount(() => {
		setTimeout(checkTruncation, 100);
		document.addEventListener('click', () => {
			setTimeout(checkTruncation, 100);
		});
	});

	$effect(() => {
		data;
		setTimeout(checkTruncation, 50);
	});

	function checkTruncation() {
		const elements = document.querySelectorAll('[data-truncate-check]');
		const newTruncated = {};

		elements.forEach((element) => {
			const rect = element.getBoundingClientRect();
			const isVisible =
				rect.width > 0 &&
				rect.height > 0 &&
				window.getComputedStyle(element).visibility !== 'hidden' &&
				window.getComputedStyle(element).display !== 'none';

			if (!isVisible) return;

			const isTruncated = Math.ceil(element.scrollWidth) > Math.floor(element.clientWidth + 1);
			if (isTruncated) {
				newTruncated[element.id] = true;
			}
		});

		truncatedElements = newTruncated;
	}

	function setHoveredGroup(name) {
		hoveredGroup = name ?? null;
	}

	function clearHoveredGroup(name) {
		if (hoveredGroup === name) {
			hoveredGroup = null;
		}
	}

	function toggleGroupSelection(name) {
		if (!name) return;
		if (selectedGroups.has(name)) {
			selectedGroups.delete(name);
		} else {
			selectedGroups.add(name);
		}
	}

	function handleGroupKey(event, name) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			toggleGroupSelection(name);
		}
	}

	function itemRowClass(item) {
		const isHighlighted =
			(hoveredGroup && item?.group === hoveredGroup) || selectedGroups.has(item?.group);
		return [
			'grid w-full grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_auto_auto]',
			isHighlighted ? 'rounded bg-white dark:bg-gray-800' : ''
		]
			.filter(Boolean)
			.join(' ');
	}

	function groupSummaryClass(name) {
		const isHighlighted = (hoveredGroup && hoveredGroup === name) || selectedGroups.has(name);
		return [
			'grid w-full grid-cols-[1fr_auto] items-center gap-2 rounded px-2 py-1',
			isHighlighted ? 'bg-white dark:bg-gray-600' : 'bg-white dark:bg-gray-800'
		]
			.filter(Boolean)
			.join(' ');
	}
</script>

<div class="flex flex-col gap-3">
	{#if !onGrid && !offGrid}
		<div class="text-md p-6 text-center text-gray-600 dark:text-gray-300">
			No directional data available.
		</div>
	{:else}
		{#if interestingItems.length > 0}
			<div class="border-b-2 border-gray-600 pb-3">
				<h3
					class="mb-2 text-sm font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-300"
				>
					Interesting
				</h3>
				<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
					{#each interestingItems as item (item.id)}
						<div
							class="grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 rounded bg-white px-2 dark:bg-gray-800"
						>
							<div class="my-2 flex min-w-0 items-center rtl:space-x-reverse">
								<Avatar
									cornerStyle="rounded"
									src="https://images.evetech.net/types/{item.id}/icon?size=32"
									size="sm"
									class="mr-2"
								/>
								<div class="flex min-w-0 items-center gap-1 font-medium dark:text-white">
									<span
										class="max-w-full min-w-0 truncate"
										id="interesting-{item.id}"
										data-truncate-check
									>
										{item.name}
										{#if item.group}
											<span class="text-xs text-gray-500 italic dark:text-gray-400">
												({item.group})</span
											>
										{/if}
									</span>
								</div>
								{#if truncatedElements[`interesting-${item.id}`]}
									<Tooltip triggeredBy="#interesting-{item.id}" placement="top">
										{item.name}
										{#if item.group}
											<span class="text-xs text-gray-500 italic dark:text-gray-400">
												({item.group})</span
											>
										{/if}
									</Tooltip>
								{/if}
							</div>
							<div class="flex items-center gap-1">
								{#if item.on > 0}
									<Badge id="interesting-on-{item.id}" color="red" size="xs">{item.on}</Badge>
									<Tooltip triggeredBy="#interesting-on-{item.id}" placement="top">On Grid</Tooltip>
								{/if}
								{#if item.off > 0}
									<Badge id="interesting-off-{item.id}" color="green" size="xs">{item.off}</Badge>
									<Tooltip triggeredBy="#interesting-off-{item.id}" placement="top"
										>Off Grid</Tooltip
									>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<div class="border-b-2 border-gray-600 pb-3">
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
				{#each groupStats as group (group.id)}
					<div
						class={groupSummaryClass(group.name)}
						onmouseenter={() => setHoveredGroup(group.name)}
						onmouseleave={() => clearHoveredGroup(group.name)}
						onfocus={() => setHoveredGroup(group.name)}
						onblur={() => clearHoveredGroup(group.name)}
						onclick={() => toggleGroupSelection(group.name)}
						onkeydown={(event) => handleGroupKey(event, group.name)}
						role="button"
						tabindex="0"
					>
						<div class="flex min-w-0 items-center gap-2">
							<span class="min-w-0 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
								{group.name}
							</span>
						</div>
						<div class="flex items-center gap-1">
							{#if group.on > 0}
								<Badge id="group-on-{group.id}" color="red" size="xs">{group.on}</Badge>
								<Tooltip triggeredBy="#group-on-{group.id}" placement="top">On Grid</Tooltip>
							{/if}
							{#if group.off > 0}
								<Badge id="group-off-{group.id}" color="green" size="xs">{group.off}</Badge>
								<Tooltip triggeredBy="#group-off-{group.id}" placement="top">Off Grid</Tooltip>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="relative grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-2">
			<div class="pr-0 sm:pr-1">
				<div class="mb-1 flex items-center justify-between border-b-2 border-gray-600 pb-2">
					<h3
						class="text-sm font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-300"
					>
						On-grid
					</h3>
					<Badge color="red" size="xs">{onGrid?.total_objects ?? 0}</Badge>
				</div>
				<Accordion flush multiple>
					{#each onGroups as group (group.id)}
						<AccordionItem open classes={{ button: 'py-1', content: 'py-0 ms-2 me-4' }}>
							{#snippet header()}
								<div
									class="me-2 grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 rounded bg-white py-1 ps-2 dark:bg-gray-600"
								>
									<div
										id="on-group-{group.id}"
										data-truncate-check
										class="min-w-0 truncate text-sm font-semibold text-gray-800 dark:text-gray-100"
									>
										{group.name}
									</div>
									<Badge color="red" size="xs">{group.total_objects ?? 0}</Badge>
								</div>
							{/snippet}
							<ul class="space-y-0.5 text-sm text-gray-600 dark:text-gray-300">
								{#each sortByTotal(collectAllLeaves({ objects: group.objects })) as item (item.id)}
									<div class={itemRowClass(item)}>
										<div class="flex min-w-0 items-center rtl:space-x-reverse">
											<Avatar
												cornerStyle="rounded"
												src="https://images.evetech.net/types/{item.id}/icon?size=32"
												size="sm"
												class="mr-2"
											/>
											<div class="flex min-w-0 items-center gap-1 font-medium dark:text-white">
												<span
													class="max-w-full min-w-0 truncate"
													id="on-item-{item.id}"
													data-truncate-check
												>
													{item.name}
													{#if item.group}
														<span class="text-xs text-gray-500 italic dark:text-gray-400">
															({item.group})</span
														>
													{/if}
												</span>
											</div>
											{#if truncatedElements[`on-item-{item.id}`]}
												<Tooltip triggeredBy="#on-item-{item.id}" placement="top">
													{item.name}
													{#if item.group}
														<span class="text-xs text-gray-500 italic dark:text-gray-400">
															({item.group})</span
														>
													{/if}
												</Tooltip>
											{/if}
										</div>
										<div class="flex items-center gap-1">
											<Badge color="primary" size="xs">{item.count}</Badge>
										</div>
									</div>
								{/each}
							</ul>
						</AccordionItem>
					{/each}
				</Accordion>
			</div>
			<div
				class="pointer-events-none absolute top-0 bottom-0 hidden w-0.5 bg-gray-600 sm:block"
				style="left: calc(50%);"
				aria-hidden="true"
			></div>
			<div class="pl-0 sm:pl-1">
				<div class="mb-1 flex items-center justify-between border-b-2 border-gray-600 pb-2">
					<h3
						class="text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
					>
						Off-grid
					</h3>
					<Badge color="green" size="xs">{offGrid?.total_objects ?? 0}</Badge>
				</div>
				<Accordion flush multiple>
					{#each offGroups as group (group.id)}
						<AccordionItem open classes={{ button: 'py-1', content: 'py-0 ms-2 me-4' }}>
							{#snippet header()}
								<div
									class="me-2 grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 rounded bg-white py-1 ps-2 dark:bg-gray-600"
								>
									<div
										id="off-group-{group.id}"
										data-truncate-check
										class="min-w-0 truncate text-sm font-semibold text-gray-800 dark:text-gray-100"
									>
										{group.name}
									</div>
									<Badge color="green" size="xs">{group.total_objects ?? 0}</Badge>
								</div>
							{/snippet}
							<ul class="space-y-0.5 text-sm text-gray-600 dark:text-gray-300">
								{#each sortByTotal(collectAllLeaves({ objects: group.objects })) as item (item.id)}
									<div class={itemRowClass(item)}>
										<div class="flex min-w-0 items-center rtl:space-x-reverse">
											<Avatar
												cornerStyle="rounded"
												src="https://images.evetech.net/types/{item.id}/icon?size=32"
												size="sm"
												class="mr-2"
											/>
											<div class="flex min-w-0 items-center gap-1 font-medium dark:text-white">
												<span
													class="max-w-full min-w-0 truncate"
													id="off-item-{item.id}"
													data-truncate-check
												>
													{item.name}
													{#if item.group}
														<span class="text-xs text-gray-500 italic dark:text-gray-400">
															({item.group})</span
														>
													{/if}
												</span>
											</div>
											{#if truncatedElements[`off-item-${item.id}`]}
												<Tooltip triggeredBy="#off-item-{item.id}" placement="top">
													{item.name}
													{#if item.group}
														<span class="text-xs text-gray-500 italic dark:text-gray-400">
															({item.group})</span
														>
													{/if}
												</Tooltip>
											{/if}
										</div>
										<div class="flex items-center gap-1">
											<Badge color="primary" size="xs">{item.count}</Badge>
										</div>
									</div>
								{/each}
							</ul>
						</AccordionItem>
					{/each}
				</Accordion>
			</div>
		</div>
	{/if}
</div>
