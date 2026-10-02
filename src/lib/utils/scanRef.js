const ID = /^[A-Za-z0-9]{4,32}$/;

/**
 * What a user pasted to pick a scan: a scan link (`…/scan/<group>/<scan>`), a scan group link
 * (`…/scan/<group>`, what "Copy link" copies) or a bare scan id.
 * @param {string | null | undefined} input
 * @returns {{ scan: string } | { group: string } | null}
 */
export function parseScanReference(input) {
	const text = String(input ?? '').trim();
	if (!text) return null;
	if (ID.test(text)) return { scan: text };

	const match = text.match(/\/scan\/([^/?#\s]+)(?:\/([^/?#\s]+))?\/?(?:[?#]\S*)?$/);
	if (!match) return null;
	const [, group, scan] = match;
	if (scan) return ID.test(scan) ? { scan } : null;
	return ID.test(group) ? { group } : null;
}

/** Path of the compare page. */
export const comparePath = (beforeId, afterId) => `/compare/${beforeId}/${afterId}`;
