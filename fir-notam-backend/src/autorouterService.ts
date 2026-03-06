import fetch from 'node-fetch';
import { NotamItem, NotamStatus } from './types';
import { classify, extractNotamAnalysis } from './notamClassifier';

export interface AutorouterNotam {
    id: number;
    code23: string;
    code45: string;
    endvalidity: number;
    estimation: string | null;
    fir: string;
    itema: string[];
    itemd: string | null;
    iteme: string;
    itemf: string | null;
    itemg: string | null;
    lat: number;
    lon: number;
    lower: number;
    modified: number;
    nelat: number;
    nelon: number;
    nof: string;
    number: number;
    purpose: string;
    radius: number;
    referrednumber: number;
    referredseries: string;
    referredyear: number;
    scope: string;
    series: string;
    startvalidity: number;
    suppressed: boolean;
    swlat: number;
    swlon: number;
    traffic: string;
    type: string;
    upper: number;
    year: number;
}

export interface AutorouterResponse {
    total: number;
    rows: AutorouterNotam[];
}

function parseAutorouterTime(seconds: number): string {
    const d = new Date(seconds * 1000);
    const yr = String(d.getUTCFullYear()).slice(-2);
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const da = String(d.getUTCDate()).padStart(2, '0');
    const hr = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    return `${yr}${mo}${da}${hr}${mi}`;
}

/**
 * Convert Autorouter's Garmin-format integer lat/lon to decimal degrees.
 * Garmin format: degrees = garminValue * 90 / (1 << 30)
 */
function garminToDegrees(garmin: number): number {
    return garmin * 90.0 / 1073741824;
}

/**
 * Format coordinates for the ICAO NOTAM Q-line.
 * Output: DDMMN/DDDMME/RRR  (e.g., 4840N00912E005)
 */
function formatQCoords(garminLat: number, garminLon: number, radius: number): string {
    const lat = garminToDegrees(garminLat);
    const lon = garminToDegrees(garminLon);

    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';

    const absLat = Math.abs(lat);
    const absLon = Math.abs(lon);

    const latDeg = Math.floor(absLat);
    const latMin = Math.round((absLat - latDeg) * 60);

    const lonDeg = Math.floor(absLon);
    const lonMin = Math.round((absLon - lonDeg) * 60);

    const latStr = String(latDeg).padStart(2, '0') + String(latMin).padStart(2, '0') + latDir;
    const lonStr = String(lonDeg).padStart(3, '0') + String(lonMin).padStart(2, '0') + lonDir;
    const radStr = String(Math.min(radius, 999)).padStart(3, '0');

    return `${latStr}${lonStr}${radStr}`;
}

export function mapAutorouterToNotamItem(arNotam: AutorouterNotam, targetIcao: string): NotamItem {
    // Reconstruct standard ICAO NOTAM text so both backend (extractNotamAnalysis, classify)
    // and frontend (parseQField, parseFirNotam) can parse it identically to scraper output.
    //
    // Critical: The Q-line MUST include the 'Q' prefix before the 4-char code.
    //   CORRECT:   Q) EDGG/QFALT/IV/NBO/A/000/999/4840N00912E005
    //   WRONG:     Q) EDGG/FALT/IV/NBO/A/000/999   (missing Q prefix → frontend "?" icon)

    // Format the NOTAM ID (e.g., P0825/17)
    const series = arNotam.series || '';
    const num = String(arNotam.number).padStart(4, '0');
    const yr = String(arNotam.year).padStart(2, '0');
    const notamId = `${series}${num}/${yr}`;

    let notamTypeStr = 'NOTAMN';
    if (arNotam.type === 'R') notamTypeStr = 'NOTAMR';
    else if (arNotam.type === 'C') notamTypeStr = 'NOTAMC';

    // For NOTAMR/NOTAMC, include the referenced NOTAM ID
    let refStr = '';
    if ((arNotam.type === 'R' || arNotam.type === 'C') && arNotam.referredseries && arNotam.referrednumber) {
        const refNum = String(arNotam.referrednumber).padStart(4, '0');
        const refYr = String(arNotam.referredyear).padStart(2, '0');
        refStr = ` ${arNotam.referredseries}${refNum}/${refYr}`;
    }

    // Build the Q-line with the MANDATORY 'Q' prefix before the 4-char code
    // Format: FIR/Q<code23><code45>/TRAFFIC/PURPOSE/SCOPE/LOWER/UPPER/COORDS
    const code4 = `${arNotam.code23 || 'XX'}${arNotam.code45 || 'XX'}`;
    const traffic = (arNotam.traffic || 'IV').trim();
    const purpose = (arNotam.purpose || 'NBO').trim();
    const scope = (arNotam.scope || 'A').trim();
    const lower = String(arNotam.lower ?? 0).padStart(3, '0');
    const upper = String(arNotam.upper ?? 999).padStart(3, '0');
    const coords = (arNotam.lat && arNotam.lon) ? formatQCoords(arNotam.lat, arNotam.lon, arNotam.radius || 0) : '';

    const qLine = `${arNotam.fir}/Q${code4}/${traffic}/${purpose}/${scope}/${lower}/${upper}${coords ? '/' + coords : ''}`;

    // A) Field — join multiple ICAOs
    const aField = arNotam.itema.join(' ');

    // B) Field (YYMMDDHHMM)
    const bField = parseAutorouterTime(arNotam.startvalidity);

    // C) Field
    const cField = arNotam.endvalidity === 4294967295 ? 'PERM' : parseAutorouterTime(arNotam.endvalidity);
    const estStr = arNotam.estimation ? ' EST' : '';

    // E) Field
    const eField = arNotam.iteme || '';

    // Construct full ICAO-format text
    let text = `${notamId} ${notamTypeStr}${refStr}\nQ) ${qLine}\nA) ${aField}\nB) ${bField}\nC) ${cField}${estStr}\n`;
    if (arNotam.itemd) text += `D) ${arNotam.itemd}\n`;
    text += `E) ${eField}\n`;
    if (arNotam.itemf) text += `F) ${arNotam.itemf}\n`;
    if (arNotam.itemg) text += `G) ${arNotam.itemg}\n`;

    // Classify and analyse immediately — same as scraper path (notamService.ts:1240-1242)
    // This ensures API NOTAMs arrive with identical fields to scraped NOTAMs.
    const classification = classify(text);
    const analysis = extractNotamAnalysis(text);

    return {
        id: notamId,
        text,
        status: classification.status,
        hasEscat: classification.hasEscat,
        hasInterference: classification.hasInterference,
        analysis,
    };
}

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

async function getAutorouterToken(): Promise<string | null> {
    if (cachedToken && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }

    const baseUrl = process.env.AUTOROUTER_API_BASE_URL || 'https://api.autorouter.aero/v1.0';
    const email = process.env.AUTOROUTER_EMAIL;
    const password = process.env.AUTOROUTER_PASSWORD;

    if (!email || !password) {
        console.error('[AUTOROUTER] Missing AUTOROUTER_EMAIL or AUTOROUTER_PASSWORD in environment variables.');
        return null;
    }

    try {
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: email,
            client_secret: password,
        });

        const resp = await fetch(`${baseUrl}/oauth2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });

        if (!resp.ok) {
            console.error(`[AUTOROUTER] Auth failed: ${resp.status} ${resp.statusText}`);
            return null;
        }

        const data = await resp.json() as any;
        if (data.access_token) {
            cachedToken = data.access_token;
            const expiresIn = parseInt(data.expires_in, 10) || 3600;
            // Expire 5 minutes early
            tokenExpiresAt = Date.now() + (expiresIn - 300) * 1000;
            return cachedToken;
        }
    } catch (err) {
        console.error(`[AUTOROUTER] Auth error:`, err);
    }
    return null;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchAutorouterNotams(icaos: string[]): Promise<Record<string, NotamItem[]>> {
    const baseUrl = process.env.AUTOROUTER_API_BASE_URL || 'https://api.autorouter.aero/v1.0';
    if (!icaos || icaos.length === 0) return {};

    const token = await getAutorouterToken();
    if (!token) return {};

    const results: Record<string, NotamItem[]> = {};
    const ICAO_CHUNK_SIZE = 5; // Process in small groups of ICAOs
    const PAGE_LIMIT = 100;
    const PROACTIVE_DELAY_MS = 1000; // 1 second between chunks to be safe

    // Split ICAOs into chunks
    for (let i = 0; i < icaos.length; i += ICAO_CHUNK_SIZE) {
        const chunk = icaos.slice(i, i + ICAO_CHUNK_SIZE);
        const itemas = JSON.stringify(chunk);
        let offset = 0;
        const headers = { 'Authorization': `Bearer ${token}` };

        console.log(`[AUTOROUTER] Processing chunk ${i / ICAO_CHUNK_SIZE + 1}: [${chunk.join(', ')}]`);

        try {
            while (true) {
                const url = `${baseUrl}/notam?itemas=${encodeURIComponent(itemas)}&offset=${offset}&limit=${PAGE_LIMIT}`;
                console.log(`[AUTOROUTER] Requesting offset=${offset}, limit=${PAGE_LIMIT}`);

                let response = await fetch(url, { headers });

                // Retry logic for 429/5xx
                let attempts = 0;
                const maxAttempts = 3;
                while ((response.status === 429 || response.status >= 500) && attempts < maxAttempts) {
                    attempts++;
                    const delay = response.status === 429 ? 10000 : 2000;
                    console.warn(`[AUTOROUTER] API status ${response.status}. Retrying in ${delay}ms... (Attempt ${attempts}/${maxAttempts})`);
                    await wait(delay * attempts);
                    response = await fetch(url, { headers });
                }

                if (!response.ok) {
                    console.error(`[AUTOROUTER] API error after retries: ${response.status} ${response.statusText}`);
                    break;
                }

                const data = await response.json() as AutorouterResponse;
                if (!data.rows || data.rows.length === 0) break;

                // Process rows
                for (const arNotam of data.rows) {
                    const item = mapAutorouterToNotamItem(arNotam, '');
                    for (const loc of arNotam.itema) {
                        if (chunk.includes(loc)) { // Only add if it was in our requested chunk
                            if (!results[loc]) results[loc] = [];
                            results[loc].push({ ...item });
                        }
                    }
                }

                if (data.rows.length < PAGE_LIMIT) break;
                offset += PAGE_LIMIT;

                // Brief pause between pages
                await wait(200);
            }
        } catch (err) {
            console.error(`[AUTOROUTER] Chunk processing failed:`, err);
        }

        // Proactive wait between ICAO chunks
        if (i + ICAO_CHUNK_SIZE < icaos.length) {
            await wait(PROACTIVE_DELAY_MS);
        }
    }

    // Deduplicate NOTAMs per location (sometimes the API might return duplicates across pages or overlaps)
    for (const loc in results) {
        const seen = new Set();
        results[loc] = results[loc].filter(n => {
            const key = `${n.id}|${n.text}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        console.log(`[AUTOROUTER] Location ${loc}: ${results[loc].length} NOTAMs`);
    }

    return results;
}
