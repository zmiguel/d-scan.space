import { SvelteMap } from 'svelte/reactivity';

export const SHIP_CATEGORY_ID = 6;

export function listGroups(section) {
	return Array.isArray(section?.objects) ? section.objects : [];
}

export function getNodeCount(node) {
	return typeof node?.count === 'number'
		? node.count
		: typeof node?.total_objects === 'number'
			? node.total_objects
			: 0;
}

export function sortByTotal(list) {
	return [...list].sort((a, b) => {
		const countDiff = getNodeCount(b) - getNodeCount(a);
		if (countDiff !== 0) return countDiff;
		return (a?.name ?? '').localeCompare(b?.name ?? '');
	});
}

export function sortCategories(list) {
	const sorted = [...list].sort((a, b) => {
		const countDiff = getNodeCount(b) - getNodeCount(a);
		if (countDiff !== 0) return countDiff;
		return (a?.name ?? '').localeCompare(b?.name ?? '');
	});

	const ships = sorted.filter((category) => Number(category?.id) === SHIP_CATEGORY_ID);
	const others = sorted.filter((category) => Number(category?.id) !== SHIP_CATEGORY_ID);

	return [...ships, ...others];
}

export function collectAllLeaves(section) {
	const items = [];
	const visit = (node, categoryName, groupName) => {
		if (!node || typeof node !== 'object') return;

		if (Array.isArray(node.objects) && node.objects.length > 0) {
			const childHasObjects = node.objects.some((child) => Array.isArray(child?.objects));
			const nextCategory = categoryName ?? node.name;
			const nextGroup = childHasObjects ? groupName : node.name;
			node.objects.forEach((child) => visit(child, nextCategory, nextGroup));
			return;
		}

		const count = getNodeCount(node);
		if (count > 0) {
			items.push({
				id: node.id,
				name: node.name,
				count,
				category: categoryName,
				group: groupName
			});
		}
	};

	listGroups(section).forEach((node) => visit(node, null, null));
	return items;
}

export function collectInteresting(section, location, interestingSet) {
	const items = [];
	const visit = (node, includeAll, groupName) => {
		if (!node || typeof node !== 'object') return;
		const matched = includeAll || (interestingSet?.has(node.id) ?? false);

		if (Array.isArray(node.objects) && node.objects.length > 0) {
			const childHasObjects = node.objects.some((child) => Array.isArray(child?.objects));
			const nextGroup = childHasObjects ? groupName : node.name;
			node.objects.forEach((child) => visit(child, matched, nextGroup));
			return;
		}

		const count = getNodeCount(node);
		if (matched && count > 0) {
			items.push({ id: node.id, name: node.name, group: groupName, count, location });
		}
	};

	listGroups(section).forEach((node) => visit(node, false, null));
	return items;
}

export function buildGroupStats(onGrid, offGrid) {
	const map = new SvelteMap();
	const addGroupItems = (section, location) => {
		const visit = (node, groupInfo, categoryId) => {
			if (!node || typeof node !== 'object') return;
			if (Array.isArray(node.objects) && node.objects.length > 0) {
				const childHasObjects = node.objects.some((child) => Array.isArray(child?.objects));
				const nextGroupInfo = childHasObjects
					? groupInfo
					: {
							id: node.id,
							name: node.name,
							categoryId
						};
				node.objects.forEach((child) => visit(child, nextGroupInfo, categoryId));
				return;
			}

			if (!groupInfo?.id) return;
			const count = getNodeCount(node);
			if (count <= 0) return;

			const entry = map.get(groupInfo.id) ?? {
				id: groupInfo.id,
				name: groupInfo.name,
				categoryId: groupInfo.categoryId,
				on: 0,
				off: 0,
				total: 0
			};

			if (location === 'on') entry.on += count;
			if (location === 'off') entry.off += count;
			entry.total = entry.on + entry.off;
			map.set(groupInfo.id, entry);
		};

		listGroups(section).forEach((node) => visit(node, null, Number(node?.id)));
	};

	addGroupItems(onGrid, 'on');
	addGroupItems(offGrid, 'off');

	const sorted = Array.from(map.values()).sort((a, b) => {
		const totalDiff = b.total - a.total;
		if (totalDiff !== 0) return totalDiff;
		return a.name.localeCompare(b.name);
	});

	const ships = sorted.filter((group) => Number(group?.categoryId) === SHIP_CATEGORY_ID);
	const others = sorted.filter((group) => Number(group?.categoryId) !== SHIP_CATEGORY_ID);

	return [...ships, ...others];
}
