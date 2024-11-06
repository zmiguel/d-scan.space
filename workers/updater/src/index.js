/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
	DB: D1Database;
	SCANS: KVNamespace;
	QUERIES: KVNamespace;
}

async function update_characters(env){
	await env.SCANS.

	console.log(`Updated ${env} Characters...`)
}

export default {
	async scheduled(event, env, ctx) {
		console.info('Updating Character Information...');
		await update_characters(env);
		console.info('Done...');
	}
};