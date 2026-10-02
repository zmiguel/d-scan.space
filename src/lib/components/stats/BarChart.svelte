<script>
	/**
	 * Small stacked bar chart (no chart library): one column per entry, series stacked
	 * bottom-up. Hovering a column shows its values; each column has an accessible label.
	 *
	 * @type {{
	 *   title: string,
	 *   data: Array<Record<string, any>>,
	 *   series: Array<{ key: string, label: string, color: string }>,
	 *   label: (entry: Record<string, any>) => string,
	 *   ticks?: number[],
	 *   empty?: string
	 * }}
	 */
	let { title, data, series, label, ticks = [], empty = 'No data yet.' } = $props();

	const totals = $derived(data.map((entry) => series.reduce((sum, s) => sum + entry[s.key], 0)));
	const max = $derived(Math.max(0, ...totals));
	const describe = (entry, total) =>
		`${label(entry)}: ` +
		(series.length > 1 ? series.map((s) => `${entry[s.key]} ${s.label}`).join(', ') : `${total}`);
</script>

<section class="rounded-lg bg-white p-4 dark:bg-gray-700" aria-label={title}>
	<div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="text-base font-semibold text-gray-800 dark:text-gray-200">{title}</h2>
		{#if series.length > 1}
			<div class="flex gap-3 text-xs text-gray-600 dark:text-gray-400">
				{#each series as s (s.key)}
					<span class="flex items-center gap-1"
						><span class={['h-2.5 w-2.5 rounded-sm', s.color]} aria-hidden="true"
						></span>{s.label}</span
					>
				{/each}
			</div>
		{/if}
	</div>
	{#if max === 0}
		<p class="flex h-32 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
			{empty}
		</p>
	{:else}
		<div class="flex h-32 items-end gap-px">
			{#each data as entry, i (i)}
				<div
					class="group relative flex h-full min-w-0 flex-1 flex-col-reverse rounded-t-sm hover:bg-gray-100 dark:hover:bg-gray-600"
					role="img"
					aria-label={describe(entry, totals[i])}
				>
					{#each series as s (s.key)}
						<div class={s.color} style:height="{(entry[s.key] / max) * 100}%"></div>
					{/each}
					<span
						class={[
							'pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded bg-gray-900 px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block',
							i < data.length / 2 ? 'left-0' : 'right-0'
						]}
						aria-hidden="true">{describe(entry, totals[i])}</span
					>
				</div>
			{/each}
		</div>
		<div class="relative mt-1 h-4 text-xs text-gray-500 dark:text-gray-400" aria-hidden="true">
			{#each ticks as tick (tick)}
				<span
					class="absolute -translate-x-1/2 whitespace-nowrap"
					style:left="{((tick + 0.5) / data.length) * 100}%">{label(data[tick])}</span
				>
			{/each}
		</div>
	{/if}
</section>
