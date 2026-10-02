import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from '../../../src/lib/server/redirects.js';

describe('safeRedirectPath', () => {
	it('keeps same-origin paths with query and hash', () => {
		expect(safeRedirectPath('/scan/abc/def?x=1#top')).toBe('/scan/abc/def?x=1#top');
	});

	it.each([
		['protocol-relative', '//evil.example/path'],
		['backslash', '/\\evil.example'],
		['tab-smuggled protocol-relative', '/\t/evil.example'],
		['absolute URL', 'https://evil.example/'],
		['relative path', 'scan/abc'],
		['empty', ''],
		['non-string', null]
	])('falls back for %s targets', (_label, value) => {
		expect(safeRedirectPath(value)).toBe('/');
		expect(safeRedirectPath(value, '/my-scans')).toBe('/my-scans');
	});
});
