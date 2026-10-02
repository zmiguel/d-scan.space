import { SvelteSet } from 'svelte/reactivity';

/**
 * @typedef {string | string[] | { groups?: string[], types?: number[] } | null | undefined} Target
 *   a group name, a list of group names, or group names and/or type ids
 */

/** @param {Target} target @returns {string[]} */
function keysOf(target) {
	if (target == null) return [];
	if (typeof target === 'string') return [`g:${target}`];
	if (Array.isArray(target)) return target.filter((name) => name != null).map((n) => `g:${n}`);
	return [
		...(target.groups ?? []).map((name) => `g:${name}`),
		...(target.types ?? []).map((id) => `t:${id}`)
	];
}

/**
 * Highlight state of a directional scan view: what is hovered/focused plus any number of
 * selected (clicked) targets. Item rows of a highlighted group or type are highlighted.
 *
 * Group summaries target one group; the composition bars target a ship class (its groups)
 * or a fleet role (its type ids, because roles can split a group).
 */
export class GroupHighlight {
	hovered = new SvelteSet();
	selected = new SvelteSet();

	/** @param {Target} target */
	hover(target) {
		this.hovered.clear();
		for (const key of keysOf(target)) this.hovered.add(key);
	}

	/** Ends the hover only if exactly this target is still the hovered one. */
	unhover(target) {
		const keys = keysOf(target);
		if (keys.length === this.hovered.size && keys.every((key) => this.hovered.has(key))) {
			this.hovered.clear();
		}
	}

	/**
	 * Toggles the sticky selection: selects the whole target unless all of it is already
	 * selected, in which case all of it is deselected.
	 * @param {Target} target
	 */
	toggle(target) {
		const keys = keysOf(target);
		if (keys.length === 0) return;
		if (keys.every((key) => this.selected.has(key)))
			keys.forEach((key) => this.selected.delete(key));
		else keys.forEach((key) => this.selected.add(key));
	}

	/** True when the whole target is selected. @param {Target} target */
	isSelected(target) {
		const keys = keysOf(target);
		return keys.length > 0 && keys.every((key) => this.selected.has(key));
	}

	#active(key) {
		return this.hovered.has(key) || this.selected.has(key);
	}

	/** Group summary state. @param {string | null | undefined} groupName */
	isHighlighted(groupName) {
		return groupName != null && this.#active(`g:${groupName}`);
	}

	/** Item row state: its group or its type is highlighted. @param {{ id: number, group?: string }} item */
	isItemHighlighted(item) {
		return this.isHighlighted(item.group) || this.#active(`t:${item.id}`);
	}

	reset() {
		this.hovered.clear();
		this.selected.clear();
	}
}
