/**
 * Rasterizes preview SVGs with resvg (WASM build: no native binary in the Docker image).
 * The WASM module and the bundled Inter fonts (latin, latin-ext, cyrillic) load once.
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { read } from '$app/server';
import latin400 from '$lib/assets/fonts/inter-latin-400.ttf';
import latin700 from '$lib/assets/fonts/inter-latin-700.ttf';
import latinExt400 from '$lib/assets/fonts/inter-latin-ext-400.ttf';
import latinExt700 from '$lib/assets/fonts/inter-latin-ext-700.ttf';
import cyrillic400 from '$lib/assets/fonts/inter-cyrillic-400.ttf';
import cyrillic700 from '$lib/assets/fonts/inter-cyrillic-700.ttf';
import { OG_WIDTH } from './og-image.js';

const FONT_ASSETS = [latin400, latin700, latinExt400, latinExt700, cyrillic400, cyrillic700];

/** @type {Promise<Uint8Array[]> | null} */
let setup = null;

function loadRenderer() {
	setup ??= (async () => {
		const wasm = createRequire(import.meta.url).resolve('@resvg/resvg-wasm/index_bg.wasm');
		await initWasm(readFile(wasm));
		return Promise.all(
			FONT_ASSETS.map(async (asset) => new Uint8Array(await read(asset).arrayBuffer()))
		);
	})();
	// A failed setup (e.g. missing file) is retried on the next request.
	setup.catch(() => (setup = null));
	return setup;
}

/** @param {string} svg @returns {Promise<Uint8Array>} PNG bytes */
export async function renderPng(svg) {
	const fontBuffers = await loadRenderer();
	const resvg = new Resvg(svg, {
		fitTo: { mode: 'width', value: OG_WIDTH },
		font: { fontBuffers, defaultFontFamily: 'Inter', loadSystemFonts: false }
	});
	return resvg.render().asPng();
}
