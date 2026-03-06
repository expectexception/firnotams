import React, { useMemo, useState } from 'react';
import { X, Wifi, WifiOff, AlertTriangle, Navigation, Clock, SignalLow } from 'lucide-react';
import { FirInfo, FirStatusItem, LocationNotams, NotamStatus, NotamItem } from '../types';
import { parseFirNotam, parseDField, getDuration, isOpsReason } from '../utils/notamParsers';

interface FIRDetailModalProps {
    fir: FirInfo;
    firStatus: FirStatusItem | null;
    notamData: LocationNotams | null;
    loading: boolean;
    onClose: () => void;
}

// ── Status styling ───────────────────────────────────────────

const STATUS_COLORS: Record<NotamStatus, { border: string; glow: string; dot: string; text: string; label: string }> = {
    red: { border: 'border-red-500/60', glow: 'shadow-[0_0_40px_-8px_rgba(239,68,68,0.25)]', dot: 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]', text: 'text-red-400', label: 'Closed / Unavailable' },
    orange: { border: 'border-amber-500/60', glow: 'shadow-[0_0_40px_-8px_rgba(245,158,11,0.2)]', dot: 'bg-amber-500', text: 'text-amber-400', label: 'Restricted / PPR' },
    green: { border: 'border-green-500/40', glow: '', dot: 'bg-green-500', text: 'text-green-400', label: 'Normal Operations' },
    unknown: { border: 'border-slate-700/40', glow: '', dot: 'bg-slate-600', text: 'text-slate-500', label: 'No Data' },
};

const SEVERITY_PILL: Record<string, string> = {
    red: 'bg-red-950/80 border-red-700/60 text-red-300',
    orange: 'bg-amber-950/80 border-amber-700/60 text-amber-300',
    warn: 'bg-yellow-950/80 border-yellow-700/60 text-yellow-300',
    info: 'bg-slate-800 border-slate-600/50 text-slate-400',
};

const SEVERITY_STRIP: Record<string, string> = {
    red: 'border-red-500/70 bg-red-950/30',
    orange: 'border-amber-500/70 bg-amber-950/30',
    warn: 'border-yellow-500/70 bg-yellow-950/20',
    info: 'border-slate-600/50 bg-slate-900/40',
};

function parseNotamStartDate(notam: NotamItem): Date | null {
    const raw = notam.analysis?.startsAtUtc ?? notam.analysis?.bField;

    if (raw) {
        if (/^\d{10}$/.test(raw)) {
            const yy = raw.slice(0, 2);
            const mm = raw.slice(2, 4);
            const dd = raw.slice(4, 6);
            const hh = raw.slice(6, 8);
            const mi = raw.slice(8, 10);
            const d = new Date(`20${yy}-${mm}-${dd}T${hh}:${mi}:00Z`);
            return isNaN(d.getTime()) ? null : d;
        }

        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
    }

    const m = notam.text.match(/\bB\)\s*(\d{10})/);
    if (!m) return null;

    const b = m[1];
    const yy = b.slice(0, 2);
    const mm = b.slice(2, 4);
    const dd = b.slice(4, 6);
    const hh = b.slice(6, 8);
    const mi = b.slice(8, 10);
    const d = new Date(`20${yy}-${mm}-${dd}T${hh}:${mi}:00Z`);
    return isNaN(d.getTime()) ? null : d;
}

// ── Helpers ──────────────────────────────────────────────────


// ── Single NOTAM card for the popup ─────────────────────────

const NotamDetailCard: React.FC<{ notam: NotamItem; rank: number }> = ({ notam, rank }) => {
    const meta = parseFirNotam(notam);
    const dSched = parseDField(notam.text);
    const { start, end } = getDuration(notam);

    const stripCls = SEVERITY_STRIP[meta.severity] ?? SEVERITY_STRIP.info;
    const pillCls = SEVERITY_PILL[meta.severity] ?? SEVERITY_PILL.info;

    const rankLabel = rank === 0 ? 'PRIMARY' : rank === 1 ? 'SECONDARY' : rank === 2 ? 'ADVISORY' : `#${rank + 1}`;
    const rankColor = rank === 0 ? 'text-red-400' : rank === 1 ? 'text-amber-400' : 'text-slate-500';

    return (
        <div className={`rounded-xl border-l-2 ${stripCls} px-3.5 py-3 flex flex-col gap-2`}>
            {/* Card header: rank label + Q-code + NOTAM ID */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black uppercase tracking-[0.15em] ${rankColor}`}>{rankLabel}</span>
                    {meta.qCodeFull && (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold tracking-widest ${pillCls}`}>
                            {meta.qCodeFull}
                        </span>
                    )}
                    {meta.isMiscQCode && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border bg-yellow-950/80 border-yellow-700/60 text-yellow-300 text-[8px] font-bold">
                            <AlertTriangle size={7} /> WRONG Q-CODE
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] text-slate-600 tracking-widest">{notam.id}</span>
                    {isOpsReason(notam.text) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border bg-amber-950/80 border-amber-700/60 text-amber-300 text-[8px] font-bold tracking-wider">
                            <Navigation size={7} className="rotate-45" /> OPS REASONS
                        </span>
                    )}
                    {(notam.analysis?.hasInterference || /\b(JAMMING|SPOOFING|GPS UNREL|GNSS UNREL|GNSS SIGNAL INTERFERENCE|JAM|GPS)\b/i.test(notam.text)) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border bg-indigo-950/80 border-indigo-700/60 text-indigo-300 text-[8px] font-bold tracking-wider">
                            <SignalLow size={7} /> GNSS
                        </span>
                    )}
                </div>
            </div>

            {/* Condition + scope row */}
            {(meta.qSubject || meta.isEnroute) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                    {meta.qSubject && (
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.severity === 'red' ? 'text-red-400' : meta.severity === 'orange' ? 'text-amber-400' : 'text-slate-400'}`}>
                            {meta.qSubject} {meta.qCondition}
                        </span>
                    )}
                    {meta.isEnroute && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-950/60 border border-blue-700/40 text-blue-300 text-[8px] font-bold uppercase tracking-widest">
                            <Navigation size={7} /> ENROUTE
                        </span>
                    )}
                    {meta.keywords.slice(0, 4).map(kw => (
                        <span key={kw} className="px-1.5 py-0.5 rounded bg-slate-800/70 border border-slate-700/40 text-slate-500 text-[8px] font-mono tracking-wider">{kw}</span>
                    ))}
                </div>
            )}

            {/* E-field text — full, scrollable */}
            {meta.eField && (
                <p className="font-mono text-[10px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words max-h-28 overflow-y-auto custom-scrollbar">
                    {meta.eField}
                </p>
            )}

            {/* Date + D-schedule row */}
            <div className="flex items-center gap-3 flex-wrap text-[9px] font-mono">
                {(start || end) && (
                    <div className="flex items-center gap-1 text-slate-400">
                        <Clock size={9} className="text-slate-600" />
                        {start && <span className="text-slate-200">{start}</span>}
                        {start && end && <span className="text-slate-700">→</span>}
                        {end && <span className="text-slate-200">{end}</span>}
                    </div>
                )}
                {dSched && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/40 text-blue-300 font-bold uppercase tracking-wider text-[8px]">
                        <span>D:</span>
                        <span>{dSched.description}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Main Modal ───────────────────────────────────────────────

const FIRDetailModal: React.FC<FIRDetailModalProps> = ({ fir, firStatus, notamData, loading, onClose }) => {
    const status: NotamStatus = loading && !firStatus ? 'unknown' : (firStatus?.status ?? 'unknown');
    const hasEscat = firStatus?.hasEscat ?? notamData?.hasEscat ?? false;
    const [startDateFilter, setStartDateFilter] = useState('');

    const allNotams = notamData?.notams ?? [];
    const filteredNotams = useMemo(() => {
        if (!startDateFilter) return allNotams;

        const threshold = new Date(`${startDateFilter}T00:00:00Z`).getTime();
        if (isNaN(threshold)) return allNotams;

        return allNotams.filter(notam => {
            const start = parseNotamStartDate(notam);
            if (!start) return true;
            return start.getTime() >= threshold;
        });
    }, [allNotams, startDateFilter]);

    const sc = STATUS_COLORS[status];

    return (
        /* Backdrop */
        <div
            className="absolute inset-0 z-[2000] flex items-center justify-center p-3 sm:p-6 md:p-8 bg-black/75 backdrop-blur-sm"
            onClick={onClose}
        >
            {/* Modal panel */}
            <div
                className={`relative w-full sm:max-w-xl bg-slate-950 border rounded-2xl ${sc.border} ${sc.glow} flex flex-col overflow-hidden`}
                style={{ maxHeight: 'min(92dvh, 92vh)' }}
                onClick={e => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div className={`flex items-center justify-between px-4 sm:px-5 py-3 sm:py-3.5 border-b ${sc.border} flex-shrink-0`}>
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                <span className="font-mono font-black text-xl sm:text-2xl tracking-widest text-slate-100">{fir.icao}</span>
                                {hasEscat && (
                                    <span className="text-[9px] font-black text-red-300 bg-red-950/80 border border-red-900/50 px-2 py-0.5 rounded animate-pulse tracking-widest">ESCAT</span>
                                )}
                                {(firStatus?.hasInterference || notamData?.hasInterference) && (
                                    <div className="flex items-center gap-1 text-[9px] font-black text-indigo-300 bg-indigo-950/80 border border-indigo-500/50 px-2 py-0.5 rounded tracking-widest">
                                        <SignalLow size={10} />
                                        <span>GNSS</span>
                                    </div>
                                )}
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${sc.text}`}>{sc.label}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">{fir.name}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-500 hover:text-slate-200 transition-colors flex-shrink-0 ml-2 p-2 rounded-xl hover:bg-slate-800/60 active:bg-slate-700/80"
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Sub-header */}
                <div className="px-4 sm:px-5 py-2 border-b border-slate-800/60 flex-shrink-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em]">
                            Operational NOTAMs
                        </span>
                        <div className="sm:ml-auto flex items-center gap-2 flex-wrap">
                            <label htmlFor="startDateFilter" className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                                Start ≥
                            </label>
                            <input
                                id="startDateFilter"
                                type="date"
                                value={startDateFilter}
                                onChange={(e) => setStartDateFilter(e.target.value)}
                                className="bg-slate-900 border border-slate-700/70 text-slate-300 text-[10px] rounded px-2 py-1 outline-none focus:border-blue-500 flex-1 sm:flex-none"
                            />
                            {startDateFilter && (
                                <button
                                    onClick={() => setStartDateFilter('')}
                                    className="text-[9px] text-slate-400 hover:text-slate-200 px-2 py-1 rounded border border-slate-700/60 hover:border-slate-500/70 active:bg-slate-800"
                                >
                                    Clear
                                </button>
                            )}
                            {allNotams.length > 0 && (
                                <span className="text-[9px] text-slate-600 font-mono">{filteredNotams.length}/{allNotams.length}</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── NOTAM list ── */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 flex flex-col gap-3">
                    {loading && allNotams.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
                            <span className="w-6 h-6 border-2 border-slate-500 border-t-transparent rounded-full spinner" />
                            <p className="text-xs">Loading NOTAMs…</p>
                        </div>
                    ) : notamData?.error ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-2 text-red-400">
                            <WifiOff size={24} />
                            <p className="text-sm text-center">{notamData.error}</p>
                        </div>
                    ) : filteredNotams.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-2 text-green-500/60">
                            <Wifi size={24} />
                            <p className="text-sm font-medium text-center">No NOTAMs match the selected start date</p>
                            <p className="text-[10px] text-slate-600 text-center">Try clearing or adjusting the start date filter</p>
                        </div>
                    ) : (
                        filteredNotams.map((notam, idx) => (
                            <NotamDetailCard key={notam.id} notam={notam} rank={idx} />
                        ))
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="px-5 py-2.5 border-t border-slate-800/60 flex-shrink-0 flex items-center justify-between">
                    <span className="text-[9px] text-slate-600 font-mono tracking-widest">Data: FAA NOTAM Portal</span>
                    <span className="text-[9px] text-slate-700 font-mono">B ≥ 28 Feb · Active</span>
                </div>
            </div>
        </div>
    );
};

export default FIRDetailModal;
