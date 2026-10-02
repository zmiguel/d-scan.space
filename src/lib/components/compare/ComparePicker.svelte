<script>
	import { resolve } from '$app/paths';
	import { formatUtcTimestamp } from '$lib/utils/time.js';

	/**
	 * GET form to `/compare`, which resolves the two inputs (scan links, scan group links or
	 * scan ids) and opens `/compare/<older>/<newer>`.
	 *
	 * @type {{
	 *   a?: string,
	 *   b?: string,
	 *   fixedA?: boolean,
	 *   labelA?: string,
	 *   labelB?: string,
	 *   choices?: Array<{ id: string, group_id: string, created_at: string | Date }>,
	 *   submitLabel?: string
	 * }}
	 */
	let {
		a = '',
		b = $bindable(''),
		fixedA = false,
		labelA = 'First scan',
		labelB = 'Second scan',
		choices = [],
		submitLabel = 'Compare'
	} = $props();

	const uid = $props.id();
	const inputClass =
		'block w-full rounded border border-gray-300 bg-gray-50 p-2 font-mono text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white';
</script>

<form
	method="GET"
	action={resolve('/compare')}
	class="flex flex-col gap-3 sm:flex-row sm:items-end"
>
	{#if fixedA}
		<input type="hidden" name="a" value={a} />
	{:else}
		<label class="flex-1 text-sm text-gray-700 dark:text-gray-300">
			{labelA}
			<input
				class={inputClass}
				name="a"
				value={a}
				list="{uid}-choices"
				placeholder="Scan link or id"
				autocomplete="off"
				required
			/>
		</label>
	{/if}
	<label class="flex-1 text-sm text-gray-700 dark:text-gray-300">
		{labelB}
		<input
			class={inputClass}
			name="b"
			bind:value={b}
			list="{uid}-choices"
			placeholder="Scan link or id"
			autocomplete="off"
			required
			data-autofocus
		/>
	</label>
	<button
		type="submit"
		class="cursor-pointer rounded bg-primary-700 px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 dark:bg-primary-600 dark:hover:bg-primary-700"
	>
		{submitLabel}
	</button>
	{#if choices.length > 0}
		<datalist id="{uid}-choices">
			{#each choices as choice (choice.id)}
				<option value={choice.id}
					>{formatUtcTimestamp(choice.created_at)} · group {choice.group_id}</option
				>
			{/each}
		</datalist>
	{/if}
</form>
