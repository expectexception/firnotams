/**
 * Forecast Logic
 * Determines controlling forecast and applicable temporary conditions.
 */

import { resolveEffectiveConditions } from './weatherConditions';

export function getForecastSnapshot(allPhases: any[], etaTime: Date) {
    if (!allPhases || !etaTime) return null;

    // 1. Identify active baseline phase (Initial or FM)
    // Baseline phases that started before or at ETA
    const basePhases = allPhases.filter(p => (p.type === 'initial' || p.type === 'fm') && p.validStart <= etaTime);
    // The latest one is the controlling base
    const controllingBase = basePhases.sort((a, b) => b.validStart.getTime() - a.validStart.getTime())[0];

    if (!controllingBase) return null;

    // 2. Identify active overlay phases (TEMPO, PROB, BECMG)
    const overlayPhases = allPhases.filter(p => !['initial', 'fm'].includes(p.type) && etaTime >= p.validStart && etaTime < p.validEnd);

    // 3. Resolve conditions
    const effectiveTokens = resolveEffectiveConditions(controllingBase, overlayPhases);

    return {
        base: controllingBase,
        overlays: overlayPhases,
        tokens: effectiveTokens,
        eta: etaTime
    };
}
