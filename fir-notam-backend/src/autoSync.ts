import { fetchBulkNotams } from './notamService';
import { getAllAirportIcaos, getAllFirIcaos, isIcaoFir } from './airportData';

interface AutoSyncConfig {
    enabled: boolean;
    intervalMs: number;
    batchSize: number;
    initialDelayMs: number;
    targets: string[];
}

interface AutoSyncState {
    enabled: boolean;
    isRunning: boolean;
    intervalMs: number;
    batchSize: number;
    targetsCount: number;
    lastRunStartedAt: number | null;
    lastRunCompletedAt: number | null;
    lastRunDurationMs: number | null;
    lastRunError: string | null;
    totalRuns: number;
    totalBatches: number;
    skippedRunsBecauseBusy: number;
}

let timer: NodeJS.Timeout | null = null;
let startDelayTimer: NodeJS.Timeout | null = null;
let inProgress = false;

const state: AutoSyncState = {
    enabled: false,
    isRunning: false,
    intervalMs: 0,
    batchSize: 0,
    targetsCount: 0,
    lastRunStartedAt: null,
    lastRunCompletedAt: null,
    lastRunDurationMs: null,
    lastRunError: null,
    totalRuns: 0,
    totalBatches: 0,
    skippedRunsBecauseBusy: 0,
};

function parseInteger(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseTargets(raw: string | undefined): string[] {
    if (!raw || !raw.trim()) {
        return getAllAirportIcaos();
    }
    const set = new Set(
        raw
            .split(',')
            .map(v => v.trim().toUpperCase())
            .filter(Boolean)
    );
    return Array.from(set);
}

function readConfig(): AutoSyncConfig {
    const enabled = (process.env.AUTO_SYNC_ENABLED || 'false').toLowerCase() === 'true';
    const intervalMinutes = parseInteger(process.env.AUTO_SYNC_INTERVAL_MINUTES, 8);
    const batchSize = parseInteger(process.env.AUTO_SYNC_BATCH_SIZE, 5);
    const initialDelaySeconds = parseInteger(process.env.AUTO_SYNC_INITIAL_DELAY_SECONDS, 20);
    const targets = parseTargets(process.env.AUTO_SYNC_AIRPORTS);

    return {
        enabled,
        intervalMs: intervalMinutes * 60 * 1000,
        batchSize,
        initialDelayMs: initialDelaySeconds * 1000,
        targets,
    };
}

async function runAutoSyncCycle(config: AutoSyncConfig): Promise<void> {
    if (inProgress) {
        state.skippedRunsBecauseBusy += 1;
        return;
    }

    inProgress = true;
    state.isRunning = true;
    state.lastRunError = null;
    state.lastRunStartedAt = Date.now();

    try {
        const fetchAirports = process.env.FETCH_AIRPORTS_ENABLED !== 'false';
        const fetchFirs = process.env.FETCH_FIRS_ENABLED !== 'false';

        const filteredTargets = config.targets.filter(icao => {
            const isFir = isIcaoFir(icao);
            if (isFir && !fetchFirs) return false;
            if (!isFir && !fetchAirports) return false;
            return true;
        });

        if (filteredTargets.length === 0) {
            console.log(`[AUTO-SYNC] No targets enabled for scraping`);
            return;
        }

        // Pulse logic: instead of processing all, we just hit fetchBulkNotams for ALL filtered targets.
        // fetchBulkNotams is now smart enough to only scrape what's actually stale (> 4 mins).
        // By running this every 30-60s, we ensure catch-up is fast but not overwhelming.
        console.log(`[AUTO-SYNC] Pulsing ${filteredTargets.length} targets to check freshness...`);

        // We process in smaller "pulse batches" to avoid blocking the DB too long in one call
        const PULSE_BATCH_SIZE = 20;
        for (let i = 0; i < filteredTargets.length; i += PULSE_BATCH_SIZE) {
            const batch = filteredTargets.slice(i, i + PULSE_BATCH_SIZE);
            // DO NOT use forceRefresh: true. Let notamService decide.
            await fetchBulkNotams(batch);
        }

        state.totalRuns += 1;
    } catch (err: any) {
        state.lastRunError = err?.message || 'Unknown auto-sync error';
        console.error('[AUTO-SYNC] Pulse failed:', err);
    } finally {
        state.lastRunCompletedAt = Date.now();
        state.lastRunDurationMs = Date.now() - state.lastRunStartedAt;
        state.isRunning = false;
        inProgress = false;
    }
}

export function startAutoSync(): void {
    const config = readConfig();

    // Override interval for "Peaceful Drip" - run pulse check every 30-60 seconds
    const pulseIntervalMs = parseInteger(process.env.AUTO_SYNC_PULSE_SECONDS, 45) * 1000;

    state.enabled = config.enabled;
    state.intervalMs = pulseIntervalMs;
    state.batchSize = config.batchSize;
    state.targetsCount = config.targets.length;

    if (!config.enabled) {
        console.log('[AUTO-SYNC] Disabled (AUTO_SYNC_ENABLED=false)');
        return;
    }

    console.log(`[AUTO-SYNC] Started in "Peaceful Drip" mode. Pulse every ${pulseIntervalMs / 1000}s check.`);

    startDelayTimer = setTimeout(() => {
        runAutoSyncCycle(config).catch(err => {
            state.lastRunError = err.message;
        });

        timer = setInterval(() => {
            runAutoSyncCycle(config).catch(err => {
                state.lastRunError = err.message;
            });
        }, pulseIntervalMs);
    }, config.initialDelayMs);
}

export function stopAutoSync(): void {
    if (startDelayTimer) {
        clearTimeout(startDelayTimer);
        startDelayTimer = null;
    }
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    state.isRunning = false;
}

export function getAutoSyncState(): AutoSyncState {
    return { ...state };
}
