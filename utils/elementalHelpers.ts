/**
 * Helper utilities for Elemental API / Query Server access.
 *
 * Centralizes gateway URL construction, API key retrieval, NEID
 * formatting, and safe-fetch (preserving int64 FIDs/PIDs) so these
 * don't need to be re-derived in every composable.
 */

import { safeJsonParse } from '~/utils/safeJson';

/**
 * Build a full gateway URL for a Query Server endpoint.
 *
 * @example buildGatewayUrl('entities/search')
 *          → "https://…/api/qs/org_abc123/entities/search"
 */
export function buildGatewayUrl(endpoint: string): string {
    const config = useRuntimeConfig();
    const gw = (config.public as any).gatewayUrl as string;
    const org = (config.public as any).tenantOrgId as string;
    if (!gw || !org) {
        console.warn('[elementalHelpers] gatewayUrl or tenantOrgId not configured');
    }
    const base = `${gw}/api/qs/${org}`;
    return endpoint ? `${base}/${endpoint.replace(/^\//, '')}` : base;
}

/**
 * Return the Query Server API key from runtime config.
 */
export function getApiKey(): string {
    return (useRuntimeConfig().public as any).qsApiKey as string;
}

/**
 * Standard headers for gateway requests.
 */
export function gatewayHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
        'X-Api-Key': getApiKey(),
        'Content-Type': 'application/json',
        ...extra,
    };
}

/**
 * Fetch JSON from the gateway with int64-safe parsing.
 *
 * Nuxt's $fetch uses native JSON.parse internally which silently rounds
 * integers exceeding Number.MAX_SAFE_INTEGER. This wrapper reads the
 * response as text first, then parses with safeJsonParse.
 */
export async function gatewayFetch<T = any>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...options,
        headers: {
            'X-Api-Key': getApiKey(),
            'Content-Type': 'application/json',
            ...((options?.headers as Record<string, string>) || {}),
        },
    });
    if (!res.ok) {
        throw new Error(`Gateway request failed: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    return text ? safeJsonParse(text) : ({} as T);
}

/**
 * Zero-pad a numeric entity ID to a 20-character NEID string.
 *
 * Relationship properties (`data_nindex`) return raw numeric IDs that are
 * often 19 characters. They must be padded to 20 to form valid NEIDs.
 */
export function padNeid(value: string | number): string {
    return String(value).padStart(20, '0');
}

/**
 * Batch-search entities by name via `POST /entities/search`.
 *
 * This endpoint is not wrapped by the generated `useElementalClient()`,
 * so we call it directly via fetch with safe JSON parsing.
 */
export async function searchEntities(
    query: string,
    options?: { maxResults?: number; flavors?: string[]; includeNames?: boolean }
): Promise<{ neid: string; name: string; score?: number }[]> {
    const url = buildGatewayUrl('entities/search');
    const queryObj: Record<string, any> = { queryId: 1, query };
    if (options?.flavors?.length) queryObj.flavors = options.flavors;

    const res = await gatewayFetch<any>(url, {
        method: 'POST',
        body: JSON.stringify({
            queries: [queryObj],
            maxResults: options?.maxResults ?? 10,
            includeNames: options?.includeNames ?? true,
        }),
    });
    const matches: any[] = res?.results?.[0]?.matches ?? [];
    return matches.map((m) => ({
        neid: m.neid,
        name: m.name || m.neid,
        score: m.score,
    }));
}

/**
 * Get the display name for an entity by NEID.
 *
 * Calls `GET /entities/{neid}/name` (not on the generated client).
 */
export async function getEntityName(neid: string): Promise<string> {
    const url = buildGatewayUrl(`entities/${neid}/name`);
    const res = await gatewayFetch<{ name: string }>(url);
    return res.name || neid;
}

/**
 * Build a form-encoded body for /elemental/find and /elemental/entities/properties.
 *
 * FIDs and PIDs are int64 values that exceed MAX_SAFE_INTEGER. Passing them
 * through JSON.stringify(number) would round them. Instead, expression JSON
 * is built by string interpolation so the raw digit string is preserved
 * in the URL-encoded form body.
 */
export function buildFormBody(params: Record<string, string>): string {
    return Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
}

/**
 * Call POST /elemental/find with a raw expression string.
 *
 * The expression should be built with string-interpolated FIDs/PIDs to
 * avoid JavaScript number rounding. Returns an array of NEID strings.
 *
 * @example
 *   const eids = await elementalFind(
 *     `{"type":"is_type","is_type":{"fid":${fid}}}`,
 *     10
 *   );
 */
export async function elementalFind(expression: string, limit = 50): Promise<string[]> {
    const url = buildGatewayUrl('elemental/find');
    const body = buildFormBody({ expression, limit: String(limit) });
    const res = await gatewayFetch<any>(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
    });
    return res?.eids ?? [];
}

/**
 * Call POST /elemental/entities/properties with safe int64 handling.
 *
 * @param eids - Array of 20-char NEID strings.
 * @param pids - Array of PID strings (string to preserve int64 precision).
 */
export async function elementalGetProperties(eids: string[], pids: string[]): Promise<any> {
    const url = buildGatewayUrl('elemental/entities/properties');
    const body = buildFormBody({
        eids: JSON.stringify(eids),
        pids: `[${pids.join(',')}]`,
    });
    return gatewayFetch<any>(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
    });
}
