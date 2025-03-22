import { gzipSync, gunzipSync } from 'zlib';

/**
 * Compresses a JSON object to a gzipped ArrayBuffer
 * @param {object} jsonData - The JSON object to compress
 * @return {ArrayBuffer} - The compressed data as an ArrayBuffer
 */
export async function compressJson(jsonData) {
	// Convert JSON to string
	const jsonString = JSON.stringify(jsonData);

	// Compress the string using gzip
	const compressedBuffer = gzipSync(jsonString);

	// Convert Buffer to ArrayBuffer
	return compressedBuffer.buffer.slice(
		compressedBuffer.byteOffset,
		compressedBuffer.byteOffset + compressedBuffer.length
	);
}

/**
 * Decompresses a gzipped ArrayBuffer back to a JSON object
 * @param {ArrayBuffer} compressedData - The compressed data as an ArrayBuffer
 * @return {object} - The decompressed JSON object
 */
export async function decompressJson(compressedData) {
	// Convert ArrayBuffer to Buffer
	const buffer = Buffer.from(new Uint8Array(compressedData));

	// Decompress the buffer to string
	const jsonString = gunzipSync(buffer).toString('utf-8');

	// Parse JSON string back to object
	return JSON.parse(jsonString);
}