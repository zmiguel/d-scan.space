<script>
	import { Popover } from 'flowbite-svelte';
	import { ClockOutline } from 'flowbite-svelte-icons';
	import { resolve } from '$app/paths';
	import { formatDuration, formatUtcTimestamp } from '$lib/utils/time.js';

	/**
	 * Which other scan's data is shown next to this one and how much older it is (local +
	 * d-scan pairing on the scan page): a small icon on the tab row; the details (with a link
	 * to that scan) open on hover or focus.
	 * @type {{ group: string, createdAt: string | Date, paired: { id: string, scan_type: 'local' | 'directional', created_at: string | Date } }}
	 */
	let { group, createdAt, paired } = $props();

	const uid = $props.id();
	const label = $derived(paired.scan_type === 'local' ? 'Local' : 'Directional');
	const timestamp = $derived(formatUtcTimestamp(paired.created_at));
	const age = $derived(
		formatDuration(new Date(createdAt).getTime() - new Date(paired.created_at).getTime())
	);
</script>

<button
	type="button"
	id="paired-scan-{uid}"
	aria-label="{label} data from {timestamp}, {age} before this scan"
	class="flex cursor-help items-center gap-1 rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200"
>
	<ClockOutline class="h-5 w-5" />
</button>
<Popover
	triggeredBy="#paired-scan-{uid}"
	trigger="hover"
	placement="bottom-end"
	class="z-40 w-64 text-xs sm:text-sm"
>
	{label} data from
	<a
		href={resolve(`/scan/${group}/${paired.id}`)}
		class="text-primary-600 hover:underline dark:text-primary-400">{timestamp}</a
	>, {age} before this scan.
</Popover>
