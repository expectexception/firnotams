/**
 * METAR Parser
 * Parses raw METAR/SPECI strings into typed tokens and logical sections.
 * Supports both FAA (US) and EASA/ICAO (international) formats.
 */

// ─── Regex Patterns ──────────────────────────────────────────────────────────

const PATTERNS = {
    reportType: /^(METAR|SPECI)$/,
    modifier: /^(AUTO|COR|RTD|CORR)$/,
    stationId: /^[A-Z]{4}$/,
    obsTime: /^\d{6}Z$/,
    wind: /^(VRB|\d{3})\d{2,3}(G\d{2,3})?(KT|MPS|KMH)$/,
    windVariability: /^\d{3}V\d{3}$/,
    visibility: /^(M?\d+(\s+\d+\/\d+)?SM|\d{4}(NDV)?|CAVOK)$/,
    rvr: /^R\d{2}[LCR]?\/(M|P)?\d{3,4}(V(M|P)?\d{3,4})?(FT|N)?(\/?[DUN])?$/,
    runwayCondition: /^R\d{2}[LCR]?\/[0-9/]{4,8}$/,
    seaState: /^W(M?\d{2}|\/{3})S\d$/,
    weather: /^(\+|-|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS|NSW|RASN|SNRA|FZRA|FZDZ|FZFG|TSRA|TSSN|TSPL|TSGR|TSGS|SHRA|SHSN|SHPL|SHGR|SHGS|BLSN|BLSA|BLDU|DRSN|DRSA|DRDU)+$/,
    recentWeather: /^RE(MI|PR|BC|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PO|FC|SS|DS|RASN|SNRA|FZRA|FZDZ|FZFG|TSRA|TSSN|TSPL|TSGR|TSGS|SHRA|SHSN|SHPL|SHGR|SHGS|BLSN)+$/,
    skyCondition: /^(SKC|CLR|NSC|NCD|FEW|SCT|BKN|OVC|VV)(\d{3}(?:\/\/\/)?|\/\/\/)?(CB|TCU)?$/,
    tempDewPoint: /^M?\d{2}\/M?\d{2}$/,
    altimeterFAA: /^A\d{4}$/,
    altimeterICAO: /^Q\d{4}$/,
    trend: /^(NOSIG|BECMG|TEMPO)$/,
    trendTime: /^(FM|TL|AT)\d{4}$/,
    rmk: /^RMK$/,
    maintenanceFlag: /^\$$/,
    cavok: /^CAVOK$/,
};

const WEATHER_PHENOMENA = /^(\+|-|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)*$/;

function isWeatherPhenomenon(token: string) {
    if (WEATHER_PHENOMENA.test(token)) return true;
    const compounds = ['RASN', 'SNRA', 'FZRA', 'FZDZ', 'FZFG', 'TSRA', 'TSSN', 'TSPL', 'TSGR', 'TSGS',
        'SHRA', 'SHSN', 'SHPL', 'SHGR', 'SHGS', 'BLSN', 'BLSA', 'BLDU', 'DRSN', 'DRSA', 'DRDU'];
    return compounds.some(c => token.includes(c));
}

// ─── Main Parser ─────────────────────────────────────────────────────────────

export function parseMETAR(metarString: string) {
    if (!metarString) return [];

    const cleaned = metarString.trim().toUpperCase().replace(/\s+/g, ' ');
    const rawTokens = cleaned.split(' ');

    const tokens: any[] = [];
    let state = 'HEADER';
    let inRemarks = false;
    let inTrend = false;

    for (let i = 0; i < rawTokens.length; i++) {
        const raw = rawTokens[i];
        if (!raw) continue;

        if (PATTERNS.rmk.test(raw)) {
            tokens.push({ value: raw, type: 'rmk' });
            inRemarks = true;
            state = 'REMARKS';
            continue;
        }

        if (inRemarks) {
            if (PATTERNS.maintenanceFlag.test(raw)) {
                tokens.push({ value: raw, type: 'maintenanceFlag' });
                continue;
            }

            const multiWordMatch = consumeMultiWordRemark(i, rawTokens);
            if (multiWordMatch) {
                tokens.push({ value: multiWordMatch.value, type: multiWordMatch.type });
                i += multiWordMatch.consume - 1;
                continue;
            }

            tokens.push({ value: raw, type: classifyRemarkToken(raw) });
            continue;
        }

        if (PATTERNS.trend.test(raw)) {
            tokens.push({ value: raw, type: 'trend' });
            inTrend = raw !== 'NOSIG';
            continue;
        }

        if (inTrend && PATTERNS.trendTime.test(raw)) {
            tokens.push({ value: raw, type: 'trendTime' });
            continue;
        }

        if (state === 'HEADER') {
            if (PATTERNS.reportType.test(raw)) {
                tokens.push({ value: raw, type: 'reportType' });
                continue;
            }
            if (PATTERNS.modifier.test(raw)) {
                tokens.push({ value: raw, type: 'modifier' });
                continue;
            }
            if (PATTERNS.obsTime.test(raw)) {
                tokens.push({ value: raw, type: 'obsTime' });
                state = 'CONDITIONS';
                continue;
            }
            if (PATTERNS.stationId.test(raw) && !tokens.some(t => t.type === 'stationId')) {
                tokens.push({ value: raw, type: 'stationId' });
                continue;
            }
            tokens.push({ value: raw, type: 'unknown' });
            continue;
        }

        if (state === 'CONDITIONS') {
            if (PATTERNS.cavok.test(raw)) {
                tokens.push({ value: raw, type: 'cavok' });
                continue;
            }
            if (PATTERNS.wind.test(raw)) {
                tokens.push({ value: raw, type: 'wind' });
                continue;
            }
            if (PATTERNS.windVariability.test(raw)) {
                tokens.push({ value: raw, type: 'windVariability' });
                continue;
            }
            if (/^\d+$/.test(raw) && i + 1 < rawTokens.length && /^\d+\/\d+SM$/.test(rawTokens[i + 1])) {
                tokens.push({ value: `${raw} ${rawTokens[i + 1]}`, type: 'visibility' });
                i++;
                continue;
            }
            if (PATTERNS.visibility.test(raw) || /^M?\d+\/\d+SM$/.test(raw)) {
                tokens.push({ value: raw, type: 'visibility' });
                continue;
            }
            if (PATTERNS.rvr.test(raw)) {
                tokens.push({ value: raw, type: 'rvr' });
                continue;
            }
            if (/^R\d{2}[LCR]?\/([0-9/]{6,8})$/.test(raw) && raw.includes('//')) {
                tokens.push({ value: raw, type: 'remarkLegacyRunwayState' });
                continue;
            }
            if (PATTERNS.runwayCondition.test(raw)) {
                tokens.push({ value: raw, type: 'runwayCondition' });
                continue;
            }
            if (PATTERNS.seaState.test(raw)) {
                tokens.push({ value: raw, type: 'seaState' });
                continue;
            }
            if (isWeatherPhenomenon(raw)) {
                tokens.push({ value: raw, type: 'weather' });
                continue;
            }
            if (raw === '//') {
                tokens.push({ value: raw, type: 'weather' });
                continue;
            }
            if (PATTERNS.skyCondition.test(raw)) {
                tokens.push({ value: raw, type: 'skyCondition' });
                continue;
            }
            if (/^VV(\d{3}|\/{3})$/.test(raw)) {
                tokens.push({ value: raw, type: 'skyCondition' });
                continue;
            }
            if (PATTERNS.tempDewPoint.test(raw)) {
                tokens.push({ value: raw, type: 'tempDewPoint' });
                continue;
            }
            if (PATTERNS.altimeterFAA.test(raw) || PATTERNS.altimeterICAO.test(raw)) {
                tokens.push({ value: raw, type: 'altimeter' });
                continue;
            }
            if (/^LTG(IC|CG|CC|CA|DSNT|OHD|VC)?/.test(raw)) {
                tokens.push({ value: raw, type: 'remarkSpecial' });
                continue;
            }
            if (/^(TS|CB)(N|NE|E|SE|S|SW|W|NW|ALQDS|DSNT|OHD|VC)?$/.test(raw)) {
                tokens.push({ value: raw, type: 'remarkSpecial' });
                continue;
            }
            if (PATTERNS.modifier.test(raw)) {
                tokens.push({ value: raw, type: 'modifier' });
                continue;
            }
            if (PATTERNS.recentWeather.test(raw)) {
                tokens.push({ value: raw, type: 'recentWeather' });
                continue;
            }
            if (raw === 'WS') {
                let wsTokens = [raw];
                let consume = 1;
                while (i + consume < rawTokens.length) {
                    let next = rawTokens[i + consume];
                    if (/^R\d{2}[LCR]?$/.test(next) || next === 'ALL' || next === 'RWY') {
                        wsTokens.push(next);
                        consume++;
                    } else {
                        break;
                    }
                }
                tokens.push({ value: wsTokens.join(' '), type: 'windShear' });
                i += consume - 1;
                continue;
            }
            if (raw === 'NSW') {
                tokens.push({ value: raw, type: 'weather' });
                continue;
            }
            tokens.push({ value: raw, type: 'unknown' });
        }
    }
    return tokens;
}

function consumeMultiWordRemark(idx: number, tokens: string[]) {
    const t = tokens[idx];
    const t1 = idx + 1 < tokens.length ? tokens[idx + 1] : '';
    const t2 = idx + 2 < tokens.length ? tokens[idx + 2] : '';
    const t3 = idx + 3 < tokens.length ? tokens[idx + 3] : '';
    const t4 = idx + 4 < tokens.length ? tokens[idx + 4] : '';
    const isDir = (v: string) => /^(N|NE|E|SE|S|SW|W|NW)$/.test(v || '');
    const isLocationWord = (v: string) => /^(ALQDS|DSNT|OHD|VC|VCNTY|STN)$/.test(v || '');

    if (t === 'GR') {
        if (t1 === 'LESS' && t2 === 'THAN' && /^\d+\/\d+$/.test(t3)) return { type: 'remarkHailSize', value: `GR LESS THAN ${t3}`, consume: 4 };
        if (/^\d+$/.test(t1) && /^\d+\/\d+$/.test(t2)) return { type: 'remarkHailSize', value: `GR ${t1} ${t2}`, consume: 3 };
        if (/^\d+\/\d+$/.test(t1)) return { type: 'remarkHailSize', value: `GR ${t1}`, consume: 2 };
        if (/^\d+(\.\d+)?$/.test(t1)) return { type: 'remarkHailSize', value: `GR ${t1}`, consume: 2 };
    }
    if (/^(CI|CS|CC|AS|AC|ST|SF|SC|CU|TCU|CB|CF|NS)$/.test(t) && t1 === 'TR') return { type: 'remarkCoverage', value: `${t} ${t1}`, consume: 2 };
    if (t === 'WND' && t1 === 'DATA' && t2 === 'ESTMD') return { type: 'remarkEstimatedData', value: 'WND DATA ESTMD', consume: 3 };
    if (t === 'ALSTG/SLP' && t1 === 'ESTMD') return { type: 'remarkEstimatedData', value: 'ALSTG/SLP ESTMD', consume: 2 };
    if (t === 'ALSTG' && t1 === 'ESTMD') return { type: 'remarkEstimatedData', value: 'ALSTG ESTMD', consume: 2 };
    if (t === 'SLP' && t1 === 'ESTMD') return { type: 'remarkEstimatedData', value: 'SLP ESTMD', consume: 2 };
    if (t === 'PK' && t1 === 'WND' && t2 === 'ESTMD') return { type: 'remarkEstimatedData', value: 'PK WND ESTMD', consume: 3 };
    if (t === 'WSHFT' && t1 === 'ESTMD') return { type: 'remarkEstimatedData', value: 'WSHFT ESTMD', consume: 2 };
    if ((t === 'TEMP' || t === 'DEWPT' || t === 'PCPN' || t === 'VIS' || t === 'CIG') && t1 === 'ESTMD') return { type: 'remarkEstimatedData', value: `${t} ESTMD`, consume: 2 };
    if (/^T\d{8}$/.test(t) && t1 === 'ESTMD') return { type: 'remarkEstimatedData', value: `${t} ESTMD`, consume: 2 };
    if (/^P\d{4}$/.test(t) && t1 === 'ESTMD') return { type: 'remarkEstimatedData', value: `${t} ESTMD`, consume: 2 };
    if (t === 'CIG' && /^\d{3}V\d{3}$/.test(t1) && t2 === 'ESTMD') return { type: 'remarkEstimatedData', value: `CIG ${t1} ESTMD`, consume: 3 };
    if (t === 'PK' && t1 === 'WND' && /^\d{5}\/\d{2,4}$/.test(t2)) return { type: 'remarkPeakWind', value: `PK WND ${t2}`, consume: 3 };
    if ((t === 'TWR' || t === 'SFC') && t1 === 'VIS') {
        if (/^\d+$/.test(t2) && /^\d+\/\d+$/.test(t3)) return { type: 'remarkVisibility', value: `${t} VIS ${t2} ${t3}`, consume: 4 };
        return { type: 'remarkVisibility', value: `${t} VIS ${t2}`, consume: 3 };
    }
    if (t === 'VIS') {
        if (t1 === 'VRB' && /^((\d+\/\d+)|\d+)$/.test(t2) && t3 === '-' && /^((\d+\/\d+)|\d+)$/.test(t4)) return { type: 'remarkVisibility', value: `VIS VRB ${t2} - ${t4}`, consume: 5 };
        if (t1 === 'VRB' && /^((\d+\/\d+)|\d+)$/.test(t2)) return { type: 'remarkVisibility', value: `VIS VRB ${t2}`, consume: 3 };
        if (t1 && /^\d+V\d+$/.test(t1)) return { type: 'remarkVisibility', value: `VIS ${t1}`, consume: 2 };
        if (t1 && /^(\d+\/\d+|\d+)V\d+$/.test(t1) && /^\d+\/\d+$/.test(t2)) return { type: 'remarkVisibility', value: `VIS ${t1} ${t2}`, consume: 3 };
        if (t1 && /^(\d+\/\d+|\d+)V(\d+\/\d+|\d+)$/.test(t1)) return { type: 'remarkVisibility', value: `VIS ${t1}`, consume: 2 };
        if (/^\d+$/.test(t1) && /^\d+\/\d+$/.test(t2)) return { type: 'remarkVisibility', value: `VIS ${t1} ${t2}`, consume: 3 };
        if (/^(\d+|\d+\/\d+)$/.test(t1)) return { type: 'remarkVisibility', value: `VIS ${t1}`, consume: 2 };
    }
    if (t.match(/^R\d{2}[LCR]?\/\d{5}MPS$/)) return { type: 'remarkRunwayWind', value: t, consume: 1 };
    if (t === 'WIND' && t1 === 'RWY' && /^\d{2}[LCR]?$/.test(t2) && /^(VRB|\d{3})\d{2,3}KT$/.test(t3)) return { type: 'remarkRunwayWind', value: `WIND RWY ${t2} ${t3}`, consume: 4 };
    if (t === 'WIND' && /^\d{3,4}FT$/.test(t1) && /^(VRB|\d{3})\d{2,3}KT$/.test(t2)) return { type: 'remarkRunwayWind', value: `WIND ${t1} ${t2}`, consume: 3 };
    if (t.match(/^R\d{2}[LCR]?\/([0-9\/]{4,6}|[0-9\/]{4}\/\/[0-9\/]{2})$/)) return { type: 'remarkLegacyRunwayState', value: t, consume: 1 };
    if (t.startsWith('QFE') && t.length <= 7) return { type: 'remarkQfe', value: t, consume: 1 };
    if (/^VIS(N|NE|E|SE|S|SW|W|NW)$/.test(t) && /^((\d+\/\d+)|\d+)$/.test(t1)) return { type: 'remarkVisibility', value: `${t} ${t1}`, consume: 2 };
    if (t === 'WSHFT' && /^\d{4}$/.test(t1)) {
        if (t2 === 'FROPA') return { type: 'remarkWindShift', value: `WSHFT ${t1} FROPA`, consume: 3 };
        return { type: 'remarkWindShift', value: `WSHFT ${t1}`, consume: 2 };
    }
    if (t === 'FUNNEL' && t1 === 'CLOUD') {
        let consume = 2; let val = 'FUNNEL CLOUD'; let j = idx + 2;
        while (j < tokens.length && (/^[BE]\d{2,4}$/.test(tokens[j]) || /^\d+$/.test(tokens[j]) || tokens[j] === 'MOV' || isDir(tokens[j]) || isLocationWord(tokens[j]))) {
            val += ' ' + tokens[j]; consume++; j++;
        }
        return { type: 'remarkSpecial', value: val, consume };
    }
    if (t === 'TORNADO' || t === 'WATERSPOUT') {
        let consume = 1; let val = t; let j = idx + 1;
        while (j < tokens.length && (/^[BE]\d{2,4}$/.test(tokens[j]) || /^\d+$/.test(tokens[j]) || tokens[j] === 'MOV' || isDir(tokens[j]) || isLocationWord(tokens[j]))) {
            val += ' ' + tokens[j]; consume++; j++;
        }
        return { type: 'remarkSpecial', value: val, consume };
    }
    if (t === 'CIG' && /^\d{3}(V\d{3})?$/.test(t1)) {
        if (t2 && (t2.startsWith('RWY') || t2 === 'LOC' || /^\d{1,2}[LCR]?$/.test(t2))) return { type: 'remarkCeiling', value: `CIG ${t1} ${t2}`, consume: 3 };
        return { type: 'remarkCeiling', value: `CIG ${t1}`, consume: 2 };
    }
    if (t === 'PCPN' && t1) {
        if (t1 === 'VRY' && t2 && /^(LGT|HVY)$/.test(t2)) return { type: 'remarkPrecipIntensity', value: `PCPN VRY ${t2}`, consume: 3 };
        if (/^(LGT|MDT|HVY)$/.test(t1)) return { type: 'remarkPrecipIntensity', value: `PCPN ${t1}`, consume: 2 };
    }
    if (t === 'SNINCR' && t1 && /^\d+\/\d+$/.test(t1)) {
        if (/^4\/\d{3}$/.test(t2)) return { type: 'remarkSnowIncrease', value: `SNINCR ${t1} ${t2}`, consume: 3 };
        return { type: 'remarkSnowIncrease', value: `SNINCR ${t1}`, consume: 2 };
    }
    if (t === '98' && /^\d{3}$/.test(t1)) return { type: 'remarkItem', value: `98 ${t1}`, consume: 2 };
    if (/^(FG|HZ|FU|VA|DU|SA|BR|PY)$/.test(t) && /^(FEW|SCT|BKN|OVC)\d{3}$/.test(t1)) return { type: 'remarkObscuration', value: `${t} ${t1}`, consume: 2 };
    if (/^(FEW|SCT|BKN|OVC)\d{3}$/.test(t) && t1 === 'V' && /^(FEW|SCT|BKN|OVC)$/.test(t2)) return { type: 'remarkVariableSky', value: `${t} V ${t2}`, consume: 3 };
    if (/^(FEW|SCT|BKN|OVC)$/.test(t) && t1 === 'V' && /^(FEW|SCT|BKN|OVC)$/.test(t2)) return { type: 'remarkVariableSky', value: `${t} V ${t2}`, consume: 3 };
    if (/^VC[A-Z]{2}$/.test(t) && t1 && /^([NSEW]{1,2})(-[NSEW]{1,2})?$/.test(t1)) return { type: 'remarkVicinity', value: `${t} ${t1}`, consume: 2 };
    if ((t === 'VISNO' || t === 'CHINO' || t === 'CIGNO')) return { type: 'remarkSensorStatus', value: t, consume: 1 };
    if (t === 'RVRNO' && t1 && (t1.startsWith('RWY') || /^\d{1,2}[LCR]?$/.test(t1))) return { type: 'remarkSensorStatus', value: `${t} ${t1}`, consume: 2 };
    if ((t === 'TS' || t === 'CB') && /^(N|NE|E|SE|S|SW|W|NW|ALQDS|DSNT|OHD|VC)$/.test(t1)) {
        if (t2 === 'MOV' && /^(N|NE|E|SE|S|SW|W|NW)$/.test(t3)) return { type: 'remarkSpecial', value: `${t} ${t1} MOV ${t3}`, consume: 4 };
        return { type: 'remarkSpecial', value: `${t} ${t1}`, consume: 2 };
    }
    if (t === 'VIRGA' && /^([NSEW]{1,2})(-[NSEW]{1,2})?$/.test(t1)) return { type: 'remarkSpecial', value: `VIRGA ${t1}`, consume: 2 };
    if (/^(FRQ|OCNL|CONS)$/.test(t) && t1.startsWith('LTG')) {
        let consume = 2; let val = `${t} ${t1}`; let j = idx + 2;
        while (j < tokens.length && (isDir(tokens[j]) || isLocationWord(tokens[j]))) {
            val += ` ${tokens[j]}`; consume++; j++;
        }
        return { type: 'remarkSpecial', value: val, consume };
    }
    return null;
}

function classifyRemarkToken(raw: string) {
    if (/^(AO1|AO2|AO1A|AO2A)$/.test(raw)) return 'remarkStationType';
    if (/^SLP\d{3}$/.test(raw)) return 'remarkSlp';
    if (/^P{1,2}\d{3,4}$/.test(raw)) return 'remarkPrecip';
    if (/^T\d{8}$/.test(raw)) return 'remarkTempPrecise';
    if (/^(PRESRR|PRESFR)$/.test(raw)) return 'remarkPressureTend';
    if (/^5\d{4}$/.test(raw)) return 'remarkPressureTend';
    if (/^1\d{4}$/.test(raw)) return 'remarkMaxMinTemp';
    if (/^2\d{4}$/.test(raw)) return 'remarkMaxMinTemp';
    if (/^6\d{4}$/.test(raw)) return 'remarkPrecip6h';
    if (/^7\d{4}$/.test(raw)) return 'remarkPrecip24h';
    if (/^R\d{2}[LCR]?\/[0-9\/]{4,8}$/.test(raw)) return 'remarkLegacyRunwayState';
    if (/^(TSNO|RVRNO|PWINO|PNO|FZRANO|VISNO|CHINO|CIGNO|SLPNO)$/.test(raw)) return 'remarkSensorStatus';
    if (/^\$$/.test(raw)) return 'remarkSensorStatus';
    return 'remarkItem';
}

export function groupMetarIntoSections(tokens: any[]) {
    const headerTypes = new Set(['reportType', 'modifier', 'stationId', 'obsTime']);
    const conditionTypes = new Set(['wind', 'windVariability', 'windShear', 'visibility', 'cavok', 'rvr', 'runwayCondition', 'seaState', 'weather', 'recentWeather', 'skyCondition', 'tempDewPoint', 'altimeter', 'trend', 'trendTime']);
    
    const header: any = { type: 'header', label: 'Report Header', tokens: [] };
    const conditions: any = { type: 'conditions', label: 'Current Conditions', tokens: [] };
    const remarks: any = { type: 'remarks', label: 'Remarks', tokens: [] };

    let rmkSeen = false;
    for (const token of tokens) {
        if (token.type === 'rmk') rmkSeen = true;
        if (headerTypes.has(token.type)) header.tokens.push(token);
        else if (rmkSeen) remarks.tokens.push(token);
        else conditions.tokens.push(token);
    }
    const sections = [header, conditions];
    if (remarks.tokens.length > 0) sections.push(remarks);
    return sections;
}

export function generateMetarSummary(tokens: any[]) {
    const get = (type: string) => tokens.find(t => t.type === type);
    const getAll = (type: string) => tokens.filter(t => t.type === type);

    const station = get('stationId')?.value || '----';
    const altRaw = get('altimeter')?.value || '';
    let altimeter = altRaw;
    if (altRaw.startsWith('A') && altRaw.length === 5) altimeter = (parseInt(altRaw.slice(1)) / 100).toFixed(2) + ' inHg';
    else if (altRaw.startsWith('Q') && altRaw.length === 5) altimeter = altRaw.slice(1) + ' hPa';

    const windRaw = get('wind')?.value || '';
    let wind: any = { dir: null, speed: null, gust: null, unit: 'KT', calm: false, variable: false };
    if (windRaw) {
        if (windRaw === 'CALM' || windRaw.startsWith('00000')) wind.calm = true;
        else {
            const wm = windRaw.match(/^(VRB|\d{3})(\d{2,3})(G(\d{2,3}))?(KT|MPS|KMH)/);
            if (wm) {
                wind.variable = wm[1] === 'VRB';
                wind.dir = wind.variable ? 'VRB' : wm[1] + '°';
                wind.speed = parseInt(wm[2]);
                wind.gust = wm[4] ? parseInt(wm[4]) : null;
                wind.unit = wm[5] || 'KT';
            }
        }
    }

    const visRaw = get('visibility')?.value || '';
    let visibility = visRaw;
    if (visRaw.endsWith('SM')) {
        const withoutSM = visRaw.slice(0, -2);
        visibility = withoutSM.startsWith('M') ? '<' + withoutSM.slice(1) + ' SM' : withoutSM + ' SM';
    } else if (/^\d{4}$/.test(visRaw)) {
        const vm = parseInt(visRaw);
        visibility = vm >= 9999 ? '10+ km' : `${vm} m`;
    }

    const skyTokens = getAll('skyCondition');
    let ceilingFt = null;
    for (const t of skyTokens) {
        const cm = t.value.match(/^(BKN|OVC|VV)(\d{3})/);
        if (cm) { ceilingFt = parseInt(cm[2]) * 100; break; }
    }

    const tempRaw = get('tempDewPoint')?.value || '';
    let temp = null; let dew = null;
    if (tempRaw) {
        const tm = tempRaw.split('/');
        temp = tm[0].startsWith('M') ? -parseInt(tm[0].slice(1)) : parseInt(tm[0]);
        dew = tm[1].startsWith('M') ? -parseInt(tm[1].slice(1)) : parseInt(tm[1]);
    }

    return { station, altimeter, wind, visibility, ceilingFt, temp, dew };
}
