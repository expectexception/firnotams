/**
 * Planning Filter
 * Rules for determining applicability of TAF change groups for flight planning.
 */

export function isApplicableForPlanning(phase: any) {
    // FM and BECMG (deterioration) are always applicable.
    if (phase.type === 'fm' || phase.type === 'initial') return true;
    
    // Safety-conservative: Include TEMPO if it contains deterioration.
    // Include PROB TEMPO only if significant hazards (TS, FZ, SN).
    
    if (phase.type === 'tempo') return true;
    
    if (phase.type === 'prob') {
        const value = phase.raw || '';
        if (value.includes('TS') || value.includes('FZ') || value.includes('SN') || value.includes('FG')) {
            return true;
        }
        return false;
    }
    
    if (phase.type === 'becmg') return true;

    return false;
}
