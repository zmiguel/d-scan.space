import { SvelteMap } from 'svelte/reactivity';
import { collectInteresting } from './directional.js';

export const INTERESTING_IDS = [30, 1972];

export function buildInterestingItems(onGrid, offGrid, interestingIds = INTERESTING_IDS) {
	if (!interestingIds || interestingIds.length === 0) return [];

	const interestingSet = new Set(interestingIds);
	const items = [
		...collectInteresting(onGrid, 'on', interestingSet),
		...collectInteresting(offGrid, 'off', interestingSet)
	];

	const map = new SvelteMap();

	for (const item of items) {
		const entry = map.get(item.id) ?? {
			id: item.id,
			name: item.name,
			group: item.group ?? null,
			total: 0,
			on: 0,
			off: 0
		};

		entry.total += item.count;
		if (item.location === 'on') entry.on += item.count;
		if (item.location === 'off') entry.off += item.count;
		map.set(item.id, entry);
	}

	return Array.from(map.values()).sort((a, b) => b.total - a.total);
}
