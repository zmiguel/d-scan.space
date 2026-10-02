import { describe, it, expect } from 'vitest';
import { buildScanOgSvg } from '../../../src/lib/server/og-image.js';

const ships = (groups) => ({
	total_objects: groups.reduce((n, [, , count]) => n + count, 0),
	objects: [
		{
			id: 6,
			name: 'Ship',
			objects: groups.map(([id, name, count]) => ({
				id,
				name,
				objects: [{ id: id * 10, name: `${name} type`, count }]
			}))
		}
	]
});

describe('buildScanOgSvg', () => {
	const svg = buildScanOgSvg({
		system: { name: 'Jita', constellation: 'Kimotoro', region: 'The Forge', security: 0.946 },
		createdAt: '2026-01-22T11:59:44Z',
		local: {
			total_pilots: 1260,
			total_corporations: 763,
			total_alliances: 182,
			alliances: [
				{ name: 'Fraternity.', character_count: 28 },
				{ name: '<Goons> & "Friends"', character_count: 35 }
			]
		},
		directional: {
			on_grid: ships([[27, 'Battleship', 4]]),
			off_grid: ships([[26, 'Cruiser', 6]])
		}
	});

	it('shows the system, security, time and both scan summaries', () => {
		expect(svg).toContain('>Jita<');
		expect(svg).toContain('>0.95<');
		expect(svg).toContain('Kimotoro · The Forge');
		expect(svg).toContain('2026-01-22 11:59:44 UTC');
		expect(svg).toContain('>1,260 pilots<');
		expect(svg).toContain('>10 ships<');
		expect(svg).toContain('4 on grid · 6 off grid');
	});

	it('escapes player-chosen names and lists the biggest alliance first', () => {
		expect(svg).not.toContain('<Goons>');
		const goons = svg.indexOf('&lt;Goons&gt; &amp; &quot;Friends&quot;');
		expect(goons).toBeGreaterThan(-1);
		expect(goons).toBeLessThan(svg.indexOf('Fraternity.'));
	});

	it('renders a scan without system or paired data', () => {
		const lone = buildScanOgSvg({
			system: null,
			createdAt: '2026-01-01T00:00:00Z',
			local: null,
			directional: { on_grid: null, off_grid: null }
		});
		expect(lone).toContain('Unknown system');
		expect(lone).toContain('No local scan');
		expect(lone).toContain('>0 ships<');
	});
});
