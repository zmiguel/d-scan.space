<script>
	import { Button } from 'flowbite-svelte';
	import { resolve } from '$app/paths';
	import { formatUtcTimestamp } from '$lib/utils/time.js';

	/**
	 * Server-paginated scan list shared by /scans and /my-scans.
	 * @type {{
	 *   basePath: '/scans' | '/my-scans',
	 *   scans: Array<{ id: string, group_id: string, scan_type: string, created_at: Date | string,
	 *     system: { name: string } | null, public?: boolean }>,
	 *   total: number, page: number, pageCount: number, query: string, type: string,
	 *   showVisibility?: boolean, emptyText: string
	 * }}
	 */
	let {
		basePath,
		scans,
		total,
		page,
		pageCount,
		query,
		type,
		showVisibility = false,
		emptyText
	} = $props();

	const filtersActive = $derived(query !== '' || type !== '');

	/** Query string for a list page, preserving the active filters. */
	function listQuery(targetPage) {
		const parts = [
			['q', query],
			['type', type],
			['page', targetPage > 1 ? String(targetPage) : '']
		]
			.filter(([, value]) => value)
			.map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
		return parts.length ? `?${parts.join('&')}` : '';
	}

	const formatTime = formatUtcTimestamp;

	function formatType(scanType) {
		return scanType === 'directional' ? 'Directional' : 'Local';
	}

	const fieldClass =
		'block w-full rounded-md border border-gray-300 bg-gray-200 p-2 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-400';
	const pagerLinkClass =
		'rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-600';
	const pagerDisabledClass =
		'cursor-not-allowed rounded-md border border-gray-200 bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500';
	const cellLinkClass = 'block px-3 py-2 text-gray-900 dark:text-gray-200';
</script>

{#if total === 0 && !filtersActive}
	<p class="p-4 text-sm sm:text-base">{emptyText}</p>
{:else}
	<form
		method="GET"
		action={resolve(basePath)}
		class="flex flex-col gap-3 p-2 sm:flex-row sm:items-end"
		role="search"
	>
		<div class="flex-1">
			<label for="scan-list-q" class="mb-1 block text-sm font-medium text-gray-900 dark:text-white"
				>System name</label
			>
			<input
				id="scan-list-q"
				type="search"
				name="q"
				value={query}
				maxlength="100"
				placeholder="e.g. Jita"
				class={fieldClass}
			/>
		</div>
		<div class="sm:w-48">
			<label
				for="scan-list-type"
				class="mb-1 block text-sm font-medium text-gray-900 dark:text-white">Type</label
			>
			<select id="scan-list-type" name="type" class={fieldClass}>
				<option value="" selected={type === ''}>All</option>
				<option value="local" selected={type === 'local'}>Local</option>
				<option value="directional" selected={type === 'directional'}>Directional</option>
			</select>
		</div>
		<div class="flex gap-2">
			<Button type="submit" size="sm" class="cursor-pointer">Search</Button>
			{#if filtersActive}
				<a href={resolve(basePath)} class={pagerLinkClass + ' self-center'}>Clear</a>
			{/if}
		</div>
	</form>

	{#if total === 0}
		<p class="p-4 text-sm sm:text-base">No scans match your search</p>
	{:else}
		<div class="overflow-x-auto p-2">
			<table
				class="w-full overflow-hidden rounded-lg border border-gray-200 bg-white text-left text-sm dark:border-gray-700 dark:bg-gray-800"
			>
				<thead
					class="bg-gray-100 text-xs text-gray-700 uppercase dark:bg-gray-900 dark:text-gray-400"
				>
					<tr>
						<th scope="col" class="px-3 py-2">Time (UTC)</th>
						<th scope="col" class="px-3 py-2">System</th>
						<th scope="col" class="px-3 py-2">Type</th>
						<th scope="col" class="px-3 py-2">Group</th>
						{#if showVisibility}
							<th scope="col" class="px-3 py-2">Visibility</th>
						{/if}
					</tr>
				</thead>
				<tbody>
					{#each scans as scan (scan.id)}
						<tr
							class="border-t border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
						>
							<td class="p-0 whitespace-nowrap">
								<a href={resolve(`/scan/${scan.group_id}/${scan.id}`)} class={cellLinkClass}>
									{formatTime(scan.created_at)}
								</a>
							</td>
							<td class="p-0">
								<a
									href={resolve(`/scan/${scan.group_id}/${scan.id}`)}
									class={cellLinkClass}
									tabindex="-1"
								>
									{scan.system?.name || 'Unknown'}
								</a>
							</td>
							<td class="p-0">
								<a
									href={resolve(`/scan/${scan.group_id}/${scan.id}`)}
									class={cellLinkClass}
									tabindex="-1"
								>
									{formatType(scan.scan_type)}
								</a>
							</td>
							<td class="p-0">
								<a
									href={resolve(`/scan/${scan.group_id}`)}
									class={`${cellLinkClass} font-mono text-primary-700 hover:underline dark:text-primary-400`}
									title="Scans with the same group belong together; opens the group's latest scan"
								>
									{scan.group_id}
								</a>
							</td>
							{#if showVisibility}
								<td class="p-0">
									<a
										href={resolve(`/scan/${scan.group_id}/${scan.id}`)}
										class={cellLinkClass}
										tabindex="-1"
									>
										{scan.public ? 'Public' : 'Private'}
									</a>
								</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<nav
		aria-label="Scan list pagination"
		class="flex flex-col items-center justify-between gap-2 p-2 sm:flex-row"
	>
		<p class="text-sm text-gray-700 dark:text-gray-300">
			{total}
			{total === 1 ? 'scan' : 'scans'}
		</p>
		<div class="flex items-center gap-2">
			{#if page > 1}
				<a href={resolve(`${basePath}${listQuery(page - 1)}`)} rel="prev" class={pagerLinkClass}
					>Previous</a
				>
			{:else}
				<span aria-disabled="true" class={pagerDisabledClass}>Previous</span>
			{/if}
			<span class="text-sm text-gray-700 dark:text-gray-300">Page {page} of {pageCount}</span>
			{#if page < pageCount}
				<a href={resolve(`${basePath}${listQuery(page + 1)}`)} rel="next" class={pagerLinkClass}
					>Next</a
				>
			{:else}
				<span aria-disabled="true" class={pagerDisabledClass}>Next</span>
			{/if}
		</div>
	</nav>
{/if}
