import { json } from '@sveltejs/kit';
import { pool } from '$lib/database/client';
import logger from '$lib/logger';

const DB_TIMEOUT_MS = 2000;
const HEADERS = { 'Cache-Control': 'no-store' };

/**
 * Liveness/readiness probe: 200 when the database answers `SELECT 1`.
 * Migrations run in the `init` hook before the server listens, so 200 also means the
 * schema is migrated. Deliberately cheap: no ESI calls, no auth.
 */
export async function GET() {
	let timer;
	try {
		const timeout = new Promise((_, reject) => {
			timer = setTimeout(
				() => reject(new Error(`Database check timed out after ${DB_TIMEOUT_MS} ms`)),
				DB_TIMEOUT_MS
			);
		});
		await Promise.race([pool.query('SELECT 1'), timeout]);
		return json({ status: 'ok' }, { headers: HEADERS });
	} catch (err) {
		logger.warn({ err }, 'Health check failed: database unavailable');
		return json({ status: 'error' }, { status: 503, headers: HEADERS });
	} finally {
		clearTimeout(timer);
	}
}
