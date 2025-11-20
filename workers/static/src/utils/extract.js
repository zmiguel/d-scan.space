import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import logger from '../../../../src/lib/logger.js';

export async function extractZipNonBlocking(zipPath, tempDir, files = []) {
	logger.info(`[ExtractWorker] Starting extraction from ${zipPath} to ${tempDir}`);

	// Ensure temp directory exists
	if (!fs.existsSync(tempDir)) {
		fs.mkdirSync(tempDir, { recursive: true });
	}

	const zip = new AdmZip(zipPath);
	const zipEntries = zip.getEntries();

	if (files.length === 0) {
		// Extract all files
		let extractedCount = 0;
		let failedCount = 0;
		const totalEntries = zipEntries.filter((entry) => !entry.isDirectory).length;

		for (const entry of zipEntries) {
			if (!entry.isDirectory) {
				try {
					const outputPath = path.join(tempDir, entry.entryName);
					const outputDir = path.dirname(outputPath);

					// Ensure output directory exists
					if (!fs.existsSync(outputDir)) {
						fs.mkdirSync(outputDir, { recursive: true });
					}

					// Extract the file content and write it manually for better control
					const fileData = zip.readFile(entry);
					if (fileData) {
						fs.writeFileSync(outputPath, fileData);
						extractedCount++;
					} else {
						failedCount++;
					}

					// Yield control every 10 files
					if (extractedCount % 10 === 0) {
						await new Promise((resolve) => setImmediate(resolve));
					}
				} catch {
					failedCount++;
				}
			}
		}

		logger.info(
			`[ExtractWorker] Extraction complete: ${extractedCount}/${totalEntries} files extracted, ${failedCount} failed`
		);

		return {
			extractedFiles: extractedCount,
			totalFiles: totalEntries,
			failedFiles: failedCount,
			requestedFiles: files.length,
			method: 'admzip'
		};
	} else {
		// Extract specific files
		let extractedCount = 0;

		for (const fileName of files) {
			const normalizedFileName = fileName.replace(/\\/g, '/');
			const entry = zip.getEntry(normalizedFileName);

			if (!entry) {
				throw new Error(`File not found in zip: ${fileName}`);
			}

			try {
				const outputPath = path.join(tempDir, entry.entryName);
				const outputDir = path.dirname(outputPath);

				// Ensure output directory exists
				if (!fs.existsSync(outputDir)) {
					fs.mkdirSync(outputDir, { recursive: true });
				}

				// Extract the file content and write it manually for better control
				const fileData = zip.readFile(entry);
				if (fileData) {
					fs.writeFileSync(outputPath, fileData);
					extractedCount++;
				} else {
					throw new Error(`Failed to read file data for: ${fileName}`);
				}

				// Yield control after each file
				await new Promise((resolve) => setImmediate(resolve));
			} catch (error) {
				logger.error(`[ExtractWorker] Failed to extract ${fileName}: ${error.message}`);
				throw error;
			}
		}
		return {
			extractedFiles: extractedCount,
			requestedFiles: files.length,
			method: 'admzip'
		};
	}
}
