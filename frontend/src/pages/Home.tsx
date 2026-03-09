import React, { useMemo, useState } from 'react';
import NotamMap from '../components/NotamMap';
import FIRDetailModal from '../components/FIRDetailModal';
import { FirInfo, FirStatusItem, LocationNotams, NotamStatus } from '../types';
import { Filter, AlertTriangle } from 'lucide-react';

interface HomeProps {
    geoJson: GeoJSON.FeatureCollection | null;
    firs: FirInfo[];
    firData: Record<string, FirStatusItem>;
    notamData: Record<string, LocationNotams>;
    loading: boolean;
}

const Home: React.FC<HomeProps> = ({ geoJson, firs, firData, notamData, loading }) => {
    const [statusFilter, setStatusFilter] = useState<NotamStatus | 'all' | 'escat' | 'interference'>('all');
    const [selectedFirIcao, setSelectedFirIcao] = useState<string | null>(null);

    // Use the patched firData (which reflects our pipeline status) for consistent counts
    const counts = useMemo(() => {
        const severityRank: Record<string, number> = { unknown: 0, green: 1, orange: 2, red: 3 };
        const geoGroups: Record<string, { status: string, hasInterference: boolean, hasEscat: boolean }> = {};

        firs.forEach(fir => {
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
        });

        const geoValues = Object.values(geoGroups);
        const c = { all: geoValues.length, red: 0, orange: 0, escat: 0, interference: 0 };
        geoValues.forEach(g => {
            if (g.status === 'red') c.red++;
            if (g.status === 'orange') c.orange++;
            if (g.hasEscat) c.escat++;
            if (g.hasInterference) c.interference++;
        });
        return c;
    }, [firs, firData, notamData]);

    const selectedFir = selectedFirIcao ? firs.find(f => f.icao === selectedFirIcao) ?? null : null;

    return (
        <div className="flex-1 w-full h-full relative">
            {/* Map Filter Controls */}
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-[1000] w-max max-w-[calc(100%-2rem)] pb-safe transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex items-center gap-2 bg-slate-950/60 backdrop-blur-xl border border-white/10 px-3 py-2 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-x-auto hide-scrollbar ring-1 ring-white/5">
                    <div className="flex items-center gap-1.5 px-2 border-r border-slate-700/50 mr-1 flex-shrink-0">
                        <Filter size={14} className="text-slate-400" />
                        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest hidden sm:inline">Filters</span>
                    </div>

                    {/* All */}
                    <button
                        onClick={() => setStatusFilter('all')}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all duration-300 flex items-center gap-1.5 ${statusFilter === 'all' ? 'bg-blue-600/90 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)] border border-blue-400/30' : 'bg-transparent text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'}`}
                    >
                        <span>All</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${statusFilter === 'all' ? 'bg-white/20' : 'bg-slate-800'}`}>{counts.all}</span>
                    </button>

                    {/* Closed */}
                    <button
                        onClick={() => setStatusFilter('red')}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all duration-300 flex items-center gap-1.5 ${statusFilter === 'red' ? 'bg-red-600/90 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)] border border-red-400/30' : 'bg-transparent text-slate-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent'}`}
                    >
                        <div className={`w-1.5 h-1.5 rounded-full bg-red-400 ${statusFilter !== 'red' ? 'opacity-50' : 'animate-[red-pulse_2s_ease-in-out_infinite]'}`} />
                        <span>Closed</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${statusFilter === 'red' ? 'bg-black/20' : 'bg-red-500/20 text-red-400'}`}>{counts.red}</span>
                    </button>

                    {/* Restricted */}
                    <button
                        onClick={() => setStatusFilter('orange')}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all duration-300 flex items-center gap-1.5 ${statusFilter === 'orange' ? 'bg-orange-600/90 text-white shadow-[0_0_15px_rgba(234,88,12,0.5)] border border-orange-400/30' : 'bg-transparent text-slate-400 hover:text-orange-300 hover:bg-orange-500/10 border border-transparent'}`}
                    >
                        <div className={`w-1.5 h-1.5 rounded-full bg-orange-400 ${statusFilter !== 'orange' ? 'opacity-50' : ''}`} />
                        <span>Restricted</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${statusFilter === 'orange' ? 'bg-black/20' : 'bg-orange-500/20 text-orange-400'}`}>{counts.orange}</span>
                    </button>

                    {/* ESCAT */}
                    <button
                        onClick={() => setStatusFilter('escat')}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all duration-300 flex items-center gap-1.5 ${statusFilter === 'escat' ? 'bg-red-950/80 text-red-200 border border-red-500/60 shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'bg-transparent text-slate-400 hover:text-red-400 hover:bg-red-900/30 border border-transparent'}`}
                    >
                        <AlertTriangle size={12} className={statusFilter === 'escat' ? 'text-red-400' : ''} />
                        <span>ESCAT</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${statusFilter === 'escat' ? 'bg-red-500/30 text-white' : 'bg-red-900/40 text-red-400'}`}>{counts.escat}</span>
                    </button>

                    {/* GNSS */}
                    <button
                        onClick={() => setStatusFilter('interference')}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all duration-300 flex items-center gap-1.5 ${statusFilter === 'interference' ? 'bg-indigo-600/90 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)] border border-indigo-400/30' : 'bg-transparent text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10 border border-transparent'}`}
                    >
                        <div className={`w-1.5 h-1.5 rounded-full bg-indigo-300 ${statusFilter !== 'interference' ? 'opacity-50' : 'animate-pulse'}`} />
                        <span>GNSS</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${statusFilter === 'interference' ? 'bg-black/20 text-white' : 'bg-indigo-500/20 text-indigo-400'}`}>{counts.interference}</span>
                    </button>
                </div>
            </div>

            <NotamMap
                geoJson={geoJson}
                firs={firs}
                firData={firData}
                notamData={notamData}
                loading={loading}
                activeFilter={statusFilter}
                onFirClick={(icao) => setSelectedFirIcao(icao)}
            />

            {/* FIR Detail Modal */}
            {selectedFir && (
                <FIRDetailModal
                    fir={selectedFir}
                    firStatus={firData[selectedFir.icao] ?? null}
                    notamData={notamData[selectedFir.icao] ?? null}
                    loading={loading}
                    onClose={() => setSelectedFirIcao(null)}
                />
            )}
        </div>
    );
};

export default Home;
