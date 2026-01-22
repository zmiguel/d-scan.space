<script>
	import OverviewLocal from '$lib/components/OverviewLocal.svelte';
	import OverviewSpace from '$lib/components/OverviewSpace.svelte';

	let { data } = $props();
</script>

<div class="relative grid grid-cols-3 gap-2">
	<!-- Local Overview-->
	<div class="col-span-1 pr-1">
		<OverviewLocal {data} />
	</div>
	<div
		class="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-gray-600"
		style="left: calc(33.333% - 0.15rem);"
		aria-hidden="true"
	></div>
	<!-- Space Overview-->
	<div class="col-span-2 pl-1">
		<OverviewSpace {data} />
	</div>
</div>
