/**
 * HTTP Client bridge for Mangayomi extensions.
 * Wraps server-side fetch() to provide the Client API that extensions expect.
 *
 * Extension usage:
 *   const client = new Client();
 *   const res = await client.get(url, headers?);
 *   const res = await client.post(url, headers?, body?);
 *   res.body, res.statusCode, res.headers, res.isRedirect
 */

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 20_000;

interface BridgeResponse {
	body: string;
	statusCode: number;
	headers: Record<string, string>;
	isRedirect: boolean;
}

async function doRequest(
	method: string,
	url: string,
	headers?: Record<string, string>,
	body?: unknown,
): Promise<BridgeResponse> {
	const fetchHeaders: Record<string, string> = {
		'User-Agent': DEFAULT_UA,
		...headers,
	};

	const init: RequestInit = {
		method,
		headers: fetchHeaders,
		redirect: 'follow',
	};

	if (body !== undefined && body !== null) {
		if (typeof body === 'string') {
			init.body = body;
		} else if (typeof body === 'object') {
			// Could be FormData-like or JSON body
			const bodyObj = body as Record<string, unknown>;
			if (bodyObj.type === 'form') {
				const params = new URLSearchParams();
				const fields = bodyObj.fields as Record<string, string> | undefined;
				if (fields) {
					for (const [k, v] of Object.entries(fields)) {
						params.append(k, v);
					}
				}
				init.body = params.toString();
				fetchHeaders['Content-Type'] = fetchHeaders['Content-Type'] ?? 'application/x-www-form-urlencoded';
			} else {
				init.body = JSON.stringify(body);
				fetchHeaders['Content-Type'] = fetchHeaders['Content-Type'] ?? 'application/json';
			}
		}
	}

	init.signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
	const response = await fetch(url, init);
	const responseBody = await response.text();

	const responseHeaders: Record<string, string> = {};
	response.headers.forEach((value, key) => {
		responseHeaders[key] = value;
	});

	return {
		body: responseBody,
		statusCode: response.status,
		headers: responseHeaders,
		isRedirect: response.redirected,
	};
}

/** Create the Client class constructor for injection into the vm sandbox. */
export function createClientClass() {
	return class Client {
		async get(url: string, headers?: Record<string, string>): Promise<BridgeResponse> {
			return doRequest('GET', url, headers);
		}

		async post(url: string, headers?: Record<string, string>, body?: unknown): Promise<BridgeResponse> {
			return doRequest('POST', url, headers, body);
		}

		async put(url: string, headers?: Record<string, string>, body?: unknown): Promise<BridgeResponse> {
			return doRequest('PUT', url, headers, body);
		}

		async delete(url: string, headers?: Record<string, string>): Promise<BridgeResponse> {
			return doRequest('DELETE', url, headers);
		}

		async patch(url: string, headers?: Record<string, string>, body?: unknown): Promise<BridgeResponse> {
			return doRequest('PATCH', url, headers, body);
		}

		async head(url: string, headers?: Record<string, string>): Promise<BridgeResponse> {
			return doRequest('HEAD', url, headers);
		}
	};
}
