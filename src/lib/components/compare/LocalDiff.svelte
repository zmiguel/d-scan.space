<script>
	import Delta from './Delta.svelte';
	import TruncatedText from '$lib/components/TruncatedText.svelte';

	/** @type {{ diff: ReturnType<typeof import('$lib/utils/scanDiff.js').diffLocal> }} */
	let { diff } = $props();

	let showUnchanged = $state(false);
	let expandAll = $state(false);

	const visibleAlliances = $derived(
		showUnchanged ? diff.alliances : diff.alliances.filter((alliance) => alliance.delta !== 0)
	);
	const visibleCorps = (alliance) =>
		showUnchanged ? alliance.corps : alliance.corps.filter((corp) => corp.delta !== 0);

	const rowGrid = 'grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_3.5rem] items-center gap-2';
	const heading =
		'mb-2 text-sm font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-300';
	const tickers = (corpTicker, allianceTicker) =>
		`[${corpTicker ?? '?'}]${allianceTicker ? ` <${allianceTicker}>` : ''}`;
</script>

{#snippet pilotList(title, pilots, tone)}
	<section class="min-w-0">
		<h2 class={heading}>
			{title}
			<span class={['ms-1', tone]}>{pilots.length}</span>
		</h2>
		{#if pilots.length === 0}
			<p class="text-sm text-gray-500 dark:text-gray-400">Nobody.</p>
		{:else}
			<ul class="max-h-96 overflow-y-auto rounded bg-gray-50 p-2 text-sm dark:bg-gray-700">
				{#each pilots as pilot (pilot.id)}
					<li class="flex min-w-0 items-center justify-between gap-2 py-0.5">
						<TruncatedText class="min-w-0 text-gray-900 dark:text-white">{pilot.name}</TruncatedText
						>
						<span class="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
							{tickers(pilot.corpTicker, pilot.allianceTicker)}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/snippet}

<div class="flex flex-col gap-5">
	<div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
		<div class="rounded bg-gray-50 p-3 dark:bg-gray-700">
			<div class="text-xs text-gray-500 uppercase dark:text-gray-400">Pilots</div>
			<div class="text-lg text-gray-900 tabular-nums dark:text-white">
				{diff.totals.before} → {diff.totals.after}
				<Delta value={diff.totals.after - diff.totals.before} />
			</div>
		</div>
		{#each [{ label: 'Arrived', value: diff.totals.arrived, tone: 'text-green-600 dark:text-green-400' }, { label: 'Left', value: diff.totals.left, tone: 'text-red-600 dark:text-red-400' }, { label: 'Stayed', value: diff.totals.stayed, tone: 'text-gray-900 dark:text-white' }, { label: 'Changed corp', value: diff.totals.moved, tone: 'text-yellow-600 dark:text-yellow-400' }] as stat (stat.label)}
			<div class="rounded bg-gray-50 p-3 dark:bg-gray-700">
				<div class="text-xs text-gray-500 uppercase dark:text-gray-400">{stat.label}</div>
				<div class={['text-lg tabular-nums', stat.tone]}>{stat.value}</div>
			</div>
		{/each}
	</div>

	<div class="grid grid-cols-1 gap-5 md:grid-cols-2">
		{@render pilotList('Arrived', diff.arrived, 'text-green-600 dark:text-green-400')}
		{@render pilotList('Left', diff.left, 'text-red-600 dark:text-red-400')}
	</div>

	{#if diff.moved.length > 0}
		<section>
			<h2 class={heading}>Changed corporation or alliance</h2>
			<ul class="rounded bg-gray-50 p-2 text-sm dark:bg-gray-700">
				{#each diff.moved as pilot (pilot.id)}
					<li class="flex flex-wrap items-center gap-2 py-0.5">
						<span class="font-medium text-gray-900 dark:text-white">{pilot.name}</span>
						<span class="font-mono text-xs text-gray-500 dark:text-gray-400">
							{tickers(pilot.from.corpTicker, pilot.from.allianceTicker)} → {tickers(
								pilot.to.corpTicker,
								pilot.to.allianceTicker
							)}
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section>
		<div class="mb-2 flex flex-wrap items-center gap-4">
			<h2 class={[heading, 'mb-0']}>Alliances &amp; corporations</h2>
			<label class="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
				<input type="checkbox" bind:checked={showUnchanged} class="rounded" />
				Show unchanged
			</label>
			<label class="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
				<input type="checkbox" bind:checked={expandAll} class="rounded" />
				Expand all
			</label>
		</div>
		{#if visibleAlliances.length === 0}
			<p class="p-4 text-center text-sm text-gray-600 dark:text-gray-300">
				No alliance or corporation changed in size.
			</p>
		{:else}
			<div
				class="{rowGrid} border-b border-gray-300 px-2 pb-1 text-xs text-gray-500 uppercase dark:border-gray-600 dark:text-gray-400"
			>
				<span>Alliance / corporation</span><span>Before</span><span>After</span><span
					class="text-right">Δ</span
				>
			</div>
			{#each visibleAlliances as alliance (alliance.id ?? 'none')}
				<details class="group border-b border-gray-200 dark:border-gray-700" open={expandAll}>
					<summary
						class="{rowGrid} cursor-pointer list-none px-2 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
					>
						<span class="flex min-w-0 items-center gap-2 font-medium text-gray-900 dark:text-white">
							<span
								class="inline-block w-3 text-gray-400 transition-transform group-open:rotate-90"
								aria-hidden="true">›</span
							>
							{#if alliance.ticker}
								<span class="font-mono text-xs text-gray-500 dark:text-gray-400"
									>&lt;{alliance.ticker}&gt;</span
								>
							{/if}
							<TruncatedText>{alliance.name}</TruncatedText>
						</span>
						<span class="tabular-nums">{alliance.before}</span>
						<span class="tabular-nums">{alliance.after}</span>
						<span class="text-right"><Delta value={alliance.delta} /></span>
					</summary>
					<ul class="pb-1">
						{#each visibleCorps(alliance) as corp (corp.id)}
							<li class="{rowGrid} py-0.5 ps-7 pe-2 text-sm text-gray-800 dark:text-gray-200">
								<span class="flex min-w-0 items-center gap-2">
									<span class="font-mono text-xs text-gray-500 dark:text-gray-400"
										>[{corp.ticker}]</span
									>
									<TruncatedText>{corp.name}</TruncatedText>
								</span>
								<span class="tabular-nums">{corp.before}</span>
								<span class="tabular-nums">{corp.after}</span>
								<span class="text-right"><Delta value={corp.delta} /></span>
							</li>
						{/each}
					</ul>
				</details>
			{/each}
		{/if}
	</section>
</div>
