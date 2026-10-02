<script>
	import { Avatar } from 'flowbite-svelte';
	import ItemName from './ItemName.svelte';
	import CountBadge from './CountBadge.svelte';

	/** One "Interesting" entry: icon, name (group), on-/off-grid counts. */
	let { item } = $props();
</script>

<div
	class="grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 rounded bg-white px-2 dark:bg-gray-800"
>
	<div class="my-2 flex min-w-0 items-center rtl:space-x-reverse">
		<Avatar
			cornerStyle="rounded"
			src="https://images.evetech.net/types/{item.id}/icon?size=32"
			size="sm"
			class="mr-2"
		/>
		<div class="flex min-w-0 items-center gap-1 font-medium dark:text-white">
			<ItemName {item} />
		</div>
	</div>
	<div class="flex items-center gap-1">
		{#if item.on > 0}
			<CountBadge count={item.on} color="red" label="On Grid" />
		{/if}
		{#if item.off > 0}
			<CountBadge count={item.off} color="green" label="Off Grid" />
		{/if}
	</div>
</div>
