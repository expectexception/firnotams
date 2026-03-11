/**
 * Timeline Utilities
 * Handles TAF time resolution and BECMG deterioration/improvement logic.
 */

/**
 * Resolves a TAF timestamp (e.g., 251215) into an absolute Date object.
 * @param {string} token - 6-digit timestamp (DDHHMM)
 * @param {Date} issueTime - The issue time of the report for context
 * @returns {Date}
 */
export function resolveTafTime(token: string, issueTime: Date) {
    if (!token || !issueTime) return null;
    
    const day = parseInt(token.slice(0, 2));
    const hour = parseInt(token.slice(2, 4));
    const min = parseInt(token.slice(4, 6)) || 0;

    const result = new Date(issueTime);
    result.setUTCSeconds(0);
    result.setUTCMilliseconds(0);
    result.setUTCMinutes(min);
    result.setUTCHours(hour);

    // Handle month roll-over
    if (day < issueTime.getUTCDate() && issueTime.getUTCDate() > 25) {
        result.setUTCMonth(result.getUTCMonth() + 1);
    } else if (day > issueTime.getUTCDate() && issueTime.getUTCDate() < 5) {
        result.setUTCMonth(result.getUTCMonth() - 1);
    }
    
    result.setUTCDate(day);
    return result;
}

/**
 * Resolves a date string into an absolute Date object.
 */
export function resolveAbsoluteTime(day: string, hour: string, refDate: Date) {
    const d = parseInt(day);
    const h = parseInt(hour);
    const res = new Date(refDate);
    res.setUTCMinutes(0); res.setUTCSeconds(0); res.setUTCMilliseconds(0);
    res.setUTCHours(h);
    
    if (d < refDate.getUTCDate() && refDate.getUTCDate() > 25) res.setUTCMonth(res.getUTCMonth() + 1);
    else if (d > refDate.getUTCDate() && refDate.getUTCDate() < 5) res.setUTCMonth(res.getUTCMonth() - 1);
    
    res.setUTCDate(d);
    return res;
}

/**
 * Parses a validity period (e.g., 2512/2618) into start and end Dates.
 */
export function parseValidPeriod(token: string, issueTime: Date) {
    if (!token || !token.includes('/') || !issueTime) return { start: null, end: null };
    const [startRaw, endRaw] = token.split('/');
    
    // Valid period is DDHH (4 digits)
    const resolve = (raw: string) => {
        const d = parseInt(raw.slice(0, 2));
        const h = parseInt(raw.slice(2, 4));
        const res = new Date(issueTime);
        res.setUTCMinutes(0); res.setUTCSeconds(0); res.setUTCMilliseconds(0);
        res.setUTCHours(h);
        
        if (d < issueTime.getUTCDate() && issueTime.getUTCDate() > 25) res.setUTCMonth(res.getUTCMonth() + 1);
        else if (d > issueTime.getUTCDate() && issueTime.getUTCDate() < 5) res.setUTCMonth(res.getUTCMonth() - 1);
        
        res.setUTCDate(d);
        return res;
    };

    return { start: resolve(startRaw), end: resolve(endRaw) };
}

/**
 * Enriches TAF phases with absolute start/end times.
 */
export function enrichPhasesWithTimeline(sections: any[], issueTime: Date) {
    if (!sections || !issueTime) return [];

    let baseStart = issueTime;
    let baseEnd = new Date(issueTime.getTime() + 30 * 60 * 60 * 1000); // Default 30h

    // Find main validity
    const header = sections.find(s => s.type === 'initial');
    const validToken = header?.tokens?.find((t: any) => t.type === 'validPeriod');
    if (validToken) {
        const { start, end } = parseValidPeriod(validToken.value, issueTime);
        if (start) baseStart = start;
        if (end) baseEnd = end;
    }

    return sections.map(section => {
        let start = baseStart;
        let end = baseEnd;

        const fmToken = section.tokens.find((t: any) => t.type === 'fm');
        if (fmToken) {
            const resolved = resolveTafTime(fmToken.value.slice(2), issueTime);
            if (resolved) start = resolved;
        }

        const periodToken = section.tokens.find((t: any) => t.type === 'timePeriod');
        if (periodToken) {
            const { start: ps, end: pe } = parseValidPeriod(periodToken.value, issueTime);
            if (ps) start = ps;
            if (pe) end = pe;
        }

        return { ...section, validStart: start, validEnd: end };
    });
}
