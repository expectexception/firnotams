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
 * Resolves a date string into an absolute Date object with month rollover protection.
 */
export function resolveAbsoluteTime(dayStr: string, hourStr: string, referenceDate: Date = new Date()) {
    const day = parseInt(dayStr, 10);
    const hour = parseInt(hourStr, 10);

    const date = new Date(referenceDate);
    date.setUTCDate(day);
    date.setUTCHours(hour, 0, 0, 0);

    const diff = date.getTime() - referenceDate.getTime();
    const daysDiff = diff / (1000 * 60 * 60 * 24);

    if (daysDiff < -15) {
        date.setUTCMonth(date.getUTCMonth() + 1);
    } else if (daysDiff > 15) {
        date.setUTCMonth(date.getUTCMonth() - 1);
    }

    return date;
}

/**
 * Enriches TAF phases with absolute start/end times and identifies baselines/overlays.
 */
export function enrichPhasesWithTimeline(phases: any[], issueTimeStamp: string, validPeriod: string) {
    if (!validPeriod) return phases;

    const now = new Date();
    let refDate = now;
    if (issueTimeStamp) {
        const match = issueTimeStamp.match(/^(\d{2})(\d{2})(\d{2})Z$/);
        if (match) {
            refDate = resolveAbsoluteTime(match[1], match[2], now);
            refDate.setUTCMinutes(parseInt(match[3]));
        }
    }

    const [startStr, endStr] = validPeriod.split('/');
    const baseStart = resolveAbsoluteTime(startStr.slice(0, 2), startStr.slice(2, 4), refDate);
    const baseEnd = resolveAbsoluteTime(endStr.slice(0, 2), endStr.slice(2, 4), baseStart);

    const enrichedPhases = phases.map(p => ({ ...p, tokens: [...(p.tokens || [])] }));

    const baselines: any[] = [];
    const overlays: any[] = [];

    enrichedPhases.forEach(phase => {
        const isFm = phase.tokens[0]?.type === 'fm';
        const isInitial = !isFm && (phase.type === 'initial' || phase.tokens[0]?.idx === 0);

        let timelineType = 'overlay';
        if (isInitial || isFm) timelineType = 'baseline';

        phase.timelineType = timelineType;
        if (timelineType === 'baseline') baselines.push(phase);
        else overlays.push(phase);
    });

    // Resolve Baselines (Initial -> FM1 -> FM2)
    for (let i = 0; i < baselines.length; i++) {
        const phase = baselines[i];
        let pStart = baseStart;
        let pEnd;

        if (i > 0 || phase.tokens[0]?.type === 'fm') {
            const fmToken = phase.tokens.find((t: any) => t.type === 'fm');
            if (fmToken) {
                const match = fmToken.value.match(/^FM(\d{2})(\d{2})(\d{2})$/);
                if (match) {
                    pStart = resolveAbsoluteTime(match[1], match[2], baseStart);
                    pStart.setUTCMinutes(parseInt(match[3]));
                }
            }
        }

        if (i < baselines.length - 1) {
            const nextPhase = baselines[i + 1];
            const nextFm = nextPhase.tokens.find((t: any) => t.type === 'fm');
            if (nextFm) {
                const match = nextFm.value.match(/^FM(\d{2})(\d{2})(\d{2})$/);
                if (match) {
                    const nextStart = resolveAbsoluteTime(match[1], match[2], baseStart);
                    nextStart.setUTCMinutes(parseInt(match[3]));
                    pEnd = nextStart;
                }
            }
        }

        if (!pEnd) pEnd = baseEnd;
        phase.validStart = pStart;
        phase.validEnd = pEnd;
    }

    // Resolve Overlays (TEMPO, BECMG, PROB)
    overlays.forEach(phase => {
        const periodToken = phase.tokens.find((t: any) => t.type === 'timePeriod');
        let pStart = baseStart;
        let pEnd = baseEnd;

        if (periodToken) {
            const [s, e] = periodToken.value.split('/');
            pStart = resolveAbsoluteTime(s.slice(0, 2), s.slice(2, 4), baseStart);
            pEnd = resolveAbsoluteTime(e.slice(0, 2), e.slice(2, 4), pStart);
        }

        phase.validStart = pStart;
        phase.validEnd = pEnd;

        // BECMG Activation Rules
        if (phase.type === 'becmg' && pStart && pEnd) {
            // Trend analysis (deteriorating/improving) is done in the component 
            // where visibility/ceiling parsing utils are integrated.
            // We initialize properties here.
            phase.becmgDeteriorating = false;
            phase.becmgImproving = false;
        }
    });

    return enrichedPhases;
}
