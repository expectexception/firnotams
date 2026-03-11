import React, { useState, useMemo } from 'react';
import * as LucideIcons from 'lucide-react';
import { fetchTAF, fetchMETAR } from '../../utils/weather/weatherService';
import { parseTAF, groupTokensIntoSections } from '../../utils/weather/tafParser';
import { enrichPhasesWithTimeline, resolveAbsoluteTime } from '../../utils/weather/timelineUtils';
import LivePhaseFeed from './LivePhaseFeed';
import { resolveEffectiveConditions, summarizeWeatherState } from '../../utils/weather/weatherConditions';
import { isApplicableForPlanning } from '../../utils/weather/planningFilter';
import { getWeatherIcon } from './IconMapper';
import { analyzeTrend } from '../../utils/weather/trendAnalysis';
import { generateSmartRecommendations } from '../../utils/weather/recommendationEngine';
import PeriodCard from './PeriodCard';

/**
 * Graphical indicator for weather deterioration factors
 */
const DeteriorationChip = ({ token }: { token: string }) => {
    const config: any = {
        'DET_CEILING': { icon: 'Cloud', text: 'Ceiling' },
        'DET_VISIBILITY': { icon: 'Eye', text: 'Visibility' },
        'DET_WIND': { icon: 'Wind', text: 'Gusts' },
        'DET_WX': { icon: 'CloudLightning', text: 'WX' },
        'DET_RISK': { icon: 'AlertTriangle', text: 'Risk' },
        'DET_TREND': { icon: 'TrendingDown', text: 'Unfavorable' }
    }[token] || { icon: 'AlertTriangle', text: token };

    const Icon = (LucideIcons as any)[config.icon] || LucideIcons.AlertTriangle;

    return (
        <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20 group/chip hover:bg-red-500/20 transition-all shadow-sm">
            <Icon className="w-4 h-4 text-red-500" />
            <span className="text-[10px] font-black text-red-400/90 uppercase tracking-tighter">
                {config.text}
            </span>
        </div>
    );
};

export default function LiveApplicability({ initialIcao }: { initialIcao?: string }) {
    const [icao, setIcao] = useState(initialIcao || '');
    const [role, setRole] = useState('dest');
    const [eta, setEta] = useState('');
    const [selectedDateDay, setSelectedDateDay] = useState('');
    const [stationName, setStationName] = useState('');

    const [rawTaf, setRawTaf] = useState<string | null>(null);
    const [rawMetar, setRawMetar] = useState<string | null>(null);
    const [showMetar, setShowMetar] = useState(false);
    const [tokens, setTokens] = useState<any[] | null>(null);
    const [enrichedPhases, setEnrichedPhases] = useState<any[]>([]);
    const [allEnrichedPhases, setAllEnrichedPhases] = useState<any[]>([]);
    const [validDateOptions, setValidDateOptions] = useState<string[]>([]);
    const [selectedPhase, setSelectedPhase] = useState<any>(null);
    const [hoverTooltip, setHoverTooltip] = useState<{ text: string, x: number, y: number } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFetch = async () => {
        if (!icao || icao.length < 3) {
            setError("Please enter a valid Airport Code");
            return;
        }

        setIsLoading(true);
        setError(null);
        setRawTaf(null);
        setRawMetar(null);
        setTokens(null);
        setEnrichedPhases([]);
        setAllEnrichedPhases([]);
        setSelectedPhase(null);
        setValidDateOptions([]);
        setSelectedDateDay('');
        setStationName('');

        try {
            const [tafData, metarData] = await Promise.all([
                fetchTAF(icao),
                fetchMETAR(icao)
            ]);

            setRawTaf(tafData.rawTAF);
            setStationName(tafData.stationName);
            if (metarData) setRawMetar(typeof metarData === 'string' ? metarData : metarData.rawMetar);

            const parsedTokens = parseTAF(tafData.rawTAF);
            const sections = groupTokensIntoSections(parsedTokens);
            const issueTimeToken = parsedTokens.find(t => t.type === 'issueTime');
            const validTimeToken = parsedTokens.find(t => t.type === 'validPeriod');

            if (validTimeToken && issueTimeToken) {
                const issueMatch = issueTimeToken.value.match(/^(\d{2})(\d{2})(\d{2})Z$/);
                const now = new Date();
                const refDate = issueMatch ? resolveAbsoluteTime(issueMatch[1], issueMatch[2], now) : now;
                const [startStr, endStr] = validTimeToken.value.split('/');
                const startDate = resolveAbsoluteTime(startStr.slice(0, 2), startStr.slice(2, 4), refDate);
                const endDate = resolveAbsoluteTime(endStr.slice(0, 2), endStr.slice(2, 4), startDate);
                
                const dates = [];
                let current = new Date(startDate);
                current.setUTCHours(0,0,0,0);
                const endDayTime = new Date(endDate);
                endDayTime.setUTCHours(0,0,0,0);
                
                while(current <= endDayTime) {
                    dates.push(current.getUTCDate().toString().padStart(2, '0'));
                    current.setUTCDate(current.getUTCDate() + 1);
                }
                setValidDateOptions(dates);
                if (dates.length > 0) setSelectedDateDay(dates[0]);
            }

            const issueMatch = issueTimeToken?.value.match(/^(\d{2})(\d{2})(\d{2})Z$/);
            const refDate = issueMatch ? resolveAbsoluteTime(issueMatch[1], issueMatch[2], new Date()) : new Date();

            const enrichedAll = enrichPhasesWithTimeline(sections, refDate);
            const applicablePhases = enrichedAll.filter(phase => isApplicableForPlanning(phase));

            setTokens(parsedTokens);
            setEnrichedPhases(applicablePhases);
            setAllEnrichedPhases(enrichedAll);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const timelineSnapshots = useMemo(() => {
        if (!enrichedPhases.length || !eta || eta.length !== 4 || !selectedDateDay) return null;

        const issueTimeToken = tokens?.find(t => t.type === 'issueTime');
        const issueMatch = issueTimeToken?.value.match(/^(\d{2})(\d{2})(\d{2})Z$/);
        const refDate = issueMatch ? resolveAbsoluteTime(issueMatch[1], issueMatch[2], new Date()) : new Date();

        const targetH = eta.slice(0, 2);
        const targetM = parseInt(eta.slice(2, 4));
        const etaDate = resolveAbsoluteTime(selectedDateDay, targetH, refDate);
        etaDate.setUTCMinutes(targetM);

        return [-60, -30, 0, 30, 60].map(offsetMin => {
            const time = new Date(etaDate.getTime() + offsetMin * 60000);
            const baseline = enrichedPhases.find(p => p.timelineType === 'baseline' && time >= p.validStart && time < p.validEnd);
            const activeOverlays = enrichedPhases.filter(p => p.timelineType === 'overlay' && time >= p.validStart && time <= p.validEnd);
            
            const effectiveState = resolveEffectiveConditions(baseline, activeOverlays);
            const { icon, color, label } = summarizeWeatherState(effectiveState || []);

            return { time, offsetMin, icon, color, label, tooltip: label };
        });
    }, [enrichedPhases, eta, tokens, selectedDateDay]);

    return (
        <div className="space-y-6 text-slate-200">
            {/* Control Panel */}
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 shadow-xl space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase text-slate-500 font-bold">Station ID</label>
                        <input
                            type="text"
                            value={icao}
                            onChange={(e) => setIcao(e.target.value.toUpperCase())}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-cyan-300 font-mono focus:border-cyan-500 outline-none"
                            placeholder="ICAO"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase text-slate-500 font-bold">ETA (UTC)</label>
                        <input
                            type="text"
                            value={eta}
                            onChange={(e) => setEta(e.target.value.replace(/\D/g, ''))}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-cyan-300 font-mono focus:border-cyan-500 outline-none"
                            placeholder="HHMM"
                        />
                    </div>
                </div>
                <button
                    onClick={handleFetch}
                    disabled={isLoading}
                    className="w-full h-10 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                >
                    {isLoading ? <LucideIcons.Loader2 className="animate-spin w-4 h-4" /> : <LucideIcons.Radar className="w-4 h-4" />}
                    <span>FETCH WEATHER</span>
                </button>
                {error && <p className="text-red-400 text-[10px] text-center">{error}</p>}
            </div>

            {/* Timeline View */}
            {timelineSnapshots && (
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-xl overflow-x-auto">
                    <div className="flex justify-between items-center min-w-[500px]">
                        {timelineSnapshots.map((snap, i) => (
                            <div key={i} className="flex flex-col items-center space-y-2 group relative">
                                <span className={`text-[10px] font-mono ${snap.offsetMin === 0 ? 'text-cyan-400 font-bold' : 'text-slate-500'}`}>
                                    {snap.time.getUTCHours().toString().padStart(2, '0')}:{snap.time.getUTCMinutes().toString().padStart(2, '0')}
                                </span>
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 ${snap.offsetMin === 0 ? 'border-cyan-500 bg-cyan-950/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'border-slate-800 bg-slate-950'}`}>
                                    {getWeatherIcon(snap.icon, `w-7 h-7 ${snap.color}`)}
                                </div>
                                <span className={`text-[9px] font-black uppercase tracking-tighter ${snap.color}`}>
                                    {snap.label}
                                </span>
                                {snap.offsetMin === 0 && <span className="absolute -top-6 text-[8px] bg-cyan-500 text-white px-1.5 py-0.5 rounded font-bold">ETA</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Phases Feed */}
            {enrichedPhases.length > 0 && (
                <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <LucideIcons.Zap className="w-4 h-4 text-cyan-500" />
                            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Phases</h3>
                        </div>
                        <LivePhaseFeed
                            phases={enrichedPhases}
                            onPhaseClick={setSelectedPhase}
                            selectedPhase={selectedPhase}
                            enableSmartFiltering={true}
                            stationId={icao}
                        />
                    </div>
                </div>
            )}

            {/* Selected Phase Details */}
            {selectedPhase && (
                <div className="animate-in fade-in slide-in-from-bottom-2">
                    <PeriodCard section={{
                        title: selectedPhase.title,
                        icon: 'Clock',
                        tokens: selectedPhase.tokens
                    }} cardIndex={0} />
                </div>
            )}
        </div>
    );
}
