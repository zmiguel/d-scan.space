import { describe, it, expect } from 'vitest';
import {
	OBJECT_CLASSES,
	SHIP_CLASSES,
	SHIP_ROLES,
	shipRole,
	summarizeObjects,
	summarizeRoles,
	summarizeShips
} from '../../../src/lib/utils/shipClasses.js';

const group = (id, name, categoryId, on, off) => ({
	id,
	name,
	categoryId,
	on,
	off,
	total: on + off
});

/** d-scan section with ship groups: [groupId, groupName, [[typeId, typeName, count]]] */
const ships = (groups) => ({
	objects: [
		{
			id: 6,
			name: 'Ship',
			objects: groups.map(([id, name, types]) => ({
				id,
				name,
				objects: types.map(([typeId, typeName, count]) => ({ id: typeId, name: typeName, count }))
			}))
		}
	]
});

describe('ship class mapping', () => {
	it('puts every listed ship group in exactly one class and at most one role', () => {
		const classIds = SHIP_CLASSES.flatMap((shipClass) => shipClass.groups);
		expect(new Set(classIds).size).toBe(classIds.length);
		const roleGroups = SHIP_ROLES.flatMap((role) => role.groups);
		expect(new Set(roleGroups).size).toBe(roleGroups.length);
		const roleTypes = SHIP_ROLES.flatMap((role) => role.types);
		expect(new Set(roleTypes).size).toBe(roleTypes.length);
	});

	it('counts black ops and marauders as battleships, strategic cruisers as cruisers', () => {
		const classOf = (id) => SHIP_CLASSES.find((shipClass) => shipClass.groups.includes(id))?.key;
		expect(classOf(898)).toBe('battleships');
		expect(classOf(900)).toBe('battleships');
		expect(classOf(963)).toBe('cruisers');
		expect(classOf(29)).toBe('pods');
		expect(classOf(883)).toBe('capitals'); // Rorqual
		expect(classOf(513)).toBe('capitals'); // Freighter (capital hull)
		expect(classOf(237)).toBe('frigates'); // rookie ships
	});
});

describe('shipRole', () => {
	it('lets a type override its group (T1 logistics and EWAR hulls in combat groups)', () => {
		expect(shipRole(26, 620).key).toBe('logistics'); // Osprey in Cruiser
		expect(shipRole(26, 632).key).toBe('ewar'); // Blackbird in Cruiser
		expect(shipRole(25, 32880).key).toBe('non-combat'); // Venture in Frigate
		expect(shipRole(26, 627).key).toBe('dps'); // Thorax in Cruiser
	});

	it('uses the group role otherwise, and DPS for unknown combat groups', () => {
		expect(shipRole(1538, 1).key).toBe('logistics'); // Force Auxiliary
		expect(shipRole(541, 1).key).toBe('interdiction');
		expect(shipRole(29, 670).key).toBe('non-combat'); // Capsule
		expect(shipRole(900, 1).key).toBe('dps'); // Marauder
		expect(shipRole(99999, 1).key).toBe('dps');
	});
});

describe('summarizeShips', () => {
	const stats = [
		group(27, 'Battleship', 6, 2, 10),
		group(900, 'Marauder', 6, 1, 0),
		group(26, 'Cruiser', 6, 3, 0),
		group(963, 'Strategic Cruiser', 6, 0, 4),
		group(29, 'Capsule', 6, 5, 6),
		group(99999, 'Future Ship Group', 6, 0, 1),
		group(18, 'Combat Drone', 18, 40, 0)
	];

	it('sums groups per class with on/off split, in bar order, ships only', () => {
		const result = summarizeShips(stats);
		expect(result).toMatchObject({ on: 11, off: 21, total: 32 });
		expect(result.classes.map((c) => [c.key, c.on, c.off, c.total])).toEqual([
			['battleships', 3, 10, 13],
			['cruisers', 3, 4, 7],
			['pods', 5, 6, 11],
			['other', 0, 1, 1]
		]);
	});

	it('targets the group names of each class for highlighting', () => {
		const battleships = summarizeShips(stats).classes.find((c) => c.key === 'battleships');
		expect(battleships.target).toEqual({ groups: ['Battleship', 'Marauder'] });
	});
});

describe('summarizeRoles', () => {
	const onGrid = ships([
		[
			26,
			'Cruiser',
			[
				[627, 'Thorax', 4],
				[620, 'Osprey', 2]
			]
		],
		[832, 'Logistics', [[11985, 'Basilisk', 1]]]
	]);
	const offGrid = ships([
		[29, 'Capsule', [[670, 'Capsule', 3]]],
		[541, 'Interdictor', [[22456, 'Sabre', 1]]]
	]);

	it('splits all ships into exclusive roles that add up to the ship total', () => {
		const result = summarizeRoles(onGrid, offGrid);
		expect(result).toMatchObject({ on: 7, off: 4, total: 11 });
		expect(result.roles.map((r) => [r.key, r.on, r.off])).toEqual([
			['dps', 4, 0],
			['logistics', 3, 0],
			['interdiction', 0, 1],
			['non-combat', 0, 3]
		]);
	});

	it('targets type ids, so a role can highlight part of a group', () => {
		const logistics = summarizeRoles(onGrid, offGrid).roles.find((r) => r.key === 'logistics');
		expect(logistics.target).toEqual({ types: [620, 11985] });
	});
});

describe('summarizeObjects', () => {
	it('groups non-ship content by category, wrecks by group, and ignores celestials', () => {
		const objects = summarizeObjects([
			group(100, 'Combat Drone', 18, 30, 10),
			group(1657, 'Citadel', 65, 0, 2),
			group(4736, 'Skyhook', 46, 0, 3),
			group(186, 'Wreck', 2, 20, 50),
			group(7, 'Planet', 2, 0, 9),
			group(27, 'Battleship', 6, 1, 0)
		]);
		expect(objects.total).toBe(115);
		expect(objects.classes.map((c) => [c.key, c.total])).toEqual([
			['drones', 40],
			['structures', 5],
			['wrecks', 70]
		]);
	});

	it('defines every object class by categories or groups', () => {
		for (const objectClass of OBJECT_CLASSES) {
			expect(Boolean(objectClass.categories) !== Boolean(objectClass.groups)).toBe(true);
		}
	});
});
