import { USER_AGENT } from './constants';

const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Accept-Language': 'en',
    'X-Compatibility-Date': '2025-07-01',
    'X-Tenant': 'tranquility',
    'User-Agent': USER_AGENT
};

export async function fetchGET(url) {
    const response = await fetch(url, {
        method: 'GET',
        headers: headers
    });
    return response;
}

export async function fetchPOST(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
    });
    return response;
}