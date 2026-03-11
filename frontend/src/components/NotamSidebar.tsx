import React, { useMemo, useState } from 'react';
import { AlertTriangle, Activity, ChevronRight, Clock, ChevronLeft, Menu, Navigation, SignalLow, Radio } from 'lucide-react';
import { FirInfo, FirStatusItem, LocationNotams, NotamStatus, NotamItem } from '../types';
import { parseFirNotam, getSeverityScore, isOpsReason } from '../utils/notamParsers';

interface NotamSidebarProps {
    firs: FirInfo[];
    firData: Record<string, FirStatusItem>;
    notamData: Record<string, LocationNotams>;
    activeFilter: NotamStatus | 'all' | 'escat' | 'interference';
    onFilterChange: (filter: NotamStatus | 'all' | 'escat' | 'interference') => void;
    onNotamClick: (firIcao: string, notamId: string) => void;
    counts: { all: number, red: number, orange: number, escat: number, interference: number };
}

function getTimeAgo(date: Date): string {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
}

const NotamSidebar: React.FC<NotamSidebarProps> = ({
    firs,
    firData: _firData,
    notamData,
    onNotamClick,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    // Extract today's notable AND active NOTAMs
    const todayNotams = useMemo(() => {
        const now = new Date();
        const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        
        const allRelevant: { notam: NotamItem, firIcao: string, firName: string, score: number, publishedAt: Date }[] = [];

        Object.entries(notamData).forEach(([icao, data]) => {
            const fir = firs.find(f => f.icao === icao);
            if (!fir) return;

            data.notams.forEach(notam => {
                const parsed = parseFirNotam(notam);
                const startDate = parsed.startDate;
                const endDate = parsed.endDate;

                // 1. Published Today: Started at or after 00:00 UTC today
                const isPublishedToday = startDate && startDate >= startOfToday;
                
                // 2. Currently Active: Started in the past and hasn't expired yet
                // This also naturally excludes "upcoming" NOTAMs (startDate > now)
                const isActive = startDate && startDate <= now && (!endDate || endDate > now);

                if (isPublishedToday && isActive) {
                    allRelevant.push({
                        notam,
                        firIcao: icao,
                        firName: fir.name,
                        score: getSeverityScore(notam.text),
                        publishedAt: startDate
                    });
                }
            });
        });

        // Dynamic sorting: Highest severity first, then newest first
        return allRelevant
            .sort((a, b) => b.score - a.score || b.publishedAt.getTime() - a.publishedAt.getTime())
            .slice(0, 40);
    }, [notamData, firs]);

    const sidebarContent = (
        <div className="h-full flex flex-col bg-slate-950 border-l border-white/10 overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-900/40 backdrop-blur-md">
                <div className="flex items-center gap-2.5">
                    <div className="relative">
                        <Activity size={18} className="text-blue-500" />
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse border border-slate-950" />
                    </div>
                    <div>
                        <h2 className="text-[13px] font-black uppercase tracking-[0.15em] text-slate-100">SkyShield Live Feed</h2>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1 h-1 rounded-full bg-green-500" />
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">System Monitoring Active</p>
                        </div>
                    </div>
                </div>
                <button 
                    onClick={() => { setIsCollapsed(true); setIsMobileOpen(false); }}
                    className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-white transition-colors"
                >
                    <ChevronRight size={18} />
                </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-950">
                {todayNotams.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                        <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center mb-4 border border-white/5 shadow-inner">
                            <Clock size={20} className="text-slate-700" />
                        </div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">No updates published today</p>
                        <p className="text-[10px] text-slate-600 mt-2">Checking for new NOTAMs periodically...</p>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {todayNotams.map(({ notam, firIcao, firName, publishedAt }) => {
                            const parsed = parseFirNotam(notam);
                            const severity = parsed.severity;
                            const isOps = isOpsReason(notam.text);
                            const isGnss = /\b(GPS|GNSS|JAMMING|SPOOFING)\b/i.test(notam.text);
                            
                            const severityCls = severity === 'red' 
                                ? 'border-red-500/30 bg-red-500/5' 
                                : severity === 'orange' 
                                    ? 'border-orange-500/30 bg-orange-500/5' 
                                    : 'border-white/5 bg-white/[0.01]';

                            return (
                                <button
                                    key={notam.id}
                                    onClick={() => onNotamClick(firIcao, notam.id)}
                                    className={`w-full text-left p-4 border-b border-white/5 hover:bg-white/[0.03] transition-all group relative overflow-hidden ${severityCls}`}
                                >
                                    {/* News Strip */}
                                    {(severity === 'red' || severity === 'orange') && (
                                        <div className={`absolute top-0 left-0 bottom-0 w-[3px] ${severity === 'red' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-orange-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`} />
                                    )}

                                    <div className="flex flex-col gap-2 relative z-10">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black tracking-widest text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded uppercase border border-blue-500/20">{firIcao}</span>
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter truncate max-w-[140px]">{firName}</span>
                                            </div>
                                            <span className="text-[9px] font-bold text-slate-600 tabular-nums flex items-center gap-1">
                                                <Clock size={8} /> {getTimeAgo(publishedAt)}
                                            </span>
                                        </div>

                                        <div className="flex flex-col gap-1">
                                            <h3 className={`text-[12px] font-black leading-tight tracking-tight uppercase ${severity === 'red' ? 'text-red-400' : severity === 'orange' ? 'text-orange-400' : 'text-slate-200'}`}>
                                                {parsed.qSubject} {parsed.qCondition}
                                            </h3>
                                            <p className="text-[11px] leading-relaxed text-slate-400 font-medium line-clamp-3 font-mono">
                                                {parsed.summary || (notam.text.length > 120 ? notam.text.slice(0, 120) + '...' : notam.text)}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            <span className="text-[9px] font-mono font-black text-slate-500 border border-white/10 px-1.5 py-0.5 rounded bg-white/[0.02]">{notam.id}</span>
                                            {isOps && (
                                                <span className="flex items-center gap-1 text-[8px] font-black text-amber-500 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                    <Navigation size={8} /> OPS
                                                </span>
                                            )}
                                            {isGnss && (
                                                <span className="flex items-center gap-1 text-[8px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/30 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                    <SignalLow size={8} /> GNSS
                                                </span>
                                            )}
                                            <ChevronRight size={12} className="ml-auto text-slate-700 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Total Footer */}
            <div className="p-3 bg-slate-900 border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <Radio size={12} className="text-slate-600" />
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Live Data Stream</span>
                </div>
                <div className="bg-blue-600/10 border border-blue-500/20 px-2 py-0.5 rounded">
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-tighter tabular-nums">
                        {todayNotams.length} Reports
                    </span>
                </div>
            </div>
        </div>
    );

    return (
        <>
            {/* Desktop View */}
            <div className={`hidden md:flex flex-col transition-all duration-300 ease-in-out ${isCollapsed ? 'w-12' : 'w-80'} h-full relative`}>
                {isCollapsed ? (
                    <div className="h-full w-full bg-slate-950 border-l border-white/10 flex flex-col items-center py-6 gap-6 shadow-2xl">
                        <button 
                            onClick={() => setIsCollapsed(false)}
                            className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors border border-transparent hover:border-white/5"
                            title="Expand Live Feed"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <div className="flex flex-col items-center gap-8">
                            <div className="[writing-mode:vertical-lr] rotate-180 text-[10px] font-black uppercase tracking-[0.4em] text-slate-700">
                                LIVE OPERATIONS FEED
                            </div>
                            <div className="relative">
                                <Activity size={12} className="text-blue-900" />
                                <div className="absolute inset-0 bg-blue-500/20 blur-sm rounded-full animate-pulse" />
                            </div>
                        </div>
                    </div>
                ) : (
                    sidebarContent
                )}
            </div>

            {/* Mobile View Toggle */}
            <div className="md:hidden fixed bottom-6 right-6 z-[2000]">
                <button
                    onClick={() => setIsMobileOpen(!isMobileOpen)}
                    className="w-14 h-14 rounded-2xl bg-blue-600 text-white shadow-[0_12px_40px_rgba(37,99,235,0.5)] flex items-center justify-center active:scale-95 transition-all border border-blue-400/30"
                >
                    {isMobileOpen ? <ChevronRight size={24} /> : <Menu size={24} />}
                </button>
            </div>

            {/* Mobile Drawer */}
            {isMobileOpen && (
                <div className="md:hidden fixed inset-0 z-[1999] flex justify-end">
                    <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-md" onClick={() => setIsMobileOpen(false)} />
                    <div className="relative w-[85%] max-w-sm h-full shadow-2xl animate-fade-in ring-1 ring-white/10">
                        {sidebarContent}
                    </div>
                </div>
            )}
        </>
    );
};

export default NotamSidebar;
