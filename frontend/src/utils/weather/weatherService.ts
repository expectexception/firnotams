/**
 * Weather Service
 * Fetches live TAF/METAR data from backend proxy
 */

const BASE_URL = 'http://localhost:3001';

export function detectAssociation(stationId: string): 'FAA' | 'EASA' {
    if (!stationId) return 'EASA';
    const id = stationId.trim().toUpperCase();
    if (id.startsWith('K')) return 'FAA';
    if (/^P[AFGHIJKLMNOPRSTW]/.test(id)) return 'FAA';
    return 'EASA';
}

export async function fetchTAF(icao: string) {
    if (!icao || icao.length < 3) throw new Error("Invalid ICAO code");

    try {
        const response = await fetch(`${BASE_URL}/api/taf/${icao}`);
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server Error: ${response.statusText}`);
        }
        const data = await response.json();
        const rawTAF = data.rawTAF || data.rawTaf || data.rawTa;
        return { 
            rawTAF, 
            stationName: data.name || "", 
            issueTime: data.issueTime || data.reportTime || null 
        };
    } catch (error) {
        console.error("Fetch TAF Failed:", error);
        throw error;
    }
}

export async function fetchMETAR(icao: string) {
    if (!icao || icao.length < 3) throw new Error("Invalid ICAO code");

    try {
        const response = await fetch(`${BASE_URL}/api/metar/${icao}`);
        if (!response.ok) {
            if (response.status === 404) return null;
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server Error: ${response.statusText}`);
        }
        const data = await response.json();
        const rawMetar = data.rawOb || data.rawMetar || (typeof data === 'string' ? data : null);
        if (!rawMetar) return null;

        return {
            rawMetar,
            name: data.name || "",
            reportTime: data.reportTime || data.obsTime || null
        };
    } catch (error) {
        console.error("Fetch METAR Failed:", error);
        return null;
    }
}

export async function fetchATIS(icao: string) {
    if (!icao || icao.length < 3) throw new Error("Invalid ICAO code");
    const response = await fetch(`${BASE_URL}/api/atis/${icao}?llm=true`);
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server Error: ${response.statusText}`);
    }
    return await response.json();
}
