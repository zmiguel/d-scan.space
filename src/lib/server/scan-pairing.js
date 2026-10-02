/**
 * The other scan type shown next to a scan: the latest scan of the other type in the
 * same group that was taken before it (local + d-scan pairing on the scan page).
 * @param {Array<{ id: string, scan_type: string, created_at: string | Date }>} timeline
 * @param {{ id: string, scan_type: string, created_at: string | Date }} scan
 * @returns {{ id: string, scan_type: string, created_at: string | Date } | null}
 */
export function findPairedScan(timeline, scan) {
	const before = new Date(scan.created_at).getTime();
	let paired = null;
	for (const item of timeline) {
		if (item.id === scan.id || item.scan_type === scan.scan_type) continue;
		const time = new Date(item.created_at).getTime();
		if (time >= before) continue;
		if (!paired || time > new Date(paired.created_at).getTime()) paired = item;
	}
	return paired;
}
