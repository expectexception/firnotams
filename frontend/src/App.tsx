// testing small commit

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { RefreshCw, Plane, Wifi, WifiOff, AlertCircle, Map as MapIcon, Database } from 'lucide-react';
import { LocationNotams, FirStatusItem, BulkNotamResponse, BulkFirResponse, AirportInfo, FirInfo, SystemConfig } from './types';
import { fetchBulkNotams, fetchBulkFirs, fetchConfig } from './api/notams';
import { selectTop3FirNotams } from './utils/notamParsers';
import UTCClock from './components/UTCClock';
import ESCATBanner from './components/ESCATBanner';
import Home from './pages/Home';
import Notams from './pages/Notams';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function App() {
    const [airports, setAirports] = useState<AirportInfo[]>([]);
    const [firs, setFirs] = useState<FirInfo[]>([]);
    const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
    const [configLoaded, setConfigLoaded] = useState(false);

    const [notamData, setNotamData] = useState<Record<string, LocationNotams>>({});
    const [firData, setFirData] = useState<Record<string, FirStatusItem>>({});
    const [geoJson, setGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
    const [loading, setLoading] = useState(true);
    const [firLoading, setFirLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    // Load System Config first
    useEffect(() => {
        fetchConfig()
            .then(data => {
                setAirports(data.airports);
                setFirs(data.firs);
                setSystemConfig(data.config);
                setConfigLoaded(true);
            })
            .catch(err => {
                console.error('Failed to load system config:', err);
                setError('Failed to connect to backend configuration.');
                setLoading(false);
                setFirLoading(false);
            });
    }, []);

    // Load GeoJSON once
    useEffect(() => {
        fetch('/fir.geojson')
            .then(res => res.json())
            .then((data) => {
                setGeoJson(data as GeoJSON.FeatureCollection);
            })
            .catch(err => {
                console.error('Failed to load GeoJSON:', err);
            });
    }, []);

    const loadAllData = useCallback(async (isManual = false) => {
        if (!configLoaded || airports.length === 0) {
            console.log('[DEBUG] Skipping loadAllData: Config not ready or no airports.');
            return;
        }

        if (isManual) setRefreshing(true);
        else setLoading(true);

        setError(null);

        try {
            const fetchAirportsEnabled = systemConfig?.fetchAirports !== false;

            // Filter airports based on config
            const activeAirports = fetchAirportsEnabled ? airports : [];
            const allAirportIcaos = activeAirports.map(a => a.icao);
            const allFirIcaos = firs.map(f => f.icao);

            if (allAirportIcaos.length === 0 && allFirIcaos.length === 0) {
                console.warn('[DEBUG] No ICAOs to fetch.');
                setLoading(false);
                return;
            }

            console.log(`[DEBUG] Fetching NOTAMs for ${allAirportIcaos.length + allFirIcaos.length} locations...`);

            const [notamRes, firRes] = await Promise.allSettled([
                fetchBulkNotams([...allAirportIcaos, ...allFirIcaos], isManual),
                fetchBulkFirs(allFirIcaos),
            ]);

            if (notamRes.status === 'fulfilled') {
                const rawData = (notamRes.value as BulkNotamResponse).locations ?? {};
                const processedData: Record<string, LocationNotams> = {};

                for (const [icao, locationData] of Object.entries(rawData)) {
                    const result = selectTop3FirNotams(locationData.notams ?? []);
                    const fallbackFirStatus = firRes.status === 'fulfilled'
                        ? (firRes.value as BulkFirResponse).firs?.[icao]?.status
                        : undefined;
                    const displayNotams = result.notams.length > 0
                        ? result.notams
                        : (locationData.notams ?? []).slice(0, 3);
                    processedData[icao] = {
                        ...locationData,
                        status: result.status !== 'unknown' ? result.status : (fallbackFirStatus ?? locationData.status),
                        hasEscat: result.hasEscat,
                        hasInterference: result.hasInterference || locationData.hasInterference,
                        notams: displayNotams,
                    };
                }

                setNotamData(processedData);

                if (firRes.status === 'fulfilled') {
                    const rawFirData = (firRes.value as BulkFirResponse).firs ?? {};
                    const patchedFirData: Record<string, FirStatusItem> = { ...rawFirData };

                    // Status severity ranking (higher = worse)
                    const severityRank: Record<string, number> = { unknown: 0, green: 1, orange: 2, red: 3 };
                    const worstStatus = (a: string | undefined, b: string | undefined): string => {
                        const ra = severityRank[a ?? 'unknown'] ?? 0;
                        const rb = severityRank[b ?? 'unknown'] ?? 0;
                        return ra >= rb ? (a ?? 'unknown') : (b ?? 'unknown');
                    };

                    for (const [icao, loc] of Object.entries(processedData)) {
                        if (patchedFirData[icao]) {
                            const backendStatus = patchedFirData[icao].status;
                            const frontendStatus = loc.status !== 'unknown' ? loc.status : undefined;
                            // Worst-wins: use whichever is more severe (backend or frontend keyword analysis)
                            const combinedStatus = worstStatus(backendStatus, frontendStatus);
                            patchedFirData[icao] = {
                                ...patchedFirData[icao],
                                status: combinedStatus as any,
                                hasEscat: loc.hasEscat || patchedFirData[icao].hasEscat,
                                hasInterference: loc.hasInterference ?? false,
                            };
                        }
                    }
                    setFirData(patchedFirData);
                    setFirLoading(false);
                } else {
                    console.error('FIR fetch failed:', firRes.reason);
                    setFirLoading(false);
                }
            } else {
                console.error('NOTAM fetch failed:', notamRes.reason);
                const reason = notamRes.reason instanceof Error ? notamRes.reason.message : String(notamRes.reason);
                setError(`Failed to load NOTAM data: ${reason}`);

                if (firRes.status === 'fulfilled') {
                    const data = (firRes.value as BulkFirResponse).firs ?? {};
                    setFirData(data);
                    setFirLoading(false);
                }
            }

            setLastRefresh(new Date());
        } catch (err: any) {
            console.error('Load Error:', err);
            setError(err?.message || 'Unknown error occurred');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [configLoaded, airports, firs]);

    // Initial load
    useEffect(() => {
        if (configLoaded) loadAllData();
    }, [configLoaded, loadAllData]);

    // Auto-refresh every 5 minutes
    useEffect(() => {
        const interval = setInterval(() => loadAllData(), REFRESH_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [loadAllData]);

    // Collect ESCAT-affected locations
    const escatLocations = Object.entries(notamData)
        .filter(([, d]) => d.hasEscat)
        .map(([icao]) => icao);

    // Format last refresh time
    const lastRefreshStr = lastRefresh
        ? `${String(lastRefresh.getUTCHours()).padStart(2, '0')}:${String(lastRefresh.getUTCMinutes()).padStart(2, '0')} UTC`
        : null;

    const location = useLocation();
    const isHome = location.pathname === '/';

    // Header counts — grouped by GeoJSON polygon to match the map parity
    const statusCounts = useMemo(() => {
        const severityRank: Record<string, number> = { unknown: 0, green: 1, orange: 2, red: 3 };
        const geoGroups: Record<string, { status: string, hasInterference: boolean, hasEscat: boolean }> = {};

        for (const fir of firs) {
            const code = fir.geojsonCode || fir.icao;
            const d = firData[fir.icao];
            const nd = notamData[fir.icao];
            const status = d?.status ?? nd?.status ?? 'unknown';

            if (!geoGroups[code]) {
                geoGroups[code] = { status: 'unknown', hasInterference: false, hasEscat: false };
            }

            // Aggregate: worst status wins
            if (severityRank[status] > severityRank[geoGroups[code].status]) {
                geoGroups[code].status = status;
            }
            if (d?.hasInterference || nd?.hasInterference) geoGroups[code].hasInterference = true;
            if (d?.hasEscat || nd?.hasEscat) geoGroups[code].hasEscat = true;
        }

        let red = 0, orange = 0, unknown = 0, interference = 0;
        for (const g of Object.values(geoGroups)) {
            if (g.status === 'red') red++;
            else if (g.status === 'orange') orange++;
            else if (g.status === 'unknown') unknown++;

            if (g.hasInterference) interference++;
        }
        return { red, orange, unknown, interference };
    }, [firs, firData, notamData]);

    return (
        <div className="h-screen bg-notam-bg flex flex-col overflow-x-hidden">
            {/* ── HEADER ─────────────────────────────────────────────── */}
            <header className="flex-shrink-0 z-50 bg-notam-bg/95 backdrop-blur-md border-b border-notam-border/60">
                <div className="max-w-[1600px] mx-auto px-3 sm:px-4">
                    <div className="flex items-center gap-2 sm:gap-3 py-2 sm:py-3">
                        {/* Logo & Badge */}
                        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                            <img src="/logo.png" alt="Logo" className="h-7 sm:h-8 w-auto object-contain" />
                            <div className="flex items-center gap-1.5">
                                <span className="relative flex h-2 w-2 mb-0.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                </span>
                                <span className="text-[18px] sm:text-[25px] font-black tracking-[-0.02em] text-red-500 uppercase leading-none">ALERTS</span>
                            </div>
                        </div>

                        {/* Navigation */}
                        <nav className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg flex-shrink-0">
                            <NavLink
                                to="/"
                                className={({ isActive }) =>
                                    `flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm transition-colors ${isActive
                                        ? 'bg-blue-600/20 text-blue-400 font-semibold border border-blue-500/30 shadow-sm'
                                        : 'text-slate-400 font-medium hover:text-slate-300 hover:bg-slate-800 border border-transparent'
                                    }`
                                }
                            >
                                <MapIcon size={13} />
                                <span className="hidden sm:inline">Home</span>
                            </NavLink>
                            <NavLink
                                to="/notams"
                                className={({ isActive }) =>
                                    `flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm transition-colors ${isActive
                                        ? 'bg-blue-600/20 text-blue-400 font-semibold border border-blue-500/30 shadow-sm'
                                        : 'text-slate-400 font-medium hover:text-slate-300 hover:bg-slate-800 border border-transparent'
                                    }`
                                }
                            >
                                <Database size={13} />
                                <span className="hidden sm:inline">Airspace Closed</span>
                            </NavLink>
                        </nav>

                        {/* Region label — desktop only */}
                        <div className="hidden lg:flex items-center gap-1.5">
                            <div className="w-1 h-4 bg-blue-500 rounded-full" />
                            <span className="text-xs text-notam-muted font-medium">Middle East · South Asia · Mediterranean</span>
                        </div>

                        {/* Spacer */}
                        <div className="flex-1" />

                        {/* Status counts — desktop only */}
                        {!loading && (
                            <div className="hidden lg:flex items-center gap-2 mr-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter mr-1">FIRs:</span>
                                {statusCounts.red > 0 && (
                                    <span className="flex items-center gap-1 text-xs bg-red-950/40 border border-red-800/50 text-notam-red px-2 py-0.5 rounded-full">
                                        <span className="w-1 h-1 rounded-full bg-notam-red animate-pulse" />
                                        {statusCounts.red}
                                    </span>
                                )}
                                {statusCounts.orange > 0 && (
                                    <span className="flex items-center gap-1 text-xs bg-orange-950/40 border border-orange-800/50 text-notam-orange px-2 py-0.5 rounded-full">
                                        <span className="w-1 h-1 rounded-full bg-notam-orange" />
                                        {statusCounts.orange}
                                    </span>
                                )}
                                {statusCounts.unknown > 0 && (
                                    <span className="flex items-center gap-1 text-xs bg-slate-800/60 border border-slate-700/50 text-slate-500 px-2 py-0.5 rounded-full">
                                        <span className="w-1 h-1 rounded-full bg-slate-600" />
                                        {statusCounts.unknown}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Connections indicator */}
                        {loading ? (
                            <Wifi size={14} className="text-blue-400 spinner" />
                        ) : error ? (
                            <WifiOff size={14} className="text-red-400" />
                        ) : (
                            <Wifi size={14} className="text-notam-green" />
                        )}

                        {/* Last refresh — desktop only */}
                        {lastRefreshStr && (
                            <div className="hidden md:flex items-center gap-1 text-[10px] text-notam-muted">
                                <span>Refreshed {lastRefreshStr}</span>
                            </div>
                        )}

                        {/* UTC Clock — hidden on xs to prevent overflow */}
                        <div className="hidden sm:block">
                            <UTCClock />
                        </div>

                        {/* Manual refresh button */}
                        <button
                            onClick={() => loadAllData(true)}
                            disabled={refreshing || loading}
                            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-all duration-200 shadow-lg shadow-blue-900/40 flex-shrink-0"
                            title="Refresh data"
                        >
                            <RefreshCw size={12} className={refreshing ? 'spinner' : ''} />
                            <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* ── MAIN CONTENT ───────────────────────────────────────── */}
            <main className="flex-1 w-full h-full relative flex flex-col min-h-0">
                {/* Error banner overlays */}
                {error && (
                    <div className="absolute top-4 left-4 right-4 z-[1000] flex items-center gap-3 bg-red-950/90 border border-red-800 rounded-lg px-4 py-3 shadow-lg">
                        <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            <span className="text-red-300 text-sm">{error}</span>
                            <span className="text-red-400/70 text-xs ml-2">
                                Make sure the backend is running on port 3001.
                            </span>
                        </div>
                        <button
                            onClick={() => setError(null)}
                            className="text-red-400 hover:text-red-300 text-xs flex-shrink-0"
                        >
                            Dismiss
                        </button>
                    </div>
                )}

                {/* ESCAT banner overlay */}
                {/* {escatLocations.length > 0 && (
                    <div className="absolute top-4 left-4 right-4 z-[999]">
                        <ESCATBanner affectedLocations={escatLocations} />
                    </div>
                )} */}

                <Routes>
                    <Route path="/" element={<Home geoJson={geoJson} firs={firs} firData={firData} notamData={notamData} loading={firLoading} />} />
                    <Route path="/notams" element={
                        <div className="flex-1 w-full h-full overflow-y-auto flex flex-col">
                            <div className="flex-1 w-full max-w-[1600px] mx-auto flex flex-col">
                                <Notams firs={firs} firData={firData} notamData={notamData} loading={loading} />

                                {/* Footer only on Notams page */}
                                <footer className="border-t border-notam-border/40 pt-6 pb-8 mx-4 lg:mx-8 flex-shrink-0 mt-auto">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="flex items-center gap-2 px-3 py-1 bg-slate-900/40 border border-slate-800/60 rounded-full">
                                            <div className="w-1 h-1 rounded-full bg-blue-500/80 shadow-[0_0_8px_rgba(59,130,246,0.4)]" />
                                            <span className="text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase">
                                                SkyShield Crisis Management System
                                            </span>
                                        </div>

                                    </div>
                                </footer>
                            </div>
                        </div>
                    } />
                </Routes>
            </main>
        </div>
    );
}

export default App;
