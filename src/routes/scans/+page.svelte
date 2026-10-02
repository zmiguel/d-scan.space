<script>
	import MetaTags from '$lib/components/MetaTags.svelte';
	import ScanList from '$lib/components/ScanList.svelte';

	let { data } = $props();
</script>

<MetaTags
	title="Public Scans"
	description="Browse public directional and local scans shared on D-Scan Space."
/>

<div class="container mx-auto px-0">
	<div
		class="min-h-[500px] rounded-sm border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-gray-700"
	>
		<ScanList
			basePath="/scans"
			scans={data.scans}
			total={data.total}
			page={data.page}
			pageCount={data.pageCount}
			query={data.query}
			type={data.type}
			emptyText="No scans available"
		/>
	</div>
</div>
