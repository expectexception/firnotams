import React, { useState } from 'react';
import { FirInfo, FirStatusItem, LocationNotams, NotamStatus } from '../types';
import { RotateCcw, Wifi, WifiOff, AlertTriangle, Route, Navigation, SignalLow, Clock } from 'lucide-react';
import { parseFirNotam, getDuration, type FirNotamMeta } from '../utils/notamParsers';

interface FIRCardProps {
    fir: FirInfo;
    firStatus: FirStatusItem | null;
    notamData: LocationNotams | null;
    loading?: boolean;
}

// ── Status colours ──────────────────────────────────────────

const BORDER: Record<NotamStatus, string> = {
    green: 'border-green-500/50  bg-green-950/20',
    orange: 'border-amber-500/50  bg-amber-950/20  shadow-[0_0_18px_-4px_rgba(245,158,11,0.12)]',
    red: 'border-red-500/50    bg-red-950/20    shadow-[0_0_18px_-4px_rgba(239,68,68,0.15)]',
    unknown: 'border-slate-700/40  bg-slate-900/50',
};

const DOT: Record<NotamStatus, string> = {
    green: 'bg-green-500',
    orange: 'bg-amber-500',
    red: 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]',
    unknown: 'bg-slate-600',
};

const TEXT_CLR: Record<NotamStatus, string> = {
    green: 'text-green-400',
    orange: 'text-amber-400',
    red: 'text-red-400',
    unknown: 'text-slate-500',
};

const STATUS_LABEL: Record<NotamStatus, string> = {
    green: 'Normal Operations',
    orange: 'Restricted / PPR',
    red: 'Closed / Unavailable',
    unknown: 'No Data',
};

const BAR: Record<NotamStatus, string> = {
    red: 'border-red-500   bg-red-950/40',
    orange: 'border-amber-500 bg-amber-950/40',
    green: 'border-green-500 bg-green-950/20',
    unknown: 'border-slate-700 bg-slate-900/40',
};

// ── Q-code severity colours ─────────────────────────────────

const SEVERITY_BADGE: Record<string, string> = {
    red: 'bg-red-950/80 border-red-700/60 text-red-300',
    orange: 'bg-amber-950/80 border-amber-700/60 text-amber-300',
    warn: 'bg-yellow-950/80 border-yellow-700/60 text-yellow-300',
    info: 'bg-slate-800/80 border-slate-600/60 text-slate-300',
};

const SEVERITY_BAR: Record<string, string> = {
    red: 'border-red-500 bg-red-950/30',
    orange: 'border-amber-500 bg-amber-950/30',
    warn: 'border-yellow-500 bg-yellow-950/20',
    info: 'border-slate-600 bg-slate-900/40',
};

// ── Sub-components ──────────────────────────────────────────

/** Pill-style badge for Q-code and scope */
const QBadge: React.FC<{ meta: FirNotamMeta }> = ({ meta }) => {
    const cls = SEVERITY_BADGE[meta.severity] ?? SEVERITY_BADGE.info;
    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            {/* Q-code */}
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold tracking-widest ${cls}`}>
                {meta.qCodeFull || '?'}
            </span>
            {/* Condition label */}
            {meta.qSubject && (
                <span className={`text-[9px] font-bold uppercase tracking-wider ${meta.severity === 'red' ? 'text-red-400' : meta.severity === 'orange' ? 'text-amber-400' : meta.severity === 'warn' ? 'text-yellow-400' : 'text-slate-400'}`}>
                    {meta.qSubject} {meta.qCondition}
                </span>
            )}
            {/* Misc warning */}
            {meta.isMiscQCode && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border bg-yellow-950/80 border-yellow-700/60 text-yellow-300 text-[8px] font-bold tracking-wider">
                    <AlertTriangle size={8} />
                    Misleading Q-CODE
                </span>
            )}
        </div>
    );
};

/** Scope / Keyword row */
const ScopeTags: React.FC<{ meta: FirNotamMeta }> = ({ meta }) => {
    return (
        <div className="flex items-center gap-1 flex-wrap">
            {meta.isEnroute && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-950/60 border border-blue-700/40 text-blue-300 text-[8px] font-bold tracking-widest uppercase">
                    <Navigation size={7} />
                    ENROUTE
                </span>
            )}
            {meta.keywords.map(kw => (
                <span key={kw} className="px-1.5 py-0.5 rounded bg-slate-800/70 border border-slate-700/50 text-slate-400 text-[8px] font-mono font-bold tracking-wider uppercase">
                    {kw}
                </span>
            ))}
            {!meta.afterCutoff && meta.startDate && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-500 text-[8px] font-bold">
                    PRE-CUT
                </span>
            )}
        </div>
    );
};

/** Date range row */
const DateRange: React.FC<{ meta: FirNotamMeta }> = ({ meta }) => {
    if (!meta.startFmt && !meta.endFmt) return null;
    return (
        <div className="flex items-center gap-1.5 font-mono text-[9px] text-slate-400 flex-wrap">
            {meta.startFmt && <span className="text-slate-200 font-semibold">{meta.startFmt}</span>}
            {meta.startFmt && meta.endFmt && <span className="text-slate-700">→</span>}
            {meta.endFmt && <span className="text-slate-200 font-semibold">{meta.endFmt}</span>}
            {meta.startFmt && !meta.endFmt && <span className="text-slate-600">(Permanent)</span>}
        </div>
    );
};

// ── Main Component ──────────────────────────────────────────

const FIRCard: React.FC<FIRCardProps> = ({ fir, firStatus, notamData, loading = false }) => {
    const [flipped, setFlipped] = useState(false);

    const status: NotamStatus = loading && !firStatus ? 'unknown' : (firStatus?.status ?? 'unknown');
    const hasEscat = firStatus?.hasEscat ?? notamData?.hasEscat ?? false;
    const notams = notamData?.notams ?? [];
    const n = notams[0] ?? null;

    // Parse FIR NOTAM metadata for structured display
    const meta: FirNotamMeta | null = n ? parseFirNotam(n) : null;

    return (
        <div
            className={`flip-card relative w-full h-64 ${flipped ? 'flipped' : ''}`}
            onClick={() => setFlipped(f => !f)}
            title={flipped ? 'Click to return' : 'Click for NOTAM details'}
        >
            <div className="flip-card-inner">

                {/* ── FRONT ── */}
                <div className={`flip-card-front border p-4 flex flex-col justify-between transition-colors ${BORDER[status]}`}>

                    {/* Top row */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {loading && !firStatus ? (
                                <span className="w-2 h-2 border-2 border-slate-500 border-t-transparent rounded-full spinner" />
                            ) : (
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT[status]}`} />
                            )}
                            <span className="font-mono font-black text-2xl tracking-widest text-slate-100">
                                {fir.icao}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium hidden sm:inline truncate max-w-[130px]">
                                {fir.name}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {/* Q-code badge on front */}
                            {meta && !meta.isMiscQCode && meta.qCodeFull && (
                                <span className={`font-mono text-[8px] px-1.5 py-0.5 rounded border font-bold tracking-widest ${SEVERITY_BADGE[meta.severity] ?? SEVERITY_BADGE.info}`}>
                                    {meta.qCodeFull}
                                </span>
                            )}
                            {meta?.isMiscQCode && (
                                <span className="flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded border bg-yellow-950/80 border-yellow-700/60 text-yellow-300">
                                    <AlertTriangle size={8} />
                                    MISC
                                </span>
                            )}
                            {hasEscat && (
                                <span className="text-[9px] font-bold text-red-300 bg-red-950/80 border border-red-900/50 px-1.5 py-0.5 rounded animate-pulse">
                                    ESCAT
                                </span>
                            )}
                            {notamData?.hasInterference && (
                                <span className="flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded border bg-indigo-950/80 border-indigo-500/50 text-indigo-300 font-bold">
                                    <SignalLow size={8} />
                                    GNSS
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Status label */}
                    <div className="space-y-1">
                        <div className={`text-[11px] font-bold uppercase tracking-widest ${TEXT_CLR[status]}`}>
                            {loading && !firStatus ? 'Loading…' : STATUS_LABEL[status]}
                        </div>
                        {/* Enroute + keyword quick-read */}
                        {meta && (meta.isEnroute || meta.keywords.length > 0) && (
                            <div className="flex items-center gap-1 flex-wrap">
                                {meta.isEnroute && (
                                    <span className="flex items-center gap-0.5 text-[8px] text-blue-400 font-bold tracking-wider">
                                        <Navigation size={7} />
                                        ENROUTE
                                    </span>
                                )}
                                {meta.keywords.slice(0, 3).map(kw => (
                                    <span key={kw} className="text-[8px] text-slate-500 font-mono">{kw}</span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Duration row */}
                    {n ? (() => {
                        const { start, end } = getDuration(n);
                        return (
                            <div className={`rounded px-3 py-2 border-l-2 ${BAR[status]}`}>
                                <div className="font-mono text-[9px] text-slate-600 tracking-widest mb-1">{n.id}</div>
                                {(start || end) ? (
                                    <div className="flex items-baseline gap-2 flex-wrap">
                                        {start && <span className="text-sm font-bold text-slate-100">{start}</span>}
                                        {start && end && <span className="text-slate-600 text-xs">→</span>}
                                        {end && <span className="text-sm font-bold text-slate-100">{end}</span>}
                                    </div>
                                ) : (
                                    <span className="text-[11px] text-slate-500">Permanent / no duration</span>
                                )}
                            </div>
                        );
                    })() : (
                        <div className="flex items-center gap-2 text-slate-600 text-xs">
                            {notamData?.error ? (
                                <><WifiOff size={12} /><span>{notamData.error}</span></>
                            ) : (
                                <><Wifi size={12} /><span>No active NOTAMs</span></>
                            )}
                        </div>
                    )}
                </div>

                {/* ── BACK ── */}
                <div className="flip-card-back p-4 flex flex-col gap-3 border border-slate-700/50">
                    
                    {/* Back header */}
                    <div className="flex items-center justify-between flex-shrink-0 border-b border-slate-700/50 pb-2.5">
                        <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[status]}`} />
                                <span className="font-mono font-bold text-slate-100 text-sm tracking-widest">{fir.icao}</span>
                                {n && (
                                    <span className="font-mono text-[9px] text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-700/30">
                                        {n.id}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 ml-3.5 overflow-hidden">
                                {meta && (
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border font-bold shrink-0 ${SEVERITY_BADGE[meta.severity] ?? SEVERITY_BADGE.info}`}>
                                            {meta.qCodeFull}
                                        </span>
                                        {meta.qSubject && (
                                            <span className={`text-[10px] font-bold uppercase truncate ${meta.severity === 'red' ? 'text-red-400' : meta.severity === 'orange' ? 'text-amber-400' : 'text-slate-400'}`}>
                                                {meta.qSubject} {meta.qCondition}
                                            </span>
                                        )}
                                    </div>
                                )}
                                {!meta && <span className="text-[10px] text-slate-500 truncate font-medium">{fir.name}</span>}
                            </div>
                        </div>
                        <RotateCcw size={14} className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0 ml-2 cursor-pointer" />
                    </div>

                    {n && meta ? (
                        <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto custom-scrollbar pr-1">
                            {/* Scope + keywords */}

                            {/* Scope + keywords */}
                            {(meta.isEnroute || meta.keywords.length > 0 || !meta.afterCutoff) && (
                                <div className="px-1">
                                    <ScopeTags meta={meta} />
                                </div>
                            )}

                            {/* Date range */}
                            {(meta.startFmt || meta.endFmt) && (
                                <div className="bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-800/80 flex items-center justify-between gap-3">
                                    <div className="text-[9px] text-slate-600 font-bold tracking-widest flex items-center gap-1.5 shrink-0">
                                        <Clock size={10} className="text-slate-700" />
                                        <span>DURATION</span>
                                    </div>
                                    <DateRange meta={meta} />
                                </div>
                            )}

                            {/* E-field text */}
                            {meta.eField && (
                                <div className="flex-1 min-h-0 px-1 pb-2">
                                    <div className="text-[9px] text-slate-600 font-bold tracking-widest mb-1.5">NOTAM TEXT</div>
                                    <div className="font-mono text-[10px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                                        {meta.eField}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-700">
                            {notamData?.error ? (
                                <>
                                    <WifiOff size={24} className="opacity-40" />
                                    <p className="text-xs text-center text-red-400 font-medium">{notamData.error}</p>
                                </>
                            ) : (
                                <>
                                    <Wifi size={24} className="opacity-40" />
                                    <p className="text-xs text-center font-medium">No active NOTAMs at this level</p>
                                </>
                            )}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default FIRCard;
