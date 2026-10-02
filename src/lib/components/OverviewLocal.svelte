<script>
	import { Avatar } from 'flowbite-svelte';
	import { secStatusColor } from '$lib/utils/secStatus';
	import { asset } from '$app/paths';
	import LocalDisclosure from '$lib/components/LocalDisclosure.svelte';
	import TruncatedText from '$lib/components/TruncatedText.svelte';

	let { data } = $props();
</script>

{#snippet zkillLink(kind, id, spacing = 'ms-1')}
	<a
		href={`https://zkillboard.com/${kind}/${id}/`}
		target="_blank"
		rel="noopener"
		class={[spacing, 'inline-flex flex-shrink-0 align-middle']}
		title="zKillBoard"
	>
		<img
			src={asset('/wreck.png')}
			alt="zKillBoard"
			class="h-4 w-4 opacity-80 transition-opacity hover:opacity-100"
		/>
	</a>
{/snippet}

{#if !data.local}
	<div class="text-md p-6 text-center text-gray-600 dark:text-gray-300">
		No local data available.
	</div>
{:else}
	<div class="w-full">
		{#each data.local?.alliances ?? [] as alliance (alliance.id)}
			<LocalDisclosure>
				{#snippet leading()}
					{#if alliance.ticker}
						<Avatar
							cornerStyle="rounded"
							src="https://images.evetech.net/alliances/{alliance.id}/logo?size=32"
							size="sm"
							class="mr-2"
						/>
					{/if}
				{/snippet}
				{#snippet label()}
					{#if alliance.ticker}
						<span class="text-pink-600 dark:text-pink-400">[{alliance.ticker}]</span>
						<TruncatedText class="relative z-10 max-w-full min-w-0">
							{alliance.name}
							{#snippet tooltip()}
								[{alliance.ticker}] {alliance.name}
							{/snippet}
						</TruncatedText>
					{:else}
						<span class="italic">No Alliance</span>
					{/if}
				{/snippet}
				{#snippet link()}
					{#if alliance.ticker}
						{@render zkillLink('alliance', alliance.id)}
					{/if}
				{/snippet}
				{#snippet trailing()}
					<div class="text-primary-700 dark:text-primary-400">
						{'<' + alliance.corporation_count + '>'}
					</div>
					<div class="me-2 text-amber-600 dark:text-amber-400">
						{alliance.character_count}
					</div>
				{/snippet}

				{#each alliance.corporations as corp (corp.id)}
					<LocalDisclosure>
						{#snippet leading()}
							<Avatar
								cornerStyle="rounded"
								src="https://images.evetech.net/corporations/{corp.id}/logo?size=32"
								size="sm"
								class="mr-2"
							/>
						{/snippet}
						{#snippet label()}
							<span class="text-primary-700 dark:text-primary-400">{'<' + corp.ticker + '>'}</span>
							<TruncatedText class="relative z-10 max-w-full min-w-0">
								{corp.name}
								{#snippet tooltip()}
									{'<' + corp.ticker + '>'}
									{corp.name}
								{/snippet}
							</TruncatedText>
						{/snippet}
						{#snippet link()}
							{@render zkillLink('corporation', corp.id)}
						{/snippet}
						{#snippet trailing()}
							<div class="text-amber-600 dark:text-amber-400">
								{corp.character_count}
							</div>
						{/snippet}

						{#each corp.characters as pilot (pilot.id)}
							<div
								class="flex w-full items-center justify-between text-sm sm:flex-row sm:items-center sm:text-base"
							>
								<div class="mt-1 flex items-center space-x-4 rtl:space-x-reverse">
									<Avatar
										cornerStyle="rounded"
										src="https://images.evetech.net/characters/{pilot.id}/portrait?size=32"
										size="sm"
									/>
									<div class="flex items-center gap-1 font-medium dark:text-white">
										<div>
											{pilot.name}
											<span style:color={secStatusColor(pilot.sec_status)}>
												{pilot.sec_status.toFixed(3)}
											</span>
										</div>
										{@render zkillLink('character', pilot.id, '')}
									</div>
								</div>
							</div>
						{/each}
					</LocalDisclosure>
				{/each}
			</LocalDisclosure>
		{/each}
	</div>
{/if}
