/**
 * Link preview image of a scan (1200×630, Open Graph / Discord): system, local summary
 * and d-scan ship composition. Built as an SVG string here; og-render.js rasterizes it.
 */
import { buildGroupStats } from '../utils/directional.js';
import { summarizeShips } from '../utils/shipClasses.js';
import { systemSecurityBand } from '../utils/secStatus.js';
import { formatUtcTimestamp } from '../utils/time.js';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// Tailwind palette values of the ship class colours (shipClasses.js uses class names).
const CLASS_HEX = {
	'bg-red-600': '#dc2626',
	'bg-orange-500': '#f97316',
	'bg-yellow-400': '#facc15',
	'bg-green-600': '#16a34a',
	'bg-teal-500': '#14b8a6',
	'bg-sky-500': '#0ea5e9',
	'bg-indigo-400': '#818cf8',
	'bg-slate-300': '#cbd5e1',
	'bg-gray-500': '#6b7280'
};
const BAND_HEX = { high: '#16a34a', low: '#ca8a04', null: '#dc2626' };

const escapeXml = (value) =>
	String(value).replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]
	);
const truncate = (value, max) => {
	const text = String(value ?? '');
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
const count = (value) =>
	Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : '0';

function text(x, y, content, { size = 28, weight = 400, fill = '#f9fafb', anchor = 'start' } = {}) {
	return `<text x="${x}" y="${y}" font-family="Inter" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(content)}</text>`;
}

/** Rows of "name ... count" in a column. */
function list(x, y, width, rows) {
	return rows
		.map(
			([name, value], i) =>
				text(x, y + i * 40, truncate(name, 30), { size: 26, fill: '#e5e7eb' }) +
				text(x + width, y + i * 40, value, { size: 26, weight: 700, anchor: 'end' })
		)
		.join('');
}

function localColumn(x, width, local) {
	if (!local) return text(x, 330, 'No local scan', { size: 28, fill: '#6b7280' });
	const top = [...(local.alliances ?? [])]
		.filter((alliance) => alliance?.name)
		.sort((a, b) => (b.character_count ?? 0) - (a.character_count ?? 0))
		.slice(0, 4)
		.map((alliance) => [alliance.name, count(alliance.character_count)]);
	return (
		text(x, 290, 'LOCAL', { size: 22, weight: 700, fill: '#9ca3af' }) +
		text(x, 350, `${count(local.total_pilots)} pilots`, { size: 52, weight: 700 }) +
		text(
			x,
			392,
			`${count(local.total_corporations)} corps · ${count(local.total_alliances)} alliances`,
			{ size: 26, fill: '#9ca3af' }
		) +
		list(x, 450, width, top)
	);
}

function directionalColumn(x, width, directional) {
	if (!directional) return text(x, 330, 'No d-scan', { size: 28, fill: '#6b7280' });
	const onGrid = directional.on_grid?.total_objects ?? 0;
	const offGrid = directional.off_grid?.total_objects ?? 0;
	const ships = summarizeShips(buildGroupStats(directional.on_grid, directional.off_grid));

	let bar = '';
	let offset = 0;
	for (const shipClass of ships.classes) {
		const segment = (shipClass.total / ships.total) * width;
		bar += `<rect x="${(x + offset).toFixed(1)}" y="372" width="${Math.max(segment - 2, 1).toFixed(1)}" height="22" fill="${CLASS_HEX[shipClass.color] ?? '#6b7280'}"/>`;
		offset += segment;
	}
	const top = [...ships.classes]
		.sort((a, b) => b.total - a.total)
		.slice(0, 4)
		.map((shipClass) => [shipClass.label, count(shipClass.total)]);

	return (
		text(x, 290, 'D-SCAN', { size: 22, weight: 700, fill: '#9ca3af' }) +
		text(x, 350, `${count(ships.total)} ships`, { size: 52, weight: 700 }) +
		(ships.total > 0
			? `<clipPath id="bar"><rect x="${x}" y="372" width="${width}" height="22" rx="6"/></clipPath><g clip-path="url(#bar)">${bar}</g>`
			: '') +
		text(x, 430, `${count(onGrid)} on grid · ${count(offGrid)} off grid`, {
			size: 26,
			fill: '#9ca3af'
		}) +
		list(x, 480, width, top.slice(0, 3))
	);
}

/**
 * @param {{
 *   system: { name?: string, constellation?: string, region?: string, security?: number } | null,
 *   createdAt: string | Date,
 *   local: any,
 *   directional: any
 * }} scan
 * @returns {string} SVG document
 */
export function buildScanOgSvg({ system, createdAt, local, directional }) {
	const band = systemSecurityBand(system?.security);
	const security = typeof system?.security === 'number' ? system.security.toFixed(2) : '?';
	const location = [system?.constellation, system?.region].filter(Boolean).join(' · ');

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#111827"/>
<rect x="0" y="0" width="${OG_WIDTH}" height="8" fill="#0ea5e9"/>
${text(60, 74, 'D-Scan Space!', { size: 28, weight: 700, fill: '#38bdf8' })}
${text(OG_WIDTH - 60, 74, `${formatUtcTimestamp(createdAt)} UTC`, { size: 26, fill: '#9ca3af', anchor: 'end' })}
<rect x="60" y="112" width="112" height="56" rx="10" fill="${band ? BAND_HEX[band] : '#7c3aed'}"/>
${text(116, 152, security, { size: 30, weight: 700, anchor: 'middle' })}
${text(196, 160, truncate(system?.name ?? 'Unknown system', 28), { size: 60, weight: 700 })}
${location ? text(60, 214, truncate(location, 60), { size: 28, fill: '#9ca3af' }) : ''}
<line x1="60" y1="244" x2="${OG_WIDTH - 60}" y2="244" stroke="#374151" stroke-width="2"/>
<line x1="${OG_WIDTH / 2}" y1="268" x2="${OG_WIDTH / 2}" y2="600" stroke="#374151" stroke-width="2"/>
${localColumn(60, OG_WIDTH / 2 - 120, local)}
${directionalColumn(OG_WIDTH / 2 + 60, OG_WIDTH / 2 - 120, directional)}
</svg>`;
}
