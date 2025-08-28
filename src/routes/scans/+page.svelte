<script>
	import { Table } from '@flowbite-svelte-plugins/datatable';
	import { goto } from '$app/navigation';

	let { data } = $props();

	// Simple items approach - transform data to array of objects
	const items = (data?.scans || []).map((scan) => ({
		Time: new Date(scan.created_at)
			.toISOString()
			.replace('T', ' ')
			.replace(/\.\d+Z$/, ''),
		System: scan.system || 'Unknown',
		Type: scan.scan_type,
		ID: scan.id,
		'Group ID': scan.group_id
	}));

	function open_item(scan) {
		goto(`/scan/${scan.group_id}/${scan.id}`);
	}

	// Basic datatable options for simple items approach
	const dataTableOptions = {
		searchable: true,
		sortable: true,
		perPage: 25,
		perPageSelect: [10, 25, 50, 100],
		rowRender: (row, tr, index) => {
			// Add click event to table row
			if (!tr.attributes) {
				tr.attributes = {};
			}
			tr.attributes.class =
				(tr.attributes.class || '') + ' cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600';
			tr.attributes['data-row-index'] = index;
			return tr;
		}
	};

	let tableInstance;

	// Handle row clicks using event delegation
	function handleRowClick(event) {
		const target = event.target.closest('tr[data-row-index]');
		if (target && target.dataset.rowIndex !== undefined) {
			const rowIndex = parseInt(target.dataset.rowIndex);
			const scan = data.scans[rowIndex];
			if (scan) {
				open_item(scan);
			}
		}
	}

	// Re-attach event listeners after any table update
	function attachEventListeners(dataTable) {
		const tableWrapper = dataTable.dom;
		if (tableWrapper) {
			// Remove existing listeners to prevent duplicates
			tableWrapper.removeEventListener('click', handleRowClick);
			// Add event listener using delegation
			tableWrapper.addEventListener('click', handleRowClick);
		}
	}

	// Initialize table events after component mounts
	function onInitComplete(dataTable) {
		tableInstance = dataTable;
		attachEventListeners(dataTable);
	}

	// Re-attach listeners after pagination/search/sort
	function onUpdate(dataTable) {
		attachEventListeners(dataTable);
	}

	function onPage(page, dataTable) {
		attachEventListeners(dataTable);
	}

	function onSearch(query, matched, dataTable) {
		attachEventListeners(dataTable);
	}

	function onSort(column, direction, dataTable) {
		attachEventListeners(dataTable);
	}
</script>

<svelte:head>
	<title>Public Scans | D-Scan Space!</title>
</svelte:head>

<div class="container mx-auto">
	<div class="min-h-[500px] rounded-sm">
		{#if items.length === 0}
			<p class="p-4">No scans available</p>
		{:else}
			<Table {items} {dataTableOptions} {onInitComplete} {onUpdate} {onPage} {onSearch} {onSort} />
		{/if}
	</div>
</div>
