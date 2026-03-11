/**
 * Weather Conditions Resolver
 * Determines effective weather by merging TAF phases.
 */

import { parseVisibility, parseCeiling, getWeatherSeverity } from './weatherComparison';

export function resolveEffectiveConditions(basePhase: any, overlayPhases: any[] = []) {
    if (!basePhase) return null;

    const tokens = [...(basePhase.tokens || [])];
    
    // Priority: TEMPO/PROB/BECMG overlays override base tokens
    overlayPhases.forEach(overlay => {
        (overlay.tokens || []).forEach((t: any) => {
            if (['wind', 'visibility', 'skyCondition', 'weather', 'cavok', 'nsw'].includes(t.type)) {
                // For skyCondition, we might want to keep base layers if overlay only has few? 
                // Actually TAF rules say change groups replace the entire parameter group.
                const idx = tokens.findIndex(bt => bt.type === t.type);
                if (idx !== -1) {
                    if (t.type === 'skyCondition') {
                        // Replace all skyConditions
                        while (tokens.findIndex(bt => bt.type === 'skyCondition') !== -1) {
                            tokens.splice(tokens.findIndex(bt => bt.type === 'skyCondition'), 1);
                        }
                        tokens.push(t);
                    } else {
                        tokens[idx] = t;
                    }
                } else {
                    tokens.push(t);
                }
            }
        });
    });

    return tokens;
}

export function summarizeWeatherState(tokens: any[]) {
    const get = (type: string) => tokens.find(t => t.type === type);
    const getAll = (type: string) => tokens.filter(t => t.type === type);

    const cavok = get('cavok');
    const wind = get('wind')?.value || '00000KT';
    const visibility = cavok ? '9999' : (get('visibility')?.value || '9999');
    const clouds = cavok ? [] : getAll('skyCondition');
    const weather = cavok ? [] : getAll('weather');

    const lowestCeiling = Math.min(...clouds.filter(c => ['BKN', 'OVC', 'VV'].some(code => c.value.startsWith(code))).map(c => parseCeiling(c.value) || Infinity));
    
    let icon = 'Sun';
    let color = 'text-yellow-400';
    let label = 'VFR';

    if (weather.some(w => w.value.includes('TS'))) {
        icon = 'CloudLightning'; color = 'text-red-500'; label = 'Thunderstorm';
    } else if (weather.some(w => w.value.includes('SN'))) {
        icon = 'Snowflake'; color = 'text-blue-200'; label = 'Snow';
    } else if (weather.some(w => w.value.includes('RA'))) {
        icon = 'CloudRain'; color = 'text-blue-400'; label = 'Rain';
    } else if (lowestCeiling < 1000 || parseVisibility(visibility) < 5000) {
        icon = 'CloudFog'; color = 'text-slate-400'; label = 'IFR';
    } else if (lowestCeiling < 3000) {
        icon = 'Cloud'; color = 'text-slate-300'; label = 'MVFR';
    }

    return { icon, color, label, wind, visibility, lowestCeiling: lowestCeiling === Infinity ? null : lowestCeiling };
}
