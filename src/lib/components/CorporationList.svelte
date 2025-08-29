<script>
	import { Avatar } from 'flowbite-svelte';

	let { corps } = $props();
</script>

<h1 class="ms-2 text-xl font-bold">Corporations</h1>
<div class="col-auto mt-2">
	{#each corps as corp (corp.id)}
		<div class="flex flex-col items-start justify-between sm:flex-row sm:items-center">
			<div class="mt-1 flex items-center space-x-4 rtl:space-x-reverse">
				<Avatar
					cornerStyle="rounded"
					src="https://images.evetech.net/corporations/{corp.id}/logo?size=64"
				/>
				<div class="font-medium dark:text-white">
					<div>
						<span class="text-primary-700 dark:text-primary-400">{'<' + corp.ticker + '>'}</span>
						{corp.name}
					</div>
					{#if corp.alliance_ticker}
						<div class="text-pink-600 dark:text-pink-400">
							[{corp.alliance_ticker}]
						</div>
					{/if}
				</div>
			</div>
			<div class="me-2 text-amber-600 dark:text-amber-400">
				{corp.character_count}
			</div>
		</div>
	{/each}
</div>
