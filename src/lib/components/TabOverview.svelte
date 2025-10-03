<script>
	import OverviewLocal from '$lib/components/OverviewLocal.svelte';

	let { data } = $props();
</script>

<div class=" grid grid-cols-3 gap-2">
	<!-- Local Overview-->
	<div class="col-span-1 border-e-2 border-gray-600 pe-2">
		<OverviewLocal {data} />
	</div>
	<!-- Space Overview-->
	<div class="col-span-2 border-e-2 border-gray-600">space</div>
</div>
