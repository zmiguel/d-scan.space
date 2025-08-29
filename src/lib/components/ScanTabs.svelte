<script>
	import { Tabs, TabItem } from 'flowbite-svelte';
	import { UsersGroupSolid, InfoCircleSolid, RocketSolid } from 'flowbite-svelte-icons';
	import TabOverview from './TabOverview.svelte';
	import TabLocalScan from './TabLocalScan.svelte';

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
</script>

<div class="min-h-[500px] rounded-sm bg-gray-100 p-0 dark:bg-gray-700">
	<Tabs tabStyle="underline" classes={{ content: 'p-3 bg-gray-100 dark:bg-gray-700 mt-0' }}>
		<!-- Tab 1: Overview -->
		<TabItem
			open
			activeClass="py-3 px-4 text-primary-600 border-b-2 border-primary-600 dark:text-primary-500 dark:border-primary-500 active"
			inactiveClass="cursor-pointer inline-block text-sm font-medium text-center disabled:cursor-not-allowed py-3 px-4 border-b-2 border-transparent hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300 text-gray-500 dark:text-gray-400"
		>
			{#snippet titleSlot()}
				<div class="flex items-center gap-2">
					<InfoCircleSolid size="md" />
					Overview
				</div>
			{/snippet}
			<TabOverview {data} {corps} {pilots} />
		</TabItem>

		<!-- Tab 2: Local Scan -->
		<TabItem
			activeClass="py-3 px-4 text-primary-600 border-b-2 border-primary-600 dark:text-primary-500 dark:border-primary-500 active"
			inactiveClass="cursor-pointer inline-block text-sm font-medium text-center disabled:cursor-not-allowed py-3 px-4 border-b-2 border-transparent hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300 text-gray-500 dark:text-gray-400"
		>
			{#snippet titleSlot()}
				<div class="flex items-center gap-2">
					<UsersGroupSolid size="md" />
					Local
				</div>
			{/snippet}
			<TabLocalScan {data} {corps} {pilots} />
		</TabItem>

		<!-- Tab 3: Space Scan -->
		<TabItem
			activeClass="py-3 px-4 text-primary-600 border-b-2 border-primary-600 dark:text-primary-500 dark:border-primary-500 active"
			inactiveClass="cursor-pointer inline-block text-sm font-medium text-center disabled:cursor-not-allowed py-3 px-4 border-b-2 border-transparent hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300 text-gray-500 dark:text-gray-400"
		>
			{#snippet titleSlot()}
				<div class="flex items-center gap-2">
					<RocketSolid size="md" />
					Space
				</div>
			{/snippet}
		</TabItem>
	</Tabs>
</div>
