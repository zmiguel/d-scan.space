<script>
	import { Avatar, Badge } from 'flowbite-svelte';
	import ItemName from './ItemName.svelte';

	/** One type in an on-/off-grid group list; `highlighted` when its group is hovered/selected. */
	let { item, highlighted = false } = $props();
</script>

<li
	class={[
		'grid w-full grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_auto_auto]',
		highlighted && 'rounded bg-primary-100 dark:bg-gray-800'
	]}
>
	<div class="flex min-w-0 items-center rtl:space-x-reverse">
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
		<Badge color="primary" size="xs">{item.count}</Badge>
	</div>
</li>
