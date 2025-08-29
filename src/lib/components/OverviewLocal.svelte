<script>
	import { Accordion, AccordionItem, Avatar, Tooltip } from 'flowbite-svelte';
	import { onMount } from 'svelte';

	let { data } = $props();
	let truncatedElements = $state({});

	onMount(() => {
		// Use a timeout to ensure DOM is fully rendered
		setTimeout(checkTruncation, 100);
		// Also check when accordion items are clicked/expanded
		document.addEventListener('click', () => {
			setTimeout(checkTruncation, 100);
		});
	});

	function checkTruncation() {
		const elements = document.querySelectorAll('[data-truncate-check]');
		const newTruncated = {};

		elements.forEach((element) => {
			const isTruncated = element.scrollWidth > element.clientWidth;
			if (isTruncated) {
				newTruncated[element.id] = true;
			}
			// Debug only for the specific element you mentioned
			if (element.id === 'alliance-99008228') {
				console.log(
					`Debug ${element.id}: scrollWidth=${element.scrollWidth}, clientWidth=${element.clientWidth}, truncated=${isTruncated}, will be in object=${!!newTruncated[element.id]}`
				);
			}
		});

		truncatedElements = newTruncated;
	}
</script>

<Accordion flush multiple>
	{#each data.local?.alliances ?? [] as alliance (alliance.id)}
		<AccordionItem classes={{ button: 'py-0', content: 'py-0 ms-4' }}>
			{#snippet header()}
				<div class="flex w-full items-center justify-between sm:flex-row sm:items-center">
					<div class="mt-1 flex min-w-0 flex-1 items-center space-x-2 rtl:space-x-reverse">
						<Avatar
							cornerStyle="rounded"
							src="https://images.evetech.net/alliances/{alliance.id}/logo?size=32"
							size="sm"
						/>
						<div
							class="truncate font-medium dark:text-white"
							id="alliance-{alliance.id}"
							data-truncate-check
						>
							{#if alliance.ticker}
								<span class="text-pink-600 dark:text-pink-400">[{alliance.ticker}]</span>
								{alliance.name}
							{:else}
								<span class="italic">No Alliance</span>
							{/if}
						</div>
						{#if truncatedElements[`alliance-${alliance.id}`]}
							<Tooltip triggeredBy="#alliance-{alliance.id}" placement="top">
								{#if alliance.ticker}
									[{alliance.ticker}] {alliance.name}
								{:else}
									No Alliance
								{/if}
							</Tooltip>
						{/if}
					</div>
					<div class="flex-shrink-0">
						<span class="me-1 text-primary-700 dark:text-primary-400">
							{'<' + alliance.corporation_count + '>'}
						</span>
						<span class="me-2 text-amber-600 dark:text-amber-400">
							{alliance.character_count}
						</span>
					</div>
				</div>
			{/snippet}
			{#each alliance.corporations as corp (corp.id)}
				<AccordionItem classes={{ button: 'py-0', content: 'py-0 ms-4' }}>
					{#snippet header()}
						<div class="flex w-full items-center justify-between sm:flex-row sm:items-center">
							<div class="mt-1 flex min-w-0 flex-1 items-center space-x-4 rtl:space-x-reverse">
								<Avatar
									cornerStyle="rounded"
									src="https://images.evetech.net/corporations/{corp.id}/logo?size=32"
									size="sm"
								/>
								<div
									class="truncate font-medium dark:text-white"
									id="corp-{corp.id}"
									data-truncate-check
								>
									<div>
										<span class="text-primary-700 dark:text-primary-400"
											>{'<' + corp.ticker + '>'}</span
										>
										{corp.name}
									</div>
								</div>
								{#if truncatedElements[`corp-${corp.id}`]}
									<Tooltip triggeredBy="#corp-{corp.id}" placement="top">
										{'<' + corp.ticker + '>'}
										{corp.name}
									</Tooltip>
								{/if}
							</div>
							<div class="me-2 flex-shrink-0 text-amber-600 dark:text-amber-400">
								{corp.character_count}
							</div>
						</div>
					{/snippet}

					{#each corp.characters as pilot (pilot.id)}
						<div class="flex w-full items-center justify-between sm:flex-row sm:items-center">
							<div class="mt-1 flex items-center space-x-4 rtl:space-x-reverse">
								<Avatar
									cornerStyle="rounded"
									src="https://images.evetech.net/characters/{pilot.id}/portrait?size=32"
									size="sm"
								/>
								<div class="font-medium dark:text-white">
									<div>
										{pilot.name}
										<span class="text-primary-700 dark:text-primary-400"
											>{pilot.sec_status.toFixed(3)}</span
										>
									</div>
								</div>
							</div>
						</div>
					{/each}
				</AccordionItem>
			{/each}
		</AccordionItem>
	{/each}
</Accordion>
