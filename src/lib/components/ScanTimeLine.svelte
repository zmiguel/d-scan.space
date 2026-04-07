<script>
	import { SvelteMap } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import { Timeline, Badge } from 'flowbite-svelte';
	import { UsersGroupSolid, RocketSolid, WandMagicSparklesOutline } from 'flowbite-svelte-icons';
	import HtmlTimelineItem from '$lib/components/HtmlTimelineItem.svelte';

	let { data } = $props();

	// Sort related scans newest-first for display
	const sortedRelatedScans = $derived(
		data.related
			? [...data.related].sort(
					(a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
				)
			: []
	);

	// Build a map of scan.id → the chronologically previous scan of the same type.
	// null means this scan is the first of its type (no predecessor).
	const prevScanMap = $derived.by(() => {
		if (!data.related) return new SvelteMap();
		const byTime = [...data.related].sort(
			(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
		);
		const map = new SvelteMap();
		/** @type {Record<string, object>} */
		const lastByType = {};
		for (const scan of byTime) {
			map.set(scan.id, lastByType[scan.scan_type] ?? null);
			lastByType[scan.scan_type] = scan;
		}
		return map;
	});

	function formatTimestamp(timestamp) {
		return new Date(timestamp)
			.toISOString()
			.replace('T', ' ')
			.replace(/\.\d+Z$/, '');
	}

	function formatScanType(scanType) {
		return scanType.charAt(0).toUpperCase() + scanType.slice(1) + ' Scan';
	}

	/**
	 * Returns delta info for a scan vs its chronological predecessor of the same type.
	 * Returns null if this is the first of its type (show "New" badge instead).
	 */
	function getDiff(scan) {
		const prev = prevScanMap.get(scan.id);
		if (prev === null) return null; // first of type

		if (!scan.data) return { noData: true };

		if (scan.scan_type === 'local') {
			const delta = (scan.data.total_pilots ?? 0) - (prev?.data?.total_pilots ?? 0);
			return { type: 'local', delta };
		}

		if (scan.scan_type === 'directional') {
			return {
				type: 'directional',
				onGrid: (scan.data.on_grid?.total_objects ?? 0) - (prev?.data?.on_grid?.total_objects ?? 0),
				offGrid:
					(scan.data.off_grid?.total_objects ?? 0) - (prev?.data?.off_grid?.total_objects ?? 0)
			};
		}

		return { noData: true };
	}
</script>

<div>
	<h3 class="mb-3 border-b pb-2 text-base font-semibold sm:text-lg">Related Scans</h3>
	{#if sortedRelatedScans.length > 0}
		<Timeline order="vertical">
			{#each sortedRelatedScans as scan (scan.id)}
				{@const diff = getDiff(scan)}
				{@const isCurrent = scan.id === data.params?.scan}
				<HtmlTimelineItem date={formatTimestamp(scan.created_at)} classLi="mb-2">
					{#snippet icon()}
						<span
							class="absolute -start-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary-200 dark:bg-primary-900"
						>
							{#if scan.scan_type === 'local'}
								<UsersGroupSolid class="h-4 w-4 text-primary-600 dark:text-primary-400" />
							{:else}
								<RocketSolid class="h-4 w-4 text-primary-600 dark:text-primary-400" />
							{/if}
						</span>
					{/snippet}

					{#snippet title()}
						<a
							href={resolve(`/scan/${data.params?.group}/${scan.id}`)}
							class="min-w-0 shrink truncate text-sm text-primary-600 hover:underline dark:text-primary-400"
						>
							{formatScanType(scan.scan_type)}
						</a>

						{#if isCurrent}
							<span class="shrink-0 text-xs text-gray-400 italic">(here)</span>
						{/if}

						{#if diff === null}
							<Badge rounded class="shrink-0 px-1.5 py-0">
								<WandMagicSparklesOutline class="me-1 h-3 w-3" />
								New
							</Badge>
						{:else if diff.noData}
							<span class="shrink-0 text-xs text-yellow-400">— 0</span>
						{:else if diff.type === 'local'}
							<span
								class="shrink-0 text-xs {diff.delta > 0
									? 'text-green-500'
									: diff.delta < 0
										? 'text-red-400'
										: 'text-gray-400'}"
							>
								{diff.delta > 0 ? '↑' : diff.delta < 0 ? '↓' : '– '}{Math.abs(diff.delta)}
							</span>
						{:else if diff.type === 'directional'}
							<span
								class="shrink-0 text-xs {diff.onGrid > 0
									? 'text-green-500'
									: diff.onGrid < 0
										? 'text-red-400'
										: 'text-gray-400'}"
							>
								{diff.onGrid > 0 ? '↑' : diff.onGrid < 0 ? '↓' : '– '}{Math.abs(diff.onGrid)} on
							</span>
							<span class="shrink-0 text-xs text-gray-500">·</span>
							<span
								class="shrink-0 text-xs {diff.offGrid > 0
									? 'text-green-500'
									: diff.offGrid < 0
										? 'text-red-400'
										: 'text-gray-400'}"
							>
								{diff.offGrid > 0 ? '↑' : diff.offGrid < 0 ? '↓' : '– '}{Math.abs(diff.offGrid)} off
							</span>
						{/if}
					{/snippet}
				</HtmlTimelineItem>
			{/each}
		</Timeline>
	{:else}
		<p class="text-sm text-gray-500 dark:text-gray-400">No related scans found.</p>
	{/if}
</div>
