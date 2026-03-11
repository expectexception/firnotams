/**
 * Weather Comparison Module
 * Compares weather parameters between base forecast and change groups (TEMPO/BECMG)
 */

export function parseVisibility(value: string) {
    if (!value) return Infinity;
    if (/^\d{4}$/.test(value)) return parseInt(value, 10);
    if (value.includes('SM')) {
        let miles: any = value.replace('SM', '').replace('P', '');
        if (miles.includes('/')) {
            const parts = miles.split('/');
            miles = parseFloat(parts[0]) / parseFloat(parts[1]);
        } else {
            miles = parseFloat(miles);
        }
        return miles * 1609.34;
    }
    return Infinity;
}

export function parseCeiling(value: string) {
    if (!value) return null;
    const match = value.match(/^(BKN|OVC|VV)(\d{3}|\/\/\/)/);
    if (!match) return null;
    if (match[2] === '///') return 0;
    return parseInt(match[2], 10) * 100;
}

export function parseWind(value: string) {
    if (!value) return null;
    const match = value.match(/^(VRB|\d{3})(\d{2,3})(G(\d{2,3}))?KT$/);
    if (!match) return null;
    return {
        direction: match[1] === 'VRB' ? 'VRB' : parseInt(match[1], 10),
        speed: parseInt(match[2], 10),
        gust: match[4] ? parseInt(match[4], 10) : null,
        isVariable: match[1] === 'VRB'
    };
}

const WEATHER_SEVERITY: Record<string, number> = {
    '+TS': 10, 'TSRA': 9, 'TS': 9, '+SHRA': 8, '+RA': 8, '+SN': 8,
    'FZRA': 9, 'FZFG': 8, 'GR': 10, 'SQ': 10, 'FC': 10,
    'RA': 5, 'SN': 5, 'SHRA': 5, 'SHSN': 5, '-TSRA': 6,
    'FG': 6, 'BLSN': 6, 'DRSN': 5,
    '-RA': 3, '-SN': 3, '-SHRA': 3, 'BR': 2, 'HZ': 2, 'FU': 3,
    'DZRA': 4, 'RASN': 4, '-FZRA': 6,
    'NSW': 0, 'SKC': 0, 'CLR': 0, 'CAVOK': 0
};

export function getWeatherSeverity(wx: string) {
    if (!wx) return 0;
    return WEATHER_SEVERITY[wx] || 1;
}

export function isParameterSignificant(paramType: string, baseValue: any, changeValue: any) {
    switch (paramType) {
        case 'visibility': {
            const baseVis = parseVisibility(baseValue);
            const changeVis = parseVisibility(changeValue);
            return { isSignificant: changeVis < baseVis, reason: changeVis < baseVis ? 'deteriorating' : 'improving' };
        }
        case 'ceiling': {
            const baseCeil = parseCeiling(baseValue);
            const changeCeil = parseCeiling(changeValue);
            if (baseCeil === null && changeCeil !== null) return { isSignificant: true, reason: 'deteriorating' };
            if (baseCeil !== null && changeCeil === null) return { isSignificant: false, reason: 'improving' };
            if (changeCeil !== null && baseCeil !== null && changeCeil < baseCeil) return { isSignificant: true, reason: 'deteriorating' };
            return { isSignificant: false, reason: 'improving' };
        }
        case 'wind': {
            const baseWind = parseWind(baseValue);
            const changeWind = parseWind(changeValue);
            if (!baseWind || !changeWind) return { isSignificant: true, reason: 'change' };
            if (changeWind.gust && (!baseWind.gust || changeWind.gust > baseWind.gust)) return { isSignificant: true, reason: 'gusting' };
            if (changeWind.speed > baseWind.speed + 5) return { isSignificant: true, reason: 'increasing' };
            if (changeWind.isVariable && !baseWind.isVariable) return { isSignificant: true, reason: 'variable' };
            return { isSignificant: false, reason: 'stable/improving' };
        }
        case 'weather': {
            const baseSeverity = getWeatherSeverity(baseValue);
            const changeSeverity = getWeatherSeverity(changeValue);
            if (changeValue === 'NSW' || changeValue === 'CAVOK') return { isSignificant: true, reason: 'clearing' };
            return { isSignificant: changeSeverity > baseSeverity, reason: changeSeverity > baseSeverity ? 'deteriorating' : 'improving' };
        }
        default:
            return { isSignificant: true, reason: 'unknown' };
    }
}
