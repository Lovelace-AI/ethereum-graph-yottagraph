/**
 * Server-side Elemental API gateway helper.
 * Handles auth, URL construction, and safe int64 JSON parsing.
 */

import { safeJsonParse } from './safeJson';

function getGatewayConfig() {
    const { public: config } = useRuntimeConfig();
    const gatewayUrl = (config as any).gatewayUrl as string;
    const orgId = (config as any).tenantOrgId as string;
    const apiKey = (config as any).qsApiKey as string;
    return { gatewayUrl, orgId, apiKey };
}

function buildUrl(endpoint: string): string {
    const { gatewayUrl, orgId } = getGatewayConfig();
    return `${gatewayUrl}/api/qs/${orgId}/${endpoint.replace(/^\//, '')}`;
}

export async function gatewayFetchJson<T = any>(endpoint: string, init?: RequestInit): Promise<T> {
    const { apiKey } = getGatewayConfig();
    const url = buildUrl(endpoint);
    const res = await fetch(url, {
        ...init,
        headers: {
            'X-Api-Key': apiKey,
            'Content-Type': 'application/json',
            ...((init?.headers as Record<string, string>) || {}),
        },
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Gateway ${res.status}: ${body.slice(0, 200)}`);
    }
    const text = await res.text();
    return text ? safeJsonParse(text) : ({} as T);
}

export async function gatewayFetchForm<T = any>(
    endpoint: string,
    params: Record<string, string>
): Promise<T> {
    const { apiKey } = getGatewayConfig();
    const url = buildUrl(endpoint);
    const body = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'X-Api-Key': apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Gateway ${res.status}: ${text.slice(0, 200)}`);
    }
    const text = await res.text();
    return text ? safeJsonParse(text) : ({} as T);
}

/** Cached schema data */
let _schemaCache: { flavors: any[]; properties: any[] } | null = null;

export async function getSchema() {
    if (_schemaCache) return _schemaCache;
    const res = await gatewayFetchJson<any>('elemental/metadata/schema');
    const schema = res.schema ?? res;
    _schemaCache = {
        flavors: schema.flavors ?? [],
        properties: schema.properties ?? [],
    };
    return _schemaCache;
}

export async function getPidByName(name: string): Promise<string | null> {
    const schema = await getSchema();
    const prop = schema.properties.find((p: any) => p.name === name);
    return prop ? String(prop.pid) : null;
}

export async function getFidByName(name: string): Promise<string | null> {
    const schema = await getSchema();
    const flavor = schema.flavors.find((f: any) => f.name === name);
    return flavor ? String(flavor.fid ?? flavor.findex) : null;
}

export async function elementalFind(expression: string, limit = 50): Promise<string[]> {
    const res = await gatewayFetchForm<any>('elemental/find', {
        expression,
        limit: String(limit),
    });
    return res?.eids ?? [];
}

export async function elementalGetProperties(eids: string[], pids: string[]): Promise<any[]> {
    const res = await gatewayFetchForm<any>('elemental/entities/properties', {
        eids: JSON.stringify(eids),
        pids: `[${pids.join(',')}]`,
    });
    return res?.values ?? [];
}
