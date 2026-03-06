/**
 * Shared NOTAM classification and analysis utilities.
 * Used by both notamService.ts (scraper path) and autorouterService.ts (API path)
 * to ensure identical NotamItem structure regardless of data source.
 */
import { NotamStatus, NotamAnalysis } from './types';

// ─── Keyword classification ────────────────────────────────────────────────────
const RED = ['CLSD', 'NOT AVBL', 'NOT AVAILABLE', 'CLOSED', 'UNAVBL', 'U/S', 'UNSERVICEABLE', 'OTS', 'OUT OF SERVICE', 'NOT OPS', 'NOT OPERATIONAL'];
const ORANGE = ['RESTRICTED', 'PRIOR PERMISSION', 'PPR', 'PRIOR APPROVAL', 'LIMITED', 'PARTIALLY CLSD', 'PARTIALLY OPEN', 'PARTIALY OPEN', 'DEGRADED'];
const ESCAT = ['ESCAT', 'SECURITY CONTROL', 'ADIZ'];
const INTERFERENCE_PATTERNS = /\b(JAMMING|SPOOFING|GPS UNREL|GNSS UNREL|GNSS SIGNAL INTERFERENCE|JAM|GPS)\b/i;
const INTERFERENCE_Q_CODES = /Q[A-Z]{2}(GW|GA|GP|GV|GX)/i;

export const RED_PATTERNS: RegExp[] = [
    /\bCLSD\b/,
    /\bCLOSED\b/,
    /\bPROHIBITED\b/,
    /\bNO\s+OVERFLIGHT\b/,
    /\bNO\s+ENTRY\b/,
    /\bTRAFFIC\s+SUSPENDED\b/,
];

export const ORANGE_PATTERNS: RegExp[] = [
    /\bRESTRICTED\b/,
    /\bPRIOR\s+PERMISSION\b/,
    /\bPRIOR\s+APPROVAL\b/,
    /\bPPR\b/,
    /\bPA\b/,
    /\bLIMITED\b/,
    /\bAIRSPACE\s+RESERVED\b/,
    /\bAIRSPACE\s+RESTRICTED\b/,
    /\bCAUTION\b/,
    /\bDANGER\b/,
    /\bWARNING\b/,
    /\bADVISORY\b/,
    /\bNOT\s+AVBL\b/,
    /\bNOT\s+AVAILABLE\b/,
    /\bUNAVBL\b/,
    /\bU\/S\b/,
    /\bUNSERVICEABLE\b/,
    /\bOTS\b/,
    /\bOUT\s+OF\s+SERVICE\b/,
    /\bNOT\s+OPS\b/,
    /\bNOT\s+OPERATIONAL\b/,
    /\bATS\s+NOT\s+AVAILABLE\b/,
    /\bATS\s+NOT\s+AVBL\b/,
    /\bUNCONTROLLED\b/,
    /\bCLASS\s+G\b/,
    /\bALTERNATIVE\s+ROUTES?\b/,
    /\bALTERNATE\s+ROUTES?\b/,
    /\bALTN\s+ROUTES?\b/,
    /\bAVAILABLE\s+VIA\b/,
    /\bAVBL\s+VIA\b/,
    /\bDEGRADED\b/,
];

export const LIMITED_SCOPE_CLOSURE_PATTERNS: RegExp[] = [
    /\bACFT\s+STANDS?\b/,
    /\bSTANDS?\b/,
    /\bTAXI(?:WAY|LANE|LANE\s*CT)?\b/,
    /\bAPRON\b/,
    /\bHELIPAD\b/,
    /\bGATE\b/,
    /\bPARKING\b/,
    /\bRAMP\b/,
    /\bRWY\b/,
    /\bRUNWAY\b/,
    /\bTHR\b/,
    /\bTHRESHOLD\b/,
    /\bUAS\b/,
    /\bDRONES?\b/,
    /\bUNMANNED\s+AERIAL\s+SYSTEMS?\b/,
    /\bROUTE\b/,
    /\bAWY\b/,
    /\bAIRWAY\b/,
    /\bRTE\b/,
    /\bAREA\b/,
    /\bZONE\b/,
    /\bSECTOR\b/,
    /\bPORTION\b/,
    /\bPART\b/,
    /\bFOR\s+[A-Z\s]+REGISTERED\s+ACFT\b/,
    /\bFOR\s+[A-Z\s]+AIRLINES\b/,
    /\bAIRCRAFT\s+OPERATED\s+BY\b/,
    /\bACFT\s+OPERATED\s+BY\b/,
];

export const CRITICAL_SCOPE_PATTERNS: RegExp[] = [
    /\bENTIRE\s+AIRSPACE\b/,
    /\bENTIRE\s+FIR\b/,
    /\bALL\s+OPERATIONS\b/,
    /\bALL\s+TRAFFIC\b/,
    /\bALL\s+FLIGHTS\b/,
    /\bALL\s+ATS\s+ROUTES?\b/,
    /\bOVERFLIGHTS?\b/,
    /\bENTRY\b/,
    /\bARRIVALS?\b/,
    /\bDEPARTURES?\b/,
    /\bAD\s+CLOSED\b/,
    /\bAERODROME\s+CLOSED\b/,
];

export const ROUTE_CLOSURE_PATTERNS: RegExp[] = [
    /\bATS\s+ROUTES?\s+.*(?:CLOSED|NOT\s+AVBL|UNAVBL)\b/s,
    /\bROUTES?\s+.*(?:CLOSED|NOT\s+AVBL|UNAVBL)\b/s,
    /\bSEGMENTS?\s+.*(?:CLOSED|NOT\s+AVBL|UNAVBL)\b/s,
    /\bRTE\s+SEGMENTS?\s+.*(?:CLOSED|NOT\s+AVBL|UNAVBL)\b/s,
    /\bROUTES?\s+UNAVAILABLE\b/,
];

const NOISE_PATTERNS = [
    /\bCHECKLIST\b/i,
    /\bLASER\b/i,
    /\bLIGHTING\b/i,
    /\bOBSTACLE\b/i,
    /\bCRANE\b/i,
];

export function matchesAny(textUpper: string, patterns: RegExp[]): boolean {
    return patterns.some((p) => p.test(textUpper));
}

export function classify(text: string): { status: NotamStatus; hasEscat: boolean; hasInterference: boolean } {
    const u = text.toUpperCase();

    // 1. Interference check (Keyword + Q-code)
    const hasInterference = INTERFERENCE_PATTERNS.test(u) || INTERFERENCE_Q_CODES.test(u);

    // 2. Noise check - if it's just a checklist or obstacle, it's green
    if (matchesAny(u, NOISE_PATTERNS) && !u.includes('JAMMING') && !u.includes('SPOOFING')) {
        return { status: 'green', hasEscat: false, hasInterference };
    }

    const hasEscat = ESCAT.some(k => u.includes(k));
    const hasRed = matchesAny(u, RED_PATTERNS);
    const hasOrange = matchesAny(u, ORANGE_PATTERNS);

    if (hasRed) {
        const limitedScopeClosure = matchesAny(u, LIMITED_SCOPE_CLOSURE_PATTERNS) && !matchesAny(u, CRITICAL_SCOPE_PATTERNS);
        const routeOnlyClosure = matchesAny(u, ROUTE_CLOSURE_PATTERNS) && !matchesAny(u, CRITICAL_SCOPE_PATTERNS);

        if (limitedScopeClosure || routeOnlyClosure) return { status: 'orange', hasEscat, hasInterference };
        return { status: 'red', hasEscat, hasInterference };
    }

    if (hasOrange) return { status: 'orange', hasEscat, hasInterference };
    return { status: 'green', hasEscat, hasInterference };
}

/**
 * Parses FAA NOTAM time string: YYMMDDHHMM (UTC)
 */
export function parseNotamTime(timeStr: string): Date | null {
    if (!timeStr) return null;
    const clean = timeStr.replace(/\s+/g, '');
    if (!/^\d{10}$/.test(clean)) return null;
    const year = 2000 + parseInt(clean.substring(0, 2), 10);
    const month = parseInt(clean.substring(2, 4), 10) - 1;
    const day = parseInt(clean.substring(4, 6), 10);
    const hour = parseInt(clean.substring(6, 8), 10);
    const minute = parseInt(clean.substring(8, 10), 10);
    return new Date(Date.UTC(year, month, day, hour, minute));
}

export function extractNotamAnalysis(text: string): NotamAnalysis {
    const u = text.toUpperCase();

    // 1. Basic Fields
    const aField = u.match(/\bA\)\s*([A-Z]{4})\b/)?.[1];
    const bField = u.match(/\bB\)\s*(\d{10})\b/)?.[1];
    const cMatch = u.match(/\bC\)\s*(\d{10}|PERM)(\s+EST)?\b/);
    const cField = cMatch?.[1];
    const isEstimated = !!cMatch?.[2];
    const dField = u.match(/\bD\)\s*([\s\S]*?)(?=\b[E-G]\)|$)/)?.[1]?.trim();
    const qCode = u.match(/\bQ\)\s*([^\n\r]+)/)?.[1]?.trim();
    const eField = u.match(/\bE\)\s*([\s\S]*?)(?=\b[F-G]\)|$)/)?.[1]?.trim();
    const fField = u.match(/\bF\)\s*([^\n\r]+)/)?.[1]?.trim();
    const gField = u.match(/\bG\)\s*([^\n\r]+)/)?.[1]?.trim();

    // 2. ID and Type extraction (e.g., A0095/26 NOTAMN)
    const idMatch = u.match(/^([A-Z]\d{4}\/\d{2})\s+NOTAM([NRC])/);
    const notamId = idMatch?.[1];
    const notamType = idMatch?.[2] as 'N' | 'R' | 'C' | undefined;

    // For NOTAMR, the replaced ID is often mentioned in the text or after NOTAMR
    const replacedId = (notamType === 'R' || notamType === 'C')
        ? u.match(/\bNOTAM[RC]\s+([A-Z]\d{4}\/\d{2})\b/)?.[1]
        : undefined;

    const bTime = bField ? parseNotamTime(bField) : null;
    const isPermanent = cField === 'PERM';
    const cTime = !isPermanent && cField ? parseNotamTime(cField) : null;
    const now = new Date();

    let isActive = true;
    if (bTime && now < bTime) isActive = false;

    if (!isPermanent && cTime) {
        if (isEstimated) {
            const gracePeriod = 7 * 24 * 60 * 60 * 1000;
            if (now.getTime() > cTime.getTime() + gracePeriod) {
                isActive = false;
            }
        } else {
            if (now > cTime) isActive = false;
        }
    }

    const keywordSet = new Set<string>();
    for (const keyword of RED) if (u.includes(keyword)) keywordSet.add(keyword);
    for (const keyword of ORANGE) if (u.includes(keyword)) keywordSet.add(keyword);
    for (const keyword of ESCAT) if (u.includes(keyword)) keywordSet.add(keyword);

    let confidence: 'high' | 'medium' | 'low' = 'low';
    const parsedCount = [aField, bField, cField, qCode, eField].filter(Boolean).length;
    if (parsedCount >= 4) confidence = 'high';
    else if (parsedCount >= 2) confidence = 'medium';

    return {
        aField,
        bField,
        cField,
        dField,
        qCode,
        eField,
        fField,
        gField,
        notamId,
        notamType,
        replacedId,
        isActive,
        isPermanent,
        isEstimated,
        startsAtUtc: bTime ? bTime.toISOString() : undefined,
        endsAtUtc: cTime ? cTime.toISOString() : undefined,
        matchedKeywords: Array.from(keywordSet),
        confidence,
    };
}

/**
 * Resolves NOTAM replacements (NOTAMR) and cancellations (NOTAMC).
 * Filters out NOTAMs that have been superseded by newer ones in the same set.
 */
export function resolveReplacements(notams: { id: string; text: string; analysis?: NotamAnalysis;[key: string]: any }[]): any[] {
    const replacedIds = new Set<string>();

    // 1. Track replacements/cancellations
    for (const n of notams) {
        if (n.analysis?.notamType === 'R' || n.analysis?.notamType === 'C') {
            if (n.analysis.replacedId) {
                replacedIds.add(n.analysis.replacedId);
            }
        }
    }

    // 2. Filter out those that were replaced or cancelled
    return notams.filter(n => {
        const id = n.analysis?.notamId || n.id;
        if (replacedIds.has(id)) return false;
        if (n.analysis?.notamType === 'C') return false;
        return true;
    });
}
