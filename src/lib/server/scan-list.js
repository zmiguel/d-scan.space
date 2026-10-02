/**
 * URL contract shared by the public (/scans) and personal (/my-scans) scan lists:
 * `?page=<n>&q=<system name substring>&type=local|directional`.
 */

const MAX_QUERY_LENGTH = 100;

/**
 * @param {URL} url
 * @returns {{ page: number, query: string, type: '' | 'local' | 'directional' }}
 */
export function parseScanListParams(url) {
	const rawPage = Number.parseInt(url.searchParams.get('page') ?? '', 10);
	const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH);
	const rawType = url.searchParams.get('type');
	const type = rawType === 'local' || rawType === 'directional' ? rawType : '';
	return { page, query, type };
}

/**
 * Page data returned by both list loads.
 * @param {{ rows: any[], total: number, page: number, pageSize: number }} result
 * @param {{ query: string, type: string }} filters
 */
export function toScanListData({ rows, total, page, pageSize }, { query, type }) {
	return {
		scans: rows,
		total,
		page,
		pageSize,
		pageCount: Math.max(1, Math.ceil(total / pageSize)),
		query,
		type
	};
}
