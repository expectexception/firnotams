import React, { useState } from 'react';
import { AirportInfo, LocationNotams, NotamStatus } from '../types';
import { RotateCcw, Wifi, WifiOff, Clock, SignalLow } from 'lucide-react';
import { extractNotamDuration, extractEField, fmtNotamDate } from '../utils/notamParsers';

interface FlipCardProps {
    airport: AirportInfo;
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
        <div className="flex items-center gap-1 flex-wrap text-[9px] text-slate-500 font-mono mt-1">
            {bFmt && <span>{bFmt}</span>}
            {bFmt && cFmt && <span className="text-slate-700">→</span>}
            {cFmt && <span>{cFmt}</span>}
        </div>
    );
};

const FlipCard: React.FC<FlipCardProps> = ({ airport, notamData, loading }) => {
    const [flipped, setFlipped] = useState(false);

    const status = notamData?.status ?? 'unknown';
    const notams = notamData?.notams ?? [];
    const checkedAt = notamData?.lastCheckedAt ?? notamData?.cachedAt;

    return (
        // overflow-hidden + explicit rounded-xl keeps the 3-D flip visually contained
        <div
            className={`flip-card w-full h-72 ${flipped ? 'flipped' : ''}`}
            onClick={() => setFlipped(f => !f)}
            title={flipped ? 'Click to return' : 'Click to see NOTAMs'}
        >
            <div className="flip-card-inner">

                {/* ── FRONT ── */}
                <div className={`flip-card-front border ${STATUS_BORDER[status]} p-4 flex flex-col justify-between`}>
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                            <span className="text-xl leading-none" title={airport.country}>{airport.countryFlag}</span>
                            <span className="font-mono text-[10px] bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-400">
                                {airport.fir}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {airport.isCapital && (
                                <span className="text-[10px] font-bold text-blue-400 bg-blue-950/50 px-1.5 py-0.5 rounded">CAP</span>
                            )}
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
                                {airport.icao}
                            </h3>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium mt-1 text-center truncate w-full px-2">
                            {airport.name}
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
                            {notams.length === 1 ? 'LATEST' : ''}
                        </span>
                    </div>
                </div>

                {/* ── BACK ── */}
                {/* overflow-hidden clips content; min-h-0 makes flex child shrink correctly */}
                <div className="flip-card-back bg-slate-900/98 p-3 flex flex-col border border-slate-700/50">
                    <div className="flex items-center justify-between mb-2 flex-shrink-0 border-b border-slate-700/50 pb-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-base leading-none flex-shrink-0">{airport.countryFlag}</span>
                            <span className="font-mono font-bold text-slate-200 text-sm tracking-widest truncate">{airport.icao}</span>
                        </div>
                        <RotateCcw size={13} className="text-slate-400 group-hover:text-slate-200 transition-colors flex-shrink-0 ml-2" />
                    </div>

                    {/* min-h-0 is critical: without it flex children ignore overflow-y-auto inside a flex column */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar min-h-0">
                        {notamData?.error ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 text-red-400">
                                <WifiOff size={20} />
                                <p className="text-xs text-center">{notamData.error}</p>
                            </div>
                        ) : notams.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 text-green-500/70">
                                <Wifi size={20} />
                                <p className="text-xs text-center font-medium">No active NOTAMs</p>
                            </div>
                        ) : (
                            notams.map((n, idx) => (
                                <div key={n.id} className="mb-1.5 last:mb-0">
                                    <div className={`text-[9px] font-bold tracking-widest uppercase mb-1 flex items-center justify-between ${idx === 0 ? 'text-blue-400' : 'text-slate-500'}`}>
                                        <span>{idx === 0 ? 'Current' : 'Previous'}</span>
                                        {n.analysis?.notamId && (
                                            <span className="font-mono text-[8px] opacity-70 bg-slate-800 px-1 rounded">{n.analysis.notamId}</span>
                                        )}
                                    </div>
                                    <div className={`rounded px-2.5 py-1.5 border-l-2 overflow-hidden ${n.status === 'red' ? 'border-red-500 bg-red-950/40' : n.status === 'orange' ? 'border-orange-500 bg-orange-950/40' : 'border-green-500 bg-green-950/20'}`}>
                                        <div className="flex items-center justify-between mb-1 gap-2">
                                            {n.analysis?.isEstimated && (
                                                <span className="text-[8px] font-bold bg-amber-950/50 text-amber-500 px-1 rounded border border-amber-900/30 uppercase">EST</span>
                                            )}
                                        </div>
                                        {/* break-words ensures long unbreakable strings wrap; line-clamp-4 caps height */}
                                        <div className="font-mono text-[10px] text-slate-300 leading-relaxed break-words overflow-hidden line-clamp-4">
                                            {extractEField(n.text) || '(No description)'}
                                        </div>

                                        {(n.analysis?.fField || n.analysis?.gField) && (
                                            <div className="text-[9px] text-slate-400 font-mono mt-2 border-t border-white/5 pt-1.5 flex items-center gap-1.5">
                                                <span className="opacity-50">LVL:</span>
                                                <span className="text-slate-300 font-bold">
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
                        <div className="flex-shrink-0 pt-1.5 mt-1 border-t border-slate-800/60 flex items-center gap-1.5 text-[9px] text-slate-600">
                            <Clock size={8} />
                            <span>Checked {formatUtcTimestamp(checkedAt)}</span>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default FlipCard;
