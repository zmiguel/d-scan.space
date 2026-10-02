import { describe, it, expect } from 'vitest';
import { GroupHighlight } from '../../../src/lib/utils/groupHighlight.svelte.js';

describe('GroupHighlight', () => {
	it('highlights a hovered group until that same group is left', () => {
		const h = new GroupHighlight();
		h.hover('Frigate');
		expect(h.isHighlighted('Frigate')).toBe(true);
		expect(h.isHighlighted('Cruiser')).toBe(false);

		h.unhover('Cruiser'); // leaving another group must not clear the current hover
		expect(h.isHighlighted('Frigate')).toBe(true);
		h.unhover('Frigate');
		expect(h.isHighlighted('Frigate')).toBe(false);
	});

	it('keeps clicked groups selected (several at once) and toggles them off again', () => {
		const h = new GroupHighlight();
		h.toggle('Frigate');
		h.toggle('Cruiser');
		expect(h.isHighlighted('Frigate') && h.isHighlighted('Cruiser')).toBe(true);
		h.toggle('Frigate');
		expect(h.isSelected('Frigate')).toBe(false);
		expect(h.isSelected('Cruiser')).toBe(true);
	});

	it('hovers a whole class of groups and leaves it as a unit', () => {
		const h = new GroupHighlight();
		h.hover(['Cruiser', 'Heavy Assault Cruiser']);
		expect(h.isHighlighted('Heavy Assault Cruiser')).toBe(true);
		h.unhover('Cruiser'); // a single group leaving does not end the class hover
		expect(h.isHighlighted('Cruiser')).toBe(true);
		h.unhover(['Heavy Assault Cruiser', 'Cruiser']);
		expect(h.isHighlighted('Cruiser')).toBe(false);
	});

	it('selects a class unless all its groups are selected, then deselects them all', () => {
		const h = new GroupHighlight();
		h.toggle('Cruiser');
		h.toggle(['Cruiser', 'Heavy Assault Cruiser']); // partly selected -> select all
		expect(h.isSelected(['Cruiser', 'Heavy Assault Cruiser'])).toBe(true);
		h.toggle(['Cruiser', 'Heavy Assault Cruiser']); // fully selected -> deselect all
		expect(h.isSelected('Cruiser')).toBe(false);
		expect(h.isSelected('Heavy Assault Cruiser')).toBe(false);
	});

	it('resets hover and selection', () => {
		const h = new GroupHighlight();
		h.hover('Frigate');
		h.toggle(['Cruiser']);
		h.reset();
		expect(h.isHighlighted('Frigate') || h.isHighlighted('Cruiser')).toBe(false);
	});

	it('treats an empty or missing group as nothing to highlight', () => {
		const h = new GroupHighlight();
		h.toggle([]);
		h.toggle(null);
		expect(h.selected.size).toBe(0);
		expect(h.isSelected([])).toBe(false);
		expect(h.isHighlighted(null)).toBe(false);
	});

	it('highlights single types of a group for a role target, without the whole group', () => {
		const h = new GroupHighlight();
		const osprey = { id: 620, group: 'Cruiser' };
		const thorax = { id: 627, group: 'Cruiser' };
		h.hover({ types: [620] });
		expect(h.isItemHighlighted(osprey)).toBe(true);
		expect(h.isItemHighlighted(thorax)).toBe(false);
		expect(h.isHighlighted('Cruiser')).toBe(false);
		h.unhover({ types: [620] });
		h.toggle('Cruiser'); // selecting the group highlights all its rows
		expect(h.isItemHighlighted(thorax)).toBe(true);
	});
});
