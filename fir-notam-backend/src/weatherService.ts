import fetch from 'node-fetch';

/**
 * Weather Service (Backend)
 * Fetches real-time METAR and TAF data from AviationWeather.gov
 */

const AVIATION_WEATHER_API = 'https://aviationweather.gov/api/data';

export async function fetchMetarFromProvider(icao: string) {
    try {
        const url = `${AVIATION_WEATHER_API}/metar?ids=${icao}&format=json`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`AviationWeather API error: ${resp.statusText}`);
        if (resp.status === 204) return null;
        
        const data = await resp.json();
        if (!data || data.length === 0) return null;

        const report = data[0];
        return {
            rawMetar: report.rawOb || report.metar || null,
            name: report.name || report.site || "",
            reportTime: report.reportTime || report.obsTime || null,
            temp: report.temp,
            dewp: report.dewp,
            wdir: report.wdir,
            wspd: report.wspd,
            visib: report.visib,
            altim: report.altim
        };
    } catch (error) {
        console.error(`[WEATHER] Error fetching METAR for ${icao}:`, error);
        throw error;
    }
}

export async function fetchTafFromProvider(icao: string) {
    try {
        const url = `${AVIATION_WEATHER_API}/taf?ids=${icao}&format=json`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`AviationWeather API error: ${resp.statusText}`);
        if (resp.status === 204) return null;

        const data = await resp.json();
        if (!data || data.length === 0) return null;

        const report = data[0];
        return {
            rawTAF: report.rawTAF || report.rawTaf || null,
            name: report.name || report.site || "",
            issueTime: report.issueTime || report.reportTime || null,
            validTimeFrom: report.validTimeFrom,
            validTimeTo: report.validTimeTo
        };
    } catch (error) {
        console.error(`[WEATHER] Error fetching TAF for ${icao}:`, error);
        throw error;
    }
}
