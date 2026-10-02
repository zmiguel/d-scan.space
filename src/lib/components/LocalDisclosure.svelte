<script>
	import { slide } from 'svelte/transition';

	/**
	 * Collapsible row of the local overview (looks like flowbite's flush AccordionItem).
	 *
	 * The toggle is a real button whose ::after overlay covers the whole row, so clicking
	 * anywhere on the row toggles it, while `link` (e.g. zKillboard) is rendered next to the
	 * button instead of inside it (no interactive content nested in a button). Content that
	 * needs its own hover (truncation tooltips) must be `relative z-10` to sit above the
	 * overlay.
	 *
	 * @type {{
	 *   label: import('svelte').Snippet,
	 *   link?: import('svelte').Snippet,
	 *   leading?: import('svelte').Snippet,
	 *   trailing?: import('svelte').Snippet,
	 *   children: import('svelte').Snippet,
	 *   contentClass?: string
	 * }}
	 */
	let { label, link, leading, trailing, children, contentClass = 'ms-4' } = $props();

	let open = $state(false);
</script>

<h2 class="group">
	<div
		class={[
			'relative flex w-full items-center justify-between border-b border-gray-200 py-0 text-left font-medium group-first:rounded-t-xl dark:border-gray-700',
			open ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
		]}
	>
		<div class="grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 text-sm sm:text-base">
			<div class="mt-1 flex min-w-0 items-center rtl:space-x-reverse">
				{@render leading?.()}
				<div class="flex min-w-0 items-center gap-1 font-medium dark:text-white">
					<button
						type="button"
						aria-expanded={open}
						onclick={() => (open = !open)}
						class="flex min-w-0 cursor-pointer items-center gap-1 text-left after:absolute after:inset-0 after:content-['']"
					>
						{@render label()}
					</button>
					{#if link}
						<span class="relative z-10 inline-flex shrink-0">{@render link()}</span>
					{/if}
				</div>
			</div>
			{@render trailing?.()}
		</div>
		<svg
			class="pointer-events-none h-3 w-3 shrink-0 text-gray-800 dark:text-white"
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 10 6"
		>
			<path
				stroke="currentColor"
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d={open ? 'M9 5 5 1 1 5' : 'm1 1 4 4 4-4'}
			/>
		</svg>
	</div>
</h2>
{#if open}
	<div transition:slide>
		<div class={['border-b border-gray-200 py-0 dark:border-gray-700', contentClass]}>
			{@render children()}
		</div>
	</div>
{/if}
