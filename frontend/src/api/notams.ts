import { BulkNotamResponse, BulkFirResponse, ConfigResponse } from '../types';

const API_BASE = import.meta.env.PROD 
    ? 'https://firnotams.onrender.com/api' 
    : '/api';

export async function fetchBulkNotams(icaos: string[], forceRefresh = false): Promise<BulkNotamResponse> {
    let url = `${API_BASE}/notams/bulk?locations=${icaos.join(',')}`;
    if (forceRefresh) url += '&forceRefresh=true';
    const res = await fetch(url);
    if (!res.ok) {
        let msg = `Request failed with ${res.status}`;
        try {
            const errBody = await res.json();
            if (errBody.error) msg = errBody.error;
        } catch (e) { /* ignore */ }
        throw new Error(msg);
    }
    return res.json() as Promise<BulkNotamResponse>;
}

export async function fetchBulkFirs(firIcaos: string[]): Promise<BulkFirResponse> {
    const url = `${API_BASE}/firs/bulk?locations=${firIcaos.join(',')}`;
    const res = await fetch(url);
    if (!res.ok) {
        let msg = `Request failed with ${res.status}`;
        try {
            const errBody = await res.json();
            if (errBody.error) msg = errBody.error;
        } catch (e) { /* ignore */ }
        throw new Error(msg);
    }
    return res.json() as Promise<BulkFirResponse>;
}

export async function fetchSyncStatus(): Promise<unknown> {
    const res = await fetch(`${API_BASE}/sync/status`);
    if (!res.ok) {
        throw new Error(`Failed to fetch sync status: ${res.status} ${res.statusText}`);
    }
    return res.json();
}

export async function fetchCacheBulk(icaos: string[]): Promise<unknown> {
    const url = `${API_BASE}/notams/cache/bulk?locations=${icaos.join(',')}`;
    const res = await fetch(url);
    if (!res.ok) {
        let msg = `Request failed with ${res.status}`;
        try {
            const errBody = await res.json();
            if (errBody.error) msg = errBody.error;
        } catch (e) { /* ignore */ }
        throw new Error(msg);
    }
    return res.json();
}

export async function fetchConfig(): Promise<ConfigResponse> {
    const res = await fetch(`${API_BASE}/config`);
    if (!res.ok) {
        throw new Error(`Failed to fetch system config: ${res.status} ${res.statusText}`);
    }
    return res.json();
}
