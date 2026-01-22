<script>
	import { Tabs, TabItem, Badge } from 'flowbite-svelte';
	import { UsersGroupSolid, InfoCircleSolid, RocketSolid } from 'flowbite-svelte-icons';
	import TabOverview from './TabOverview.svelte';
	import TabLocalScan from './TabLocalScan.svelte';
	import TabDirectionalScan from './TabDirectionalScan.svelte';

	let { data } = $props();

	// Derive corps and pilots from data to avoid reactive loops
	const corps = $derived(
		!data.local || !Array.isArray(data.local.alliances)
			? []
			: (() => {
					let allCorps = [];
					data.local.alliances.forEach((alliance) => {
						let temp = alliance.corporations;
						temp.forEach((corp) => (corp.alliance_ticker = alliance.ticker));
						allCorps = [...allCorps, ...temp];
					});
					// sort by number
					return allCorps.sort((a, b) => b.character_count - a.character_count);
				})()
	);

	const pilots = $derived(
		!corps || corps.length === 0
			? []
			: (() => {
					let allPilots = [];
					corps.forEach((corp) => {
						let temp = corp.characters;
						temp.forEach((character) => {
							character.corporation_ticker = corp.ticker;
							character.alliance_ticker = corp.alliance_ticker;
						});
						allPilots = [...allPilots, ...temp];
					});
					// sort alpha
					return allPilots.sort((a, b) => a.name.localeCompare(b.name));
				})()
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

<div class="scan-tabs min-h-[500px] rounded-sm bg-gray-100 p-0 dark:bg-gray-700">
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
</style>
