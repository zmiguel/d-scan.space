import { version } from "../../../package.json"
import { env } from '$env/dynamic/private';

export const DOOMHEIM_ID = 1000001;
export const USER_AGENT = `D-Scan.Space/${version} (${env.NODE_ENV + ";"}${env.AGENT})`
