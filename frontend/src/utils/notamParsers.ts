/**
 * NOTAM operational relevance filters, Q-code analysis and date parsing utilities.
 */

import type { NotamItem, NotamStatus } from '../types';

// ─── Q-Code Tables ────────────────────────────────────────────

/*
 * Recognised FIR-operational Q-codes: [subject, condition, severity].
 * Only these should be treated as operationally meaningful for FIR cards.
 */
const FIR_QCODE_MAP: Record<string, { subject: string; condition: string; severity: 'red' | 'orange' }> = {
    // FIR / UIR operational
    AFLC: { subject: 'FIR', condition: 'Closed', severity: 'red' },
    AULC: { subject: 'UIR', condition: 'Closed', severity: 'red' },
    AFLP: { subject: 'FIR', condition: 'Prohibited', severity: 'red' },
    ARAU: { subject: 'ATS Route', condition: 'Not Available', severity: 'orange' },
    ARLC: { subject: 'ATS Route', condition: 'Closed', severity: 'orange' },
    ARLK: { subject: 'ATS Route', condition: 'Unserviceable', severity: 'orange' },
    // Military / restricted areas (ESCAT, war zones, danger areas)
    RMCA: { subject: 'Mil/Civil Area', condition: 'Active', severity: 'orange' },
    RDCA: { subject: 'Danger Area', condition: 'Active', severity: 'orange' },
    RRCA: { subject: 'Restricted Area', condition: 'Active', severity: 'orange' },
    RTCA: { subject: 'Temp Reserved', condition: 'Active', severity: 'orange' },
    RPCA: { subject: 'Prohibited Area', condition: 'Active', severity: 'red' },
    RWCA: { subject: 'Warning Area', condition: 'Active', severity: 'orange' },
};

/*
 * Q-code subject prefixes that are FIR/Route/Military-related.
 * If we see AF/AU/AR/RM/RD/RR/RT/RP/RW with an UNKNOWN suffix → wrong / misc use.
 */
const MISC_PREFIXES: string[] = ['AF', 'AU', 'AR', 'RM', 'RD', 'RR', 'RT', 'RP', 'RW'];

// Operational war/conflict Q-code prefix pairs — always pass noise filter
const WAR_QCODE_SUBJECTS = new Set(['RM', 'RD', 'RR', 'RT', 'RP', 'RW']);

// Q-codes that are non-operational noise (e.g. checklists)
const NOISE_QCODES = new Set(['QKKKK']);

// Text patterns in the E) field that indicate non-operational NOTAMs
const NOISE_PATTERNS: RegExp[] = [
    /\bRADIOSONDE\b/i,
    /\bBALLOON\b.*\b(RELEASE|ASCENT|WILL TAKE PLACE)\b/i,
    /\bTRIGGER\s+NOTAM\b/i,
    /\bCHECKLIST\s*\n?\s*SERIES\b/i,
    /\bAIP\s+(AIRAC\s+)?AMDT\b.*\bSUP\s+CHECKLIST\b/i,
    /\bOBSTACLE\s+(LIGHT|ERECT)/i,
    /\bCRANE\s+(ERECTED|OPR)\b/i,
    /\bFIREWORK/i,
    /\bLASER\s+(DISPLAY|BEAM)\b/i,
    /\bPARACHUT(E|ING)\s+ACTIVITY\b/i,
    /\bMODEL\s+AIRCRAFT\b/i,
    /\bUNMANNED\s+FREE\s+BALLOON\b/i,
    /\bSKY\s+LANTERN\b/i,
    /\bBIRD\s+SANCTUAR/i,
];

/*
 * Keywords in the E-field that confirm airspace operational relevance.
 * Covers all common NOTAM phrasings for closure / restriction / prohibition.
 */
const AIRSPACE_KEYWORDS: { label: string; pattern: RegExp }[] = [
    // Core airspace subjects
    { label: 'AIRSPACE', pattern: /\bAIRSPACE\b/i },
    { label: 'FIR', pattern: /\bFIR\b/i },
    { label: 'UIR', pattern: /\bUIR\b/i },

    // Closure variants
    { label: 'CLSD', pattern: /\bCLSD\b/i },
    { label: 'CLOSED', pattern: /\bCLOS(ED|URE)\b/i },

    // Restriction / prohibition
    { label: 'NOT AVAILABLE', pattern: /\bNOT\s+AVAIL(ABLE)?\b/i },
    { label: 'UNAVAILABLE', pattern: /\bUNAVAIL(ABLE)?\b/i },
    { label: 'PROHIBITED', pattern: /\bPROHIBIT(ED|ION)?\b/i },
    { label: 'RESTRICTED', pattern: /\bRESTRICT(ED|ION)?\b/i },

    // Operational suspension
    { label: 'SUSPENDED', pattern: /\bSUSPEND(ED)?\b/i },
    { label: 'OPS SUSPENDED', pattern: /\bOPS\s+SUSPEND/i },
    { label: 'LIMITATIONS', pattern: /\bLIMIT(S|ATIONS?)\b/i },

    // Permission / clearance
    { label: 'PPR REQUIRED', pattern: /\bPPR\b/i },
    { label: 'PRIOR PERMISSION', pattern: /\bPRIOR\s+PERMISSION\b/i },
    { label: 'SPECIAL APPROVAL', pattern: /\bSPECIAL\s+APPRO?V/i },

    // ATS Route / traffic
    { label: 'ATS ROUTE', pattern: /\bATS\s+ROUTE\b/i },
    { label: 'SEGMENT', pattern: /\bSEGMENT\b/i },
    { label: 'ATC CLNC', pattern: /\bATC\s+(CLNC|CLEARANCE)\b/i },
    { label: 'NO TFC', pattern: /\bNO\s+TR(AFFIC|FC)\b/i },
    { label: 'DIVERTED', pattern: /\bDIVERT(ED)?\b/i },
    { label: 'RTE CLSD', pattern: /\bRTE\b.*\bCLSD\b/i },

    // ── War / conflict / security ──
    { label: 'ARMED CONFLICT', pattern: /\bARMED\s+CONFLICT\b/i },
    { label: 'CONFLICT ZONE', pattern: /\bCONFLICT\s+ZONE\b/i },
    { label: 'WAR', pattern: /\bWAR(LIKE|FARE)?\b/i },
    { label: 'HOSTILITIES', pattern: /\bHOSTILITI(ES|TY)\b/i },
    { label: 'BOMB FRAGMENT', pattern: /\bBOMB\s+(FRAGMENT|DEBRIS|THREAT)\b/i },
    { label: 'MISSILE', pattern: /\bMISSILE\b/i },
    { label: 'AIR DEFENSE', pattern: /\bAIR\s+DEF(ENSE|ENCE)\b/i },
    { label: 'NO-FLY ZONE', pattern: /\bNO[\s-]FLY\b/i },
    { label: 'ESCAT', pattern: /\bESCAT\b/i },
    { label: 'DANGER AREA', pattern: /\bDANGER\s+AREA\b/i },
    { label: 'COMBAT', pattern: /\bCOMBAT\b/i },
    { label: 'INTERCEPT', pattern: /\bINTERCEPT(ION)?\b/i },
    { label: 'UNIDENTIFIED AC', pattern: /\bUNIDENTIFIED\s+(AC|AIRCRAFT)\b/i },
    { label: 'MILITARY OPS', pattern: /\bMILITARY\s+(OPS|OPERATIONS|EXERCISE|ACTIVITY)\b/i },
    { label: 'SPECIAL OPS', pattern: /\bSPECIAL\s+(OPS|OPERATION)\b/i },
    { label: 'ACTIVATED', pattern: /\bACTIVAT(ED|ION)\b/i },
];

// GNSS Interference (Jamming/Spoofing) patterns
const INTERFERENCE_PATTERNS = /\b(JAMMING|SPOOFING|GPS UNREL|GNSS UNREL|GNSS SIGNAL INTERFERENCE|JAM|GPS)\b/i;

export function hasInterference(text: string): boolean {
    return INTERFERENCE_PATTERNS.test(text);
}

export function isEscat(text: string): boolean {
    return /\bESCAT\b/i.test(text);
}

// Cutoff: NOTAMs must have started on or after 28 Feb 2026
const CUTOFF_DATE = new Date('2026-02-28T00:00:00Z');
// Recency window: only show NOTAMs issued within the last N days (for dynamic fallbacks)
const RECENCY_DAYS = 30;

// ─── FIR NOTAM Meta Interface ────────────────────────────────

export interface FirNotamMeta {
    // Raw 5-char Q-code (without "Q" prefix), e.g. "AFLC"
    qCode: string;
    // Full Q-code as written, e.g. "QAFLC"
    qCodeFull: string;
    // Subject from Q-code, e.g. "FIR", "ATS Route"
    qSubject: string;
    // Condition from Q-code, e.g. "Closed", "Prohibited"
    qCondition: string;
    // true if the Q-code is a recognised FIR-operational code
    isValidQCode: boolean;
    // true if the Q-code prefix is AF/AU/AR but NOT a known operational code (wrong use)
    isMiscQCode: boolean;
    // true if NOTAM scope contains 'E' (Enroute)
    isEnroute: boolean;
    // true if E-field contains any airspace keyword
    hasKeyword: boolean;
    // Matched airspace keywords
    keywords: string[];
    // true if B-field start date >= 01 March 2026
    afterCutoff: boolean;
    // Resolved severity
    severity: 'red' | 'orange' | 'info' | 'warn';
    // One-line human summary
    summary: string;
    // Parsed start date (UTC)
    startDate: Date | null;
    // Parsed end date (UTC) or null if permanent
    endDate: Date | null;
    // Formatted start string
    startFmt: string | null;
    // Formatted end string
    endFmt: string | null;
    // Extracted E-field text
    eField: string;
}

// Explicit closure phrases that should always be treated as RED,
// even when upstream Q-code is weaker/misc-classified.
const HARD_CLOSURE_PATTERNS: RegExp[] = [
    /\bFIR\s+CLSD\b/i,
    /\bFIR\s+CLOSED\b/i,
    /\bUIR\s+CLSD\b/i,
    /\bUIR\s+CLOSED\b/i,
    /\bAIRSPACE\s+CLSD\b/i,
    /\bAIRSPACE\s+CLOSED\b/i,
    /\bAIRSPACE\s+IS\s+CLOSED\b/i,
    /\bCLOSED\s+TO\s+ALL\s+TFC\b/i,
    /\bNO\s+ARR\s+OR\s+DEP\b/i,
    /\bNO\s+TRAFFIC\s+PERMITTED\b/i,
];

function hasHardClosure(eField: string): boolean {
    return HARD_CLOSURE_PATTERNS.some(p => p.test(eField));
}

// ─── Q-field parsing helper ──────────────────────────────────

interface QParsed {
    location: string;
    qCode: string;
    flight: string;
    purpose: string;
    scope: string;
    lower: string;
    upper: string;
    coords?: string;
}

function parseQField(text: string): QParsed | null {
    // Q) LLLL/QAFLC/IV/NBO/E/000/999/3123N03648E159
    const m = text.match(/\bQ\)\s*(\S+)\/Q([A-Z]{4})\/([^/]*)\/([^/]*)\/([^/]*)\/([^/]*)\/([^/]*)(?:\/(\S+))?/);
    if (!m) return null;
    return {
        location: m[1],
        qCode: m[2],
        flight: m[3],
        purpose: m[4],
        scope: m[5],
        lower: m[6],
        upper: m[7],
        coords: m[8],
    };
}

// ─── Core: parseFirNotam ─────────────────────────────────────

export function parseFirNotam(n: { text: string; analysis?: any }): FirNotamMeta {
    const text = n.text ?? '';

    const q = parseQField(text);
    const rawQCode = q?.qCode ?? '';
    const qCodeFull = rawQCode ? `Q${rawQCode}` : '';

    const known = FIR_QCODE_MAP[rawQCode] ?? null;
    const isValidQCode = !!known;

    const prefix2 = rawQCode.slice(0, 2);
    const isMiscQCode = !isValidQCode && MISC_PREFIXES.includes(prefix2);

    const scope = q?.scope ?? '';
    const isEnroute = scope.toUpperCase().includes('E');

    const eField = extractEField(text);
    const hardClosure = hasHardClosure(eField);

    const keywords: string[] = [];
    for (const kw of AIRSPACE_KEYWORDS) {
        if (kw.pattern.test(eField)) keywords.push(kw.label);
    }
    const hasKeyword = keywords.length > 0;

    const startDate = parseBField(text, n.analysis);
    const endDate = parseCField(text, n.analysis);
    const afterCutoff = startDate ? startDate >= CUTOFF_DATE : false;

    const startFmt = startDate ? fmtDateObj(startDate) : null;
    const endFmt = endDate ? fmtDateObj(endDate) : null;

    let severity: FirNotamMeta['severity'];
    if (hardClosure) {
        severity = 'red';
    } else if (isMiscQCode) {
        severity = 'warn';
    } else if (known) {
        severity = known.severity;
    } else {
        severity = 'info';
    }

    let summary = '';
    if (isMiscQCode) {
        summary = `MISC Q-CODE (${qCodeFull}) - Wrong use`;
    } else if (known) {
        summary = `${known.subject} ${known.condition.toUpperCase()}`;
        if (isEnroute) summary += ' · ENROUTE';
    } else {
        summary = qCodeFull || 'Unknown Q-code';
    }

    return {
        qCode: rawQCode,
        qCodeFull,
        qSubject: known?.subject ?? (isMiscQCode ? `${prefix2}xx (misc)` : ''),
        qCondition: known?.condition ?? '',
        isValidQCode,
        isMiscQCode,
        isEnroute,
        hasKeyword,
        keywords,
        afterCutoff,
        severity,
        summary,
        startDate,
        endDate,
        startFmt,
        endFmt,
        eField,
    };
}

// ─── Noise detection / isOperational ─────────────────────────

export function isOperational(text: string, analysis?: any): boolean {
    if (!text) return false;

    const firstLine = text.split('\n')[0] ?? '';

    // NOTAMC (cancellations) are not themselves operational
    if (/\bNOTAMC\b/.test(firstLine)) return false;

    // Check Q-code for noise
    const qMatch = text.match(/\bQ\)\s*\S+\/Q(\w{4})\//);
    const rawQCode = qMatch?.[1] ?? '';
    if (rawQCode && NOISE_QCODES.has(`Q${rawQCode}`)) return false;
    if (analysis?.qCode && NOISE_QCODES.has(analysis.qCode)) return false;

    // If it's a known FIR-operational Q-code → always keep
    if (rawQCode && FIR_QCODE_MAP[rawQCode]) return true;

    // If it's a war/military/danger Q-code prefix → always keep
    const qPrefix = rawQCode.slice(0, 2);
    if (WAR_QCODE_SUBJECTS.has(qPrefix)) return true;

    // Check E-field against noise patterns
    const eField = extractEField(text);

    // War/conflict/ESCAT keywords in E-field → always keep
    for (const p of CLOSURE_PATTERNS) {
        if (p.test(eField)) return true;
    }

    // Check against noise patterns
    for (const pattern of NOISE_PATTERNS) {
        if (pattern.test(eField)) return false;
    }

    return true;
}

// ─── D-Field (Daily Schedule) Parser ────────────────────────

export interface DSchedule {
    raw: string;          // raw D-field text, e.g. "DAILY 1500-0600"
    isDaily: boolean;     // D) DAILY ...
    days: string[];       // e.g. ['MON','TUE','WED'] or [] for daily
    startUtc: string | null;  // e.g. "1500"
    endUtc: string | null;  // e.g. "0600" (may wrap midnight)
    description: string;  // human-readable
}

// Extract D) field from NOTAM text
export function extractDField(text: string): string | null {
    const m = text.match(/\bD\)\s*([^\n]+)/);
    return m ? m[1].trim() : null;
}

// Parse D-field into structured schedule
export function parseDField(text: string): DSchedule | null {
    const raw = extractDField(text);
    if (!raw) return null;

    const daysMap: Record<string, string> = {
        MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun',
    };

    // Time pattern: HHMM-HHMM
    const timeMatch = raw.match(/(\d{4})\s*[-–]\s*(\d{4})/);
    const startUtc = timeMatch ? timeMatch[1] : null;
    const endUtc = timeMatch ? timeMatch[2] : null;

    // Day pattern: MON TUE WED ... or DAILY
    const isDaily = /\bDAILY\b/i.test(raw);
    const days: string[] = [];
    if (!isDaily) {
        const dayRegex = /\b(MON|TUE|WED|THU|FRI|SAT|SUN)\b/gi;
        let dm: RegExpExecArray | null;
        while ((dm = dayRegex.exec(raw)) !== null) {
            days.push(daysMap[dm[1].toUpperCase()] ?? dm[1]);
        }
    }

    // Build human description
    let description = '';
    if (isDaily) description = 'Daily';
    else if (days.length > 0) description = days.join('/');
    if (startUtc && endUtc) {
        const sH = startUtc.slice(0, 2);
        const sM = startUtc.slice(2, 4);
        const eH = endUtc.slice(0, 2);
        const eM = endUtc.slice(2, 4);
        description += ` ${sH}:${sM}–${eH}:${eM}Z`;
    }

    return { raw, isDaily, days, startUtc, endUtc, description };
}


const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseYYMMDDHHMM(raw: string): Date | null {
    if (!/^\d{10}$/.test(raw)) return null;
    const d = new Date(`20${raw.slice(0, 2)}-${raw.slice(2, 4)}-${raw.slice(4, 6)}T${raw.slice(6, 8)}:${raw.slice(8, 10)}:00Z`);
    return isNaN(d.getTime()) ? null : d;
}

export function parseBField(text: string, analysis?: any): Date | null {
    const raw = analysis?.startsAtUtc ?? analysis?.bField;
    if (raw) {
        const d = /^\d{10}$/.test(raw) ? parseYYMMDDHHMM(raw) : new Date(raw);
        if (d && !isNaN(d.getTime())) return d;
    }
    const m = text.match(/\bB\)\s*(\d{10})/);
    return m ? parseYYMMDDHHMM(m[1]) : null;
}

function parseCField(text: string, analysis?: any): Date | null {
    const raw = analysis?.endsAtUtc ?? analysis?.cField;
    if (raw) {
        if (/PERM/i.test(raw)) return null;
        const d = /^\d{10}$/.test(raw) ? parseYYMMDDHHMM(raw) : new Date(raw);
        if (d && !isNaN(d.getTime())) return d;
    }
    const m = text.match(/\bC\)\s*(\d{10})/);
    return m ? parseYYMMDDHHMM(m[1]) : null;
}

function fmtDateObj(d: Date): string {
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mon = MONTHS[d.getUTCMonth()];
    const yyyy = d.getUTCFullYear();
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    return `${dd} ${mon} ${yyyy} ${hh}:${mi}Z`;
}

// ─── Public date API ─────────────────────────────────────────

export function fmtDateRaw(raw: string | undefined | null): string | null {
    if (!raw) return null;
    const d = /^\d{10}$/.test(raw) ? parseYYMMDDHHMM(raw) : new Date(raw);
    return d && !isNaN(d.getTime()) ? fmtDateObj(d) : null;
}

export function getDuration(n: { text: string; analysis?: any }): { start: string | null; end: string | null } {
    const sd = parseBField(n.text, n.analysis);
    const ed = parseCField(n.text, n.analysis);
    return { start: sd ? fmtDateObj(sd) : null, end: ed ? fmtDateObj(ed) : null };
}

// ─── Text extraction ─────────────────────────────────────────

export function extractEField(text: string): string {
    const match = text.match(/\bE\)\s*([\s\S]*?)(?:\nF\)|\nG\)|\nLOWER|\nUPPER|$)/);
    return match ? match[1].trim() : text.trim();
}

// ─── Legacy exports (used by FlipCard.tsx) ───────────────────

export function isNotamN(text: string): boolean {
    const firstLine = (text ?? '').split('\n')[0];
    return /\bNOTAMN\b/.test(firstLine);
}

export function extractNotamDuration(text: string): { b: string | null; c: string | null } {
    const bMatch = text.match(/\bB\)\s*(\d{10})/);
    const cMatch = text.match(/\bC\)\s*(\d{10})/);
    return { b: bMatch?.[1] ?? null, c: cMatch?.[1] ?? null };
}

export function fmtNotamDate(raw: string): string | null {
    return fmtDateRaw(raw);
}

// ─── Smart NOTAM Selection Pipeline ──────────────────────────


// Q-code severity scores (higher = more severe)
const QCODE_SCORE: Record<string, number> = {
    // FIR/UIR operational (RED)
    AFLC: 100,  // FIR Closed
    AULC: 100,  // UIR Closed
    AFLP: 100,  // FIR Prohibited
    RPCA: 100,  // Prohibited Area active — treat as red
    // ATS Route (ORANGE)
    ARLC: 75,   // ATS Route Closed
    ARAU: 75,   // ATS Route Not Available
    ARLK: 75,   // ATS Route Unserviceable
    // Military/War restricted areas (ORANGE — high priority)
    RMCA: 80,   // Military/Civil Restricted Area (ESCAT)
    RDCA: 80,   // Danger Area
    RRCA: 75,   // Restricted Area
    RTCA: 75,   // Temporarily Reserved Area
    RWCA: 70,   // Warning Area
    // Full Q-code spellings (in case backend includes the Q prefix)
    QRMCA: 80,
    QRDCA: 80,
    QRRCA: 75,
    QRTCA: 75,
    QRPCA: 100,
    QRWCA: 70,
    // Generic FIR misc
    AFXX: 10,
};

// Re-open / restoration keywords in E-field
const REOPEN_PATTERNS: RegExp[] = [
    /\bRE[\s-]?OPEN(ED)?\b/i,
    /\bNORMAL\s+OP(ERATION)?S?\b/i,
    /\bOPS?\s+RESUMED\b/i,
    /\bOPERATIONS?\s+RESUMED\b/i,
    /\bRESTRICTIONS?\s+LIFT(ED)?\b/i,
    /\bWITHDRAWN\b/i,
    /\bNOW\s+(OPEN|AVAILABLE)\b/i,
    /\bCLSD\s+CANCEL(LED)?\b/i,
    /\bCLOSURE\s+CANCEL(LED)?\b/i,
    /\bAIRSPACE\s+(IS\s+)?OPEN\b/i,
];

// Closure / restriction / activation / conflict keywords in E-field
const CLOSURE_PATTERNS: RegExp[] = [
    /\bCLSD\b/i,
    /\bCLOS(ED|URE)\b/i,
    /\bPROHIBIT(ED|ION)?\b/i,
    /\bNOT\s+AVAIL(ABLE)?\b/i,
    /\bUNAVAIL(ABLE)?\b/i,
    /\bSUSPEND(ED)?\b/i,
    /\bRESTRICT(ED|ION)?\b/i,
    // ── War / conflict / security ──
    /\bESCAT\b/i,
    /\bACTIVAT(ED|ION)\b/i,
    /\bARMED\s+CONFLICT\b/i,
    /\bCONFLICT\s+ZONE\b/i,
    /\bWAR(LIKE|FARE)?\b/i,
    /\bHOSTILITI(ES|TY)\b/i,
    /\bBOMB\s+(FRAGMENT|DEBRIS|THREAT)\b/i,
    /\bMISSILE\b/i,
    /\bAIR\s+DEF(ENSE|ENCE)\b/i,
    /\bNO[\s-]FLY\b/i,
    /\bDANGER\s+AREA\b/i,
    /\bCOMBAT\b/i,
    /\bINTERCEPT(ION)?\b/i,
    /\bUNIDENTIFIED\s+(AC|AIRCRAFT)\b/i,
    /\bMILITARY\s+(OPS|OPERATIONS|EXERCISE|ACTIVITY)\b/i,
    /\bSPECIAL\s+ACT(IVITY|IVE)?\b/i,
    /\bLIMIT(S|ATIONS?)\b/i,
];

// OMAE-specific operational advisory currently preferred over generic ESCAT text
const OMAE_PARTIAL_CLOSURE_PATTERNS: RegExp[] = [
    /\bEMIRATES\s+FIR\s+PARTIALLY\s+CLOSED\b/i,
    /\bARR\s+AND\s+DEP\s+TRAFFIC\s+INTO\s+EMIRATES\s+FIR\s+IS\s+PERMITTED\b/i,
    /\bOVERFLIGHTS\s+ARE\s+ONLY\s+AVBL\b/i,
];

const OPS_REASONS_PATTERNS = /\b(DUE\s+TO\s+)?OPERATIONAL\s+(REASONS?|CONSTRAINTS?)|OPS\s+REASONS\b/i;
const PAK_INDIA_RESTRICTION_PATTERN = /\bPAKISTAN\s+AIRSPACE\s+NOT\s+AVBL\s+FOR\s+INDIAN\s+REGISTERED\s+ACFT\b|\bPAKISTAN\s+AIRSPACE\s+NOT\s+AVBL\s+FOR\s+INDIAN\s+REGISTERED\s+ACFT\s+AND\s+ACFT\s+OPERATED\/OWNED\s+OR\s+LEASED\s+BY\s+INDIAN\s+AIRLINES\/OPERATORS\b/i;

export function isOpsReason(text: string): boolean {
    return OPS_REASONS_PATTERNS.test(extractEField(text));
}

export function isPakIndiaRestriction(text: string): boolean {
    return PAK_INDIA_RESTRICTION_PATTERN.test(extractEField(text));
}

function getCategoryPriority(text: string): number {
    const qCode4 = extractQCode4(text);
    const eField = extractEField(text);

    // 0. Absolute Top Priority
    if (PAK_INDIA_RESTRICTION_PATTERN.test(eField)) return 0;

    // 1. Hard Closure (Broad FIR/Airspace)
    if (hasHardClosure(eField)) return 1;

    // 2. LP (Prohibited)
    if (qCode4.endsWith('LP') || /\bPROHIBITED\b/i.test(eField)) return 2;

    // 3. Generic LC (Closed / Unavailable)
    if (qCode4.endsWith('LC') || /\b(CLOSED|CLSD|UNAVAILABLE|NOT\s+AVAILABLE)\b/i.test(eField)) return 3;

    // 4. Ops reasons
    if (OPS_REASONS_PATTERNS.test(eField)) return 4;

    // 5. Spoofing and jamming (GNSS)
    if (hasInterference(text)) return 5;

    return 99; // Lower priority for everything else
}

const PARTIAL_CLOSURE_PATTERNS: RegExp[] = [
    /\bPARTIALLY\s+CLOSED\b/i,
    /\bNOT\s+AVBL\b/i,
    /\bNOT\s+AVAILABLE\b/i,
    ...OMAE_PARTIAL_CLOSURE_PATTERNS,
];

export function isPartiallyClosed(text: string): boolean {
    const eField = extractEField(text);
    return PARTIAL_CLOSURE_PATTERNS.some(p => p.test(eField));
}

export function isOmaePartialClosureNotam(text: string): boolean {
    const hasOmaeContext =
        /\bQ\)\s*OMAE\//i.test(text) ||
        /\bA\)\s*OMAE\b/i.test(text) ||
        /\bEMIRATES\s+FIR\b/i.test(text);

    if (!hasOmaeContext) return false;
    return OMAE_PARTIAL_CLOSURE_PATTERNS.some(p => p.test(text));
}

export interface SelectionResult {
    // The winning (most operationally relevant) NOTAM to display
    winner: NotamItem | null;
    // Composite operational status across all surviving NOTAMs
    status: NotamStatus;
    // Whether any surviving NOTAM has ESCAT
    hasEscat: boolean;
    // Whether any surviving NOTAM has interference
    hasInterference: boolean;
    // All surviving NOTAMs after pipeline processing (sorted by priority)
    all: NotamItem[];
    // Debug: count of NOTAMs removed at each stage
    debug: {
        totalInput: number;
        removedByReplacement: number;
        removedByCancellation: number;
        removedByDate: number;
        removedByNoise: number;
        surviving: number;
    };
}

// Extract the NOTAM ID that this NOTAM Replaces (NOTAMR) or Cancels (NOTAMC)
function extractReferencedId(text: string): { type: 'R' | 'C' | null; refId: string | null } {
    const firstLine = (text ?? '').split('\n')[0];
    // NOTAMR A0859/26  or  NOTAMC A0500/26
    const m = firstLine.match(/\bNOTAM([RC])\s+(A\d{4}\/\d{2})/);
    if (m) return { type: m[1] as 'R' | 'C', refId: m[2] };
    return { type: null, refId: null };
}

// Extract Q-code from text (4-char after "Q")
function extractQCode4(text: string): string {
    const m = text.match(/\bQ\)\s*\S+\/Q([A-Z]{4})\//);
    return m?.[1] ?? '';
}

// Get severity score for a NOTAM based on Q-code + E-field keywords
export function getSeverityScore(text: string): number {
    const eField = extractEField(text);

    // Explicit closure language must win over weaker/misc Q-code labels.
    if (hasHardClosure(eField)) return 100;

    // Prefer OMAE "partially closed" operational routing NOTAM over generic ESCAT advisories
    // so the primary card text reflects the latest routing constraints from API.
    if (isOmaePartialClosureNotam(text)) return 90;

    const qCode = extractQCode4(text);

    // Known Q-code score
    if (qCode && QCODE_SCORE[qCode]) return QCODE_SCORE[qCode];

    // Check if Q-code prefix is AF/AU/AR (FIR-related but unknown suffix)
    const prefix = qCode.slice(0, 2);
    if (['AF', 'AU', 'AR'].includes(prefix)) return 10; // misc

    // Fall back: check E-field for closure keywords
    for (const p of CLOSURE_PATTERNS) {
        if (p.test(eField)) return 30; // E-field mentions closure but Q-code is not FIR-specific
    }

    if (isOpsReason(text)) return 30; // Ops reasons should be orange (Restricted / PPR)

    // Interference detection score (high priority if not closed)
    if (hasInterference(text)) return 85;

    return 5; // generic / unknown
}

// Check if this NOTAM is a re-open / restoration
function isReopen(text: string): boolean {
    const eField = extractEField(text);
    return REOPEN_PATTERNS.some(p => p.test(eField));
}

// Score → NotamStatus mapping
function scoreToStatus(score: number, hasEscat = false): NotamStatus {
    if (score >= 100) return 'red';
    if (score >= 50) return 'orange';
    if (score >= 30) return 'orange';  // E-field closure keywords
    if (score >= 10) return 'orange';  // misc FIR Q-codes
    // score = 5: generic NOTAM with no recognized pattern
    // If ESCAT is active, bump to orange; otherwise leave as unknown
    if (hasEscat) return 'orange';
    return 'unknown'; // Don't show green unless we confirmed normal ops
}

/*
 * Smart NOTAM selection pipeline.
 *
 * 1. Resolve NOTAMR replacement chains (newer replaces older)
 * 2. Handle NOTAMC cancellations (removes cancelled + cancellation itself)
 * 3. Filter by date cutoff (B-field >= 01 March 2026)
 * 4. Filter noise (isOperational check)
 * 5. Score + sort by Q-code severity, then by B-field date (newest first)
 * 6. Re-open detection: if winner says "OPEN" / "RESUMED" → status = green
 * 7. Composite worst-wins status
 */
export function selectBestFirNotams(rawNotams: NotamItem[]): SelectionResult {
    const debug = {
        totalInput: rawNotams.length,
        removedByReplacement: 0,
        removedByCancellation: 0,
        removedByDate: 0,
        removedByNoise: 0,
        surviving: 0,
    };

    if (rawNotams.length === 0) {
        return { winner: null, status: 'green', hasEscat: false, hasInterference: false, all: [], debug };
    }

    // Build maps for quick lookup
    const byId = new Map<string, NotamItem>();
    for (const n of rawNotams) byId.set(n.id, n);

    // ── Step 1: Resolve NOTAMR replacement chains ──
    const replacedIds = new Set<string>();
    const cancellationIds = new Set<string>();  // IDs of NOTAMC items themselves
    const cancelledIds = new Set<string>();     // IDs cancelled by NOTAMC

    for (const n of rawNotams) {
        const { type, refId } = extractReferencedId(n.text);
        if (type === 'R' && refId) {
            replacedIds.add(refId);
        }
        if (type === 'C' && refId) {
            cancelledIds.add(refId);
            cancellationIds.add(n.id); // the NOTAMC itself
        }
    }

    // ── Step 2: Remove replaced, cancelled, and cancellation NOTAMs ──
    let pool = rawNotams.filter(n => {
        if (replacedIds.has(n.id)) {
            debug.removedByReplacement++;
            return false;
        }
        if (cancelledIds.has(n.id)) {
            debug.removedByCancellation++;
            return false;
        }
        if (cancellationIds.has(n.id)) {
            debug.removedByCancellation++;
            return false;
        }
        return true;
    });

    // ── Step 3: Date + Active filter ──
    // Rules:
    //  • If backend marks NOTAM active, keep it UNLESS it's a stale permanent legacy
    //    record started before cutoff (e.g., very old PERM entries).
    //  • Otherwise enforce cutoff + expiry checks.
    const nowMs = Date.now();
    pool = pool.filter(n => {
        // Exempt interference NOTAMs and special Pak/India restriction from recency cutoff
        if (hasInterference(n.text) || n.analysis?.hasInterference || isPakIndiaRestriction(n.text)) return true;

        const bDate = parseBField(n.text, n.analysis);
        const cDate = parseCField(n.text, n.analysis);

        // Backend-confirmed active NOTAMs: keep, except stale permanent legacy entries
        if (n.analysis?.isActive === true) {
            if (bDate && bDate < CUTOFF_DATE && !cDate) {
                debug.removedByDate++;
                return false;
            }
            return true;
        }

        // Can't parse B-field → give benefit of doubt
        if (!bDate) return true;

        // Must have started on or after the cutoff
        if (bDate < CUTOFF_DATE) {
            debug.removedByDate++;
            return false;
        }

        // Must still be active (C-field in future, or permanent = no C-field)
        if (cDate && cDate.getTime() <= nowMs) {
            debug.removedByDate++;
            return false; // already expired
        }

        return true;
    });


    // ── Step 4: Filter noise (isOperational) ──
    pool = pool.filter(n => {
        if (!isOperational(n.text, n.analysis)) {
            debug.removedByNoise++;
            return false;
        }
        return true;
    });

    debug.surviving = pool.length;

    // ── Verbose debug logging ──
    console.debug(
        `[NOTAM Pipeline] ${debug.totalInput} input → ${debug.surviving} surviving |`,
        `replaced:${debug.removedByReplacement}`,
        `cancelled:${debug.removedByCancellation}`,
        `expired:${debug.removedByDate}`,
        `noise:${debug.removedByNoise}`,
        pool.length > 0 ? `| survivors: ${pool.map(n => n.id).join(', ')}` : '| NO SURVIVORS'
    );

    if (pool.length === 0) {
        // If we had raw input NOTAMs but all were filtered out, return 'unknown'
        // so firData is NOT patched green (firData retains backend's status)
        // Only return 'green' if there were truly zero input NOTAMs
        const status = debug.totalInput > 0 ? 'unknown' : 'green';
        return { winner: null, status, hasEscat: false, hasInterference: false, all: [], debug };
    }

    // ── Step 5: Score and sort ──
    const scored = pool.map(n => {
        const bDate = parseBField(n.text, n.analysis);
        return {
            notam: n,
            score: getSeverityScore(n.text),
            bDate: bDate,
            isReopen: isReopen(n.text),
            afterCutoff: bDate ? bDate >= CUTOFF_DATE : false
        };
    });

    // Sort Order:
    // 0. Absolute Top Priority (Pak/India Restriction) - Category 0 wins regardless of date
    // 1. After Cutoff (True > False) - Post 28 Feb 2026 priority
    // 2. Category Priority (LP > LC > Ops > GNSS)
    // 3. Date newest first (Recency)
    scored.sort((a, b) => {
        const aCat = getCategoryPriority(a.notam.text);
        const bCat = getCategoryPriority(b.notam.text);

        // Tier 0: Absolute Global Priority (Category 0)
        if (aCat === 0 && bCat !== 0) return -1;
        if (bCat === 0 && aCat !== 0) return 1;

        // Tier 1: Cutoff Priority
        if (a.afterCutoff !== b.afterCutoff) {
            return a.afterCutoff ? -1 : 1;
        }

        // Tier 2: Category Priority
        if (aCat !== bCat) {
            return aCat - bCat;
        }

        // Tier 3: Date recency
        const aTime = a.bDate?.getTime() ?? 0;
        const bTime = b.bDate?.getTime() ?? 0;
        return bTime - aTime;
    });

    const winner = scored[0];
    const sortedAll = scored.map(s => s.notam);
    const escat = pool.some(n => n.hasEscat);

    // ── Step 6: Re-open detection ──
    // If the top-scored NOTAM is a re-open, mark green ONLY if no other high-severity NOTAMs remain
    if (winner.isReopen && scored.every(s => s.isReopen || s.score < 30)) {
        return {
            winner: winner.notam,
            status: 'green',
            hasEscat: escat,
            hasInterference: pool.some(n => hasInterference(n.text) || n.analysis?.hasInterference),
            all: sortedAll,
            debug,
        };
    }

    // ── Step 7: Composite worst-wins status ──
    // The FIR status itself should be "worst wins" (Red > Orange > Green)
    // regardless of which NOTAM is newest.
    const maxScore = Math.max(...scored.map(s => s.score));
    const status = scoreToStatus(maxScore, escat);

    return {
        winner: winner.notam,
        status,
        hasEscat: pool.some(n => n.hasEscat),
        hasInterference: pool.some(n => hasInterference(n.text) || n.analysis?.hasInterference),
        all: sortedAll,
        debug,
    };
}

// Convenience: run the pipeline and return ALL surviving NOTAMs (sorted by severity + recency)
export function selectTop3FirNotams(rawNotams: NotamItem[]): { notams: NotamItem[]; status: NotamStatus; hasEscat: boolean; hasInterference: boolean } {
    const result = selectBestFirNotams(rawNotams);

    // Re-score the full surviving pool and take top 3
    const pool = result.all;
    const scored = pool.map(n => {
        const bDate = parseBField(n.text, n.analysis);
        return {
            notam: n,
            score: getSeverityScore(n.text),
            bDate: bDate,
            afterCutoff: bDate ? bDate >= CUTOFF_DATE : false
        };
    });

    scored.sort((a, b) => {
        const aCat = getCategoryPriority(a.notam.text);
        const bCat = getCategoryPriority(b.notam.text);

        // Tier 0: Absolute Global Priority (Category 0)
        if (aCat === 0 && bCat !== 0) return -1;
        if (bCat === 0 && aCat !== 0) return 1;

        // Tier 1: Cutoff Priority
        if (a.afterCutoff !== b.afterCutoff) {
            return a.afterCutoff ? -1 : 1;
        }

        // Tier 2: Category Priority
        if (aCat !== bCat) {
            return aCat - bCat;
        }

        // Tier 3: Date recency
        const aT = a.bDate?.getTime() ?? 0;
        const bT = b.bDate?.getTime() ?? 0;
        return bT - aT;
    });

    return {
        notams: scored.map(s => s.notam),  // ALL valid NOTAMs, no slice cap
        status: result.status,
        hasEscat: result.hasEscat,
        hasInterference: result.hasInterference,
    };
}
