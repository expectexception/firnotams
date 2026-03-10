import React, { useMemo, Suspense, lazy } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { RefreshCw, Wifi, WifiOff, AlertCircle, Map as MapIcon, Database } from 'lucide-react';
import { useNotamData } from './hooks/useNotamData';
import UTCClock from './components/UTCClock';

// Lazy load pages for better performance
const Home = lazy(() => import('./pages/Home'));
const Notams = lazy(() => import('./pages/Notams'));

function App() {
    const {
        firs,
        notamData,
        firData,
        geoJson,
        loading,
        firLoading,
        error,
        lastRefresh,
        refreshing,
        loadAllData,
        setError
    } = useNotamData();

    // Format last refresh time
    const lastRefreshStr = lastRefresh
        ? `${String(lastRefresh.getUTCHours()).padStart(2, '0')}:${String(lastRefresh.getUTCMinutes()).padStart(2, '0')} UTC`
        : null;

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
                            <img src="logo.png" alt="Logo" className="h-7 sm:h-8 w-auto object-contain" />
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
                                <span className="hidden sm:inline">Map</span>
                            </NavLink>
                            <NavLink
                                to="/notams"
                                className={({ isActive }) =>
                                    `flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm transition-colors ${isActive
                                        ? 'bg-red-600/20  text-black-400 font-semibold border border-red-500/30 shadow-sm'
                                        : 'text-slate-400 font-medium hover:text-slate-300 hover:bg-slate-800 border border-transparent'
                                    }`
                                }
                            >
                                <Database size={13} />
                                <span className="hidden sm:inline">Airspace Restrictions</span>
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
                        </div>
                        <button
                            onClick={() => setError(null)}
                            className="text-red-400 hover:text-red-300 text-xs flex-shrink-0"
                        >
                            Dismiss
                        </button>
                    </div>
                )}

                <Suspense fallback={
                    <div className="flex-1 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="h-10 w-10 border-2 border-blue-400 border-t-transparent rounded-full spinner" />
                            <span className="text-slate-400 text-sm font-medium animate-pulse">Initializing System…</span>
                        </div>
                    </div>
                }>
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
                </Suspense>
            </main>
        </div>
    );
}

export default App;
