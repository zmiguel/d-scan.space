<script>
	import { Accordion, AccordionItem, Avatar, Tooltip } from 'flowbite-svelte';
	import { onMount } from 'svelte';
	import { secStatusColor } from '$lib/utils/secStatus';
	import { asset } from '$app/paths';

	let { data } = $props();
	let truncatedElements = $state({});

	onMount(() => {
		setTimeout(checkTruncation, 100);
		document.addEventListener('click', () => {
			setTimeout(checkTruncation, 100);
		});
	});

	function checkTruncation() {
		const elements = document.querySelectorAll('[data-truncate-check]');
		const newTruncated = {};

		elements.forEach((element) => {
			// Check if element is visible (skip hidden accordion items)
			const rect = element.getBoundingClientRect();
			const isVisible =
				rect.width > 0 &&
				rect.height > 0 &&
				window.getComputedStyle(element).visibility !== 'hidden' &&
				window.getComputedStyle(element).display !== 'none';

			if (!isVisible) return;

			// Use scrollWidth vs clientWidth to detect truncation reliably
			const isTruncated = Math.ceil(element.scrollWidth) > Math.floor(element.clientWidth + 1);

			if (isTruncated) {
				newTruncated[element.id] = true;
			}
		});

		truncatedElements = newTruncated;
	}

	function stopAccordionToggle(event) {
		event.stopPropagation();
	}
</script>

<Accordion flush multiple>
	{#each data.local?.alliances ?? [] as alliance (alliance.id)}
		<AccordionItem classes={{ button: 'py-0', content: 'py-0 ms-4' }}>
			{#snippet header()}
				<div class="grid w-full grid-cols-[1fr_auto_auto] items-center gap-2">
					<div class="mt-1 flex min-w-0 items-center rtl:space-x-reverse">
						{#if alliance.ticker}
							<Avatar
								cornerStyle="rounded"
								src="https://images.evetech.net/alliances/{alliance.id}/logo?size=32"
								size="sm"
								class="mr-2"
							/>
						{/if}
						<div class="min-w-0 font-medium dark:text-white flex items-center gap-1">
							{#if alliance.ticker}
								<span class="text-pink-600 dark:text-pink-400">[{alliance.ticker}]</span>
								<span
									class="truncate min-w-0 max-w-full"
									id="alliance-{alliance.id}"
									data-truncate-check
								>
									{alliance.name}
								</span>
								<a
									id="alliance-zkill-{alliance.id}"
									href={`https://zkillboard.com/alliance/${alliance.id}/`}
									target="_blank"
									rel="noopener"
									class="ms-1 inline-flex flex-shrink-0 align-middle"
									title="zKillBoard"
									onclick={stopAccordionToggle}
								>
									<img
										src={asset('/wreck.png')}
										alt="zKillBoard"
										class="h-4 w-4 opacity-80 transition-opacity hover:opacity-100"
									/>
								</a>
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
					<div class="text-primary-700 dark:text-primary-400">
						{'<' + alliance.corporation_count + '>'}
					</div>
					<div class="me-2 text-amber-600 dark:text-amber-400">
						{alliance.character_count}
					</div>
				</div>
			{/snippet}
			<Accordion flush multiple>
				{#each alliance.corporations as corp (corp.id)}
					<AccordionItem classes={{ button: 'py-0', content: 'py-0 ms-4' }}>
						{#snippet header()}
							<div class="grid w-full grid-cols-[1fr_auto_auto] items-center gap-2">
								<div class="mt-1 flex min-w-0 items-center rtl:space-x-reverse">
									<Avatar
										cornerStyle="rounded"
										src="https://images.evetech.net/corporations/{corp.id}/logo?size=32"
										size="sm"
										class="mr-2"
									/>
									<div class="min-w-0 font-medium dark:text-white flex items-center gap-1">
										<span class="text-primary-700 dark:text-primary-400">{'<' + corp.ticker + '>'}</span>
										<span
											class="truncate min-w-0 max-w-full"
											id="corp-{corp.id}"
											data-truncate-check
										>
											{corp.name}
										</span>
										<a
											id="corp-zkill-{corp.id}"
											href={`https://zkillboard.com/corporation/${corp.id}/`}
											target="_blank"
											rel="noopener"
											class="ms-1 inline-flex flex-shrink-0 align-middle"
											title="zKillBoard"
											onclick={stopAccordionToggle}
										>
											<img
												src={asset('/wreck.png')}
												alt="zKillBoard"
												class="h-4 w-4 opacity-80 transition-opacity hover:opacity-100"
											/>
										</a>
									</div>
									{#if truncatedElements[`corp-${corp.id}`]}
										<Tooltip triggeredBy="#corp-{corp.id}" placement="top">
											{'<' + corp.ticker + '>'}
											{corp.name}
										</Tooltip>
									{/if}
								</div>
								<div class="text-amber-600 dark:text-amber-400">
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
										<div class="font-medium dark:text-white flex items-center gap-1">
											<div>
												{pilot.name}
												<span style:color={secStatusColor(pilot.sec_status)}>
													{pilot.sec_status.toFixed(3)}
												</span>
											</div>
											<a
												href={`https://zkillboard.com/character/${pilot.id}/`}
												target="_blank"
												rel="noopener"
												class="inline-flex flex-shrink-0 align-middle"
												title="zKillBoard"
											>
												<img
													src={asset('/wreck.png')}
													alt="zKillBoard"
													class="h-4 w-4 opacity-80 transition-opacity hover:opacity-100"
												/>
											</a>
										</div>
									</div>
								</div>
							{/each}
					</AccordionItem>
				{/each}
			</Accordion>
		</AccordionItem>
	{/each}
</Accordion>
