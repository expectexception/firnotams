import React, { useState, useMemo } from 'react';
import * as LucideIcons from 'lucide-react';
import { fetchTAF, fetchMETAR } from '../../utils/weather/weatherService';
import { parseTAF, groupTokensIntoSections } from '../../utils/weather/tafParser';
import { enrichPhasesWithTimeline, resolveAbsoluteTime } from '../../utils/weather/timelineUtils';
import LivePhaseFeed from './LivePhaseFeed';
import { resolveEffectiveConditions, summarizeWeatherState } from '../../utils/weather/weatherConditions';
import { parseVisibility } from '../../utils/weather/weatherComparison';
import { isApplicableForPlanning } from '../../utils/weather/planningFilter';
import { getWeatherIcon } from './IconMapper';
import { analyzeTrend } from '../../utils/weather/trendAnalysis';
import { getZoneExplanation } from '../../utils/weather/zoneKnowledge';
import { generateSmartRecommendations } from '../../utils/weather/recommendationEngine';

/**
 * Graphical indicator for weather deterioration factors
 */
const DeteriorationChip = ({ token }: { token: string }) => {
    const config: any = {
        'DET_CEILING': { icon: 'Cloud', arrow: 'TrendingDown', text: 'Ceiling' },
        'DET_VISIBILITY': { icon: 'Eye', arrow: 'TrendingDown', text: 'Visibility' },
        'DET_WIND': { icon: 'Wind', arrow: 'TrendingUp', text: 'Gusts' },
        'DET_WX': { icon: 'CloudLightning', arrow: null, text: 'WX' },
        'DET_RISK': { icon: 'AlertTriangle', arrow: null, text: 'Risk' },
        'DET_TREND': { icon: 'TrendingDown', arrow: null, text: 'Unfavorable' }
    }[token] || { icon: 'AlertTriangle', arrow: null, text: token };

    const Icon = (LucideIcons as any)[config.icon] || LucideIcons.AlertTriangle;
    const TrendIcon = config.arrow ? (LucideIcons as any)[config.arrow] : null;

    return (
        <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20 group/chip hover:bg-red-500/20 transition-all shadow-sm">
            <div className="relative flex items-center justify-center">
                <Icon className="w-5 h-5 text-red-500 group-hover/chip:text-red-400 transition-colors" />
                {TrendIcon && (
                    <div className="absolute -bottom-1 -right-1 bg-slate-950 rounded-full p-0.5 border border-red-500/40">
                        <TrendIcon className="w-2 h-2 text-red-500" />
                    </div>
                )}
            </div>
            <span className="text-[10px] font-black text-red-400/90 uppercase tracking-tighter group-hover/chip:text-red-300 transition-colors">
                {config.text}
            </span>
        </div>
    );
};

// Helper Component for Graphical Operational Notices
const OperationalNoticeCard = ({ text }: { text: string }) => {
    let type = 'general';
    let icon = LucideIcons.Info;
    let colorClass = 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    let label = 'Notice';

    const lowerText = text.toLowerCase();
    const upperText = text.toUpperCase();

    const parseVisibilityFromNotice = () => {
        const metricMatch = text.match(/\b(\d{3,4})m\b/i);
        if (metricMatch) return parseInt(metricMatch[1], 10);
        const smToken = text.match(/(\d+\s+\d+\/\d+SM|\d+\/\d+SM|M?\d+SM|P?\d+SM)/i);
        if (smToken) return parseVisibility(smToken[1].toUpperCase());
        if (/10\s?km\+/i.test(text) || /\b9999\b/.test(text)) return 10000;
        return null;
    };

    const visibilityMeters = parseVisibilityFromNotice();
    const ceilingMatch = text.match(/ceiling\s+(\d+)\s*ft/i);
    const ceilingFeet = ceilingMatch ? parseInt(ceilingMatch[1], 10) : null;
    const gustSpreadMatch = text.match(/gust spread\s+(\d+)\s*kt/i);
    const gustSpreadKt = gustSpreadMatch ? parseInt(gustSpreadMatch[1], 10) : null;
    const windMatch = text.match(/(?:gusts?|winds?)\s+(\d+)\s*kt/i);
    const windKt = windMatch ? parseInt(windMatch[1], 10) : null;

    if (lowerText.includes('convective') || lowerText.includes('thunderstorm') || lowerText.includes('zap')) {
        type = 'wx'; icon = LucideIcons.Zap; colorClass = 'text-red-400 bg-red-500/10 border-red-500/20'; label = 'Convective';
    } else if (lowerText.includes('freezing')) {
        type = 'wx'; icon = LucideIcons.Snowflake; colorClass = 'text-red-400 bg-red-500/10 border-red-500/20'; label = 'Freezing';
    } else if (lowerText.includes('visibility') || lowerText.includes('fog')) {
        type = 'vis'; icon = LucideIcons.Eye; label = 'Visibility';
        if (visibilityMeters !== null) {
            colorClass = visibilityMeters < 800 ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                        visibilityMeters < 5000 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                        'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        } else {
            colorClass = lowerText.includes('reduced') ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        }
    } else if (lowerText.includes('ceiling') || lowerText.includes('cloud')) {
        type = 'cig'; icon = LucideIcons.Cloud; label = 'Ceiling';
        if (ceilingFeet !== null) {
            colorClass = ceilingFeet < 300 ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                        ceilingFeet < 1000 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                        'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        } else {
            colorClass = lowerText.includes('reduced') ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        }
    } else if (lowerText.includes('gust spread') || (gustSpreadKt !== null)) {
        type = 'wind'; icon = LucideIcons.Wind; label = 'Gust Spread';
        colorClass = (gustSpreadKt || 0) >= 15 ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    } else if (lowerText.includes('wind') || lowerText.includes('gust')) {
        type = 'wind'; icon = LucideIcons.Wind; label = 'Wind';
        if (windKt !== null) {
            colorClass = windKt >= 30 ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                        windKt >= 20 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                        'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        } else {
            colorClass = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
        }
    }

    const Icon = icon;
    const displayValue = visibilityMeters !== null ? `${visibilityMeters}m` :
                         ceilingFeet !== null ? `${ceilingFeet}ft` :
                         gustSpreadKt !== null ? `${gustSpreadKt}kt` :
                         windKt !== null ? `${windKt}kt` : '';

    return (
        <div className={`p-4 rounded-lg border ${colorClass} flex items-center justify-between group transition-all hover:bg-opacity-20`}>
            <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-slate-900/50 border border-current opacity-80 group-hover:opacity-100 transition-opacity">
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">{label}</div>
                    <p className="text-xs font-medium leading-relaxed max-w-md">{text}</p>
                </div>
            </div>
            {displayValue && (
                <div className="px-3 py-1 bg-slate-950/50 rounded border border-current font-mono text-sm font-bold">
                    {displayValue}
                </div>
            )}
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
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFetch = async () => {
        if (!icao || icao.length < 3) {
            setError("Please enter a valid Airport Code");
            return;
        }

        let currentEta = eta;
        if (!currentEta) {
            const now = new Date();
            currentEta = now.getUTCHours().toString().padStart(2, '0') +
                now.getUTCMinutes().toString().padStart(2, '0');
            setEta(currentEta);
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

            const { rawTAF, stationName } = tafData;
            setRawTaf(rawTAF);
            setStationName(stationName);

            if (metarData) {
                const normalizedMetar = typeof metarData === 'string' ? metarData : (metarData.rawMetar || null);
                setRawMetar(normalizedMetar);
            }

            const parsedTokens = parseTAF(rawTAF);
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
                current.setUTCHours(0, 0, 0, 0);
                const endDayTime = new Date(endDate);
                endDayTime.setUTCHours(0, 0, 0, 0);

                let safety = 0;
                while (current <= endDayTime && safety < 10) {
                    dates.push(current.getUTCDate().toString().padStart(2, '0'));
                    current.setUTCDate(current.getUTCDate() + 1);
                    safety++;
                }
                setValidDateOptions(dates);
                if (dates.length > 0) setSelectedDateDay(dates[0]);
            }

            const issueVal = issueTimeToken?.value || '';
            const validVal = validTimeToken?.value || '';
            const enrichedAll = enrichPhasesWithTimeline(sections, issueVal, validVal);

            const preProcessedAll = enrichedAll.map(p => {
                if (p.type === 'becmg' && p.validStart && p.validEnd) {
                    const baseline = enrichedAll.find(b => b.timelineType === 'baseline' && b.validStart <= p.validStart && b.validEnd > p.validStart);
                    if (baseline) {
                        const baseVis = parseVisibility(baseline.tokens?.find((t: any) => t.type === 'visibility')?.value || '9999');
                        const newVis = parseVisibility(p.tokens?.find((t: any) => t.type === 'visibility')?.value || '9999');
                        const getCig = (tks: any[]) => {
                            const heights = tks.filter(t => t.value.match(/\d{3}/)).map(t => parseInt(t.value.match(/\d{3}/)?.[0] || '999'));
                            return heights.length > 0 ? Math.min(...heights) : 999;
                        };
                        const baseCig = getCig(baseline.tokens || []);
                        const newCig = getCig(p.tokens || []);
                        if (newVis < baseVis || newCig < baseCig) p.becmgDeteriorating = true;
                        else p.becmgImproving = true;
                    }
                }
                return p;
            });

            setTokens(parsedTokens);
            setEnrichedPhases(preProcessedAll.filter(phase => isApplicableForPlanning(phase)));
            setAllEnrichedPhases(preProcessedAll);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const isBECMGEffectiveAtTime = (phase: any, time: Date) => {
        if (!phase || phase.type !== 'becmg' || !time || !phase.validStart || !phase.validEnd) return false;
        if (phase.becmgDeteriorating) return time >= phase.validStart;
        if (phase.becmgImproving) return time >= phase.validEnd;
        return time >= phase.validEnd;
    };

    const timelineSnapshots = useMemo(() => {
        if (!enrichedPhases.length || !eta || eta.length !== 4 || !selectedDateDay || !tokens) return null;
        const issueTimeToken = tokens.find(t => t.type === 'issueTime');
        const issueMatch = issueTimeToken?.value.match(/^(\d{2})(\d{2})(\d{2})Z$/);
        const refDate = issueMatch ? resolveAbsoluteTime(issueMatch[1], issueMatch[2], new Date()) : new Date();
        const targetM = parseInt(eta.slice(2, 4));
        const etaDate = resolveAbsoluteTime(selectedDateDay, eta.slice(0, 2), refDate);
        etaDate.setUTCMinutes(targetM);

        return [-60, -30, 0, 30, 60].map(offsetMin => {
            const time = new Date(etaDate.getTime() + offsetMin * 60000);
            let baseline = enrichedPhases.find(p => p.timelineType === 'baseline' && time >= p.validStart && time < p.validEnd);
            let activeOverlays = enrichedPhases.filter(p => {
                if (p.timelineType !== 'overlay') return false;
                if (p.type === 'becmg') return isBECMGEffectiveAtTime(p, time) && time <= p.validEnd;
                return time >= p.validStart && time <= p.validEnd;
            });
            const effectiveState = resolveEffectiveConditions(baseline, activeOverlays);
            const { icon, color, label } = summarizeWeatherState(effectiveState || []);
            return { time, offsetMin, icon, color, label };
        });
    }, [enrichedPhases, eta, tokens, selectedDateDay]);

    const windowAnalysis = useMemo(() => {
        if (!timelineSnapshots || !allEnrichedPhases.length) return null;

        const snapshots = timelineSnapshots;
        const startTime = snapshots[0].time;
        const endTime = snapshots[snapshots.length - 1].time;
        const etaDate = snapshots.find(s => s.offsetMin === 0)?.time || snapshots[2].time;
        const bufferEndTime = new Date(endTime.getTime() + 1);

        // 1. Identify effective baseline at ETA with inheritance
        const underlyingBaseline = allEnrichedPhases.find(p =>
            p.timelineType === 'baseline' && etaDate >= p.validStart && etaDate < p.validEnd
        );

        const relevantBECMGs = allEnrichedPhases.filter(p => {
            if (p.type !== 'becmg' || !p.validStart || !p.validEnd) return false;
            return p.becmgDeteriorating ? etaDate >= p.validStart : etaDate >= p.validEnd;
        }).sort((a, b) => b.validStart.getTime() - a.validStart.getTime());

        let effectiveBaseline = underlyingBaseline;
        if (relevantBECMGs.length > 0 && underlyingBaseline) {
            const becmg = relevantBECMGs[0];
            const becmgTokens = becmg.tokens || [];
            const becmgTypes = new Set(becmgTokens.map((t: any) => t.type));
            const inherited = (underlyingBaseline.tokens || []).filter((t: any) => !becmgTypes.has(t.type));
            effectiveBaseline = { ...becmg, tokens: [...becmgTokens, ...inherited] };
        }

        // 2. Identify Overlays (TEMPO/PROB)
        const windowOverlays = allEnrichedPhases.filter(p =>
            p.timelineType === 'overlay' && p.validStart <= bufferEndTime && p.validEnd >= startTime
        );

        // 3. Dangerous transients for operational awareness
        const isDangerous = (phase: any) => {
            if (!phase.tokens) return false;
            const vis = parseVisibility(phase.tokens.find((t: any) => t.type === 'visibility')?.value || '9999');
            if (vis < 5000) return true;
            const cigs = phase.tokens.filter((t: any) => t.type === 'skyCondition')
                .map((t: any) => parseInt(t.value.match(/\d{3}/)?.[0] || '999') * 100);
            if (cigs.length && Math.min(...cigs) < 1000) return true;
            return phase.tokens.some((t: any) => t.type === 'weather' && ['TS', 'FZ', 'SN', 'FG', 'SH'].some(c => (t.value as string).includes(c)));
        };

        const dangerousTransients = allEnrichedPhases.filter(p => {
            const isProbOrTempo = p.type === 'prob' || p.type === 'tempo' || p.raw?.includes('PROB') || p.raw?.includes('TEMPO');
            return isProbOrTempo && (p.validStart <= bufferEndTime && p.validEnd >= startTime) && isDangerous(p);
        });

        const windowPhases = [];
        if (effectiveBaseline) windowPhases.push(effectiveBaseline);
        const combinedPhases = [...windowPhases, ...windowOverlays, ...dangerousTransients];

        // 4. Hazards Calculation
        const causes = new Set<string>();
        let hasSevere = false;
        let hasWarning = false;

        combinedPhases.forEach(p => {
            const vis = parseVisibility(p.tokens?.find((t: any) => t.type === 'visibility')?.value || '9999');
            if (vis < 800) { hasSevere = true; causes.add(`LVP VIS (${vis}M)`); }
            else if (vis < 5000) { hasWarning = true; causes.add(`IFR VIS (${vis}M)`); }

            const cigs = p.tokens?.filter((t: any) => t.type === 'skyCondition')
                .map((t: any) => parseInt(t.value.match(/\d{3}/)?.[0] || '999') * 100) || [];
            const minCig = cigs.length ? Math.min(...cigs) : 9999;
            if (minCig < 300) { hasSevere = true; causes.add(`LOW CIG (${minCig}FT)`); }
            else if (minCig < 1000) { hasWarning = true; causes.add(`IFR CIG (${minCig}FT)`); }

            p.tokens?.filter((t: any) => t.type === 'weather').forEach((t: any) => {
                const val = (t.content || t.value ||'').toUpperCase();
                if (val.includes('TS')) { hasSevere = true; causes.add('TS'); }
                if (val.includes('FZ')) { hasSevere = true; causes.add('FREEZING'); }
                if (val.includes('SN')) { hasWarning = true; causes.add('SNOW'); }
            });

            const wind = p.tokens?.find((t: any) => t.type === 'wind')?.value ||'';
            const gustMatch = wind.match(/G(\d{2,3})/);
            if (gustMatch) {
                const g = parseInt(gustMatch[1], 10);
                if (g > 35) { hasSevere = true; causes.add(`GUSTS ${g}KT`); }
                else if (g > 25) { hasWarning = true; causes.add(`GUSTS ${g}KT`); }
            }
        });

        const windowTrends: any[] = [];
        for (let i = 1; i < combinedPhases.length; i++) {
            const tr = analyzeTrend(combinedPhases[i - 1], combinedPhases[i]);
            if (tr.trend !== 'NEUTRAL') windowTrends.push(tr);
        }

        const recommendations = generateSmartRecommendations(combinedPhases, role, icao, windowTrends, {
            legalPhases: enrichedPhases,
            etaTime: etaDate
        });

        return {
            windowPhases: combinedPhases,
            hazards: {
                hasSevere,
                hasWarning,
                causes: Array.from(causes)
            },
            recommendations
        };
    }, [timelineSnapshots, allEnrichedPhases, enrichedPhases, role, icao]);

    const windowHazards = windowAnalysis?.hazards || { hasSevere: false, hasWarning: false, causes: [] };
    const recommendation = windowAnalysis?.recommendations || { advice: [], status: 'neutral' };

    return (
        <div className="space-y-6 text-slate-200">
            {/* Control Panel - Cockpit Style */}
            <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-500 opacity-50"></div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                    <div className="space-y-1 group relative">
                        <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider group-focus-within:text-cyan-400 transition-colors">Station ID</label>
                        <div className="relative">
                            <LucideIcons.MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-600 group-focus-within:text-cyan-400 transition-colors" />
                            <input type="text" value={icao} onChange={(e) => setIcao(e.target.value.toUpperCase())} placeholder="ICAO" className="w-full bg-slate-950 border border-slate-700/50 rounded-lg p-2 pl-9 text-cyan-300 font-bold font-mono focus:border-cyan-500 transition-all outline-none" maxLength={4} />
                        </div>
                        {stationName && <div className="absolute top-full left-0 mt-1 w-full text-[10px] font-medium text-cyan-400/80 truncate px-1">{stationName}</div>}
                    </div>
                    <div className="space-y-1 group">
                        <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Role</label>
                        <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full bg-slate-950 border border-slate-700/50 rounded-lg p-2 text-slate-300 font-medium focus:border-cyan-500 outline-none appearance-none transition-all cursor-pointer">
                            <option value="dest">Destination</option>
                            <option value="takeoff_alt">T/O Alt</option>
                            <option value="dest_alt">Dest Alt</option>
                            <option value="fuelera">Fuel ERA</option>
                        </select>
                    </div>
                    <div className="space-y-1 group">
                        <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Date</label>
                        <select value={selectedDateDay} onChange={(e) => setSelectedDateDay(e.target.value)} disabled={validDateOptions.length === 0} className="w-full bg-slate-950 border border-slate-700/50 rounded-lg p-2 text-cyan-300 font-bold font-mono focus:border-cyan-500 outline-none appearance-none transition-all cursor-pointer disabled:opacity-50">
                            {validDateOptions.map(day => <option key={day} value={day}>{day}th</option>)}
                        </select>
                    </div>
                    <div className="space-y-1 group">
                        <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">ETA (UTC)</label>
                        <div className="relative">
                            <LucideIcons.Clock className="absolute left-3 top-2.5 w-4 h-4 text-slate-600 group-focus-within:text-cyan-400 transition-colors" />
                            <input type="text" value={eta} onChange={(e) => setEta(e.target.value.replace(/\D/g, ''))} placeholder="HHMM" maxLength={4} className="w-full bg-slate-950 border border-slate-700/50 rounded-lg p-2 pl-9 text-cyan-300 font-bold font-mono focus:border-cyan-500 transition-all outline-none" />
                        </div>
                    </div>
                    <button onClick={handleFetch} disabled={isLoading} className="h-10 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-lg transition-all flex items-center justify-center gap-2 border border-cyan-400/20">
                        {isLoading ? <LucideIcons.Loader2 className="animate-spin w-4 h-4" /> : <LucideIcons.Radar className="w-4 h-4" />}
                        <span>SCAN</span>
                    </button>
                </div>
            </div>

            {/* Official Forecast Bulletin */}
            {rawTaf && (
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 relative overflow-hidden group shadow-lg">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                        <LucideIcons.FileText className="w-12 h-12" />
                    </div>
                    <div className="flex items-center gap-3 mb-4 border-b border-white/5 pb-3">
                        <div className="w-1 h-4 bg-cyan-500 rounded-full"></div>
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Official Forecast Bulletin</h3>
                    </div>
                    <div className="relative">
                        <p className="text-xs font-mono leading-relaxed text-slate-300 whitespace-pre-wrap break-words selection:bg-cyan-500/30">
                            {rawTaf.split(' ').map((word, i) => {
                                const isHazard = ['TS', 'FZ', 'SN', 'FG', 'VV', 'BKN00', 'OVC00'].some(h => word.includes(h));
                                const isChange = ['TEMPO', 'BECMG', 'PROB', 'FM'].some(c => word.includes(c));
                                return (
                                    <span key={i} className={`${isHazard ? 'text-red-400 font-bold underline decoration-red-500/40 underline-offset-4' : isChange ? 'text-cyan-400 font-black' : ''}`}>
                                        {word}{' '}
                                    </span>
                                );
                            })}
                        </p>
                    </div>
                </div>
            )}

            {/* METAR Toggle */}
            {rawTaf && (
                <div className="flex justify-end px-2">
                    <label className="flex items-center gap-2 cursor-pointer group">
                        <div className="relative">
                            <input type="checkbox" checked={showMetar} onChange={(e) => setShowMetar(e.target.checked)} className="peer sr-only" />
                            <div className="w-9 h-5 bg-slate-800 rounded-full border border-slate-600 peer-checked:bg-cyan-900 transition-all"></div>
                            <div className="absolute left-1 top-1 w-3 h-3 bg-slate-400 rounded-full peer-checked:translate-x-4 transition-all"></div>
                        </div>
                        <span className="text-[10px] font-bold uppercase text-slate-500">Show METAR</span>
                    </label>
                </div>
            )}

            {showMetar && rawMetar && (
                <div className="bg-[#0b121e] border border-slate-700 rounded-xl p-4 shadow-lg animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 mb-2 border-b border-slate-700/50 pb-2">
                        <LucideIcons.Eye className="w-4 h-4 text-cyan-500" />
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Official METAR Observation</span>
                    </div>
                    <code className="text-[11px] font-mono text-cyan-200/90 break-all">{rawMetar}</code>
                </div>
            )}

            {/* Timeline Analysis */}
            {timelineSnapshots && (
                <div className="relative overflow-x-auto rounded-xl border border-slate-700 bg-[#040b14] shadow-xl p-6">
                    <div className="flex flex-col items-center justify-center gap-3 mb-6">
                        <div className="inline-flex items-center gap-3 px-4 py-1.5 bg-slate-900 rounded-full border border-slate-700">
                            {(windowHazards.hasSevere || windowHazards.hasWarning) && (
                                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border animate-pulse ${windowHazards.hasSevere ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>
                                    <LucideIcons.AlertTriangle className="w-3 h-3" />
                                    <span className="text-[8px] font-black uppercase">{windowHazards.hasSevere ? 'Severe' : 'Caution'}</span>
                                    <span className="mx-1 opacity-20">|</span>
                                    <span className="text-[8px] font-bold uppercase truncate max-w-[120px]">{windowHazards.causes[0]}</span>
                                </div>
                            )}
                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></div>
                            <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black">Analysis Window (ETA ±1h)</span>
                        </div>
                    </div>
                    <div className="flex justify-between items-center min-w-[500px] px-8 py-2 relative">
                        <div className="absolute left-10 right-10 h-0.5 bg-slate-800 top-[45px]"></div>
                        {timelineSnapshots.map((snap, i) => (
                            <div key={i} className="flex flex-col items-center space-y-3 relative z-10 transition-all group">
                                <span className={`text-[9px] font-mono font-black ${snap.offsetMin === 0 ? 'text-cyan-400' : 'text-slate-500 opacity-60'}`}>
                                    {snap.time.getUTCHours().toString().padStart(2, '0')}:{snap.time.getUTCMinutes().toString().padStart(2, '0')}
                                </span>
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${snap.offsetMin === 0 ? 'border-cyan-500 bg-cyan-950/40 scale-110 shadow-lg shadow-cyan-500/20' : 'border-slate-800 bg-slate-950'}`}>
                                    {getWeatherIcon(snap.icon, `${snap.offsetMin === 0 ? 'w-7 h-7' : 'w-5 h-5'} ${snap.color}`)}
                                </div>
                                <span className={`text-[8px] font-black uppercase tracking-widest ${snap.color} ${snap.offsetMin === 0 ? 'opacity-100' : 'opacity-40'}`}>{snap.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Main Content Split View */}
            {enrichedPhases.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 px-1">
                            <LucideIcons.Shield className="w-4 h-4 text-cyan-500" />
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Legal Applicable Weather</h3>
                        </div>
                        <div className="bg-slate-900/30 border border-slate-800/50 rounded-xl p-3">
                            <LivePhaseFeed phases={enrichedPhases} onPhaseClick={setSelectedPhase} selectedPhase={selectedPhase} enableSmartFiltering={true} stationId={icao} />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center gap-2 px-1">
                            <LucideIcons.Briefcase className="w-4 h-4 text-cyan-500" />
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Smart Efficient Operation</h3>
                        </div>
                        <div className="bg-[#081420] border border-slate-700/50 rounded-xl p-5 shadow-xl min-h-[400px]">
                            {(() => {
                                if (!recommendation) return null;

                                return (
                                    <div className="relative z-10 animate-in fade-in duration-500">
                                        <div className="flex flex-col gap-4 mb-6 pb-4 border-b border-white/10">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="text-[10px] uppercase text-slate-500 font-bold tracking-widest mb-1">Window Analysis (ETA ±1h)</div>
                                                    <div className="text-lg font-bold text-slate-100 flex items-center gap-2">
                                                        <LucideIcons.ShieldCheck className="w-5 h-5 text-cyan-400" />
                                                        {(() => {
                                                            const labels: any = {
                                                                'dest': 'Destination',
                                                                'takeoff_alt': 'Take-Off Alternate',
                                                                'dest_alt': 'Dest Alternate',
                                                                'fuelera': 'Fuel ERA'
                                                            };
                                                            return labels[role] || 'Operational';
                                                        })()} Summary
                                                    </div>
                                                </div>
                                                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border 
                                                    ${recommendation.status === 'danger' ? 'bg-red-500/10 text-red-400 border-red-500/30' : 
                                                      recommendation.status === 'warning' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 
                                                      'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}>
                                                    {recommendation.status === 'danger' ? 'High Alert' : recommendation.status === 'warning' ? 'Caution' : 'Favorable'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            {recommendation.advice.map((cat: any, idx: number) => {
                                                if (cat.type === 'deteriorating') {
                                                    return (
                                                        <div key={idx} className="p-4 rounded-lg bg-red-950/20 border border-red-500/30 flex gap-3 items-start transition-all hover:translate-x-1">
                                                            <div className="mt-0.5 p-1 rounded-full bg-red-500/20 text-red-400">
                                                                <LucideIcons.TrendingDown className="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-3 text-red-400/80 flex items-center gap-2">
                                                                    Deteriorating Conditions
                                                                </p>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {cat.items.map((token: string, tIdx: number) => (
                                                                        <DeteriorationChip key={tIdx} token={token} />
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                if (cat.type === 'deteriorating_clean') {
                                                    const isPoor = cat.items[0].includes("poor conditions");
                                                    return (
                                                        <div key={idx} className={`p-4 rounded-lg flex gap-3 items-center transition-all hover:translate-x-1 opacity-80 hover:opacity-100 border
                                                            ${isPoor ? 'bg-slate-900/40 border-slate-700/50' : 'bg-emerald-950/10 border-emerald-500/20'}`}>
                                                            <div className={`p-1 rounded-full ${isPoor ? 'bg-slate-800 text-slate-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                                                {isPoor ? <LucideIcons.Minus className="w-4 h-4" /> : <LucideIcons.TrendingUp className="w-4 h-4" />}
                                                            </div>
                                                            <div>
                                                                <p className={`text-[10px] font-black uppercase tracking-wide mb-0.5 ${isPoor ? 'text-slate-300' : 'text-emerald-400'}`}>
                                                                    {isPoor ? 'Constant State' : 'Conditions Stable'}
                                                                </p>
                                                                <p className="text-[11px] text-slate-400">{cat.items[0]}</p>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                if (cat.type === 'notice') {
                                                    return (
                                                        <div key={idx} className="p-4 rounded-lg bg-amber-950/10 border border-amber-500/20 transition-all">
                                                            <div className="flex items-center gap-2 mb-3">
                                                                <div className="p-1 rounded-full bg-amber-500/20 text-amber-400">
                                                                    <LucideIcons.Plane className="w-4 h-4" />
                                                                </div>
                                                                <p className="text-[10px] font-black uppercase tracking-wide text-amber-400">Operational Notices</p>
                                                            </div>
                                                            <div className="flex flex-col gap-2.5">
                                                                {cat.items.map((item: string, i: number) => (
                                                                    <OperationalNoticeCard key={i} text={item} />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                if (cat.type === 'notice_clean') {
                                                    return (
                                                        <div key={idx} className="p-4 rounded-lg bg-amber-950/10 border border-amber-500/20 flex gap-3 items-center transition-all hover:translate-x-1 opacity-80 hover:opacity-100">
                                                            <div className="p-1 rounded-full bg-amber-500/10 text-amber-400">
                                                                <LucideIcons.Plane className="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black uppercase tracking-wide mb-0.5 text-amber-400">Operational Notices</p>
                                                                <p className="text-[11px] text-slate-400">{cat.items[0]}</p>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                if (cat.type === 'recommendation') {
                                                    return (
                                                        <div key={idx} className="p-4 rounded-lg bg-cyan-950/20 border border-cyan-500/30 flex gap-3 items-start transition-all hover:translate-x-1">
                                                            <div className="mt-0.5 p-1 rounded-full bg-cyan-500/20 text-cyan-400">
                                                                <LucideIcons.Zap className="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black uppercase tracking-wide mb-2 text-cyan-400">Strategic Recommendations</p>
                                                                <div className="flex flex-col gap-2">
                                                                    {cat.items.map((item: string, i: number) => (
                                                                        <div key={i} className="flex gap-2 items-start">
                                                                            <div className="mt-1.5 w-1 h-1 rounded-full bg-cyan-500/50 shrink-0"></div>
                                                                            <p className="text-[11px] text-slate-300 leading-relaxed font-medium">{item}</p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

