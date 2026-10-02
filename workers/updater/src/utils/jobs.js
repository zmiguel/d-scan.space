/**
 * Runs scheduled updater jobs safely:
 * - one run of a job at a time across all updater processes (Postgres session advisory
 *   lock per job name, held on a dedicated connection; released automatically if the
 *   process dies),
 * - errors are logged and recorded instead of crashing the process,
 * - running jobs are tracked so shutdown can wait for them.
 * Overlap within one process is prevented by croner's `protect` option (index.js).
 */
import { pool } from '../../../../src/lib/database/client.js';
import logger from '../../../../src/lib/logger.js';
import { writeFile } from 'node:fs/promises';
import { config } from '../config.js';

/**
 * Records "this process and its DB are healthy" for the Docker healthcheck
 * (src/healthcheck.js). Never throws.
 */
export async function writeHeartbeat() {
	try {
		await writeFile(config.HEALTHCHECK_FILE, new Date().toISOString());
	} catch (err) {
		logger.error({ err, file: config.HEALTHCHECK_FILE }, 'Failed to write heartbeat file');
	}
}

const LOCK_PREFIX = 'd-scan.space/updater/';

/**
 * Runs `fn` while holding the advisory lock for `name`.
 * @template T
 * @param {string} name
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ skipped: true } | { skipped: false, result: T }>}
 */
export async function withJobLock(name, fn) {
	const client = await pool.connect();
	const key = LOCK_PREFIX + name;
	try {
		const { rows } = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [
			key
		]);
		if (!rows[0]?.locked) {
			return { skipped: true };
		}
		try {
			return { skipped: false, result: await fn() };
		} finally {
			await client
				.query('SELECT pg_advisory_unlock(hashtext($1))', [key])
				.catch((err) => logger.warn({ err, job: name }, 'Failed to release job lock'));
		}
	} finally {
		client.release();
	}
}

export function createJobRunner() {
	/** @type {Set<Promise<void>>} */
	const running = new Set();

	return {
		/**
		 * Runs a job under its lock. Never throws (it is called from cron callbacks).
		 * @param {string} name
		 * @param {() => Promise<unknown>} fn
		 */
		run(name, fn) {
			const task = (async () => {
				const started = Date.now();
				try {
					const outcome = await withJobLock(name, fn);
					if (outcome.skipped) {
						logger.warn({ job: name }, 'Job skipped: already running in another updater');
					} else {
						logger.info({ job: name, durationMs: Date.now() - started }, 'Job finished');
					}
					// Skipped runs count too: the lock query proved the DB is reachable.
					await writeHeartbeat();
				} catch (err) {
					logger.error({ err, job: name, durationMs: Date.now() - started }, 'Job failed');
				}
			})();
			running.add(task);
			task.finally(() => running.delete(task));
			return task;
		},

		/** Number of jobs currently running in this process. */
		get active() {
			return running.size;
		},

		/**
		 * Waits for running jobs, at most `timeoutMs`.
		 * @param {number} timeoutMs
		 * @returns {Promise<boolean>} true when all jobs finished in time
		 */
		async drain(timeoutMs) {
			if (running.size === 0) return true;
			let timer;
			const timedOut = new Promise((resolve) => {
				timer = setTimeout(() => resolve(false), timeoutMs);
			});
			const finished = Promise.allSettled([...running]).then(() => true);
			const result = await Promise.race([finished, timedOut]);
			clearTimeout(timer);
			return result;
		}
	};
}
