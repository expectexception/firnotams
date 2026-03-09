import { BulkNotamResponse, BulkFirResponse, ConfigResponse } from '../types';

const API_BASE = import.meta.env.PROD 
    ? 'https://firnotams.onrender.com/api' 
    : '/api';

async function handleFetchError(res: Response): Promise<never> {
    let msg = "An unexpected error occurred.";
    if (res.status === 404) msg = "The requested information could not be found.";
    else if (res.status >= 500) msg = "Problem with the NOTAM service. Please try again later.";
    
    try {
        const errBody = await res.json();
        if (errBody.error && !/port|connect|econn|timeout|sql|socket/i.test(errBody.error)) {
            msg = errBody.error;
        }
    } catch (e) { /* ignore */ }
    
    throw new Error(msg);
}

export async function fetchBulkNotams(icaos: string[], forceRefresh = false): Promise<BulkNotamResponse> {
    let url = `${API_BASE}/notams/bulk?locations=${icaos.join(',')}`;
    if (forceRefresh) url += '&forceRefresh=true';
    try {
        const res = await fetch(url);
        if (!res.ok) await handleFetchError(res);
        return res.json() as Promise<BulkNotamResponse>;
    } catch (err: any) {
        if (err.message === 'Failed to fetch') throw new Error("Unable to connect to the NOTAM service.");
        throw err;
    }
}

export async function fetchBulkFirs(firIcaos: string[]): Promise<BulkFirResponse> {
    const url = `${API_BASE}/firs/bulk?locations=${firIcaos.join(',')}`;
    try {
        const res = await fetch(url);
        if (!res.ok) await handleFetchError(res);
        return res.json() as Promise<BulkFirResponse>;
    } catch (err: any) {
        if (err.message === 'Failed to fetch') throw new Error("Unable to connect to the NOTAM service.");
        throw err;
    }
}

export async function fetchSyncStatus(): Promise<unknown> {
    try {
        const res = await fetch(`${API_BASE}/sync/status`);
        if (!res.ok) await handleFetchError(res);
        return res.json();
    } catch (err: any) {
        if (err.message === 'Failed to fetch') throw new Error("Unable to connect to the NOTAM service.");
        throw err;
    }
}

export async function fetchCacheBulk(icaos: string[]): Promise<unknown> {
    const url = `${API_BASE}/notams/cache/bulk?locations=${icaos.join(',')}`;
    try {
        const res = await fetch(url);
        if (!res.ok) await handleFetchError(res);
        return res.json();
    } catch (err: any) {
        if (err.message === 'Failed to fetch') throw new Error("Unable to connect to the NOTAM service.");
        throw err;
    }
}

export async function fetchConfig(): Promise<ConfigResponse> {
    try {
        const res = await fetch(`${API_BASE}/config`);
        if (!res.ok) throw new Error("Unable to load system configuration.");
        return res.json();
    } catch (err: any) {
        if (err.message === 'Failed to fetch') throw new Error("Unable to connect to the NOTAM service.");
        throw err;
    }
}
