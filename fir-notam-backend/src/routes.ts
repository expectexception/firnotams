import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { fetchBulkNotams, fetchFirStatus } from './notamService';
import { getAirportsByFir, AIRPORTS, FIRS } from './airportData';
import { getAutoSyncState } from './autoSync';
import { NotamCacheModel } from './models/NotamCache';
import { fetchMetarFromProvider, fetchTafFromProvider } from './weatherService';

const router = Router();

// Rate limit for forceRefresh to prevent scraper abuse
const forceRefreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 forceRefresh requests per windowMs
    message: { error: 'Too many refresh requests, please try again later.' },
    skip: (req) => req.query.forceRefresh !== 'true',
});

// GET /api/notams/bulk?locations=OMAA,OMDB,...
router.get('/notams/bulk', forceRefreshLimiter, async (req: Request, res: Response) => {
    try {
        const locationsParam = req.query.locations as string;
        if (!locationsParam) {
            return res.status(400).json({ error: 'Missing locations parameter' });
        }

        const icaos = locationsParam
            .split(',')
            .map(s => s.trim().toUpperCase())
            .filter(Boolean);

        if (icaos.length === 0) {
            return res.status(400).json({ error: 'No valid ICAO codes provided' });
        }

        if (icaos.length > 100) {
            return res.status(400).json({ error: 'Too many locations (max 100)' });
        }

        const forceRefresh = `${req.query.forceRefresh || 'false'}`.toLowerCase() === 'true';
        const data = await fetchBulkNotams(icaos, { forceRefresh });
        return res.json({ locations: data, timestamp: Date.now() });
    } catch (err: any) {
        console.error('Error in /api/notams/bulk:', err);
        return res.status(500).json({ error: err?.message || 'Internal server error' });
    }
});

// GET /api/firs/bulk?locations=OMAE,OSTT,...
router.get('/firs/bulk', forceRefreshLimiter, async (req: Request, res: Response) => {
    try {
        const locationsParam = req.query.locations as string;
        if (!locationsParam) {
            return res.status(400).json({ error: 'Missing locations parameter' });
        }

        const firIcaos = locationsParam
            .split(',')
            .map(s => s.trim().toUpperCase())
            .filter(Boolean);

        if (firIcaos.length === 0) {
            return res.status(400).json({ error: 'No valid FIR codes provided' });
        }

        const forceRefresh = `${req.query.forceRefresh || 'false'}`.toLowerCase() === 'true';
        const data = await fetchFirStatus(firIcaos, getAirportsByFir, { forceRefresh });
        return res.json({ firs: data, timestamp: Date.now() });
    } catch (err: any) {
        console.error('Error in /api/firs/bulk:', err);
        return res.status(500).json({ error: err?.message || 'Internal server error' });
    }
});

// Health check
router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Auto sync status
router.get('/sync/status', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: Date.now(),
        autoSync: getAutoSyncState(),
    });
});

// GET /api/config
router.get('/config', (_req: Request, res: Response) => {
    res.json({
        airports: AIRPORTS,
        firs: FIRS,
        config: {
            fetchAirports: process.env.FETCH_AIRPORTS_ENABLED !== 'false',
            fetchFirs: process.env.FETCH_FIRS_ENABLED !== 'false',
        },
        timestamp: Date.now(),
    });
});

// Cache verification endpoint
// GET /api/notams/cache/bulk?locations=OMAA,OMDB
router.get('/notams/cache/bulk', async (req: Request, res: Response) => {
    try {
        const locationsParam = req.query.locations as string;
        if (!locationsParam) {
            return res.status(400).json({ error: 'Missing locations parameter' });
        }

        const icaos = locationsParam
            .split(',')
            .map(s => s.trim().toUpperCase())
            .filter(Boolean);

        if (icaos.length === 0) {
            return res.status(400).json({ error: 'No valid ICAO codes provided' });
        }

        if (icaos.length > 50) {
            return res.status(400).json({ error: 'Too many locations (max 50)' });
        }

        const docs = await NotamCacheModel.find({ icao: { $in: icaos } })
            .select({ _id: 0, __v: 0 })
            .lean();

        const byIcao: Record<string, any> = {};
        for (const icao of icaos) byIcao[icao] = null;
        for (const doc of docs) byIcao[(doc as any).icao] = doc;

        return res.json({
            cache: byIcao,
            timestamp: Date.now(),
        });
    } catch (err: any) {
        console.error('Error in /api/notams/cache/bulk:', err);
        return res.status(500).json({ error: err?.message || 'Internal server error' });
    }
});


// GET /api/metar/:icao
router.get('/metar/:icao', async (req: Request, res: Response) => {
    try {
        const { icao } = req.params;
        if (!icao) return res.status(400).json({ error: 'Missing ICAO code' });
        const data = await fetchMetarFromProvider(icao.toUpperCase());
        if (!data) return res.status(404).json({ error: 'METAR not found' });
        return res.json(data);
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || 'Internal server error' });
    }
});

// GET /api/taf/:icao
router.get('/taf/:icao', async (req: Request, res: Response) => {
    try {
        const { icao } = req.params;
        if (!icao) return res.status(400).json({ error: 'Missing ICAO code' });
        const data = await fetchTafFromProvider(icao.toUpperCase());
        if (!data) return res.status(404).json({ error: 'TAF not found' });
        return res.json(data);
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || 'Internal server error' });
    }
});

export default router;
