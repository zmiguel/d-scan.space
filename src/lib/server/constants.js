import { env } from '$env/dynamic/private';
const pkg = require("../../../package.json")

export const DOOMHEIM_ID = 1000001;
export const USER_AGENT = `D-Scan.Space/${pkg.version} (${env.NODE_ENV ? '' : env.NODE_ENV + ";"}${env.AGENT ? '' : " " + env.AGENT})`
