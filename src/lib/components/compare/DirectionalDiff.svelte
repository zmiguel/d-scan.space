<script>
	import { SvelteMap } from 'svelte/reactivity';
	import { Avatar } from 'flowbite-svelte';
	import Delta from './Delta.svelte';
	import CountCell from './CountCell.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import TruncatedText from '$lib/components/TruncatedText.svelte';

	/** @type {{ diff: ReturnType<typeof import('$lib/utils/scanDiff.js').diffDirectional> }} */
	let { diff } = $props();

	let showUnchanged = $state(false);
	let expandAll = $state(false);

	const typesByGroup = $derived.by(() => {
		const map = new SvelteMap();
		for (const type of diff.types) {
			if (!map.has(type.group)) map.set(type.group, []);
			map.get(type.group).push(type);
		}
		return map;
	});
	const visibleGroups = $derived(
		showUnchanged ? diff.groups : diff.groups.filter((group) => group.status !== 'same')
	);
	const visibleTypes = (groupName) =>
		(typesByGroup.get(groupName) ?? []).filter((type) => showUnchanged || type.status !== 'same');

	const rowGrid = 'grid grid-cols-[minmax(0,1fr)_6rem_6rem_3.5rem] items-center gap-2';
	const heading =
		'mb-2 text-sm font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-300';
</script>

{#snippet header(label)}
	<div
		class="{rowGrid} border-b border-gray-300 px-2 pb-1 text-xs text-gray-500 uppercase dark:border-gray-600 dark:text-gray-400"
	>
		<span>{label}</span><span>Before</span><span>After</span><span class="text-right">Δ</span>
	</div>
{/snippet}

{#snippet classTable(title, rows)}
	{#if rows.length > 0}
		<section>
			<h2 class={heading}>{title}</h2>
			{@render header('Class')}
			<ul>
				{#each rows as row (row.key)}
					<li class="{rowGrid} px-2 py-1 text-sm">
						<span class="flex min-w-0 items-center gap-2 text-gray-800 dark:text-gray-200">
							<span class={['h-2.5 w-2.5 shrink-0 rounded-sm', row.color]} aria-hidden="true"
							></span>
							{row.label}
							<StatusBadge {row} />
						</span>
						<CountCell counts={row.before} />
						<CountCell counts={row.after} />
						<span class="text-right"><Delta value={row.delta} /></span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/snippet}

<div class="flex flex-col gap-5">
	<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
		{#each [{ label: 'Ships', before: diff.totals.shipsBefore, after: diff.totals.shipsAfter }, { label: 'All objects', before: diff.totals.before, after: diff.totals.after }] as total (total.label)}
			<div class="rounded bg-gray-50 p-3 dark:bg-gray-700">
				<div class="text-xs text-gray-500 uppercase dark:text-gray-400">{total.label}</div>
				<div class="text-lg text-gray-900 tabular-nums dark:text-white">
					{total.before} → {total.after}
					<Delta value={total.after - total.before} />
				</div>
			</div>
		{/each}
	</div>

	{#if diff.notable.length > 0}
		<section>
			<h2 class={heading}>Notable changes</h2>
			<ul class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each diff.notable as type (type.id)}
					<li class="flex items-center gap-2 rounded bg-gray-50 p-2 dark:bg-gray-700">
						<Avatar
							cornerStyle="rounded"
							src="https://images.evetech.net/types/{type.id}/icon?size=32"
							size="sm"
						/>
						<span class="min-w-0 flex-1 text-sm font-medium text-gray-900 dark:text-white">
							<TruncatedText>{type.name}</TruncatedText>
							<span class="text-xs font-normal text-gray-500 dark:text-gray-400">
								{type.before.total} → {type.after.total}
							</span>
						</span>
						<StatusBadge row={type} />
						<Delta value={type.delta} />
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
		{@render classTable('Ship classes', diff.shipClasses)}
		{@render classTable('Other objects', diff.objectClasses)}
	</div>

	<section>
		<div class="mb-2 flex flex-wrap items-center gap-4">
			<h2 class={[heading, 'mb-0']}>By group</h2>
			<label class="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
				<input type="checkbox" bind:checked={showUnchanged} class="rounded" />
				Show unchanged
			</label>
			<label class="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
				<input type="checkbox" bind:checked={expandAll} class="rounded" />
				Expand all
			</label>
		</div>
		{#if visibleGroups.length === 0}
			<p class="p-4 text-center text-sm text-gray-600 dark:text-gray-300">
				Nothing changed between the two scans.
			</p>
		{:else}
			{@render header('Group / type')}
			{#each visibleGroups as group (group.id)}
				<details class="group border-b border-gray-200 dark:border-gray-700" open={expandAll}>
					<summary
						class="{rowGrid} cursor-pointer list-none px-2 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
					>
						<span class="flex min-w-0 items-center gap-2 font-medium text-gray-900 dark:text-white">
							<span
								class="inline-block w-3 text-gray-400 transition-transform group-open:rotate-90"
								aria-hidden="true">›</span
							>
							<TruncatedText>{group.name}</TruncatedText>
							<StatusBadge row={group} />
						</span>
						<CountCell counts={group.before} />
						<CountCell counts={group.after} />
						<span class="text-right"><Delta value={group.delta} /></span>
					</summary>
					<ul class="pb-1">
						{#each visibleTypes(group.name) as type (type.id)}
							<li class="{rowGrid} py-0.5 ps-7 pe-2 text-sm">
								<span class="flex min-w-0 items-center gap-2 text-gray-800 dark:text-gray-200">
									<img
										src="https://images.evetech.net/types/{type.id}/icon?size=32"
										alt=""
										class="h-5 w-5 rounded"
										loading="lazy"
									/>
									<TruncatedText>{type.name}</TruncatedText>
									<StatusBadge row={type} />
								</span>
								<CountCell counts={type.before} />
								<CountCell counts={type.after} />
								<span class="text-right"><Delta value={type.delta} /></span>
							</li>
						{/each}
					</ul>
				</details>
			{/each}
		{/if}
	</section>
</div>
