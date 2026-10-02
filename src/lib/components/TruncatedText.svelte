<script>
	import { Tooltip } from 'flowbite-svelte';

	/**
	 * Single-line text cut with an ellipsis when it does not fit. While it is cut, hovering
	 * or focusing it shows the full content in a tooltip (`tooltip` snippet, defaults to
	 * the children).
	 *
	 * The element measures itself with a ResizeObserver, so it re-checks when its column
	 * resizes, an accordion opens, a tab becomes visible or fonts load — no document-wide
	 * listeners. The id is unique per instance, so the tooltip always binds to this element.
	 *
	 * @type {{ class?: string, tooltip?: import('svelte').Snippet, children: import('svelte').Snippet }}
	 */
	let { class: className = '', tooltip, children } = $props();

	const uid = $props.id();
	const id = `truncated-${uid}`;
	/** @type {HTMLElement | undefined} */
	let element = $state();
	let truncated = $state(false);

	function measure() {
		// Hidden (closed accordion, inactive tab): keep the last result until it is visible.
		if (!element || element.clientWidth === 0) return;
		truncated = Math.ceil(element.scrollWidth) > Math.floor(element.clientWidth + 1);
	}

	$effect(() => {
		if (!element) return;
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	});
</script>

<span bind:this={element} {id} class={['truncate', className]}>{@render children()}</span>
{#if truncated}
	<Tooltip triggeredBy="#{id}" placement="top">
		{#if tooltip}
			{@render tooltip()}
		{:else}
			{@render children()}
		{/if}
	</Tooltip>
{/if}
