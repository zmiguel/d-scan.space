<script>
	/** Signed change between two counts (`+3`, `−2`, `±0`), green up / red down like the timeline. */
	let { value } = $props();
</script>

<span
	class={[
		'font-semibold tabular-nums',
		value > 0 && 'text-green-600 dark:text-green-400',
		value < 0 && 'text-red-600 dark:text-red-400',
		value === 0 && 'text-gray-400 dark:text-gray-500'
	]}
>
	{value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '±0'}
</span>
