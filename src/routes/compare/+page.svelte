<script>
	import MetaTags from '$lib/components/MetaTags.svelte';
	import ComparePicker from '$lib/components/compare/ComparePicker.svelte';

	let { data } = $props();
</script>

<MetaTags
	title="Compare scans"
	description="Compare two directional or local scans."
	showImage={false}
	noIndex
/>

<div class="mx-auto max-w-3xl rounded-lg bg-white p-4 dark:bg-gray-800">
	<h1 class="mb-2 text-2xl font-semibold text-gray-900 dark:text-white">Compare scans</h1>
	<p class="mb-4 text-sm text-gray-600 dark:text-gray-300">
		Paste two scan links (or scan ids) of the same type, from any scan groups. A scan group link
		(what "Copy link" copies) stands for that group's latest scan. The older scan is shown as
		"before".
	</p>
	{#if data.message}
		<p
			role="alert"
			class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200"
		>
			{data.message}
		</p>
	{/if}
	<div class="rounded bg-gray-50 p-4 dark:bg-gray-700">
		<ComparePicker a={data.a} b={data.b} />
	</div>
</div>
