<script>
	import { summarizeObjects, summarizeRoles, summarizeShips } from '$lib/utils/shipClasses.js';

	/**
	 * Scan composition: ships by hull class, ships by fleet role (same scale) and non-ship
	 * objects, each as a stacked bar (darker part = on grid). A slice's name and counts show
	 * in a tooltip on hover/focus. Hovering / clicking a slice highlights / selects its rows
	 * through the view's GroupHighlight. Each bar is one tab stop; arrow keys move between
	 * its slices.
	 *
	 * @type {{
	 *   groupStats: Array<{ id: number, name: string, categoryId: number | string, on: number, off: number, total: number }>,
	 *   onGrid: any,
	 *   offGrid: any,
	 *   highlight: import('$lib/utils/groupHighlight.svelte.js').GroupHighlight
	 * }}
	 */
	let { groupStats, onGrid, offGrid, highlight } = $props();

	const ships = $derived(summarizeShips(groupStats));
	const roles = $derived(summarizeRoles(onGrid, offGrid));
	const objects = $derived(summarizeObjects(groupStats));

	const describe = (bucket) =>
		`${bucket.label}: ${bucket.total}` + (bucket.on > 0 ? ` (${bucket.on} on grid)` : '');

	/** Arrow keys / Home / End move focus between the slices of one bar. */
	function moveFocus(event) {
		const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
		if (step === undefined && event.key !== 'Home' && event.key !== 'End') return;
		event.preventDefault();
		const slices = [...event.currentTarget.parentElement.children];
		const index = slices.indexOf(event.currentTarget);
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? slices.length - 1
					: (index + step + slices.length) % slices.length;
		slices[next].focus();
	}

	/** Slices with the share of the bar before them, to keep tooltips inside the bar. */
	const withOffsets = (buckets, total) => {
		let before = 0;
		return buckets.map((bucket) => {
			const start = before / total;
			before += bucket.total;
			return { bucket, start };
		});
	};
</script>

{#snippet bar(label, title, buckets, total, heightClass)}
	<div class="flex items-center gap-2">
		<span
			class="w-24 shrink-0 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-300"
		>
			{label}
		</span>
		<div role="group" aria-label={title} class={['flex min-w-0 flex-1 gap-px', heightClass]}>
			{#each withOffsets(buckets, total) as { bucket, start }, index (bucket.key)}
				<button
					type="button"
					tabindex={index === 0 ? 0 : -1}
					aria-label={describe(bucket)}
					aria-pressed={highlight.isSelected(bucket.target)}
					class={[
						'group relative h-full min-w-1 cursor-pointer first:rounded-l last:rounded-r focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500',
						bucket.color,
						highlight.isSelected(bucket.target) && 'ring-2 ring-white ring-inset dark:ring-white'
					]}
					style:flex="{bucket.total} 1 0%"
					onmouseenter={() => highlight.hover(bucket.target)}
					onmouseleave={() => highlight.unhover(bucket.target)}
					onfocus={() => highlight.hover(bucket.target)}
					onblur={() => highlight.unhover(bucket.target)}
					onclick={() => highlight.toggle(bucket.target)}
					onkeydown={moveFocus}
				>
					<span
						class="absolute inset-y-0 left-0 bg-black/30 group-first:rounded-l"
						style:width="{(bucket.on / bucket.total) * 100}%"
					></span>
					<span
						class={[
							'pointer-events-none absolute bottom-full z-30 mb-1.5 hidden rounded bg-gray-900 px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow group-hover:block group-focus-visible:block dark:bg-gray-950',
							start < 0.5 ? 'left-0' : 'right-0'
						]}
						aria-hidden="true"
					>
						{bucket.label}: <span class="tabular-nums">{bucket.total}</span>
						{#if bucket.on > 0}
							<span class="text-red-300">({bucket.on} on grid)</span>
						{/if}
					</span>
				</button>
			{/each}
		</div>
	</div>
{/snippet}

{#if ships.total > 0 || objects.total > 0}
	<section aria-label="Scan composition" class="space-y-1.5 rounded bg-white p-2 dark:bg-gray-800">
		{#if ships.total > 0}
			{@render bar(`Ships ${ships.total}`, 'Ships by class', ships.classes, ships.total, 'h-4')}
			{@render bar('Roles', 'Ships by role', roles.roles, roles.total, 'h-3')}
		{/if}
		{#if objects.total > 0}
			{@render bar(
				`Other ${objects.total}`,
				'Other objects',
				objects.classes,
				objects.total,
				'h-2'
			)}
		{/if}
	</section>
{/if}
