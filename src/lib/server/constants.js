import { env } from '$env/dynamic/private';

export const DOOMHEIM_ID = 1000001;
export const USER_AGENT = `D-Scan.Space/${process.env.npm_package_version} (${env.NODE_ENV ? '' : env.NODE_ENV + ";"}${env.AGENT ? '' : " " + env.AGENT})`
