<script>
	import {
		Table,
		TableBody,
		TableBodyCell,
		TableBodyRow,
		TableHead,
		TableHeadCell
	} from 'flowbite-svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();
	let items = data.scans.map((scan) => ({
		...scan,
		system: scan.system || 'Unknown' // Ensure system is always defined
	}));

	function open_item(item) {
		goto(`/scan/${item.group_id}/${item.id}`);
	}

	function handleRowClick(item) {
		return () => open_item(item);
	}
</script>

<svelte:head>
	<title>Public Scans | D-Scan Space!</title>
</svelte:head>

<div class="container mx-auto">
	<div class="bg-gray-100 dark:bg-gray-700 p-0 rounded-sm min-h-[500px]">
		<Table
			{items}
			placeholder="Search by System"
			filter={(item, searchTerm) => item.system?.toLowerCase().includes(searchTerm.toLowerCase())}
		>
			<TableHead>
				<TableHeadCell
					sort={(a, b) => a.created_at - b.created_at}
					defaultSort
					defaultDirection="desc"
				>
					Time
				</TableHeadCell>
				<TableHeadCell sort={(a, b) => a.system - b.system}>System</TableHeadCell>
				<TableHeadCell>Type</TableHeadCell>
				<TableHeadCell>ID</TableHeadCell>
				<TableHeadCell>Group ID</TableHeadCell>
			</TableHead>
			<TableBody tableBodyClass="divide-y">
				<TableBodyRow slot="row" let:item onclick={handleRowClick(item)}>
					<TableBodyCell
						>{new Date(item.created_at)
							.toISOString()
							.replace('T', ' ')
							.replace(/\.\d+Z$/, '')}</TableBodyCell
					>
					<TableBodyCell>{item.system ? item.system : 'Unknown'}</TableBodyCell>
					<TableBodyCell>{item.scan_type}</TableBodyCell>
					<TableBodyCell>{item.id}</TableBodyCell>
					<TableBodyCell>{item.group_id}</TableBodyCell>
				</TableBodyRow>
			</TableBody>
		</Table>
	</div>
</div>
