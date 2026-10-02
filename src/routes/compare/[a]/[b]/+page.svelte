<script>
	import { resolve } from '$app/paths';
	import MetaTags from '$lib/components/MetaTags.svelte';
	import ComparePicker from '$lib/components/compare/ComparePicker.svelte';
	import DirectionalDiff from '$lib/components/compare/DirectionalDiff.svelte';
	import LocalDiff from '$lib/components/compare/LocalDiff.svelte';
	import { comparePath } from '$lib/utils/scanRef.js';
	import { formatDuration, formatUtcTimestamp } from '$lib/utils/time.js';
	import { ArrowsRepeatOutline } from 'flowbite-svelte-icons';

	let { data } = $props();

	const typeLabel = $derived(data.scanType === 'local' ? 'local scans' : 'd-scans');
	const elapsed = $derived(
		new Date(data.after.created_at).getTime() - new Date(data.before.created_at).getTime()
	);
	const systemName = (scan) => scan.system?.name ?? 'Unknown system';
</script>

<MetaTags
	title="Compare {typeLabel}"
	description="Difference between two {typeLabel}."
	showImage={false}
	noIndex
/>

{#snippet scanCard(label, scan)}
	<a
		href={resolve(`/scan/${scan.group_id}/${scan.id}`)}
		class="block min-w-0 flex-1 rounded bg-gray-50 p-3 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600"
	>
		<div class="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">{label}</div>
		<div class="font-medium text-gray-900 dark:text-white">{systemName(scan)}</div>
		<div class="text-sm text-gray-600 tabular-nums dark:text-gray-300">
			{formatUtcTimestamp(scan.created_at)}
		</div>
		<div class="font-mono text-xs text-primary-600 dark:text-primary-400">
			{scan.group_id}/{scan.id}
		</div>
	</a>
{/snippet}

<div class="flex flex-col gap-4 rounded-lg bg-white p-3 dark:bg-gray-800">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Compare {typeLabel}</h1>
		<span class="text-sm text-gray-600 dark:text-gray-300">
			{#if elapsed >= 0}
				"After" is {formatDuration(elapsed)} later.
			{:else}
				"After" is {formatDuration(-elapsed)} older than "before".
			{/if}
		</span>
	</div>

	<div class="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
		{@render scanCard('Before', data.before)}
		<a
			href={resolve(comparePath(data.after.id, data.before.id))}
			data-sveltekit-noscroll
			title="Swap before and after"
			class="inline-flex shrink-0 items-center justify-center gap-1 self-center rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
		>
			<ArrowsRepeatOutline class="h-4 w-4" />
			Swap
		</a>
		{@render scanCard('After', data.after)}
	</div>

	{#if data.systemsDiffer}
		<p
			role="note"
			class="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200"
		>
			These scans are from different systems ({systemName(data.before)} and {systemName(
				data.after
			)}).
		</p>
	{/if}

	<details class="rounded bg-gray-50 p-3 dark:bg-gray-700">
		<summary class="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
			Compare other scans
		</summary>
		<div class="mt-3">
			{#key `${data.before.id}/${data.after.id}`}
				<ComparePicker
					a={data.before.id}
					b={data.after.id}
					labelA="Before"
					labelB="After"
					choices={data.choices}
				/>
			{/key}
		</div>
	</details>

	{#if data.scanType === 'local'}
		<LocalDiff diff={data.diff} />
	{:else}
		<DirectionalDiff diff={data.diff} />
	{/if}
</div>
