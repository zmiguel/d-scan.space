import { describe, it, expect } from 'vitest';
import { parseScanReference } from '../../../src/lib/utils/scanRef.js';

describe('parseScanReference', () => {
	it('reads the scan id from scan links, with or without host, query or hash', () => {
		expect(parseScanReference('https://d-scan.space/scan/CkbZwZU6/Sv2rd7v16cEK')).toEqual({
			scan: 'Sv2rd7v16cEK'
		});
		expect(parseScanReference(' /scan/CkbZwZU6/Sv2rd7v16cEK/?tab=local#x ')).toEqual({
			scan: 'Sv2rd7v16cEK'
		});
	});

	it('reads a group link (what "Copy link" copies) as a group', () => {
		expect(parseScanReference('https://d-scan.space/scan/CkbZwZU6')).toEqual({
			group: 'CkbZwZU6'
		});
	});

	it('takes a bare id as a scan id', () => {
		expect(parseScanReference('Sv2rd7v16cEK')).toEqual({ scan: 'Sv2rd7v16cEK' });
	});

	it('rejects empty input, other pages and malformed ids', () => {
		expect(parseScanReference('')).toBeNull();
		expect(parseScanReference(null)).toBeNull();
		expect(parseScanReference('https://d-scan.space/scans?page=2')).toBeNull();
		expect(parseScanReference('/scan/CkbZwZU6/<script>')).toBeNull();
		expect(parseScanReference('not an id')).toBeNull();
	});
});
