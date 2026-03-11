import { parseVisibility } from './weatherComparison';

/**
 * Enhanced Recommendation Engine
 * Generates aggregated operational advice for a window of phases.
 */
export function generateSmartRecommendations(phases: any[], role: string, stationId: string, trends: any[] = [], fallbackContext: any = null) {
    if (!phases || phases.length === 0) {
        return {
            advice: [
                { type: 'deteriorating_clean', items: ["No forecast data available."] },
                { type: 'notice_clean', items: ["Unable to generate operational notices."] },
                { type: 'recommendation_clean', items: ["Verify forecast availability."] }
            ],
            status: 'neutral'
        };
    }

    const advice: any = {
        deteriorating: new Set(),
        notices: new Set(),
        recommendations: new Set()
    };
    let status = 'neutral';

    let minVis = 9999;
    let minVisRaw = '9999';
    let minCig = Infinity;
    let maxGust = 0;
    let baseWind = 0;

    let hasProbTempo = false;
    let hasVisToken = false;
    let hasCigToken = false;
    let hasWindToken = false;

    const ptHazards: any = {
        vis: null,
        cig: null,
        wind: null,
        ts: null,
        fz: null,
        sn: null,
        fg: null,
        sh: null
    };

    phases.forEach(phase => {
        let phaseTypeLabel: string | null = null;
        const hasProbToken = phase.tokens?.some((t: any) => t.value?.includes('PROB'));
        const isProbTempoGroup =
            (phase.raw?.includes('PROB') && phase.raw?.includes('TEMPO')) ||
            (phase.type === 'tempo' && (phase.probability || hasProbToken)) ||
            (phase.type === 'prob' && (phase.raw?.includes('TEMPO') || phase.tokens?.some((t: any) => t.value?.includes('TEMPO'))));

        if (isProbTempoGroup) {
            phaseTypeLabel = 'PROB TEMPO';
        } else if (phase.type === 'prob') {
            phaseTypeLabel = 'PROB';
        } else if (phase.type === 'tempo') {
            phaseTypeLabel = 'TEMPO';
        }

        const isProbOrTempo = phaseTypeLabel !== null;
        if (isProbOrTempo) hasProbTempo = true;

        const visToken = phase.tokens?.find((t: any) => t.type === 'visibility');
        const cigTokens = phase.tokens?.filter((t: any) => t.type === 'skyCondition') || [];
        const windToken = phase.tokens?.find((t: any) => t.type === 'wind');
        const wxTokens = phase.tokens?.filter((t: any) => t.type === 'weather') || [];

        if (visToken) {
            hasVisToken = true;
            const v = parseVisibility(visToken.value);
            if (v < minVis) {
                minVis = v;
                minVisRaw = visToken.value;
                if (isProbOrTempo) {
                    if (ptHazards.vis !== 'PROB TEMPO') ptHazards.vis = phaseTypeLabel;
                }
            }
        }

        if (cigTokens.length > 0) {
            const ceilingHeights = cigTokens
                .filter((token: any) => ['BKN', 'OVC', 'VV'].some(layer => token.value.startsWith(layer)))
                .map((token: any) => {
                    const match = token.value.match(/\d{3}/);
                    return match ? parseInt(match[0], 10) * 100 : null;
                })
                .filter((height: number | null): height is number => height !== null && Number.isFinite(height));

            if (ceilingHeights.length > 0) {
                hasCigToken = true;
                const phaseMinCeiling = Math.min(...ceilingHeights);
                if (phaseMinCeiling < minCig) minCig = phaseMinCeiling;
                if (isProbOrTempo) {
                    if (ptHazards.cig !== 'PROB TEMPO') ptHazards.cig = phaseTypeLabel;
                }
            }
        }

        if (windToken) {
            hasWindToken = true;
            const baseMatch = windToken.value.match(/(\d{3}|VRB)(\d{2,3})(KT|MPS|KMH)/);
            if (baseMatch) {
                let w = parseInt(baseMatch[2]);
                const u = baseMatch[3];
                if (u === 'MPS') w = Math.round(w * 1.94384);
                if (u === 'KMH') w = Math.round(w * 0.539957);
                if (w > baseWind) baseWind = w;
            }

            const gustMatch = windToken.value.match(/G(\d{2,3})(KT|MPS|KMH)/);
            if (gustMatch) {
                let g = parseInt(gustMatch[1]);
                const u = gustMatch[2];
                if (u === 'MPS') g = Math.round(g * 1.94384);
                if (u === 'KMH') g = Math.round(g * 0.539957);
                if (g > maxGust) maxGust = g;
                if (isProbOrTempo && g > 20) {
                    if (ptHazards.wind !== 'PROB TEMPO') ptHazards.wind = phaseTypeLabel;
                }
            }
        }

        wxTokens.forEach((t: any) => {
            if (t.value.includes('TS')) {
                if (isProbOrTempo && ptHazards.ts !== 'PROB TEMPO') ptHazards.ts = phaseTypeLabel;
            }
            if (t.value.includes('FZ')) {
                if (isProbOrTempo && ptHazards.fz !== 'PROB TEMPO') ptHazards.fz = phaseTypeLabel;
            }
            if (t.value.includes('SN')) {
                if (isProbOrTempo && ptHazards.sn !== 'PROB TEMPO') ptHazards.sn = phaseTypeLabel;
            }
            if (t.value.includes('FG') || t.phenomenon === 'FG') {
                if (isProbOrTempo && ptHazards.fg !== 'PROB TEMPO') ptHazards.fg = phaseTypeLabel;
            }
            if (t.value.includes('SH')) {
                if (isProbOrTempo && ptHazards.sh !== 'PROB TEMPO') ptHazards.sh = phaseTypeLabel;
            }
        });
    });

    // Fallback logic omitted for brevity in port, could be restored if needed
    
    const weatherValues = phases
        .flatMap(p => p.tokens || [])
        .filter(t => t.type === 'weather' && typeof t.value === 'string')
        .map(t => t.value.toUpperCase());

    const hasWeatherCode = (code: string) => weatherValues.some(v => v.includes(code));
    const hasSignificantWx = phases.some(p => p.tokens?.some((t: any) => ['TS', 'FZ', 'SN', 'GR', 'PL', 'FC', 'FG'].some(code => t.value.includes(code))));
    const hasTS = hasWeatherCode('TS');
    const hasFZ = hasWeatherCode('FZ');
    const hasSN = hasWeatherCode('SN');
    const hasRA = hasWeatherCode('RA');
    const hasFG = phases.some(p => p.tokens?.some((t: any) => t.value.includes('FG') || t.phenomenon === 'FG'));
    const hasBR = hasWeatherCode('BR');
    const hasHZ = hasWeatherCode('HZ');

    let flightCategory = 'VFR';
    if (minVis < 5000 || minCig < 1000) flightCategory = 'IFR';
    if (minVis < 1600 || minCig < 500) flightCategory = 'LIFR';
    if (minVis >= 5000 && minCig >= 3000) flightCategory = 'VFR';
    else if (minVis >= 5000 && minCig >= 1000) flightCategory = 'MVFR';

    // --- DETERIORATING CONDITIONS ---
    const isWorsening = trends.some(t => t.trend === 'DETERIORATING');
    if (isWorsening) {
        status = 'warning';
        advice.deteriorating.add("DET_TREND");
    }

    if (minCig < 1000 || minVis < 3000 || maxGust > 25 || hasSignificantWx) {
        advice.deteriorating.add("DET_RISK");
        if (status !== 'danger') status = 'warning';
        if (minCig < 200 || minVis < 800 || hasTS || hasFZ) status = 'danger';
    }

    // --- NOTICES ---
    const formatVis = () => {
        if (minVisRaw.includes('SM')) return minVisRaw;
        return Math.round(minVis) + 'm';
    };

    if (role === 'dest') {
        if (minVis < 800) advice.notices.add(`Visibility ${formatVis()} — Type B capability required; Arrival rate reduced.`);
        else if (minVis < 3000) advice.notices.add(`Visibility ${formatVis()} — Taxi routing and stand sequencing should be monitored.`);
        
        if (minCig < 250) advice.notices.add(`Ceiling ${Math.round(minCig)}ft — Type B required for continuity.`);
        else if (minCig < 1000) advice.notices.add(`Ceiling ${Math.round(minCig)}ft — Visual acquisition delayed.`);
        
        if (hasTS) advice.notices.add("Thunderstorm activity — vectoring and holding possible.");
        if (hasSN) advice.notices.add("Snow accumulation — Runway contamination likely.");
    }

    // --- RECOMMENDATIONS ---
    if (hasProbTempo || isWorsening) advice.recommendations.add("Plan using worst-case forecast.");
    if (hasSN || hasFZ) advice.recommendations.add("Verify runway condition and braking.");
    if (maxGust >= 20) advice.recommendations.add("Check crosswind and landing performance.");
    if (status === 'danger' || hasTS) advice.recommendations.add("Carry contingency fuel.");

    const finalAdvice: any[] = [];
    if (advice.deteriorating.size > 0) finalAdvice.push({ type: 'deteriorating', items: Array.from(advice.deteriorating) });
    else finalAdvice.push({ type: 'deteriorating_clean', items: ["Conditions Stable."] });

    if (advice.notices.size > 0) finalAdvice.push({ type: 'notice', items: Array.from(advice.notices) });
    else finalAdvice.push({ type: 'notice_clean', items: ["Standard meteorological conditions."] });

    if (advice.recommendations.size > 0) finalAdvice.push({ type: 'recommendation', items: Array.from(advice.recommendations) });
    else finalAdvice.push({ type: 'recommendation_clean', items: ["Standard flight operations apply."] });

    return { advice: finalAdvice, status };
}
