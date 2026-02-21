<script>
	import { Table } from '@flowbite-svelte-plugins/datatable';
	import { ListPlaceholder } from 'flowbite-svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { asset, resolve } from '$app/paths';
	import MetaTags from '$lib/components/MetaTags.svelte';

	let { data } = $props();

	let isTableLoading = $state(true);

	const tableData = $derived.by(() => ({
		headings: ['Time', 'System', 'Type', 'Visibility', 'ID', 'Group ID'],
		data: (data?.scans || []).map((scan) => [
			new Date(scan.created_at)
				.toISOString()
				.replace('T', ' ')
				.replace(/\.\d+Z$/, ''),
			scan.system?.name || 'Unknown',
			scan.scan_type,
			scan.public ? 'Public' : 'Private',
			scan.id,
			scan.group_id
		])
	}));

	function open_item(scan) {
		goto(resolve(`/scan/${scan.group_id}/${scan.id}`));
	}

	const dataTableOptions = $derived.by(() => ({
		data: tableData,
		searchable: true,
		sortable: true,
		perPage: 25,
		perPageSelect: [10, 25, 50, 100],
		rowRender: (row, tr, index) => {
			if (!tr.attributes) {
				tr.attributes = {};
			}
			tr.attributes.class =
				(tr.attributes.class || '') + ' cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600';
			tr.attributes['data-row-index'] = index;
			return tr;
		}
	}));

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

	function attachEventListeners(dataTable) {
		const tableWrapper = dataTable.dom;
		if (tableWrapper) {
			tableWrapper.removeEventListener('click', handleRowClick);
			tableWrapper.addEventListener('click', handleRowClick);
		}
	}

	function onInitComplete(dataTable) {
		isTableLoading = false;
		attachEventListeners(dataTable);
	}

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

<MetaTags title="My Scans" description="Browse your private and public scans on D-Scan Space." />

<div class="container mx-auto px-0">
	<div
		class="min-h-[500px] rounded-sm border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-gray-700"
	>
		{#if data.requiresLogin}
			<div class="flex min-h-[300px] flex-col items-center justify-center gap-4 p-4 text-center">
				<p class="text-sm sm:text-base">You need to login to view your personal scans.</p>
				<form method="POST" action="/signin">
					<input type="hidden" name="providerId" value="eveonline" />
					<input type="hidden" name="redirectTo" value={page.url.pathname} />
					<button type="submit" class="w-full cursor-pointer">
						<img
							src={asset('/eve-sso-login-black-large.png')}
							alt="Login with EVE Online"
							class="hidden w-full sm:block dark:hidden"
						/>
						<img
							src={asset('/eve-sso-login-white-large.png')}
							alt="Login with EVE Online"
							class="hidden w-full sm:dark:block"
						/>
						<img
							src={asset('/eve-sso-login-black-small.png')}
							alt="Login with EVE Online"
							class="w-full sm:hidden dark:hidden"
						/>
						<img
							src={asset('/eve-sso-login-white-small.png')}
							alt="Login with EVE Online"
							class="hidden w-full dark:block sm:dark:hidden"
						/>
					</button>
				</form>
			</div>
		{:else if !tableData.data || tableData.data.length === 0}
			<p class="p-4 text-sm sm:text-base">You have no scans yet</p>
		{:else}
			{#if isTableLoading}
				<div class="flex items-center justify-center p-4">
					<ListPlaceholder class="mb-4 w-full max-w-4xl" />
				</div>
			{/if}

			<div
				class:opacity-0={isTableLoading}
				class:invisible={isTableLoading}
				class="-mx-4 overflow-x-auto px-4 transition-opacity duration-300 sm:mx-0 sm:px-0"
			>
				<Table {dataTableOptions} {onInitComplete} {onUpdate} {onPage} {onSearch} {onSort} />
			</div>
		{/if}
	</div>
</div>
