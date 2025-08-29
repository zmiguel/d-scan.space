<script>
	import { Accordion, AccordionItem, Avatar, Tooltip } from 'flowbite-svelte';
	import { onMount } from 'svelte';

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

			// Measure text width using canvas
			const computedStyle = window.getComputedStyle(element);
			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d');
			context.font = `${computedStyle.fontWeight} ${computedStyle.fontSize} ${computedStyle.fontFamily}`;

			const textContent = element.textContent || element.innerText || '';
			const textWidth = context.measureText(textContent).width;

			// Get available space in the flex container
			const flexParent = element.closest('.flex');
			const parentWidth = flexParent ? flexParent.clientWidth : element.parentElement.clientWidth;
			const avatarAndSpacing = 40; // Avatar (32px) + spacing
			const availableTextSpace = parentWidth - avatarAndSpacing;

			const isTruncated = Math.ceil(textWidth) >= Math.floor(availableTextSpace);

			if (isTruncated) {
				newTruncated[element.id] = true;
			}
		});

		truncatedElements = newTruncated;
	}
</script>

<Accordion flush multiple>
	{#each data.local?.alliances ?? [] as alliance (alliance.id)}
		<AccordionItem classes={{ button: 'py-0', content: 'py-0 ms-4' }}>
			{#snippet header()}
				<div class="grid grid-cols-[1fr_auto_auto] items-center gap-2 w-full">
					<div class="mt-1 flex min-w-0 items-center rtl:space-x-reverse">
						<Avatar
							cornerStyle="rounded"
							src="https://images.evetech.net/alliances/{alliance.id}/logo?size=32"
							size="sm"
							class="mr-2"
						/>
						<div
							class="min-w-0 truncate font-medium dark:text-white"
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
					<div class="text-primary-700 dark:text-primary-400">
						{'<' + alliance.corporation_count + '>'}
					</div>
					<div class="text-amber-600 dark:text-amber-400 me-2">
						{alliance.character_count}
					</div>
				</div>
			{/snippet}
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
								<div
									class="min-w-0 truncate font-medium dark:text-white"
									id="corp-{corp.id}"
									data-truncate-check
								>
									<div class="truncate">
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
