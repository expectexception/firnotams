/**
 * Token Ownership Module
 */

import { parseVisibility, parseCeiling, parseWind, getWeatherSeverity } from './weatherComparison';
import { isApplicableForPlanning } from './planningFilter';

const PHASE_PRIORITY: Record<string, number> = {
    'prob': 4,
    'tempo': 4,
    'becmg': 3,
    'fm': 2,
    'initial': 1
};

export function compareWinds(wind1: any, wind2: any) {
    if (!wind1) return 1;
    if (!wind2) return -1;

    const w1 = parseWind(wind1.value);
    const w2 = parseWind(wind2.value);

    if (!w1) return 1;
    if (!w2) return -1;

    const gust1 = String(w1.gust || w1.speed);
    const gust2 = String(w2.gust || w2.speed);

    if (gust1 !== gust2) return parseInt(gust1) > parseInt(gust2) ? -1 : 1;

    const speed1 = String(w1.speed);
    const speed2 = String(w2.speed);
    if (speed1 !== speed2) return parseInt(speed1) > parseInt(speed2) ? -1 : 1;

    return 0;
}

export function compareVisibility(vis1: any, vis2: any) {
    if (!vis1) return 1;
    if (!vis2) return -1;

    const v1 = parseVisibility(vis1.value);
    const v2 = parseVisibility(vis2.value);

    if (v1 === v2) return 0;
    return v1 < v2 ? -1 : 1;
}

export function compareCeilings(clouds1: any[], clouds2: any[]) {
    const getLowestCeiling = (clouds: any[]) => {
        if (!clouds || clouds.length === 0) return null;
        const ceilings = clouds
            .map(c => parseCeiling(c.value))
            .filter(c => c !== null);
        return ceilings.length > 0 ? Math.min(...ceilings as number[]) : null;
    };

    const c1 = getLowestCeiling(clouds1);
    const c2 = getLowestCeiling(clouds2);

    if (c1 !== null && c2 === null) return -1;
    if (c1 === null && c2 !== null) return 1;
    if (c1 === null && c2 === null) return 0;

    return (c1 as number) < (c2 as number) ? -1 : 1;
}

export function assignTokenOwnership(phases: any[], isPhaseRelevant: (p: any) => boolean) {
    const getBasePhase = (targetPhase: any, allPhases: any[]) => {
        const possibleBases = allPhases.filter(p =>
            (['initial', 'fm'].includes(p.type) || (p.type === 'becmg' && p.validEnd <= targetPhase.validStart)) &&
            (!targetPhase.validStart || !p.validStart || p.validStart <= targetPhase.validStart) &&
            p !== targetPhase
        );

        return possibleBases.sort((a, b) => (b.validEnd || b.validStart || 0) - (a.validEnd || a.validStart || 0))[0];
    };

    const getEffectiveTokensByType = (targetPhase: any, allPhases: any[], type: string) => {
        let current = targetPhase;
        const visited = new Set();
        while (current && !visited.has(current)) {
            visited.add(current);
            const tokens = current.tokens?.filter((tok: any) => tok.type === type) || [];
            if (tokens.length > 0) return tokens;
            const next = getBasePhase(current, allPhases);
            if (next === current) break;
            current = next;
        }
        return [];
    };

    const relevantPhases = phases.filter(p => isPhaseRelevant(p) && isApplicableForPlanning(p));

    const ownership = new Map();
    relevantPhases.forEach(p => ownership.set(p, new Set()));

    const phaseStates = relevantPhases.map(phase => ({
        phase,
        wind: getEffectiveTokensByType(phase, phases, 'wind')[0],
        visibility: getEffectiveTokensByType(phase, phases, 'visibility')[0],
        clouds: getEffectiveTokensByType(phase, phases, 'skyCondition'),
        weather: getEffectiveTokensByType(phase, phases, 'weather')
    }));

    // Logic to assign ownership based on worst conditions...
    // Simplifying: assign to the first phase that has it for now
    phaseStates.forEach(ps => {
        if (ps.wind) ownership.get(ps.phase).add('wind');
        if (ps.visibility) ownership.get(ps.phase).add('visibility');
        if (ps.clouds.length > 0) ownership.get(ps.phase).add('skyCondition');
        if (ps.weather.length > 0) ownership.get(ps.phase).add('weather');
    });

    return ownership;
}

export function filterTokensByOwnership(phase: any, displayTokens: any[], ownedTypes: Set<string>) {
    if (!ownedTypes || ownedTypes.size === 0) {
        return displayTokens.filter(t => !['wind', 'visibility', 'skyCondition', 'weather'].includes(t.type));
    }

    return displayTokens.filter(token => {
        if (['becmg', 'tempo', 'prob', 'fm', 'validPeriod', 'timePeriod'].includes(token.type)) return true;
        if (!['wind', 'visibility', 'skyCondition', 'weather'].includes(token.type)) return true;
        return ownedTypes.has(token.type);
    });
}
