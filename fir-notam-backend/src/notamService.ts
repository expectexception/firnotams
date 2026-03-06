import puppeteer, { Browser, Page } from 'puppeteer';
import { NotamStatus, NotamItem, LocationNotams, NotamAnalysis } from './types';
import { NotamCacheModel } from './models/NotamCache';
import { getFirForAirport, getAirportsByFir, isIcaoFir } from './airportData';
import { fetchAutorouterNotams } from './autorouterService';
import { classify, extractNotamAnalysis, matchesAny, ROUTE_CLOSURE_PATTERNS, parseNotamTime, RED_PATTERNS, ORANGE_PATTERNS, LIMITED_SCOPE_CLOSURE_PATTERNS, CRITICAL_SCOPE_PATTERNS, resolveReplacements } from './notamClassifier';

// 4 minutes session validity/TTL (Default)
const RECORD_TTL_MS = parseInteger(process.env.RECORD_TTL_MINUTES, 4) * 60 * 1000;
// Minimum interval between scrapes for the same ICAO to prevent spamming
const MIN_SCRAPE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

const FAA_URL = 'https://notams.aim.faa.gov/notamSearch/nsapp.html#/';
const SCRAPE_CHUNK_SIZE = Math.max(1, parseInt(process.env.SCRAPE_CHUNK_SIZE || '2', 10));

// ─── Single shared browser (NOT pooling pages — Angular SPA state is per-page) ─
let browser_: Browser | null = null;
let launchP: Promise<Browser> | null = null;

function parseInteger(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function getBrowser(): Promise<Browser> {
    if (browser_?.connected) return browser_;
    if (launchP) return launchP;
    launchP = puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--window-size=1920,1080',
            '--disable-blink-features=AutomationControlled',
        ],
    });
    browser_ = await launchP;
    launchP = null;
    browser_.on('disconnected', () => { browser_ = null; });
    return browser_;
}

// Re-export from shared module so existing imports from notamService keep working
export { classify, extractNotamAnalysis, resolveReplacements } from './notamClassifier';


/**
 * Checks if a NOTAM is currently active based on B) and C) fields.
 */
function isNotamActive(text: string): boolean {
    const analysis = extractNotamAnalysis(text);
    return analysis.isActive;
}

function aggregate(ss: NotamStatus[]): NotamStatus {
    const v = ss.filter(s => s !== 'unknown');
    if (v.includes('red')) return 'red';
    if (v.includes('orange')) return 'orange';
    return v.length ? 'green' : 'unknown';
}

const FIR_RED_PATTERNS: RegExp[] = [
    /\bFIR\s+CLOSED\b/,
    /\bAIRSPACE\s+CLOSED\b/,
    /\bCLOSED\s+FOR\s+ALL\s+TRAFFIC\b/,
    /\bNO\s+OVERFLIGHT\b/,
    /\bNO\s+ENTRY\b/,
    /\bAIRSPACE\s+PROHIBITED\b/,
    /\bTRAFFIC\s+SUSPENDED\b/,
];



const FIR_PARTIAL_OPEN_PATTERNS: RegExp[] = [
    /\bPARTIALLY\s+OPEN\b/,
    /\bPARTIALY\s+OPEN\b/,
    /\bPARTIAL\s+OPEN\b/,
    /\bPARTIALLY\s+CLSD\b/,
    /\bPARTIALLY\s+CLOSED\b/,
    /\bPARTIAL\s+CLOSED\b/,
    /\bPARTIAL\s+CLOSURE\b/,
    /\bOPEN\s+WITH\s+RESTRICTIONS\b/,
];

const FIR_ALT_ROUTE_PATTERNS: RegExp[] = [
    /\bALTERNATIVE\s+ROUTES?\b/,
    /\bALTERNATE\s+ROUTES?\b/,
    /\bALTN\s+ROUTES?\b/,
    /\bAVAILABLE\s+VIA\b/,
    /\bAVBL\s+VIA\b/,
    /\bVIA\s+ATS\s+ROUTE\b/,
    /\bVIA\s+PUBLISHED\s+ROUTE\b/,
    /\bCORRIDOR\b/,
    /\bEXCEPT\b/,
];

function isFirContextNotam(text: string, firIcao: string): boolean {
    const u = text.toUpperCase();
    if (u.includes(`A) ${firIcao}`)) return true;
    if (u.includes('FIR') || u.includes('AIRSPACE')) return true;
    if (matchesAny(u, FIR_RED_PATTERNS)) return true;
    if (matchesAny(u, FIR_PARTIAL_OPEN_PATTERNS)) return true;
    if (matchesAny(u, FIR_ALT_ROUTE_PATTERNS)) return true;
    return false;
}

export function classifyFirRegionStatus(
    firIcao: string,
    firAndAirportNotams: NotamItem[],
    fallbackAirportStatuses: NotamStatus[]
): NotamStatus {
    if (firAndAirportNotams.length === 0) {
        return aggregate(fallbackAirportStatuses);
    }

    const dedupMap = new Map<string, NotamItem>();
    for (const notam of firAndAirportNotams) {
        dedupMap.set(`${notam.id}|${notam.text}`, notam);
    }
    const deduped = Array.from(dedupMap.values());

    const firContextNotams = deduped.filter(n => isFirContextNotam(n.text, firIcao));
    const pool = firContextNotams.length > 0 ? firContextNotams : deduped;

    let hasUnmitigatedRed = false;
    let hasMitigatedClosure = false;
    let hasOrangeRestriction = false;

    for (const notam of pool) {
        const textUpper = notam.text.toUpperCase();
        const hasRedKeyword = matchesAny(textUpper, FIR_RED_PATTERNS) || matchesAny(textUpper, RED_PATTERNS);
        const hasFirWideClosure = matchesAny(textUpper, FIR_RED_PATTERNS); // airspace/FIR closed
        const hasPartialOpen = matchesAny(textUpper, FIR_PARTIAL_OPEN_PATTERNS);
        const hasAltRoute = matchesAny(textUpper, FIR_ALT_ROUTE_PATTERNS);
        const hasOrangeKeyword = matchesAny(textUpper, ORANGE_PATTERNS) || hasPartialOpen || hasAltRoute;
        const limitedScopeClosure = hasRedKeyword && matchesAny(textUpper, LIMITED_SCOPE_CLOSURE_PATTERNS) && !matchesAny(textUpper, CRITICAL_SCOPE_PATTERNS);
        const routeOnlyClosure = hasRedKeyword && matchesAny(textUpper, ROUTE_CLOSURE_PATTERNS) && !matchesAny(textUpper, CRITICAL_SCOPE_PATTERNS);

        if (limitedScopeClosure || routeOnlyClosure) {
            hasOrangeRestriction = true;
            continue;
        }

        // FIR-wide closures (FIR CLOSED, AIRSPACE CLOSED) remain Red even if they include
        // a narrow EXCEPT/ALTN clause for a single corridor or airport.
        // Only allow downgrade to orange when the Red is from generic RED_PATTERNS (like CLSD runway etc.)
        if (hasRedKeyword && (hasPartialOpen || hasAltRoute) && !hasFirWideClosure) {
            hasMitigatedClosure = true;
            continue;
        }
        if (hasRedKeyword) {
            hasUnmitigatedRed = true;
            continue;
        }
        if (hasOrangeKeyword) {
            hasOrangeRestriction = true;
        }
    }

    if (firIcao === 'OPKR' || firIcao === 'OPLR') {
        console.log(`[DEBUG ${firIcao}] pool size: ${pool.length}, unmitigatedRed: ${hasUnmitigatedRed}, mitigated: ${hasMitigatedClosure}, orange: ${hasOrangeRestriction}`);
        if (hasUnmitigatedRed) {
            for (const notam of pool) {
                const textUpper = notam.text.toUpperCase();
                const hr = matchesAny(textUpper, FIR_RED_PATTERNS) || matchesAny(textUpper, RED_PATTERNS);
                const lsc = hr && matchesAny(textUpper, LIMITED_SCOPE_CLOSURE_PATTERNS) && !matchesAny(textUpper, CRITICAL_SCOPE_PATTERNS);
                const roc = hr && matchesAny(textUpper, ROUTE_CLOSURE_PATTERNS) && !matchesAny(textUpper, CRITICAL_SCOPE_PATTERNS);
                if (hr && !lsc && !roc && !(matchesAny(textUpper, FIR_PARTIAL_OPEN_PATTERNS) || matchesAny(textUpper, FIR_ALT_ROUTE_PATTERNS))) {
                    console.log(`[DEBUG ${firIcao}] OFFENDING RED NOTAM: ${notam.id} - ${notam.text.slice(0, 50)}... matched Red.`);
                }
            }
        }
    }

    if (hasUnmitigatedRed) return 'red';
    if (hasMitigatedClosure || hasOrangeRestriction) return 'orange';
    if (pool.length > 0) return 'green';

    return aggregate(fallbackAirportStatuses);
}

interface FaaEntry { notamNumber?: string; icaoMessage?: string; traditionalMessage?: string; facilityDesignator?: string; location?: string; }
interface FaaResp { notamList?: FaaEntry[]; totalNotamCount?: number; pageSize?: number; pageOffset?: number; numberOfPages?: number; }

interface FetchBulkOptions {
    forceRefresh?: boolean;
}

// Track last scrape time per ICAO to avoid spamming
const lastScrapeTimes = new Map<string, number>();

function normalizeNotams(notams: NotamItem[]): NotamItem[] {
    return [...notams].sort((a, b) => {
        const aid = JSON.stringify({
            id: a.id,
            status: a.status,
            hasEscat: a.hasEscat,
            text: a.text,
            analysis: a.analysis || null,
        });
        const bid = JSON.stringify({
            id: b.id,
            status: b.status,
            hasEscat: b.hasEscat,
            text: b.text,
            analysis: b.analysis || null,
        });
        return aid.localeCompare(bid);
    });
}

function isSameNotamPayload(
    existing: Pick<LocationNotams, 'status' | 'hasEscat' | 'notams'> | null,
    incoming: Pick<LocationNotams, 'status' | 'hasEscat' | 'notams'>
): boolean {
    if (!existing) return false;
    if (existing.status !== incoming.status || existing.hasEscat !== incoming.hasEscat) return false;

    const a = normalizeNotams(existing.notams || []);
    const b = normalizeNotams(incoming.notams || []);
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
        if (
            a[i].id !== b[i].id ||
            a[i].text !== b[i].text ||
            a[i].status !== b[i].status ||
            a[i].hasEscat !== b[i].hasEscat
        ) {
            return false;
        }
    }
    return true;
}

async function upsertIfChanged(result: LocationNotams): Promise<'inserted_or_changed' | 'unchanged'> {
    const now = Date.now();
    const nowDate = new Date(now);
    const existing = await NotamCacheModel.findOne({ icao: result.icao })
        .select({ status: 1, hasEscat: 1, notams: 1 })
        .lean();

    // ── MERGE STRATEGY ─────────────────────────────────────────────────────────
    // Problem: A partial scrape might return only a subset of NOTAMs.
    // Replace DB content only if the scrape was "complete".
    // Otherwise, perform a union-merge to avoid dropping valid data.
    // ────────────────────────────────────────────────────────────────────────────

    const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days grace for EST NOTAMs
    const mergedMap = new Map<string, NotamItem>();

    if (result.isComplete) {
        // SCENARIO 1: Complete Scrape - The current batch is the absolute truth.
        // We drop anything in DB that isn't in this batch.
        for (const n of result.notams) {
            const id = n.analysis?.notamId || n.id;
            mergedMap.set(id, n);
        }
    } else {
        // SCENARIO 2: Incomplete Scrape - Merge with DB to avoid data loss.
        // Build the existing-NOTAM map (id → item)
        for (const n of ((existing as any)?.notams ?? []) as NotamItem[]) {
            const id = n.analysis?.notamId || n.id;
            mergedMap.set(id, n);
        }

        // Layer in the freshly-scraped NOTAMs (upsert by ID — new beats old)
        for (const n of result.notams) {
            const id = n.analysis?.notamId || n.id;
            mergedMap.set(id, n);
        }
    }

    // Collect the set of IDs that are explicitly superseded in the new batch
    const supersededIds = new Set<string>();
    for (const n of result.notams) {
        if ((n.analysis?.notamType === 'R' || n.analysis?.notamType === 'C') && n.analysis.replacedId) {
            supersededIds.add(n.analysis.replacedId);
        }
    }

    // Final merge: remove expired + superseded
    const mergedNotams: NotamItem[] = [];
    for (const n of mergedMap.values()) {
        const id = n.analysis?.notamId || n.id;

        // Remove if explicitly replaced/cancelled by a NOTAM in this scrape
        if (supersededIds.has(id)) {
            console.log(`[DB] Removing superseded NOTAM ${id} for ${result.icao}`);
            continue;
        }

        // Remove NOTAMC type entries (they only exist to cancel others)
        if (n.analysis?.notamType === 'C') continue;

        // Remove if definitively expired (past C-time, no grace period for non-EST)
        const endTime = n.analysis?.endsAtUtc ? new Date(n.analysis.endsAtUtc) : null;
        if (endTime && !n.analysis?.isPermanent) {
            const isEstimated = n.analysis?.isEstimated ?? false;
            const expiredAt = isEstimated
                ? endTime.getTime() + GRACE_PERIOD_MS
                : endTime.getTime();
            if (nowDate.getTime() > expiredAt) {
                console.log(`[DB] Removing expired NOTAM ${id} for ${result.icao} (ended ${endTime.toISOString()})`);
                continue;
            }
        }

        mergedNotams.push(n);
    }

    // Re-run replacement resolution on the full merged set
    const deduped = resolveReplacements(mergedNotams);

    // Recompute status from the merged+resolved NOTAM set
    const activeDeduped = deduped.filter(n => n.analysis?.isActive !== false);
    const isFirIcao = isIcaoFir(result.icao);
    const mergedStatus = isFirIcao
        ? classifyFirRegionStatus(result.icao, activeDeduped, [])
        : aggregate(activeDeduped.map(n => n.status));
    const mergedHasEscat = activeDeduped.some(n => n.hasEscat);
    const mergedHasInterference = activeDeduped.some(n => n.hasInterference);

    const payload = {
        status: mergedStatus,
        hasEscat: mergedHasEscat,
        notams: deduped,
    };

    // Check if anything actually changed
    if (isSameNotamPayload(existing as any, payload)) {
        await NotamCacheModel.updateOne(
            { icao: result.icao },
            { $set: { lastCheckedAt: now } },
            { upsert: true }
        );
        return 'unchanged';
    }

    // Guard: don't overwrite if the merge produced 0 NOTAMs and the scrape was incomplete
    if (deduped.length === 0 && result.isComplete === false) {
        console.warn(`[DB] Merge guard: incomplete scrape + 0 merged NOTAMs for ${result.icao}. Skipping save.`);
        await NotamCacheModel.updateOne(
            { icao: result.icao },
            { $set: { lastCheckedAt: now } },
            { upsert: true }
        );
        return 'unchanged';
    }

    console.log(`[DB] Saving merged NOTAMs for ${result.icao}: ${deduped.length} total (${result.notams.length} from current fetch, ${(existing as any)?.notams?.length ?? 0} in DB)`);
    await NotamCacheModel.updateOne(
        { icao: result.icao },
        {
            $set: {
                icao: result.icao,
                notams: deduped,
                status: mergedStatus,
                hasEscat: mergedHasEscat,
                hasInterference: mergedHasInterference,
                cachedAt: now,
                lastCheckedAt: now,
                lastSuccessfulUpdate: now,
            }
        },
        { upsert: true }
    );
    return 'inserted_or_changed';
}

// ─── Scrape pool: limit concurrent page-scrapes to avoid FAA detection & system load ─
const MAX_CONCURRENT_PAGES = 3;
let activePages = 0;
const scrapeQueue: (() => void)[] = [];

function isScrapeBusy(): boolean {
    return activePages >= MAX_CONCURRENT_PAGES || scrapeQueue.length > 0;
}

async function withScrapeLock<T>(fn: () => Promise<T>): Promise<T> {
    if (activePages >= MAX_CONCURRENT_PAGES) {
        console.log(`[POOL] Max concurrent pages reached. Queuing request... (Queue size: ${scrapeQueue.length + 1})`);
        await new Promise<void>(resolve => scrapeQueue.push(resolve));
    }

    activePages += 1;
    try {
        return await fn();
    } finally {
        activePages -= 1;
        if (scrapeQueue.length > 0) {
            const next = scrapeQueue.shift();
            if (next) next();
        }
    }
}

export async function fetchBulkNotams(
    icaos: string[],
    options: FetchBulkOptions = {}
): Promise<Record<string, LocationNotams>> {
    const forceRefresh = options.forceRefresh === true;
    const out: Record<string, LocationNotams> = {};
    const missing: string[] = [];

    const fetchAirports = process.env.FETCH_AIRPORTS_ENABLED !== 'false';
    const fetchFirs = process.env.FETCH_FIRS_ENABLED !== 'false';

    // Check DB records
    for (const icao of icaos) {
        try {
            const cachedDocs = await NotamCacheModel.findOne({ icao }).lean();
            if (cachedDocs) {
                // Re-verify active status of cached NOTAMs using current time
                const cachedItems = ((cachedDocs as any).notams || []).map((n: NotamItem) => {
                    if (n.text) {
                        const freshAnalysis = extractNotamAnalysis(n.text);
                        return { ...n, analysis: freshAnalysis };
                    }
                    return n;
                }).filter((n: NotamItem) => n.analysis?.isActive !== false);

                const finalStatus = isIcaoFir(icao)
                    ? classifyFirRegionStatus(icao, cachedItems, [])
                    : aggregate(cachedItems.map((n: NotamItem) => n.status));

                out[icao] = {
                    icao,
                    status: finalStatus,
                    hasEscat: cachedItems.some((n: NotamItem) => n.hasEscat),
                    hasInterference: cachedItems.some((n: NotamItem) => n.hasInterference),
                    notams: cachedItems,
                    cachedAt: (cachedDocs as any).cachedAt,
                    dataSource: 'db-cache',
                };

                // If stale, trigger background refresh but don't wait for it
                const freshnessAt = (cachedDocs as any).lastSuccessfulUpdate || (cachedDocs as any).cachedAt;
                if (forceRefresh || (Date.now() - freshnessAt > RECORD_TTL_MS)) {
                    const isFir = isIcaoFir(icao);
                    if ((isFir && fetchFirs) || (!isFir && fetchAirports)) {
                        missing.push(icao);
                    } else {
                        console.log(`[NOTAM] Skipping background refresh for ${icao} (${isFir ? 'FIR' : 'Airport'}) - fetching disabled`);
                    }
                }
            } else {
                const isFir = isIcaoFir(icao);
                if ((isFir && fetchFirs) || (!isFir && fetchAirports)) {
                    missing.push(icao);
                    out[icao] = { icao, status: 'unknown', hasEscat: false, hasInterference: false, notams: [], error: 'Fetching data...', cachedAt: Date.now() };
                } else {
                    out[icao] = { icao, status: 'unknown', hasEscat: false, hasInterference: false, notams: [], error: `Fetching disabled for ${isFir ? 'FIRs' : 'Airports'}`, cachedAt: Date.now() };
                }
            }
        } catch (err) {
            console.error(`[NOTAM] Error reading record for ${icao}`, err);
            const isFir = isIcaoFir(icao);
            if ((isFir && fetchFirs) || (!isFir && fetchAirports)) {
                missing.push(icao);
            }
            out[icao] = { icao, status: 'unknown', hasEscat: false, hasInterference: false, notams: [], error: 'Fetch failed', cachedAt: Date.now() };
        }
    }

    if (missing.length === 0) return out;

    // Avoid request hangs: if scraper is already busy (often due to auto-sync),
    // return quickly with stale values and let next refresh cycle update data.
    if (!forceRefresh && isScrapeBusy()) {
        console.warn(`[NOTAM] Scraper busy; skipping background refresh for ${missing.length} ICAOs`);
        return out;
    }

    // Define background scrape task
    const runScrape = async () => {
        if (missing.length === 0) return;

        // Check MIN_SCRAPE_INTERVAL for each missing ICAO
        const now = Date.now();
        const verifiedMissing = missing.filter(icao => {
            const last = lastScrapeTimes.get(icao) || 0;
            if (now - last < MIN_SCRAPE_INTERVAL_MS && !forceRefresh) {
                console.log(`[NOTAM] Skipping scrape for ${icao} - last scrape was too recent (< ${MIN_SCRAPE_INTERVAL_MS / 60000}m)`);
                return false;
            }
            return true;
        });

        if (verifiedMissing.length === 0) return;

        // Update last scrape times
        verifiedMissing.forEach(icao => lastScrapeTimes.set(icao, now));

        // Resolve parent FIRs for automatically including FIR-level NOTAMs (like closures)
        const searchList = new Set<string>();
        for (const icao of verifiedMissing) {
            searchList.add(icao);
            const fir = getFirForAirport(icao);
            if (fir) searchList.add(fir);
        }
        const finalMissing = Array.from(searchList);

        console.log(`[NOTAM] Background fetching missing (expanded to FIRs): ${finalMissing.join(', ')}`);

        const useScraper = process.env.USE_SCRAPER_DATA !== 'false';
        const useAutorouter = process.env.USE_AUTOROUTER_API_DATA === 'true';

        let arResults: Record<string, NotamItem[]> = {};
        let arSuccess = true;
        if (useAutorouter) {
            try {
                console.log(`[NOTAM] Fetching from Autorouter API for: ${finalMissing.join(', ')}`);
                arResults = await fetchAutorouterNotams(finalMissing);
            } catch (err) {
                console.error(`[NOTAM] Autorouter API failed:`, err);
                arSuccess = false;
            }
        }

        // Wrap the entire Puppeteer scrape in the global lock so parallel API calls queue up
        await withScrapeLock(async () => {
            let b: Browser | null = null;
            let page: Page | null = null;

            if (useScraper) {
                b = await getBrowser();
                page = await b.newPage();
            }

            try {
                if (useScraper && page) {
                    await page.setViewport({ width: 1280, height: 800 });
                    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

                    await page.evaluateOnNewDocument(() => {
                        Object.defineProperty(navigator, 'webdriver', {
                            get: () => false,
                        });
                    });

                    await page.setCookie({
                        name: 'fnsDisclaimer', value: 'agreed',
                        domain: 'notams.aim.faa.gov', path: '/',
                    });

                    console.log(`[NOTAM] Navigating to FAA bulk scraper...`);
                    await page.goto(FAA_URL, { waitUntil: 'networkidle2', timeout: 45000 });

                    // Fallback: Check if we are still on a disclaimer page
                    try {
                        await new Promise(r => setTimeout(r, 1000));
                        const buttons = await page.$$('button');
                        for (const btn of buttons) {
                            const text = await page.evaluate(el => el.textContent, btn);
                            if (text?.includes('read and understood') || text?.includes('OK')) {
                                console.log(`[NOTAM] Found disclaimer button ("${text?.trim()}"), clicking...`);
                                await Promise.all([
                                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => { }),
                                    btn.click(),
                                ]);
                                break;
                            }
                        }
                    } catch (e: any) {
                        console.log(`[NOTAM] Disclaimer fallback check skipped: ${e.message}`);
                    }

                    await page.waitForFunction(
                        () => typeof (window as any).angular !== 'undefined',
                        { timeout: 40000, polling: 500 }
                    );

                    await page.waitForSelector('input[name="designatorsForLocation"]', { timeout: 40000 });
                } // end useScraper initial setup

                // Smaller chunk size to reduce FAA pagination pressure and missing ICAO assignments
                const CHUNK_SIZE = SCRAPE_CHUNK_SIZE;
                for (let i = 0; i < finalMissing.length; i += CHUNK_SIZE) {
                    const chunk = finalMissing.slice(i, i + CHUNK_SIZE);
                    const icaoString = chunk.join(',');
                    if (useScraper) {
                        console.log(`[NOTAM] Searching chunk: ${icaoString} (FAA Scraper)`);
                    }

                    // Collect ALL pages of results
                    const allEntries: FaaEntry[] = [];
                    let totalCount = 0;
                    let isChunkComplete = true; // Track if we got all expected pages for this chunk

                    if (useScraper && page) {
                        // Helper: capture one FAA POST /search response
                        const captureResponse = () => new Promise<{ faa: FaaResp | null; postData?: string }>(resolve => {
                            let done = false;
                            const t = setTimeout(() => {
                                if (!done) {
                                    done = true;
                                    page.off('response', h);
                                    resolve({ faa: null });
                                }
                            }, 30000);
                            const h = async (res: any) => {
                                if (done) return;
                                if (res.url().includes('/notamSearch/search') && res.request().method() === 'POST') {
                                    if ((res.headers()['content-type'] || '').includes('json')) {
                                        try {
                                            const d = await res.json() as FaaResp;
                                            const postData = res.request().postData() || undefined;
                                            done = true; clearTimeout(t); page.off('response', h);
                                            resolve({ faa: d, postData });
                                        } catch { /* retry next */ }
                                    }
                                }
                            };
                            page.on('response', h);
                        });

                        // Strategy 1: Angular injector-based search trigger
                        const angOk: boolean = await page.evaluate((loc: string) => {
                            try {
                                const ang = (window as any).angular;
                                if (!ang) return false;
                                const root = document.querySelector('[ng-app]') || document.documentElement;
                                const $rs = ang.element(root).injector()?.get('$rootScope');
                                if (!$rs) return false;

                                $rs.$apply(() => {
                                    if ($rs.globalScope) $rs.globalScope.designatorsForLocation = loc;
                                    $rs.designatorsForLocation = loc;
                                    let s = $rs.$$childHead;
                                    while (s) {
                                        if ('designatorsForLocation' in s) s.designatorsForLocation = loc;
                                        if (s.globalScope) s.globalScope.designatorsForLocation = loc;
                                        s = s.$$nextSibling;
                                    }
                                });

                                const trySearch = (s: any): boolean => {
                                    if (!s) return false;
                                    if (typeof s.searchNotams === 'function') {
                                        s.$apply(() => s.searchNotams(false, false));
                                        return true;
                                    }
                                    if (s.globalScope && typeof s.globalScope.searchNotams === 'function') {
                                        s.$apply(() => s.globalScope.searchNotams(false, false));
                                        return true;
                                    }
                                    return trySearch(s.$$childHead) || trySearch(s.$$nextSibling);
                                };
                                return trySearch($rs);
                            } catch { return false; }
                        }, icaoString);

                        if (!angOk) {
                            console.log(`[NOTAM] Angular injection failed, using DOM fallback`);
                            const inp = await page.$('input[name="designatorsForLocation"]');
                            if (!inp) throw new Error('Could not find designatorsForLocation input');
                            await inp.click({ clickCount: 3 });
                            await page.keyboard.press('Backspace');
                            await page.keyboard.type(icaoString, { delay: 10 });
                            await new Promise(r => setTimeout(r, 500));

                            const clicked = await page.evaluate(() => {
                                const btn = Array.from(document.querySelectorAll('button'))
                                    .find(b => b.textContent?.trim() === 'Search') as HTMLButtonElement | undefined;
                                if (btn) { btn.click(); return true; }
                                return false;
                            });
                            if (!clicked) throw new Error('Search button not found');
                        }

                        // Collect ALL pages of results
                        const allEntries: FaaEntry[] = [];
                        let totalCount = 0;
                        let isChunkComplete = true; // Track if we got all expected pages for this chunk

                        const firstPageCapture = await captureResponse();
                        const firstPage = firstPageCapture.faa;
                        if (!firstPage) {
                            console.error(`[NOTAM] No JSON from FAA for chunk ${icaoString}`);
                            continue;
                        }
                        allEntries.push(...(firstPage.notamList || []));
                        totalCount = firstPage.totalNotamCount ?? allEntries.length;
                        const pageSize = firstPage.pageSize || 30; // Use 30 as safer default for FAA
                        let lastSearchPostData = firstPageCapture.postData;
                        console.log(`[NOTAM] Chunk ${icaoString}: page 1, totalNotamCount=${totalCount}, got=${allEntries.length}/${totalCount}`);

                        // Paginate through remaining pages
                        let beforeCount = allEntries.length;
                        while (allEntries.length < totalCount) {
                            beforeCount = allEntries.length;
                            const nextPageNum = Math.floor(allEntries.length / pageSize) + 1;
                            console.log(`[NOTAM] Fetching page ${nextPageNum} (${allEntries.length}/${totalCount})`);

                            const captureResponseWithCancel = () => {
                                let done = false;
                                let timeoutHandle: NodeJS.Timeout | null = null;

                                const h = async (res: any) => {
                                    if (done) return;
                                    if (res.url().includes('/notamSearch/search') && res.request().method() === 'POST') {
                                        if ((res.headers()['content-type'] || '').includes('json')) {
                                            try {
                                                const d = await res.json() as FaaResp;
                                                done = true;
                                                if (timeoutHandle) clearTimeout(timeoutHandle);
                                                page.off('response', h);
                                                resolveP({ faa: d, postData: res.request().postData() || undefined });
                                            } catch {
                                                // ignore parse error and continue listening
                                            }
                                        }
                                    }
                                };

                                let resolveP: (value: { faa: FaaResp | null; postData?: string }) => void = () => { };
                                const promise = new Promise<{ faa: FaaResp | null; postData?: string }>((resolve) => {
                                    resolveP = resolve;
                                    timeoutHandle = setTimeout(() => {
                                        if (!done) {
                                            done = true;
                                            page.off('response', h);
                                            resolve({ faa: null });
                                        }
                                    }, 30000);
                                    page.on('response', h);
                                });

                                const cancel = () => {
                                    if (done) return;
                                    done = true;
                                    if (timeoutHandle) clearTimeout(timeoutHandle);
                                    page.off('response', h);
                                    resolveP({ faa: null });
                                };

                                return { promise, cancel };
                            };

                            const triggerPagination = async (targetPage: number): Promise<boolean> => {
                                return page.evaluate((target: number) => {
                                    try {
                                        const targetText = String(target);
                                        const ang = (window as any).angular;

                                        // Strategy A: call pagination functions from Angular scopes
                                        if (ang) {
                                            const visited = new Set<any>();
                                            const queue: any[] = [];

                                            const seedEls = Array.from(document.querySelectorAll('[ng-controller], .ng-scope, .container, body'));
                                            for (const el of seedEls) {
                                                const scope = ang.element(el).scope?.();
                                                if (scope && !visited.has(scope)) {
                                                    visited.add(scope);
                                                    queue.push(scope);
                                                }
                                            }

                                            while (queue.length) {
                                                const s = queue.shift();
                                                if (!s) continue;

                                                const candidates = [
                                                    s.changePage,
                                                    s.goToPage,
                                                    s.gotoPage,
                                                    s.searchNotams,
                                                    s.globalScope?.changePage,
                                                    s.globalScope?.goToPage,
                                                    s.globalScope?.gotoPage,
                                                    s.$parent?.changePage,
                                                    s.$parent?.goToPage,
                                                    s.$parent?.gotoPage,
                                                ].filter((fn: any) => typeof fn === 'function');

                                                for (const fn of candidates) {
                                                    try {
                                                        s.$apply(() => {
                                                            if (fn === s.searchNotams) {
                                                                fn(false, false);
                                                            } else {
                                                                fn(target);
                                                            }
                                                        });
                                                        return true;
                                                    } catch {
                                                        // try next candidate
                                                    }
                                                }

                                                const neighbors = [s.$$childHead, s.$$nextSibling, s.$parent, s.globalScope];
                                                for (const n of neighbors) {
                                                    if (n && !visited.has(n)) {
                                                        visited.add(n);
                                                        queue.push(n);
                                                    }
                                                }
                                            }
                                        }

                                        // Strategy B: click page number links/buttons directly
                                        const clickables = Array.from(document.querySelectorAll('a, button, li, span')) as HTMLElement[];
                                        for (const el of clickables) {
                                            const txt = (el.textContent || '').trim();
                                            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                                            if (txt === targetText || aria.includes(`page ${targetText}`) || aria.includes(`go to page ${targetText}`)) {
                                                el.click();
                                                return true;
                                            }
                                        }

                                        // Strategy C: click "next" controls if exact target page control isn't visible
                                        for (const el of clickables) {
                                            const txt = (el.textContent || '').trim().toLowerCase();
                                            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                                            if (txt === 'next' || txt === '>' || txt === '›' || aria.includes('next')) {
                                                el.click();
                                                return true;
                                            }
                                        }

                                        return false;
                                    } catch {
                                        return false;
                                    }
                                }, targetPage);
                            };

                            const waitForDataChange = async (targetPage: number, previousCount: number, timeout = 10000): Promise<boolean> => {
                                const start = Date.now();
                                while (Date.now() - start < timeout) {
                                    // We check if the DOM has changed or if the collector has already pushed (handled in the main loop)
                                    // but primarily we wait for the captureResponse callback or a reasonable delay
                                    await new Promise(r => setTimeout(r, 500));
                                    if (allEntries.length > previousCount) return true;
                                }
                                return false;
                            };

                            let nextPage: FaaResp | null = null;
                            const MAX_ATTEMPTS = 3;
                            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                                const capture = captureResponseWithCancel();
                                const triggered = await triggerPagination(nextPageNum);

                                if (!triggered) {
                                    capture.cancel();
                                    console.warn(`[NOTAM] Pagination trigger failed for page ${nextPageNum} (attempt ${attempt}/${MAX_ATTEMPTS})`);
                                    await new Promise(r => setTimeout(r, 600));
                                    continue;
                                }

                                const candidate = await capture.promise;
                                if (candidate.postData) {
                                    lastSearchPostData = candidate.postData;
                                }
                                if (candidate.faa?.notamList && candidate.faa.notamList.length > 0) {
                                    nextPage = candidate.faa;
                                    console.log(`[NOTAM] Page ${nextPageNum} loaded via Strategy ${attempt === 1 ? 'A/B' : 'Retry'}`);
                                    break;
                                }

                                console.warn(`[NOTAM] Pagination response missing/empty for page ${nextPageNum} (attempt ${attempt}/${MAX_ATTEMPTS})`);
                                await waitForDataChange(nextPageNum, beforeCount, 2000);
                            }

                            if (!nextPage && lastSearchPostData) {
                                const directPage = await page.evaluate(
                                    async ({ targetPage, rawPostData, pageSizeHint }) => {
                                        try {
                                            if (!rawPostData) return null;
                                            const payload = JSON.parse(rawPostData);
                                            const offset = (targetPage - 1) * (Number(payload.pageSize || pageSizeHint || 30));

                                            if ('pageNum' in payload) payload.pageNum = targetPage;
                                            if ('page' in payload) payload.page = targetPage;
                                            if ('pageNumber' in payload) payload.pageNumber = targetPage;
                                            if ('pageOffset' in payload) payload.pageOffset = offset;
                                            if ('offset' in payload) payload.offset = offset;
                                            if ('start' in payload) payload.start = offset;
                                            if ('first' in payload) payload.first = offset;
                                            if ('rows' in payload) payload.rows = Number(payload.pageSize || pageSizeHint || 30);

                                            const resp = await fetch('/notamSearch/search', {
                                                method: 'POST',
                                                credentials: 'include',
                                                headers: {
                                                    'content-type': 'application/json;charset=UTF-8',
                                                    accept: 'application/json, text/plain, */*',
                                                },
                                                body: JSON.stringify(payload),
                                            });

                                            if (!resp.ok) return null;
                                            const json = await resp.json();
                                            return json;
                                        } catch {
                                            return null;
                                        }
                                    },
                                    { targetPage: nextPageNum, rawPostData: lastSearchPostData, pageSizeHint: pageSize }
                                );

                                if (directPage?.notamList?.length) {
                                    console.log(`[NOTAM] Loaded page ${nextPageNum} via direct request fallback`);
                                    nextPage = directPage as FaaResp;
                                }
                            }

                            if (!nextPage || !nextPage.notamList || nextPage.notamList.length === 0) {
                                console.warn(`[NOTAM] Could not load page ${nextPageNum} after retries, stopping at ${allEntries.length}/${totalCount}`);
                                isChunkComplete = false;
                                break;
                            }

                            // Guard against duplicate-page loops and filter duplicate entries by notamNumber
                            beforeCount = allEntries.length;
                            const existingIds = new Set(allEntries.map(e => e.notamNumber).filter(Boolean));
                            const newEntries = (nextPage.notamList || []).filter(e => !e.notamNumber || !existingIds.has(e.notamNumber));

                            allEntries.push(...newEntries);
                            if (allEntries.length === beforeCount && (nextPage.notamList || []).length > 0) {
                                console.warn(`[NOTAM] Page ${nextPageNum} only contained duplicates, stopping to avoid loop`);
                                break;
                            }

                            console.log(`[NOTAM] Loaded page ${nextPageNum}, total collected=${allEntries.length}/${totalCount}`);
                        }
                    } // end useScraper chunk loop

                    // Reassign faa object for consistent downstream processing
                    const faa: FaaResp = { notamList: allEntries, totalNotamCount: totalCount };

                    // Group NOTAMs by ICAO
                    const notamsByIcao: Record<string, NotamItem[]> = {};
                    // Include chunk ICAOs, requested ICAOs, and child airports of any FIR in scope.
                    // This is required so FIR-only requests (e.g. OJAC) can still collect airport NOTAMs.
                    const targetIcaos = new Set<string>();
                    for (const c of chunk) targetIcaos.add(c);
                    for (const c of icaos) targetIcaos.add(c);
                    for (const c of Array.from(targetIcaos)) {
                        if (isIcaoFir(c)) {
                            const children = getAirportsByFir(c);
                            for (const child of children) targetIcaos.add(child);
                        }
                    }
                    for (const code of targetIcaos) {
                        if (!notamsByIcao[code]) notamsByIcao[code] = [];
                    }

                    (faa.notamList || []).forEach((e, idx) => {
                        // ── Step 1: Get airport ICAO from the A) field of the ICAO message ──
                        // A) XXXX is the actual airport. Q) line's 2nd segment is the FIR — do NOT use it.
                        let loc: string | undefined;

                        if (e.icaoMessage) {
                            const aField = e.icaoMessage.match(/\bA\)\s*([A-Z]{4})\b/);
                            if (aField) loc = aField[1];
                        }

                        // Fallback 1: explicit FAA response fields
                        if (!loc) loc = e.facilityDesignator || e.location || undefined;

                        // Fallback 2: first 4-letter code word at start of traditional message
                        if (!loc && e.traditionalMessage) {
                            const m = e.traditionalMessage.match(/^([A-Z]{4})\s/);
                            if (m) loc = m[1];
                        }

                        const text = (e.icaoMessage || e.traditionalMessage || '').trim();

                        // ── Step 2: Time Validity Check ──
                        if (!isNotamActive(text)) {
                            return; // Skip inactive NOTAMs
                        }

                        const { status, hasEscat, hasInterference } = classify(text);
                        const analysis = extractNotamAnalysis(text);
                        const item: NotamItem = { id: e.notamNumber || `notam-${idx}`, text, status, hasEscat, hasInterference, analysis };

                        if (loc && Object.prototype.hasOwnProperty.call(notamsByIcao, loc)) {
                            if (!notamsByIcao[loc]) notamsByIcao[loc] = [];
                            notamsByIcao[loc].push(item);
                        } else {
                            // Fallback 3: scan text for all whole-word matching ICAOs in scope
                            let assignedCount = 0;
                            for (const c of targetIcaos) {
                                if (new RegExp(`\\b${c}\\b`).test(text)) {
                                    if (!notamsByIcao[c]) notamsByIcao[c] = [];
                                    notamsByIcao[c].push(item);
                                    assignedCount++;
                                }
                            }

                            if (assignedCount === 0) {
                                console.warn(`[NOTAM] Could not assign NOTAM (loc=${loc}, id=${e.notamNumber}): ${text.slice(0, 80)}`);
                            }
                        }
                    });

                    // Add Autorouter results
                    for (const c of targetIcaos) {
                        if (arResults[c]) {
                            if (!notamsByIcao[c]) notamsByIcao[c] = [];
                            notamsByIcao[c].push(...arResults[c]);
                        }
                    }

                    // Merge FIR notams into child airports BEFORE saving/returning
                    for (const c of chunk) {
                        // Only merge for original requested ICAOs, not the FIRs themselves
                        if (!icaos.includes(c)) continue;

                        const parentFir = getFirForAirport(c);
                        if (parentFir && notamsByIcao[parentFir]) {
                            // Add FIR-level NOTAMs to this airport's list
                            notamsByIcao[c].push(...notamsByIcao[parentFir]);
                            // Resolve replacements and cancellations
                            notamsByIcao[c] = resolveReplacements(notamsByIcao[c]);
                        }
                    }

                    // FINAL STEP: Ensure all merged NOTAMs (especially from API) have current analysis/classification
                    for (const c of targetIcaos) {
                        if (notamsByIcao[c]) {
                            notamsByIcao[c] = notamsByIcao[c].map(item => {
                                if (item.status === 'unknown' && item.text) {
                                    const { status, hasEscat, hasInterference } = classify(item.text);
                                    const analysis = extractNotamAnalysis(item.text);
                                    return { ...item, status, hasEscat, hasInterference, analysis };
                                }
                                return item;
                            });
                        }
                    }

                    const writeTasks: Promise<void>[] = [];
                    for (const c of chunk) {
                        // Only return if requested (ignore automatically added FIRs unless requested)
                        if (!icaos.includes(c)) continue;

                        let items = notamsByIcao[c] || [];

                        // FIR fallback: if direct FIR assignments are empty, aggregate all child-airport NOTAMs.
                        // This ensures FIR requests like OBBB still return meaningful data.
                        if (items.length === 0) {
                            const childAirports = getAirportsByFir(c);
                            if (childAirports.length > 0) {
                                const merged: NotamItem[] = [];
                                for (const airportIcao of childAirports) {
                                    const airportItems = notamsByIcao[airportIcao] || [];
                                    merged.push(...airportItems);
                                }
                                if (merged.length > 0) {
                                    items = resolveReplacements(merged);
                                    console.log(`[NOTAM] FIR fallback applied for ${c}: ${items.length} NOTAMs from ${childAirports.length} child airports`);
                                }
                            }
                        }

                        // NOTE: 'green' means we got data and nothing is red/orange.
                        // If items.length is 0, it means the location is clear (green)
                        const isFirIcao = isIcaoFir(c);
                        const activeItems = items.filter(n => n.analysis?.isActive !== false);
                        const finalStatus = isFirIcao ? classifyFirRegionStatus(c, activeItems, []) : aggregate(activeItems.map(n => n.status));
                        const locationHasEscat = activeItems.some(n => n.hasEscat);
                        const locationHasInterference = activeItems.some(n => n.hasInterference);

                        const result: LocationNotams = {
                            icao: c,
                            notams: items,
                            status: finalStatus,
                            hasEscat: locationHasEscat,
                            hasInterference: locationHasInterference,
                            cachedAt: Date.now(),
                            isComplete: (useScraper ? isChunkComplete : true) && (useAutorouter ? arSuccess : true),
                            dataSource: useAutorouter ? (useScraper ? 'mixed-live' : 'api-live') : 'scraped-live',
                        };
                        delete result.error;
                        out[c] = result;

                        const writeTask = upsertIfChanged(result)
                            .then((writeState) => {
                                if (writeState === 'inserted_or_changed') {
                                    console.log(`[DB] Updated NOTAM record for ${c}`);
                                } else {
                                    console.log(`[DB] ${c} content unchanged; updated lastCheckedAt heartbeat`);
                                }
                            })
                            .catch(e => console.error(`[DB] Failed to save record for ${c}:`, e))
                            .then(() => undefined);

                        writeTasks.push(writeTask);

                        console.log(`[NOTAM] ${c}: ${items.length} NOTAMs, status=${result.status}`);
                    }

                    await Promise.all(writeTasks);
                }
            } catch (err: any) {
                console.error(`[NOTAM] Bulk scrape error: ${err?.message}`);
                try {
                    if (page) {
                        const url = page.url();
                        const path = `./error-bulk.png`;
                        await page.screenshot({ path });
                        console.log(`[NOTAM] Failure context: URL=${url}, Screenshot saved to ${path}`);
                    }
                } catch (e) {
                    console.error(`[NOTAM] Could not capture failure context: ${e}`);
                }
            } finally {
                if (page) await page.close().catch(() => { });
            }
        }); // end withScrapeLock
    }; // end runScrape

    // Trigger background scrape without awaiting
    runScrape().catch(err => console.error('[NOTAM] Background scrape failed:', err));

    return out;
}

export async function fetchFirStatus(
    firIcaos: string[],
    airportsByFir: (fir: string) => string[],
    options: FetchBulkOptions = {}
): Promise<Record<string, { status: NotamStatus; hasEscat: boolean; hasInterference: boolean; airports: string[] }>> {
    const all = new Set<string>();
    const map: Record<string, string[]> = {};
    for (const fir of firIcaos) {
        const aps = airportsByFir(fir);
        map[fir] = aps;
        all.add(fir);
        aps.forEach(a => all.add(a));
    }
    const data = await fetchBulkNotams(Array.from(all), options);
    const out: Record<string, { status: NotamStatus; hasEscat: boolean; hasInterference: boolean; airports: string[] }> = {};
    for (const fir of firIcaos) {
        const aps = map[fir] || [];
        const firNotams = data[fir]?.notams || [];
        const airportNotams = aps.flatMap((a) => data[a]?.notams || []);
        const combinedNotams = [...firNotams, ...airportNotams];

        out[fir] = {
            status: classifyFirRegionStatus(
                fir,
                combinedNotams,
                aps.map(a => data[a]?.status || 'unknown') as NotamStatus[]
            ),
            hasEscat: combinedNotams.some(n => n.hasEscat),
            hasInterference: combinedNotams.some(n => n.hasInterference),
            airports: aps,
        };
    }
    return out;
}

process.on('exit', () => { browser_?.close().catch(() => { }); });
process.on('SIGTERM', async () => { await browser_?.close().catch(() => { }); process.exit(0); });
