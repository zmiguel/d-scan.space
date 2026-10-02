import yauzl from 'yauzl';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import logger from '../../../../src/lib/logger.js';

/** @returns {Promise<import('yauzl').ZipFile>} */
function openZip(zipPath) {
	return new Promise((resolve, reject) => {
		yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zip) =>
			err ? reject(err) : resolve(zip)
		);
	});
}

/**
 * Streams the requested files out of a zip archive into `destDir`, one entry at a time,
 * without loading the archive or an entry into memory (the SDE zip is ~100 MB).
 *
 * Entries are matched by base name and written as `destDir/<requested name>`: output
 * paths never come from the archive, so crafted entry names (`../x`, absolute paths)
 * cannot write outside `destDir` (zip-slip). yauzl additionally rejects such names.
 *
 * @param {string} zipPath
 * @param {string} destDir
 * @param {string[]} fileNames base names to extract, e.g. `types.jsonl`
 * @returns {Promise<{ extractedFiles: number, totalBytes: number }>}
 */
export async function extractZipEntries(zipPath, destDir, fileNames) {
	await fs.promises.mkdir(destDir, { recursive: true });
	const wanted = new Set(fileNames.map((name) => path.basename(name)));
	/** @type {Map<string, number>} */
	const extracted = new Map();

	const zip = await openZip(zipPath);
	try {
		await new Promise((resolve, reject) => {
			zip.on('error', reject);
			zip.on('end', resolve);
			zip.on('entry', (entry) => {
				const base = path.posix.basename(entry.fileName);
				if (entry.fileName.endsWith('/') || !wanted.has(base) || extracted.has(base)) {
					zip.readEntry();
					return;
				}
				zip.openReadStream(entry, (err, stream) => {
					if (err) {
						reject(err);
						return;
					}
					pipeline(stream, fs.createWriteStream(path.join(destDir, base))).then(() => {
						extracted.set(base, entry.uncompressedSize);
						logger.info(`[Extract] ${base}: ${entry.uncompressedSize} bytes`);
						zip.readEntry();
					}, reject);
				});
			});
			zip.readEntry();
		});
	} finally {
		zip.close();
	}

	const missing = [...wanted].filter((name) => !extracted.has(name));
	if (missing.length > 0) {
		throw new Error(`Files not found in zip: ${missing.join(', ')}`);
	}

	return {
		extractedFiles: extracted.size,
		totalBytes: [...extracted.values()].reduce((sum, size) => sum + size, 0)
	};
}
