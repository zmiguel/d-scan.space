<script>
	import { Tabs, TabItem, Badge } from 'flowbite-svelte';
	import { UsersGroupSolid, InfoCircleSolid, RocketSolid } from 'flowbite-svelte-icons';
	import PairedScanNotice from './PairedScanNotice.svelte';
	import TabOverview from './TabOverview.svelte';
	import TabLocalScan from './TabLocalScan.svelte';
	import TabDirectionalScan from './TabDirectionalScan.svelte';

	let { data } = $props();

	// Flattened lists for the Local tab. New objects carry the parent tickers the
	// highlighting needs (`alliance_ticker`, `corporation_ticker`); the loaded scan data is
	// not modified.
	const corps = $derived(
		Array.isArray(data.local?.alliances)
			? data.local.alliances
					.flatMap((alliance) =>
						(alliance.corporations ?? []).map((corp) => ({
							...corp,
							alliance_ticker: alliance.ticker
						}))
					)
					// most pilots first
					.sort((a, b) => b.character_count - a.character_count)
			: []
	);

	const pilots = $derived(
		corps
			.flatMap((corp) =>
				(corp.characters ?? []).map((character) => ({
					...character,
					corporation_ticker: corp.ticker,
					alliance_ticker: corp.alliance_ticker
				}))
			)
			// alphabetical
			.sort((a, b) => a.name.localeCompare(b.name))
	);

	const localCount = $derived(formatCountValue(data.local?.total_pilots));
	const spaceCount = $derived(
		formatCountValue(
			data.directional?.on_grid?.total_objects + data.directional?.off_grid?.total_objects
		)
	);
	const hasLocal = $derived(!!data.local);
	const hasDirectional = $derived(!!data.directional);
	const defaultTab = $derived(
		hasLocal && hasDirectional
			? 'overview'
			: hasLocal
				? 'local'
				: hasDirectional
					? 'space'
					: 'overview'
	);

	function formatCountValue(value) {
		return typeof value === 'number' && !Number.isNaN(value) ? value : '?';
	}
</script>

<div
	class={[
		'scan-tabs relative min-h-[500px] rounded-sm bg-gray-100 p-0 dark:bg-gray-700',
		data.pairedScan && 'has-aside'
	]}
>
	{#if data.pairedScan}
		<!-- right end of the tab row; the tab list keeps room for it (`.has-aside`) -->
		<div
			class="absolute top-0 right-1 z-10 flex h-[2.375rem] items-center sm:right-2 sm:h-[2.875rem]"
		>
			<PairedScanNotice
				group={data.params.group}
				createdAt={data.created_at}
				paired={data.pairedScan}
			/>
		</div>
	{/if}
	<Tabs tabStyle="underline" classes={{ content: 'p-3 bg-gray-100 dark:bg-gray-700 mt-0' }}>
		<!-- Tab 1: Overview -->
		<TabItem
			open={defaultTab === 'overview'}
			activeClass="py-2 px-1.5 text-xs leading-tight text-primary-600 border-b-2 border-primary-600 dark:text-primary-500 dark:border-primary-500 active sm:py-3 sm:px-4 sm:text-sm"
			inactiveClass="cursor-pointer inline-block text-xs font-medium leading-tight text-center disabled:cursor-not-allowed py-2 px-1.5 border-b-2 border-transparent hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300 text-gray-500 dark:text-gray-400 sm:py-3 sm:px-4 sm:text-sm"
		>
			{#snippet titleSlot()}
				<div class="flex items-center gap-1 sm:gap-2">
					<InfoCircleSolid size="md" />
					Overview
				</div>
			{/snippet}
			<TabOverview {data} {corps} {pilots} />
		</TabItem>

		<!-- Tab 2: Local Scan -->
		<TabItem
			open={defaultTab === 'local'}
			activeClass="py-2 px-1.5 text-xs leading-tight text-primary-600 border-b-2 border-primary-600 dark:text-primary-500 dark:border-primary-500 active sm:py-3 sm:px-4 sm:text-sm"
			inactiveClass="cursor-pointer inline-block text-xs font-medium leading-tight text-center disabled:cursor-not-allowed py-2 px-1.5 border-b-2 border-transparent hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300 text-gray-500 dark:text-gray-400 sm:py-3 sm:px-4 sm:text-sm"
		>
			{#snippet titleSlot()}
				<div class="flex items-center gap-1 sm:gap-2">
					<UsersGroupSolid size="md" />
					Local
					<Badge
						color="primary"
						size="xs"
						class="px-1.5 text-[11px] font-semibold sm:px-2 sm:text-xs"
					>
						{localCount}
					</Badge>
				</div>
			{/snippet}
			<TabLocalScan {data} {corps} {pilots} />
		</TabItem>

		<!-- Tab 3: Space Scan -->
		<TabItem
			open={defaultTab === 'space'}
			activeClass="py-2 px-1.5 text-xs leading-tight text-primary-600 border-b-2 border-primary-600 dark:text-primary-500 dark:border-primary-500 active sm:py-3 sm:px-4 sm:text-sm"
			inactiveClass="cursor-pointer inline-block text-xs font-medium leading-tight text-center disabled:cursor-not-allowed py-2 px-1.5 border-b-2 border-transparent hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300 text-gray-500 dark:text-gray-400 sm:py-3 sm:px-4 sm:text-sm"
		>
			{#snippet titleSlot()}
				<div class="flex items-center gap-1 sm:gap-2">
					<RocketSolid size="md" />
					Space
					<Badge
						color="primary"
						size="xs"
						class="px-1.5 text-[11px] font-semibold sm:px-2 sm:text-xs"
					>
						{spaceCount}
					</Badge>
				</div>
			{/snippet}
			<TabDirectionalScan {data} />
		</TabItem>
	</Tabs>
</div>

<style>
	.scan-tabs :global([role='tablist']) {
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.scan-tabs :global([role='tablist'] > *) {
		margin-right: 0;
	}

	.scan-tabs.has-aside :global([role='tablist']) {
		padding-right: 2.5rem;
	}
</style>
