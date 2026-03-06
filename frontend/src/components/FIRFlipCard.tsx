import React, { useState } from 'react';
import { FirInfo, LocationNotams, NotamStatus } from '../types';
import { RotateCcw, Wifi, WifiOff, Clock, SignalLow } from 'lucide-react';
import { extractNotamDuration, extractEField, fmtNotamDate } from '../utils/notamParsers';

interface FIRFlipCardProps {
    fir: FirInfo;
    notamData: LocationNotams | null;
    loading: boolean;
}

const STATUS_BORDER: Record<NotamStatus, string> = {
    green: 'border-slate-700 hover:border-green-500/50 bg-slate-900/80',
    orange: 'border-orange-500/50 bg-orange-950/40 shadow-[0_0_15px_-3px_rgba(249,115,22,0.2)]',
    red: 'border-red-500/50 bg-red-950/40 shadow-[0_0_15px_-3px_rgba(239,68,68,0.25)]',
    unknown: 'border-slate-800 bg-slate-900/80 hover:border-slate-700',
};

const STATUS_TEXT: Record<NotamStatus, string> = {
    green: 'text-green-500',
    orange: 'text-orange-500',
    red: 'text-red-500',
    unknown: 'text-slate-500',
};

const STATUS_DOT: Record<NotamStatus, string> = {
    green: 'bg-green-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
    unknown: 'bg-slate-600',
};

function getStatusLabel(status: NotamStatus, count: number): string {
    if (status === 'green') return count === 0 ? 'No Active NOTAMs' : 'Normal Operations';
    if (status === 'orange') return 'Restricted / PPR';
    if (status === 'red') return 'Closed / Unavailable';
    return 'No Data';
}

function formatUtcTimestamp(ts: number): string {
    const d = new Date(ts);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}/${mo} ${hh}:${mm}Z`;
}

const NotamDuration: React.FC<{ text: string }> = ({ text }) => {
    const { b, c } = extractNotamDuration(text);
    const bFmt = b ? fmtNotamDate(b) : null;
    const cFmt = c ? fmtNotamDate(c) : null;
    if (!bFmt && !cFmt) return null;
    return (
        <div className="flex items-center justify-between gap-2 text-[9px] font-mono mt-2 pt-2 border-t border-white/5">
            <span className="text-slate-600 font-bold tracking-widest uppercase">Duration</span>
            <div className="flex items-center gap-1 text-slate-500">
                {bFmt && <span>{bFmt}</span>}
                {bFmt && cFmt && <span className="text-slate-700">→</span>}
                {cFmt && <span>{cFmt}</span>}
            </div>
        </div>
    );
};

const FIRFlipCard: React.FC<FIRFlipCardProps> = ({ fir, notamData, loading }) => {
    const [flipped, setFlipped] = useState(false);

    const status = notamData?.status ?? 'unknown';
    const notams = notamData?.notams ?? [];
    const checkedAt = notamData?.lastCheckedAt ?? notamData?.cachedAt;

    return (
        <div
            className={`flip-card w-full h-72 ${flipped ? 'flipped' : ''}`}
            onClick={() => setFlipped(f => !f)}
            title={flipped ? 'Click to return' : 'Click to see NOTAMs'}
        >
            <div className="flip-card-inner">

                {/* FRONT */}
                <div className={`flip-card-front border ${STATUS_BORDER[status]} p-4 flex flex-col justify-between`}>
                    <div className="flex justify-between items-start">
                        <span className="font-mono text-[10px] bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-400 uppercase tracking-widest">FIR</span>
                        <div className="flex items-center gap-1.5">
                            {notamData?.hasEscat && (
                                <span className="text-[10px] font-bold text-red-300 bg-red-950/80 border border-red-900/50 px-1.5 py-0.5 rounded animate-pulse">ESCAT</span>
                            )}
                            {notamData?.hasInterference && (
                                <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-300 bg-indigo-950/80 border border-indigo-500/50 px-1.5 py-0.5 rounded">
                                    <SignalLow size={10} />
                                    <span>GNSS</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col items-center justify-center">
                        <div className="flex items-center gap-2">
                            {!loading && (
                                <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]} ${status === 'red' ? 'animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]' : ''}`} />
                            )}
                            <h3 className="text-3xl font-black tracking-widest text-slate-100 group-hover:text-white transition-colors">
                                {fir.icao}
                            </h3>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium mt-1 text-center truncate w-full px-2">
                            {fir.name}
                        </p>
                    </div>

                    <div className="flex items-center justify-between text-[10px] tracking-widest uppercase font-bold">
                        {loading ? (
                            <span className="text-slate-500 flex items-center gap-1">
                                <span className="w-2 h-2 border-2 border-slate-500 border-t-transparent rounded-full spinner" />
                                Loading...
                            </span>
                        ) : (
                            <span className={STATUS_TEXT[status]}>{getStatusLabel(status, notams.length)}</span>
                        )}
                        <span className="text-slate-500 font-mono">
                            {notams.length === 1 ? 'LATEST' : notams.length === 2 ? 'UPDATED' : ''}
                        </span>
                    </div>
                </div>

                {/* BACK */}
                <div className="flip-card-back bg-slate-900/95 p-4 flex flex-col gap-3 border border-slate-700/50">
                    <div className="flex items-center justify-between flex-shrink-0 border-b border-slate-700/50 pb-2.5">
                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-100 text-sm tracking-widest">{fir.icao}</span>
                                <span className="text-[10px] text-slate-500 truncate font-medium">{fir.name.replace(' FIR', '')}</span>
                            </div>
                        </div>
                        <RotateCcw size={14} className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0 ml-2 cursor-pointer" />
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar min-h-0">
                        {notamData?.error ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-red-400">
                                <WifiOff size={24} className="opacity-40" />
                                <p className="text-xs text-center font-medium">{notamData.error}</p>
                            </div>
                        ) : notams.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-green-500/50">
                                <Wifi size={24} className="opacity-40" />
                                <p className="text-xs text-center font-medium">No active NOTAMs</p>
                            </div>
                        ) : (
                            notams.map((n, idx) => (
                                <div key={n.id} className="relative pb-4 border-b border-slate-800/50 last:border-0 last:pb-0">
                                    <div className="flex items-center justify-between mb-2 gap-2 overflow-hidden">
                                        <div className={`text-[9px] font-bold tracking-widest uppercase flex items-center gap-2 shrink-0 ${idx === 0 ? 'text-blue-400' : 'text-slate-500'}`}>
                                            <span>{idx === 0 ? 'Current' : 'Previous'}</span>
                                            {n.analysis?.notamId && (
                                                <span className="font-mono text-[8px] opacity-70 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/30">
                                                    {n.analysis.notamId}
                                                </span>
                                            )}
                                        </div>
                                        {n.status !== 'unknown' && (
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <span className="font-mono text-[8px] opacity-70 bg-slate-800 px-1 py-0.5 rounded border border-slate-700/30 text-slate-400 font-bold shrink-0">
                                                    {n.id.split('/')[0]}
                                                </span>
                                                <span className="text-[8px] font-bold text-slate-500 uppercase truncate">
                                                    {n.status === 'red' ? 'Closed' : 'Restricted'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className={`rounded-xl px-3 py-2.5 border-l-4 ${n.status === 'red' ? 'border-red-500 bg-red-950/40' : n.status === 'orange' ? 'border-orange-500 bg-orange-950/40' : 'border-green-500 bg-green-950/20'}`}>
                                        <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                                            {n.analysis?.isEstimated && (
                                                <span className="text-[8px] font-bold bg-amber-950/50 text-amber-500 px-1.5 py-0.5 rounded border border-amber-900/30 uppercase">EST</span>
                                            )}
                                            {(n.analysis?.hasInterference || /\b(JAMMING|SPOOFING|GPS UNREL|GNSS UNREL|GNSS SIGNAL INTERFERENCE|JAM|GPS)\b/i.test(n.text)) && (
                                                <span className="text-[8px] font-bold bg-indigo-950/50 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-900/30 uppercase">GNSS ALRT</span>
                                            )}
                                        </div>
                                        
                                        <div className="font-mono text-[10px] text-slate-300 leading-relaxed break-words mb-2.5">
                                            {extractEField(n.text) || '(No description)'}
                                        </div>

                                        {(n.analysis?.fField || n.analysis?.gField) && (
                                            <div className="text-[9px] text-slate-400 font-mono mt-2.5 pt-2.5 border-t border-white/5 flex items-center gap-1.5">
                                                <span className="opacity-50">LVL:</span>
                                                <span className="text-slate-200 font-bold">
                                                    {n.analysis?.fField || 'SFC'} – {n.analysis?.gField || 'UNL'}
                                                </span>
                                            </div>
                                        )}

                                        <NotamDuration text={n.text} />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {checkedAt && (
                        <div className="flex-shrink-0 pt-2 border-t border-slate-800/60 flex items-center gap-1.5 text-[9px] text-slate-600 font-medium justify-center">
                            <Clock size={10} className="text-slate-700" />
                            <span>Checked {formatUtcTimestamp(checkedAt)}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FIRFlipCard;
