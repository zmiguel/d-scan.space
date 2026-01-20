import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockSpan = {
	setAttributes: vi.fn(),
	setStatus: vi.fn(),
	addEvent: vi.fn()
};

vi.mock('../../../src/lib/server/tracer.js', () => ({
	withSpan: vi.fn((name, fn) => fn(mockSpan))
}));

const { mockDb } = vi.hoisted(() => {
	return {
		mockDb: {
			select: vi.fn(),
			transaction: vi.fn()
		}
	};
});

vi.mock('../../../src/lib/database/client.js', () => ({
	db: mockDb
}));

vi.mock('../../../src/lib/database/schema.js', () => ({
	scans: {
		id: 'scans.id',
		group_id: 'scans.group_id',
		scan_type: 'scans.scan_type',
		created_at: 'scans.created_at',
		data: 'scans.data',
		raw_data: 'scans.raw_data'
	},
	scanGroups: {
		id: 'scanGroups.id',
		system: 'scanGroups.system',
		public: 'scanGroups.public',
		created_at: 'scanGroups.created_at'
	}
}));

import {
	getScanByID,
	createNewScan,
	updateScan,
	getScansByGroupID,
	getPublicScans
} from '../../../src/lib/database/scans.js';

describe('scans', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('getScanByID', () => {
		it('should fetch scan by ID', async () => {
			const mockSelect = {
				from: vi.fn().mockReturnThis(),
				leftJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue([{ id: 1 }])
			};
			mockDb.select.mockReturnValue(mockSelect);

			const result = await getScanByID(1);

			expect(mockDb.select).toHaveBeenCalled();
			expect(mockSelect.from).toHaveBeenCalled();
			expect(mockSelect.leftJoin).toHaveBeenCalled();
			expect(mockSelect.where).toHaveBeenCalled();
			expect(result).toEqual([{ id: 1 }]);
		});
	});

	describe('getScansByGroupID', () => {
		it('should fetch scans by group ID', async () => {
			const mockSelect = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }])
			};
			mockDb.select.mockReturnValue(mockSelect);

			const result = await getScansByGroupID('group1');

			expect(mockDb.select).toHaveBeenCalled();
			expect(mockSelect.from).toHaveBeenCalled();
			expect(mockSelect.where).toHaveBeenCalled();
			expect(result).toHaveLength(2);
		});
	});

	describe('createNewScan', () => {
		it('should create new scan in transaction', async () => {
			const data = {
				scanId: 'scan1',
				scanGroupId: 'group1',
				type: 'local',
				data: {},
				raw_data: [],
				is_public: false
			};

			// Mock transaction to immediately execute the callback
			mockDb.transaction.mockImplementation(async (callback) => {
				const tx = {
					insert: vi.fn().mockReturnThis(),
					values: vi.fn().mockResolvedValue()
				};
				await callback(tx);

				// Verify logic inside transaction
				expect(tx.insert).toHaveBeenCalledTimes(2);
				// First insert: scanGroups
				expect(tx.insert).toHaveBeenNthCalledWith(
					1,
					expect.objectContaining({
						id: 'scanGroups.id',
						system: 'scanGroups.system',
						public: 'scanGroups.public',
						created_at: 'scanGroups.created_at'
					})
				);
				expect(tx.values).toHaveBeenNthCalledWith(
					1,
					expect.objectContaining({
						id: 'group1',
						public: false
					})
				);

				// Second insert: scans
				expect(tx.insert).toHaveBeenNthCalledWith(
					2,
					expect.objectContaining({
						id: 'scans.id',
						group_id: 'scans.group_id',
						scan_type: 'scans.scan_type',
						created_at: 'scans.created_at',
						data: 'scans.data',
						raw_data: 'scans.raw_data'
					})
				);
				expect(tx.values).toHaveBeenNthCalledWith(
					2,
					expect.objectContaining({
						id: 'scan1',
						group_id: 'group1',
						scan_type: 'local'
					})
				);
			});

			await createNewScan(data);

			expect(mockDb.transaction).toHaveBeenCalled();
		});
		it('should create new scan without system info', async () => {
			const data = {
				scanId: 'scan-123',
				scanGroupId: 'group-123',
				type: 'directional',
				is_public: true,
				data: {}, // No system info
				raw_data: 'raw'
			};

			const mockTx = {
				insert: vi.fn().mockReturnThis(),
				values: vi.fn().mockResolvedValue()
			};
			mockDb.transaction.mockImplementation(async (cb) => await cb(mockTx));

			await createNewScan(data);

			expect(mockTx.insert).toHaveBeenCalledTimes(2);
			// Verify system is null in scanGroups insert
			expect(mockTx.values).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'group-123',
					system: null
				})
			);
		});

		it('should create new scan with system info', async () => {
			const data = {
				scanId: 'scan-sys',
				scanGroupId: 'group-sys',
				type: 'directional',
				is_public: true,
				data: { system: { name: 'Jita' } },
				raw_data: 'raw'
			};

			const mockTx = {
				insert: vi.fn().mockReturnThis(),
				values: vi.fn().mockResolvedValue()
			};
			mockDb.transaction.mockImplementation(async (cb) => await cb(mockTx));

			await createNewScan(data);

			expect(mockTx.insert).toHaveBeenCalledTimes(2);
			expect(mockTx.values).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'group-sys',
					system: { name: 'Jita' }
				})
			);
		});
	});

	describe('updateScan', () => {
		it('should update scan in transaction with system info', async () => {
			const data = {
				scanId: 'scan2',
				scanGroupId: 'group1',
				type: 'directional',
				data: { system: { name: 'Jita' } },
				raw_data: []
			};

			mockDb.transaction.mockImplementation(async (callback) => {
				const tx = {
					insert: vi.fn().mockReturnThis(),
					values: vi.fn().mockResolvedValue(),
					update: vi.fn().mockReturnThis(),
					set: vi.fn().mockReturnThis(),
					where: vi.fn().mockResolvedValue()
				};
				await callback(tx);

				expect(tx.insert).toHaveBeenCalled();
				expect(tx.update).toHaveBeenCalledWith(
					expect.objectContaining({
						id: 'scanGroups.id',
						system: 'scanGroups.system',
						public: 'scanGroups.public',
						created_at: 'scanGroups.created_at'
					})
				);
				expect(tx.set).toHaveBeenCalledWith({ system: { name: 'Jita' } });
			});

			await updateScan(data);

			expect(mockDb.transaction).toHaveBeenCalled();
		});

		it('should update scan in transaction without system info', async () => {
			const data = {
				scanId: 'scan3',
				scanGroupId: 'group2',
				type: 'local',
				data: {}, // No system info
				raw_data: []
			};

			mockDb.transaction.mockImplementation(async (callback) => {
				const tx = {
					insert: vi.fn().mockReturnThis(),
					values: vi.fn().mockResolvedValue(),
					update: vi.fn().mockReturnThis(),
					set: vi.fn().mockReturnThis(),
					where: vi.fn().mockResolvedValue()
				};
				await callback(tx);

				expect(tx.insert).toHaveBeenCalled();
				expect(tx.update).not.toHaveBeenCalled(); // Should NOT update system info
			});

			await updateScan(data);

			expect(mockDb.transaction).toHaveBeenCalled();
		});
	});
});

describe('getPublicScans', () => {
	it('should fetch public scans', async () => {
		const mockSelect = {
			from: vi.fn().mockReturnThis(),
			leftJoin: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			orderBy: vi.fn().mockResolvedValue([{ id: 1 }])
		};
		mockDb.select.mockReturnValue(mockSelect);

		const result = await getPublicScans();

		expect(mockDb.select).toHaveBeenCalled();
		expect(mockSelect.from).toHaveBeenCalled();
		expect(mockSelect.leftJoin).toHaveBeenCalled();
		expect(mockSelect.where).toHaveBeenCalled();
		expect(mockSelect.orderBy).toHaveBeenCalled();
		expect(result).toHaveLength(1);
	});
});
