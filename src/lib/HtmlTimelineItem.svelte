<script>
	import { twMerge } from 'tailwind-merge';
	import { getContext } from 'svelte';

	export let htmlTitle = '';
	export let date = '';
	export let svgClass = 'w-3 h-3 text-primary-600 dark:text-primary-400';
	export let classDiv = '';
	export let classLi = '';
	export let classTime = '';
	export let classH3 = '';

	let order = 'default';
	order = getContext('order');

	const liClasses = {
		default: 'mb-10 ms-4',
		vertical: 'mb-10 ms-6',
		horizontal: 'relative mb-6 sm:mb-0',
		activity: 'mb-10 ms-6',
		group: ''
	};

	const divClasses = {
		default:
			'absolute w-3 h-3 bg-gray-200 rounded-full mt-1.5 -start-1.5 border border-white dark:border-gray-900 dark:bg-gray-700',
		vertical:
			'flex absolute -start-3 justify-center items-center w-6 h-6 bg-primary-200 rounded-full dark:bg-primary-900',
		horizontal: 'flex items-center',
		activity:
			'flex absolute -start-3 justify-center items-center w-6 h-6 bg-primary-200 rounded-full ring-8 ring-white dark:ring-gray-900 dark:bg-primary-900',
		group:
			'p-5 mb-4 bg-gray-50 rounded-lg border border-gray-100 dark:bg-gray-800 dark:border-gray-700'
	};

	const timeClasses = {
		default: 'mb-1 text-sm font-normal leading-none text-gray-400 dark:text-gray-500',
		vertical: 'block mb-2 text-sm font-normal leading-none text-gray-400 dark:text-gray-500',
		horizontal: 'block mb-2 text-sm font-normal leading-none text-gray-400 dark:text-gray-500',
		activity: 'mb-1 text-xs font-normal text-gray-400 sm:order-last sm:mb-0',
		group: 'text-lg font-semibold text-gray-900 dark:text-white'
	};

	let liCls = twMerge(liClasses[order], classLi);
	let divCls = twMerge(divClasses[order], classDiv);
	let timeCls = twMerge(timeClasses[order], classTime);
	const h3Cls = twMerge(
		order === 'vertical'
			? 'flex items-center mb-1 text-lg font-semibold text-gray-900 dark:text-white'
			: 'text-lg font-semibold text-gray-900 dark:text-white',
		classH3
	);
</script>

<li class={liCls}>
	<div class={divCls}></div>

	{#if order !== 'default'}
		<slot name="icon">
			<svg
				aria-hidden="true"
				class={svgClass}
				fill="currentColor"
				viewBox="0 0 20 20"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					fill-rule="evenodd"
					d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
					clip-rule="evenodd"
				/>
			</svg>
		</slot>
	{:else if date}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<time class={timeCls}>{@html date}</time>
	{/if}

	{#if htmlTitle}
		<h3 class={h3Cls}>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html htmlTitle}
		</h3>
	{/if}

	{#if order !== 'default'}
		{#if date}
			<time class={timeCls}>{date}</time>
		{/if}
	{/if}

	<slot></slot>
</li>
