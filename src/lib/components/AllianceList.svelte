<script>
	import { Avatar } from 'flowbite-svelte';

	let { data } = $props();
</script>

<h1 class="ms-2 text-xl font-bold">Alliances</h1>
<div class="col-auto mt-2">
	{#each data.local?.alliances ?? [] as alliance (alliance.id)}
		<div class="flex flex-col items-start justify-between sm:flex-row sm:items-center">
			<div class="mt-1 flex items-center space-x-2 rtl:space-x-reverse">
				<Avatar
					cornerStyle="rounded"
					src="https://images.evetech.net/alliances/{alliance.id}/logo?size=64"
				/>
				<div class="font-medium dark:text-white">
					<div>
						{#if alliance.ticker}
							<span class="text-primary-700 dark:text-primary-400">[{alliance.ticker}]</span>
							{alliance.name}
						{:else}
							<span class="italic">No Alliance</span>
						{/if}
					</div>
					<div class="text-pink-600 dark:text-pink-400">
						{alliance.corporation_count} Corporations
					</div>
				</div>
			</div>
			<div class="me-3 text-amber-600 dark:text-amber-400">
				{alliance.character_count}
			</div>
		</div>
	{/each}
</div>
