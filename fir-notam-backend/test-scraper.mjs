/**
 * Scraper Integration Test
 * Tests the live backend API (which uses Puppeteer to scrape notams.aim.faa.gov)
 * Run: node test-scraper.mjs
 */

const BASE = 'http://localhost:3001';
const PASS = '\x1b[32m✅ PASS\x1b[0m';
const FAIL = '\x1b[31m❌ FAIL\x1b[0m';
const INFO = '\x1b[36mℹ\x1b[0m ';

async function get(path) {
    const r = await fetch(`${BASE}${path}`);
    const json = await r.json();
    return { status: r.status, data: json };
}

function assert(label, condition, detail = '') {
    if (condition) {
        console.log(`${PASS}  ${label}`);
    } else {
        console.log(`${FAIL}  ${label}${detail ? ' — ' + detail : ''}`);
    }
    return condition;
}

console.log('\n\x1b[1m═══════════════════════════════════════════════\x1b[0m');
console.log('\x1b[1m  NOTAM Scraper Integration Test\x1b[0m');
console.log('\x1b[1m═══════════════════════════════════════════════\x1b[0m\n');

// ── Test 1: Health check ──────────────────────────────────────────────────────
console.log('\x1b[33m[1/4] Health Check\x1b[0m');
try {
    const { status, data } = await get('/api/health');
    assert('Backend is reachable', status === 200);
    assert('Health returns ok status', data.status === 'ok', JSON.stringify(data));
    assert('Health includes timestamp', typeof data.timestamp === 'number');
} catch (e) {
    console.log(`${FAIL}  Backend unreachable — is it running on port 3001? (${e.message})`);
    process.exit(1);
}

// ── Test 2: Single airport NOTAM scrape (the real test) ───────────────────────
console.log('\n\x1b[33m[2/4] Scraping OMAA (Abu Dhabi) — this may take 15-30s for first load...\x1b[0m');
const t0 = Date.now();
try {
    const { status, data } = await get('/api/notams/bulk?locations=OMAA');
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`${INFO} Response time: ${elapsed}s`);

    assert('HTTP 200 response', status === 200);
    assert('Has locations object', typeof data.locations === 'object');
    assert('Has OMAA key', 'OMAA' in data.locations);

    const omaa = data.locations['OMAA'];
    assert('OMAA has status field', ['red', 'orange', 'green', 'unknown'].includes(omaa?.status),
        `got: ${omaa?.status}`);
    assert('OMAA has notams array', Array.isArray(omaa?.notams));
    assert('OMAA has hasEscat boolean', typeof omaa?.hasEscat === 'boolean');

    if (omaa?.error) {
        console.log(`\x1b[31m  ⚠ Scraper error: ${omaa.error}\x1b[0m`);
    } else {
        const count = omaa?.notams?.length ?? 0;
        console.log(`${INFO} NOTAMs returned: ${count}`);
        console.log(`${INFO} Overall status: \x1b[1m${omaa?.status?.toUpperCase()}\x1b[0m`);

        if (count > 0) {
            const first = omaa.notams[0];
            assert('First NOTAM has id', !!first.id);
            assert('First NOTAM has text', typeof first.text === 'string' && first.text.length > 0,
                `text length=${first.text?.length}`);
            assert('First NOTAM has status', ['red', 'orange', 'green'].includes(first.status));

            console.log(`\n${INFO} \x1b[2mSample NOTAM (first 200 chars):\x1b[0m`);
            console.log(`  \x1b[2m${first.text.slice(0, 200)}...\x1b[0m`);
        }
    }
} catch (e) {
    console.log(`${FAIL}  Scrape request failed — ${e.message}`);
}

// ── Test 3: Multiple airports bulk ───────────────────────────────────────────
console.log('\n\x1b[33m[3/4] Bulk scrape — OMDB, OBBI (should use cache if same FIR)\x1b[0m');
const t1 = Date.now();
try {
    const { status, data } = await get('/api/notams/bulk?locations=OMDB,OBBI');
    const elapsed = ((Date.now() - t1) / 1000).toFixed(1);
    console.log(`${INFO} Response time: ${elapsed}s`);

    assert('HTTP 200 response', status === 200);
    assert('Has OMDB result', 'OMDB' in data.locations);
    assert('Has OBBI result', 'OBBI' in data.locations);

    for (const icao of ['OMDB', 'OBBI']) {
        const d = data.locations[icao];
        const statusOk = ['red', 'orange', 'green', 'unknown'].includes(d?.status);
        console.log(`${statusOk ? PASS : FAIL}  ${icao}: status=${d?.status}, notams=${d?.notams?.length ?? 'N/A'}${d?.error ? ', err=' + d.error : ''}`);
    }
} catch (e) {
    console.log(`${FAIL}  Bulk scrape failed — ${e.message}`);
}

// ── Test 4: FIR status endpoint ───────────────────────────────────────────────
console.log('\n\x1b[33m[4/4] FIR status endpoint (OMAE — Emirates FIR)\x1b[0m');
try {
    const { status, data } = await get('/api/firs/bulk?locations=OMAE');
    assert('HTTP 200 response', status === 200);
    assert('Has firs object', typeof data.firs === 'object');
    assert('Has OMAE key', 'OMAE' in data.firs);

    const omae = data.firs['OMAE'];
    assert('OMAE has status', ['red', 'orange', 'green', 'unknown'].includes(omae?.status),
        `got: ${omae?.status}`);
    assert('OMAE has airports array', Array.isArray(omae?.airports));
    console.log(`${INFO} OMAE airports tracked: ${omae?.airports?.join(', ')}`);
    console.log(`${INFO} OMAE FIR status: \x1b[1m${omae?.status?.toUpperCase()}\x1b[0m`);
} catch (e) {
    console.log(`${FAIL}  FIR endpoint failed — ${e.message}`);
}

console.log('\n\x1b[1m═══════════════════════════════════════════════\x1b[0m');
console.log('\x1b[1m  Tests complete\x1b[0m');
console.log('\x1b[1m═══════════════════════════════════════════════\x1b[0m\n');
