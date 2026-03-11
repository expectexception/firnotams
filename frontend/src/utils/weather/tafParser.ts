/**
 * TAF Decoder - Position-Based TAF Parser
 * Following ICAO standards
 */

// Pattern definitions
const PATTERNS = {
    // Header patterns (position-specific)
    reportType: /^(TAF|AMD|COR|RTD)$/,
    stationId: /^[A-Z]{4}$/,
    issueTime: /^\d{6}Z$/,
    validPeriod: /^\d{4}\/\d{4}$/,

    // Condition patterns
    wind: /^(VRB|\d{3})\d{2,3}(G\d{2,3})?(KT|MPS|KMH)$/,
    calmWind: /^00000KT$/,
    visibilityUS: /^(P6SM|M?(\d+\s)?(\d\/\d)?SM|\d+SM)$/,
    visibilityMetric: /^\d{4}$/,
    skyCondition: /^(SKC|CLR|NSC|NCD|FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)?(CB|TCU)?$/,

    // Change group indicators
    fm: /^FM\d{6}$/,
    tempo: /^TEMPO$/,
    becmg: /^BECMG$/,
    prob: /^PROB[34]0$/,

    // Special codes
    cavok: /^CAVOK$/,
    nsw: /^NSW$/,
    nil: /^NIL$/,
    windShear: /^WS\d{3}\/\d{3}\d{2,3}KT$/,

    // Military/International TAF elements
    qnh: /^QNH\d{4}(INS|MB)?$/,
    tempMax: /^TX(M?\d{2})\/\d{4}Z$/,
    tempMin: /^TN(M?\d{2})\/\d{4}Z$/,
    minAltimeter: /^6\d{5}$/,
    turbulence: /^5\d{5}$/,
    icing: /^6\d{5}$/,

    // Time period for TEMPO/BECMG/PROB
    timePeriod: /^\d{4}\/\d{4}$/
};

// Weather phenomenon codes
const WEATHER_DESCRIPTORS = ['MI', 'PR', 'BC', 'DR', 'BL', 'SH', 'TS', 'FZ'];
const WEATHER_PRECIP = ['DZ', 'RA', 'SN', 'SG', 'IC', 'PL', 'GR', 'GS', 'UP'];
const WEATHER_OBSCURATION = ['BR', 'FG', 'FU', 'VA', 'DU', 'SA', 'HZ', 'PY'];
const WEATHER_OTHER = ['PO', 'SQ', 'FC', 'SS', 'DS'];
// @ts-ignore
const ALL_WEATHER_CODES = [...WEATHER_DESCRIPTORS, ...WEATHER_PRECIP, ...WEATHER_OBSCURATION, ...WEATHER_OTHER];

function isWeatherPhenomenon(token: string) {
    // Weather codes can be prefixed with +/- for intensity
    // Format: [+/-][descriptor][phenomenon]
    // Examples: -RA, +TSRA, SN, SHSN, -FZRA, VCSH
    // Must NOT match things like FCST, RMK, NXT which contain weather code substrings

    // Clean the token of intensity prefix
    const cleaned = token.replace(/^[+-]/, '').replace(/^VC/, '');

    // For a token to be weather, it should:
    // 1. Be composed ONLY of known weather codes
    // 2. Not be a keyword like FCST, NXT, BY, RMK

    const KEYWORDS_TO_IGNORE = ['FCST', 'NXT', 'RMK', 'BY', 'AMD', 'COR', 'NIL'];
    if (KEYWORDS_TO_IGNORE.includes(token)) return false;

    // Build a regex that matches valid weather code patterns
    const weatherPattern = /^[+-]?VC?(MI|PR|BC|DR|BL|SH|TS|FZ)*(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+$/;

    const result = weatherPattern.test(token);

    // BUGFIX: Standalone weather codes sometimes fail the complex regex
    if (!result) {
        // Check standalone precipitation codes
        if (WEATHER_PRECIP.includes(cleaned)) return true;
        // Check standalone obscurations
        if (WEATHER_OBSCURATION.includes(cleaned)) return true;
        // Check common combinations
        if (cleaned.length === 4) {
            const first = cleaned.slice(0, 2);
            const second = cleaned.slice(2, 4);
            if (WEATHER_PRECIP.includes(first) && WEATHER_PRECIP.includes(second)) return true;
        }
        // Check descriptor + precipitation
        if (cleaned.length >= 4) {
            const desc = cleaned.slice(0, 2);
            const remainder = cleaned.slice(2);
            if (WEATHER_DESCRIPTORS.includes(desc)) {
                if (WEATHER_PRECIP.includes(remainder)) return true;
                if (WEATHER_OBSCURATION.includes(remainder)) return true;
                if (cleaned.length === 6 && cleaned === 'SHRAGS') return true;
                if (remainder.length === 4) {
                    const p1 = remainder.slice(0, 2);
                    const p2 = remainder.slice(2, 4);
                    if (WEATHER_PRECIP.includes(p1) && WEATHER_PRECIP.includes(p2)) return true;
                }
            }
        }
    }

    return result;
}

// Parse states
const PARSE_STATE = {
    HEADER: 'HEADER',
    INITIAL_CONDITIONS: 'INITIAL_CONDITIONS',
    CHANGE_GROUP: 'CHANGE_GROUP',
    CHANGE_CONDITIONS: 'CHANGE_CONDITIONS'
};

export function parseTAF(tafString: string) {
    if (!tafString) return [];
    
    // Clean and tokenize
    const cleanTaf = tafString.replace(/\s+/g, ' ').trim().replace(/=$/, '');
    const rawTokens = cleanTaf.split(' ').filter(t => t.length > 0);

    const tokens: any[] = [];
    let state = PARSE_STATE.HEADER;
    let headerPosition = 0;

    for (let i = 0; i < rawTokens.length; i++) {
        const raw = rawTokens[i].toUpperCase();
        let token: any = { value: raw, type: 'unknown' };

        // ======== HEADER PARSING ========
        if (state === PARSE_STATE.HEADER) {
            if (headerPosition === 0) {
                if (PATTERNS.reportType.test(raw)) {
                    token.type = 'reportType';
                } else if (PATTERNS.stationId.test(raw)) {
                    token.type = 'stationId';
                    headerPosition = 2;
                }
            } else if (headerPosition === 2) {
                if (PATTERNS.issueTime.test(raw)) {
                    token.type = 'issueTime';
                    headerPosition = 3;
                } else if (PATTERNS.stationId.test(raw)) {
                    token.type = 'stationId';
                }
            } else if (headerPosition === 3) {
                if (PATTERNS.validPeriod.test(raw)) {
                    token.type = 'validPeriod';
                    state = PARSE_STATE.INITIAL_CONDITIONS;
                } else if (PATTERNS.nil.test(raw)) {
                    token.type = 'nil';
                    state = PARSE_STATE.INITIAL_CONDITIONS;
                }
            }
        }

        // ======== CONDITIONS PARSING ========
        else if (state === PARSE_STATE.INITIAL_CONDITIONS || state === PARSE_STATE.CHANGE_CONDITIONS) {
            if (PATTERNS.fm.test(raw)) {
                token.type = 'fm';
                state = PARSE_STATE.CHANGE_CONDITIONS;
            }
            else if (PATTERNS.tempo.test(raw)) {
                token.type = 'tempo';
                state = PARSE_STATE.CHANGE_GROUP;
            }
            else if (PATTERNS.becmg.test(raw)) {
                token.type = 'becmg';
                state = PARSE_STATE.CHANGE_GROUP;
            }
            else if (PATTERNS.prob.test(raw)) {
                token.type = 'prob';
                state = PARSE_STATE.CHANGE_GROUP;
            }
            else if (PATTERNS.calmWind.test(raw) || PATTERNS.wind.test(raw)) {
                token.type = 'wind';
            }
            else if (PATTERNS.cavok.test(raw)) {
                token.type = 'cavok';
            }
            else if (PATTERNS.nsw.test(raw)) {
                token.type = 'nsw';
            }
            else if (PATTERNS.visibilityUS.test(raw)) {
                token.type = 'visibility';
            }
            else if (PATTERNS.visibilityMetric.test(raw)) {
                token.type = 'visibility';
            }
            else if (PATTERNS.skyCondition.test(raw)) {
                token.type = 'skyCondition';
            }
            else if (PATTERNS.windShear.test(raw)) {
                token.type = 'windShear';
            }
            else if (isWeatherPhenomenon(raw)) {
                token.type = 'weather';
            }
            else if (PATTERNS.qnh.test(raw)) {
                token.type = 'qnh';
            }
            else if (PATTERNS.tempMax.test(raw)) {
                token.type = 'tempMax';
            }
            else if (PATTERNS.tempMin.test(raw)) {
                token.type = 'tempMin';
            }
            else if (PATTERNS.minAltimeter.test(raw)) {
                token.type = 'minAltimeter';
            }
            else if (PATTERNS.turbulence.test(raw)) {
                token.type = 'turbulence';
            }
            else if (PATTERNS.icing.test(raw)) {
                token.type = 'icing';
            }
        }

        // ======== CHANGE GROUP (expecting time period) ========
        else if (state === PARSE_STATE.CHANGE_GROUP) {
            if (PATTERNS.timePeriod.test(raw)) {
                token.type = 'timePeriod';
                state = PARSE_STATE.CHANGE_CONDITIONS;
            } else {
                state = PARSE_STATE.CHANGE_CONDITIONS;
                i--;
                continue;
            }
        }

        tokens.push(token);
    }

    return tokens;
}

// Group tokens into sections for display
export function groupTokensIntoSections(tokens: any[]) {
    const sections: any[] = [];
    let currentSection: any = { type: 'initial', title: 'Initial Forecast', icon: 'Sun', tokens: [] };

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const tokenWithIdx = { ...token, idx: i };

        // Detect Change Groups
        if (['fm', 'tempo', 'becmg', 'prob'].includes(token.type)) {
            // Check for PROB + TEMPO combination
            let isProbTempo = false;
            let probToken = null;

            if (token.type === 'prob' && i + 1 < tokens.length && tokens[i + 1].type === 'tempo') {
                isProbTempo = true;
                probToken = tokenWithIdx;
                i++;
            }

            const activeToken = isProbTempo ? { ...tokens[i], idx: i } : tokenWithIdx;

            if (currentSection.tokens.length > 0) {
                sections.push(currentSection);
            }

            let title = 'Change';
            let icon = 'ArrowRight';

            if (activeToken.type === 'fm') {
                const m = activeToken.value.match(/^FM(\d{2})(\d{2})(\d{2})$/);
                title = m ? `From ${m[2]}:${m[3]}Z (Day ${m[1]})` : 'From';
            } else if (activeToken.type === 'tempo') {
                title = isProbTempo
                    ? `${probToken.value.replace('PROB', '')}% Probability of Temporary Conditions`
                    : 'Temporary Conditions';
                icon = 'Clock';
            } else if (activeToken.type === 'becmg') {
                title = 'Becoming';
                icon = 'TrendingUp';
            } else if (activeToken.type === 'prob') {
                title = `${activeToken.value.replace('PROB', '')}% Probability`;
                icon = 'Percent';
            }

            const newTokens = [];
            if (isProbTempo) newTokens.push(probToken);
            newTokens.push(activeToken);

            currentSection = {
                type: isProbTempo ? 'tempo' : activeToken.type,
                title,
                icon,
                tokens: newTokens
            };
        }
        else {
            currentSection.tokens.push(tokenWithIdx);
        }
    }

    if (currentSection.tokens.length > 0) {
        sections.push(currentSection);
    }

    return sections;
}

// Generate summary data from tokens
export function generateSummaryData(tokens: any[]) {
    const station = tokens.find(t => t.type === 'stationId')?.value || '—';
    const validPeriod = tokens.find(t => t.type === 'validPeriod')?.value || '';
    const fmCount = tokens.filter(t => t.type === 'fm').length;
    const tempoCount = tokens.filter(t => t.type === 'tempo').length;
    const becmgCount = tokens.filter(t => t.type === 'becmg').length;
    const hasWeather = tokens.some(t => t.type === 'weather');
    const hasTS = tokens.some(t => t.type === 'weather' && t.value.includes('TS'));
    const hasGusts = tokens.some(t => t.type === 'wind' && t.value.includes('G'));
    const hasFog = tokens.some(t => t.type === 'weather' && t.value.includes('FG'));
    const hasIce = tokens.some(t => t.type === 'weather' && (t.value.includes('FZ') || t.value.includes('IC') || t.value.includes('PL')));

    let duration = '24h';
    let validFrom = '';
    let validTo = '';
    if (validPeriod) {
        const [s, e] = validPeriod.split('/');
        validFrom = `${s.slice(0, 2)}th ${s.slice(2)}:00Z`;
        validTo = `${e.slice(0, 2)}th ${e.slice(2)}:00Z`;
        const h = (parseInt(e.slice(0, 2)) - parseInt(s.slice(0, 2))) * 24 + parseInt(e.slice(2)) - parseInt(s.slice(2));
        duration = h >= 28 ? '30h' : '24h';
    }

    return { station, duration, validFrom, validTo, fmCount, tempoCount, becmgCount, hasWeather, hasTS, hasGusts, hasFog, hasIce };
}
