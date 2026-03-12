import { parseVisibility } from './weatherComparison';

/**
 * Enhanced Recommendation Engine for "Smart Efficient Operation"
 * Generates aggregated operational advice for a window of phases.
 * 
 * @param {Array} phases - List of relevant phases in the ETA window
 * @param {String} role - Selected role: 'dest', 'takeoff_alt', 'dest_alt', 'fuelera'
 * @param {String} stationId - ICAO code
 * @param {Array} trends - Array of trendAnalysis objects for the window
 * @param {Object} fallbackContext - Optional context for missing parameter fallback
 * @returns {Object} { advice: Array<{text, type}>, status: 'neutral'|'warning'|'danger' }
 */
export function generateSmartRecommendations(phases: any[], role: string, stationId: string, trends: any[] = [], fallbackContext: any = null) {
    if (!phases || phases.length === 0) {
        // Return baseline empty state
        return {
            advice: [
                { type: 'deteriorating_clean', items: ["No forecast data available."] },
                { type: 'notice_clean', items: ["Unable to generate operational notices."] },
                { type: 'recommendation_clean', items: ["Verify forecast availability."] }
            ],
            status: 'neutral'
        };
    }

    const advice: { deteriorating: Set<string>, notices: Set<string>, recommendations: Set<string> } = {
        deteriorating: new Set(),
        notices: new Set(),
        recommendations: new Set()
    };
    let status = 'neutral';

    let minVis = 9999;
    let minVisRaw = '9999'; // Track original token value for display
    let minCig = Infinity;
    let maxGust = 0;
    let baseWind = 0;

    let hasProbTempo = false;
    let hasVisToken = false;
    let hasCigToken = false;
    let hasWindToken = false;

    // Track hazards specifically from PROB/TEMPO phases with their type
    const ptHazards: Record<string, string | null> = {
        vis: null,    // Will store 'PROB', 'TEMPO', or 'PROB TEMPO'
        cig: null,
        wind: null,
        ts: null,
        fz: null,
        sn: null,
        fg: null,
        sh: null     // Add showers tracking
    };

    // 1. Analyze Phases for Minimums and Hazards
    phases.forEach(phase => {
        // Determine specific phase type
        let phaseTypeLabel: string | null = null;

        // Check for PROB TEMPO
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

        // VIS
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

        // CIG
        if (cigTokens.length > 0) {
            const ceilingHeights = cigTokens
                .filter((token: any) => ['BKN', 'OVC', 'VV'].some(layer => token.value.startsWith(layer)))
                .map((token: any) => {
                    const match = token.value.match(/\d{3}/);
                    return match ? parseInt(match[0], 10) * 100 : null;
                })
                .filter((height: any): height is number => typeof height === 'number' && Number.isFinite(height));

            if (ceilingHeights.length > 0) {
                hasCigToken = true;
                const phaseMinCeiling = Math.min(...ceilingHeights);
                if (phaseMinCeiling < minCig) minCig = phaseMinCeiling;

                if (isProbOrTempo) {
                    if (ptHazards.cig !== 'PROB TEMPO') ptHazards.cig = phaseTypeLabel;
                }
            }
        }

        // WIND
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

        // WX
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

    // Fallback from legal applicable phases
    if (fallbackContext?.legalPhases?.length && fallbackContext?.etaTime) {
        const etaTime = fallbackContext.etaTime;
        const timedLegalPhases = fallbackContext.legalPhases.filter((p: any) => p?.tokens?.length && p.validStart && p.validEnd);
        const candidatePhases = timedLegalPhases.filter((p: any) => etaTime >= p.validStart && etaTime < p.validEnd)
            .sort((a: any, b: any) => (b.validStart?.getTime() || 0) - (a.validStart?.getTime() || 0));

        if (!hasWindToken) {
            const fallbackWind = candidatePhases.map((p: any) => p.tokens.find((t: any) => t.type === 'wind')).find(Boolean);
            if (fallbackWind) {
                hasWindToken = true;
                const baseMatch = (fallbackWind.value as string).match(/(\d{3}|VRB)(\d{2,3})(KT|MPS|KMH)/);
                if (baseMatch) {
                    let w = parseInt(baseMatch[2], 10);
                    const u = baseMatch[3];
                    if (u === 'MPS') w = Math.round(w * 1.94384);
                    if (u === 'KMH') w = Math.round(w * 0.539957);
                    if (w > baseWind) baseWind = w;
                }
                const gustMatch = (fallbackWind.value as string).match(/G(\d{2,3})(KT|MPS|KMH)/);
                if (gustMatch) {
                    let g = parseInt(gustMatch[1], 10);
                    const u = gustMatch[2];
                    if (u === 'MPS') g = Math.round(g * 1.94384);
                    if (u === 'KMH') g = Math.round(g * 0.539957);
                    if (g > maxGust) maxGust = g;
                }
            }
        }
    }

    const weatherValues = phases
        .flatMap(p => p.tokens || [])
        .filter(t => t.type === 'weather' && typeof t.value === 'string')
        .map(t => t.value.toUpperCase());

    const hasWeatherCode = (code: string) => weatherValues.some(v => v.includes(code));
    const hasSignificantWx = phases.some(p => p.tokens?.some((t: any) => ['TS', 'FZ', 'SN', 'GR', 'PL', 'FC', 'FG'].some(code => t.value.includes(code))));
    const hasTS = hasWeatherCode('TS');
    const hasFZ = hasWeatherCode('FZ');
    const hasSN = hasWeatherCode('SN');
    const hasFG = phases.some(p => p.tokens?.some((t: any) => t.value.includes('FG') || t.phenomenon === 'FG'));

    let flightCategory = 'VFR';
    if (minVis < 5000 || minCig < 1000) flightCategory = 'IFR';
    if (minVis < 1600 || minCig < 500) flightCategory = 'LIFR';
    if (minVis >= 5000 && minCig >= 3000) flightCategory = 'VFR';
    else if (minVis >= 5000 && minCig >= 1000) flightCategory = 'MVFR';

    // --- DETERIORATING CONDITIONS ---
    const isWorsening = trends.some(t => t.trend === 'DETERIORATING');
    if (isWorsening) {
        status = 'warning';
        const trendReasons = trends.flatMap(t => t.reasons);
        if (trendReasons.some(r => r.includes("Ceiling Lowering"))) advice.deteriorating.add("DET_CEILING");
        if (trendReasons.some(r => r.includes("Visibility Reducing"))) advice.deteriorating.add("DET_VISIBILITY");
        if (trendReasons.some(r => r.includes("Wind Gusts Increasing"))) advice.deteriorating.add("DET_WIND");
        if (trendReasons.some(r => r.includes("Weather Conditions Intensifying"))) advice.deteriorating.add("DET_WX");
        if (advice.deteriorating.size === 0) advice.deteriorating.add("DET_TREND");
    }

    if (minCig < 1000 || minVis < 3000 || maxGust > 25 || hasSignificantWx) {
        advice.deteriorating.add("DET_RISK");
        if (status !== 'danger') status = 'warning';
        if (minCig < 200 || minVis < 800 || hasTS || hasFZ) status = 'danger';
    }

    // --- OPERATIONAL NOTICES ---
    const formatVis = () => {
        if (minVisRaw.includes('SM')) return minVisRaw;
        return Math.round(minVis) + 'm';
    };

    const getVisibilityQuality = () => {
        if (minVis >= 9999) return 'Excellent';
        if (minVis >= 5000) return 'Good';
        if (minVis >= 3000) return 'Moderate';
        return 'Reduced';
    };

    let thresholdBreaches = 0;
    const gustSpread = maxGust > 0 ? maxGust - baseWind : 0;

    if (role === 'dest') {
        const visSuffix = ptHazards.vis ? ` (${ptHazards.vis})` : '';
        if (minVis < 800) { advice.notices.add(`Visibility ${formatVis()} — Type B capability required; Arrival rate reduced; Taxi flow significantly constrained${visSuffix}.`); thresholdBreaches++; }
        else if (minVis < 1500) { advice.notices.add(`Visibility ${formatVis()} — Increased instrument dependency; Low visibility taxi procedures possible${visSuffix}.`); thresholdBreaches++; }
        else if (minVis < 3000) { advice.notices.add(`Visibility ${formatVis()} — Arrival flow stable; Type A potentially needed; Taxi routing should be monitored${visSuffix}.`); thresholdBreaches++; }
        else if (hasVisToken) advice.notices.add(`${getVisibilityQuality()} visibility (${minVis >= 9999 ? '10km+' : formatVis()}) — Visual acquisition is robust; Standard arrival and taxi flow sustained${visSuffix}.`);

        const cigSuffix = ptHazards.cig ? ` (${ptHazards.cig})` : '';
        if (minCig < 250) { advice.notices.add(`Ceiling ${Math.round(minCig)}ft — Type B required for continuity; Diversion exposure increases${cigSuffix}.`); thresholdBreaches++; }
        else if (minCig < 600) { advice.notices.add(`Ceiling ${Math.round(minCig)}ft — Increased reliance on instrument guidance; Missed approach exposure increases${cigSuffix}.`); thresholdBreaches++; }
        else if (minCig < 1000) { advice.notices.add(`Ceiling ${Math.round(minCig)}ft — Visual acquisition delayed but operationally stable${cigSuffix}.`); thresholdBreaches++; }
        else if (hasCigToken && Number.isFinite(minCig)) advice.notices.add(`Ceiling ${Math.round(minCig)}ft — Supports normal approach continuity${cigSuffix}.`);

        const windSuffix = ptHazards.wind ? ` (${ptHazards.wind})` : '';
        if (gustSpread >= 15) { advice.notices.add(`Gust spread ${gustSpread}kt — Marked wind variability; Touchdown dispersion risk elevated${windSuffix}.`); thresholdBreaches++; }
        else if (hasWindToken) {
            const windVal = Math.round(Math.max(baseWind, maxGust));
            advice.notices.add(windVal >= 20 ? `Winds ${windVal}kt — Stable headwind/crosswind profile; Standard sequencing manageable${windSuffix}.` : `Light to moderate winds (${windVal}kt) — Minimal wind-driven disruption expected.`);
        }

        if (hasTS) { advice.notices.add(`Thunderstorm activity — vectoring, holding and ramp suspension possible${ptHazards.ts ? ` (${ptHazards.ts})` : ''}.`); thresholdBreaches++; }
        if (hasFG) { advice.notices.add(`Fog reducing visibility — Arrival throughput may reduce; Low-visibility taxi routing likely${ptHazards.fg ? ` (${ptHazards.fg})` : ''}.`); thresholdBreaches++; }
        if (thresholdBreaches >= 2) advice.notices.add("Multiple thresholds exceeded — Recovery predictability reduced; Secondary alternate enhances resilience.");
    } else if (role === 'dest_alt') {
        const visSuffix = ptHazards.vis ? ` (${ptHazards.vis})` : '';
        if (minVis < 800) { advice.notices.add(`Visibility ${formatVis()} — Alternate minima likely not met; Diversion viability at risk${visSuffix}.`); thresholdBreaches++; }
        else if (minVis < 3000) { advice.notices.add(`Visibility ${formatVis()} — Adequate for alternate; Monitor trend to protect diversion reliability${visSuffix}.`); }
        else if (hasVisToken) advice.notices.add(`${getVisibilityQuality()} visibility — Diversion arrival viability is strong${visSuffix}.`);

        const cigSuffix = ptHazards.cig ? ` (${ptHazards.cig})` : '';
        if (minCig < 300) { advice.notices.add(`Ceiling ${Math.round(minCig)}ft — Below alternate minima; Diversion protection compromised${cigSuffix}.`); thresholdBreaches++; }
        else if (minCig < 1000) { advice.notices.add(`Ceiling ${Math.round(minCig)}ft — Acceptable ceiling for alternate approach${cigSuffix}.`); }

        if (hasTS) { advice.notices.add(`Thunderstorm activity — Holding potentially limited; Secondary alternate recommended${ptHazards.ts ? ` (${ptHazards.ts})` : ''}.`); thresholdBreaches++; }
        if (thresholdBreaches >= 2) advice.notices.add("Multiple thresholds exceeded — Alternate reliability degraded; Review selection.");
    }

    // --- RECOMMENDATIONS ---
    if (hasProbTempo || isWorsening) advice.recommendations.add("Plan using worst-case forecast.");
    if (hasSignificantWx) advice.recommendations.add("Verify runway condition and braking.");
    if (maxGust >= 20 || baseWind >= 20) advice.recommendations.add("Check crosswind and landing performance.");
    if (minCig < 1000 || minVis < 3000) advice.recommendations.add("Confirm approach minima and authorization.");
    if (status === 'danger' || hasTS) advice.recommendations.add("Carry contingency fuel.");
    if (role === 'dest' && (status === 'danger' || hasTS)) advice.recommendations.add("Consider alternate selection.");

    const finalAdvice: any[] = [];
    if (advice.deteriorating.size > 0) finalAdvice.push({ type: 'deteriorating', items: Array.from(advice.deteriorating) });
    else finalAdvice.push({ type: 'deteriorating_clean', items: [status !== 'neutral' ? "Stable poor conditions." : "Conditions Stable."] });

    if (advice.notices.size > 0) finalAdvice.push({ type: 'notice', items: Array.from(advice.notices) });
    else finalAdvice.push({ type: 'notice_clean', items: ["Standard meteorological conditions."] });

    if (advice.recommendations.size > 0) finalAdvice.push({ type: 'recommendation', items: Array.from(advice.recommendations) });
    else finalAdvice.push({ type: 'recommendation_clean', items: ["Standard flight operations apply."] });

    return { advice: finalAdvice, status };
}

