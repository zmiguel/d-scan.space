import { USER_AGENT } from './constants';
import { withSpan } from './tracer.js';

const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Accept-Language': 'en',
    'X-Compatibility-Date': '2025-07-01',
    'X-Tenant': 'tranquility',
    'User-Agent': USER_AGENT
};

export async function fetchGET(url) {
    return await withSpan(`fetchGET`, async (span) => {
        const response = await fetch(url, {
            method: 'GET',
            headers: headers
        });

        const responseClone = response.clone();
        const fullResponse = await responseClone.json();

        span.setAttributes({
            'http.response': JSON.stringify({
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: fullResponse,
                url: response.url,
                redirected: response.redirected,
                type: response.type
            })
        });
        span.setStatus({ code: response.ok ? 0 : 1 });
        return response;
    }, {
        'http.method': 'GET',
        'http.url': url,
        'http.request.headers': JSON.stringify(headers)
    });
}

export async function fetchPOST(url, body) {
    return await withSpan(`fetchPOST`, async (span) => {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        const responseClone = response.clone();
        const fullResponse = await responseClone.json();

        span.setAttributes({
            'http.response': JSON.stringify({
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: fullResponse,
                url: response.url,
                redirected: response.redirected,
                type: response.type
            })
        });
        span.setStatus({ code: response.ok ? 0 : 1 });
        return response;
    }, {
        'http.method': 'POST',
        'http.url': url,
        'http.request.headers': JSON.stringify(headers),
        'http.request.body': JSON.stringify(body)
    });
}
