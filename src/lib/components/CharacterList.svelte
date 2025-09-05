<script>
	import { Avatar } from 'flowbite-svelte';
	import { secStatusColor } from '$lib/utils/secStatus';

	let { pilots } = $props();
</script>

<h1 class="ms-2 text-xl font-bold">Pilots</h1>
<div class="col-auto mt-2">
	{#each pilots as pilot (pilot.id)}
		<div class="flex flex-col items-start justify-between sm:flex-row sm:items-center">
			<div class="mt-1 flex items-center space-x-4 rtl:space-x-reverse">
				<Avatar
					cornerStyle="rounded"
					src="https://images.evetech.net/characters/{pilot.id}/portrait?size=64"
				/>
				<div class="font-medium dark:text-white">
					<div>
						{pilot.name}
						<span style:color={secStatusColor(pilot.sec_status)}>{pilot.sec_status.toFixed(3)}</span
						>
					</div>
					<div>
						{#if pilot.alliance_ticker}
							<span class="text-pink-600 dark:text-pink-400">[{pilot.alliance_ticker}]</span>
						{/if}
						<span class="text-primary-700 dark:text-primary-400"
							>{'<' + pilot.corporation_ticker + '>'}</span
						>
					</div>
				</div>
			</div>
		</div>
	{/each}
</div>
