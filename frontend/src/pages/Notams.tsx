import React, { useState, useMemo } from 'react';
import { FirInfo, FirStatusItem, LocationNotams } from '../types';
import { Search, Filter, AlertTriangle } from 'lucide-react';
import FIRCard from '../components/FIRCard';

interface NotamsProps {
    firs: FirInfo[];
    firData: Record<string, FirStatusItem>;
    notamData: Record<string, LocationNotams>;
    loading: boolean;
}

type FilterStatus = 'red' | 'orange' | 'escat' | 'interference';


const Notams: React.FC<NotamsProps> = ({ firs, firData, notamData, loading }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<FilterStatus>('red');

    const statusCounts = useMemo(() => {
        const severityRank: Record<string, number> = { unknown: 0, green: 1, orange: 2, red: 3 };
        const geoGroups: Record<string, { status: string, hasInterference: boolean, hasEscat: boolean }> = {};

        firs.forEach(fir => {
            const code = fir.geojsonCode || fir.icao;
            const d = notamData[fir.icao];
            const fd = firData[fir.icao];
            const status = d?.status && d.status !== 'unknown' ? d.status : (fd?.status || 'unknown');

            if (!geoGroups[code]) {
                geoGroups[code] = { status: 'unknown', hasInterference: false, hasEscat: false };
            }

            if (severityRank[status] > severityRank[geoGroups[code].status]) {
                geoGroups[code].status = status;
            }
            if (fd?.hasEscat || d?.hasEscat) geoGroups[code].hasEscat = true;
            if (fd?.hasInterference || d?.hasInterference) geoGroups[code].hasInterference = true;
        });

        const geoValues = Object.values(geoGroups);
        const counts = { red: 0, orange: 0, green: 0, escat: 0, interference: 0 };
        geoValues.forEach(g => {
            if (g.status === 'red') counts.red++;
            if (g.status === 'orange') counts.orange++;
            if (g.status === 'green') counts.green++;
            if (g.hasEscat) counts.escat++;
            if (g.hasInterference) counts.interference++;
        });
        return counts;
    }, [firs, firData, notamData]);

    const filteredFirs = useMemo(() => {
        return firs.filter(fir => {
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch = !searchTerm ||
                fir.icao.toLowerCase().includes(searchLower) ||
                fir.name.toLowerCase().includes(searchLower);

            const nd = notamData[fir.icao];
            const fd = firData[fir.icao];
            // prefer pipeline status only when not unknown; otherwise use backend status
            const status = nd?.status && nd.status !== 'unknown' ? nd.status : (fd?.status ?? 'unknown');
            const hasEscat = fd?.hasEscat ?? nd?.hasEscat ?? false;

            let matchesFilter = true;
            if (statusFilter === 'escat') {
                matchesFilter = hasEscat;
            } else if (statusFilter === 'interference') {
                matchesFilter = fd?.hasInterference || nd?.hasInterference || false;
            } else {
                matchesFilter = status === statusFilter;
            }

            return matchesSearch && matchesFilter;
        });
    }, [firs, firData, notamData, searchTerm, statusFilter]);

    return (
        <div className="flex-1 px-3 sm:px-4 lg:px-8 py-4 sm:py-6 flex flex-col gap-4 sm:gap-6">
            {/* Search & Filter Top Bar */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800/80 shadow-sm">
                {/* Search */}
                <div className="relative w-full sm:w-80 text-slate-300">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search size={16} className="text-slate-500" />
                    </div>
                    <input
                        type="text"
                        className="bg-slate-950/50 border border-slate-700/50 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 py-2.5 pr-4 placeholder-slate-500 outline-none transition-all"
                        placeholder="Search FIR ICAO or name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 hide-scrollbar">
                    <Filter size={16} className="text-slate-500 mr-1 flex-shrink-0 hidden sm:block" />
                    <button
                        onClick={() => setStatusFilter('red')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${statusFilter === 'red' ? 'bg-red-950/80 text-red-400 border-red-500/50 shadow-[0_0_10px_-2px_rgba(239,68,68,0.2)]' : 'bg-slate-800/50 text-slate-400 border-transparent hover:bg-slate-700/80'}`}
                    >
                        <span>Closed</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${statusFilter === 'red' ? 'bg-red-500/20' : 'bg-red-500/10 text-red-500'}`}>{statusCounts.red}</span>
                    </button>
                    <button
                        onClick={() => setStatusFilter('orange')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${statusFilter === 'orange' ? 'bg-orange-950/80 text-orange-400 border-orange-500/50 shadow-[0_0_10px_-2px_rgba(249,115,22,0.2)]' : 'bg-slate-800/50 text-slate-400 border-transparent hover:bg-slate-700/80'}`}
                    >
                        <span>Restricted</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${statusFilter === 'orange' ? 'bg-orange-500/20' : 'bg-orange-500/10 text-orange-500'}`}>{statusCounts.orange}</span>
                    </button>
                    <button
                        onClick={() => setStatusFilter('escat')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${statusFilter === 'escat' ? 'bg-red-950/90 text-red-300 border-red-600/60 shadow-[0_0_12px_-2px_rgba(239,68,68,0.35)]' : 'bg-slate-800/50 text-slate-400 border-transparent hover:bg-red-950/40 hover:text-red-400 hover:border-red-900/50'}`}
                    >
                        <AlertTriangle size={12} className={statusFilter === 'escat' ? 'text-red-400' : 'text-slate-400'} />
                        <span>ESCAT</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${statusFilter === 'escat' ? 'bg-red-500/20' : 'bg-red-900/30 text-red-400'}`}>{statusCounts.escat}</span>
                    </button>
                    <button
                        onClick={() => setStatusFilter('interference')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${statusFilter === 'interference' ? 'bg-indigo-950/80 text-indigo-400 border-indigo-500/50 shadow-[0_0_10px_-2px_rgba(79,70,229,0.2)]' : 'bg-slate-800/50 text-slate-400 border-transparent hover:bg-slate-700/80'}`}
                    >
                        <span>GNSS</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${statusFilter === 'interference' ? 'bg-indigo-500/20' : 'bg-indigo-500/10 text-indigo-400'}`}>{statusCounts.interference}</span>
                    </button>
                </div>
            </div>

            {/* FIR Card Grid */}
            {loading && filteredFirs.length === 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="w-full h-64 rounded-xl border border-slate-800/50 bg-slate-900/30 p-4 flex flex-col justify-between overflow-hidden">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                    <div className="w-16 h-8 skeleton rounded-md" />
                                    <div className="w-24 h-4 skeleton rounded" />
                                </div>
                                <div className="w-12 h-6 skeleton rounded-full" />
                            </div>
                            <div className="space-y-2">
                                <div className="w-32 h-4 skeleton rounded" />
                                <div className="w-20 h-3 skeleton rounded" />
                            </div>
                            <div className="h-16 skeleton rounded-lg w-full" />
                        </div>
                    ))}
                </div>
            ) : filteredFirs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-500">
                    <Search size={48} className="mb-4 opacity-20" />
                    {statusFilter === 'red' && !searchTerm ? (
                        <>
                            <h3 className="text-xl font-medium text-green-400">No Closed FIRs</h3>
                            <p className="text-sm mt-2">All monitored FIR airspaces are currently operational.</p>
                        </>
                    ) : (
                        <>
                            <h3 className="text-xl font-medium text-slate-300">No FIRs match</h3>
                            <p className="text-sm mt-2">Adjust your search or filter.</p>
                        </>
                    )}
                    {(searchTerm || statusFilter !== 'red') && (
                        <button
                            onClick={() => { setSearchTerm(''); setStatusFilter('red'); }}
                            className="mt-6 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                        >
                            Reset filters
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {filteredFirs.map(fir => (
                        <FIRCard
                            key={fir.icao}
                            fir={fir}
                            firStatus={firData[fir.icao] ?? null}
                            notamData={notamData[fir.icao] ?? null}
                            loading={loading && !firData[fir.icao]}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default Notams;
