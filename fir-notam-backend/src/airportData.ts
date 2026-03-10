export interface AirportInfo {
    icao: string;
    name: string;
    country: string;
    countryFlag: string;
    fir: string;
    isCapital: boolean;
}

export interface FirInfo {
    icao: string;
    name: string;
    geojsonCode: string; // may differ from icao (e.g. LLLL -> LLTA)
}

export const AIRPORTS: AirportInfo[] = [
    // Capital airports
    { icao: 'OMAA', name: 'Abu Dhabi International', country: 'UAE', countryFlag: '🇦🇪', fir: 'OMAE', isCapital: true },
    { icao: 'OBBI', name: 'Bahrain International', country: 'Bahrain', countryFlag: '🇧🇭', fir: 'OBBB', isCapital: true },
    { icao: 'OAKB', name: 'Kabul International', country: 'Afghanistan', countryFlag: '🇦🇫', fir: 'OAKX', isCapital: true },
    { icao: 'OIIE', name: 'Imam Khomeini Intl', country: 'Iran', countryFlag: '🇮🇷', fir: 'OIIX', isCapital: true },
    { icao: 'OJAI', name: 'Queen Alia International', country: 'Jordan', countryFlag: '🇯🇴', fir: 'OJAC', isCapital: true },
    { icao: 'OKBK', name: 'Kuwait International', country: 'Kuwait', countryFlag: '🇰🇼', fir: 'OKAC', isCapital: true },
    { icao: 'OLBA', name: 'Rafic Hariri International', country: 'Lebanon', countryFlag: '🇱🇧', fir: 'OLBB', isCapital: true },
    { icao: 'LLBG', name: 'Ben Gurion International', country: 'Israel', countryFlag: '🇮🇱', fir: 'LLLL', isCapital: true },
    { icao: 'OTBD', name: 'Doha International', country: 'Qatar', countryFlag: '🇶🇦', fir: 'OTDF', isCapital: true },
    { icao: 'LCLK', name: 'Larnaca International', country: 'Cyprus', countryFlag: '🇨🇾', fir: 'LCCC', isCapital: false },
    { icao: 'LCPH', name: 'Paphos International', country: 'Cyprus', countryFlag: '🇨🇾', fir: 'LCCC', isCapital: false },
    { icao: 'OERK', name: 'King Khalid International', country: 'Saudi Arabia', countryFlag: '🇸🇦', fir: 'OEJD', isCapital: true },
    { icao: 'OOMS', name: 'Muscat International', country: 'Oman', countryFlag: '🇴🇲', fir: 'OOMM', isCapital: true },
    { icao: 'ORBI', name: 'Baghdad International', country: 'Iraq', countryFlag: '🇮🇶', fir: 'ORBB', isCapital: true },
    { icao: 'OSDI', name: 'Damascus International', country: 'Syria', countryFlag: '🇸🇾', fir: 'OSTT', isCapital: true },

    // Additional UAE airports
    { icao: 'OMDB', name: 'Dubai International', country: 'UAE', countryFlag: '🇦🇪', fir: 'OMAE', isCapital: false },
    { icao: 'OMAD', name: 'Al Bateen Executive Airport', country: 'UAE', countryFlag: '🇦🇪', fir: 'OMAE', isCapital: false },
    { icao: 'OMAL', name: 'Al Ain International', country: 'UAE', countryFlag: '🇦🇪', fir: 'OMAE', isCapital: false },
    { icao: 'OMDW', name: 'Al Maktoum International', country: 'UAE', countryFlag: '🇦🇪', fir: 'OMAE', isCapital: false },
    { icao: 'OMFJ', name: 'Fujairah International', country: 'UAE', countryFlag: '🇦🇪', fir: 'OMAE', isCapital: false },
    { icao: 'OMRK', name: 'Ras Al Khaimah International', country: 'UAE', countryFlag: '🇦🇪', fir: 'OMAE', isCapital: false },
    { icao: 'OMSJ', name: 'Sharjah International', country: 'UAE', countryFlag: '🇦🇪', fir: 'OMAE', isCapital: false },

    // Additional Saudi airports
    { icao: 'OEJN', name: 'King Abdulaziz International', country: 'Saudi Arabia', countryFlag: '🇸🇦', fir: 'OEJD', isCapital: false },
    { icao: 'OEDF', name: 'King Fahd International', country: 'Saudi Arabia', countryFlag: '🇸🇦', fir: 'OEJD', isCapital: false },
    { icao: 'OEMA', name: 'Prince Mohammad bin Abdulaziz', country: 'Saudi Arabia', countryFlag: '🇸🇦', fir: 'OEJD', isCapital: false },

    // Additional Iran airports
    { icao: 'OIFM', name: 'Isfahan International', country: 'Iran', countryFlag: '🇮🇷', fir: 'OIIX', isCapital: false },
    { icao: 'OIII', name: 'Mehrabad International', country: 'Iran', countryFlag: '🇮🇷', fir: 'OIIX', isCapital: false },
    { icao: 'OIKB', name: 'Bandar Abbas International', country: 'Iran', countryFlag: '🇮🇷', fir: 'OIIX', isCapital: false },
    { icao: 'OIMM', name: 'Mashhad International', country: 'Iran', countryFlag: '🇮🇷', fir: 'OIIX', isCapital: false },
    { icao: 'OISS', name: 'Shiraz International', country: 'Iran', countryFlag: '🇮🇷', fir: 'OIIX', isCapital: false },
    { icao: 'OIZH', name: 'Zahedan International', country: 'Iran', countryFlag: '🇮🇷', fir: 'OIIX', isCapital: false },

    // Additional Jordan airports
    { icao: 'OJAM', name: 'Amman Civil Airport', country: 'Jordan', countryFlag: '🇯🇴', fir: 'OJAC', isCapital: false },
    { icao: 'OJAQ', name: 'Aqaba King Hussein Airport', country: 'Jordan', countryFlag: '🇯🇴', fir: 'OJAC', isCapital: false },

    // Iraq airports
    { icao: 'ORER', name: 'Erbil International', country: 'Iraq', countryFlag: '🇮🇶', fir: 'ORBB', isCapital: false },
    { icao: 'ORMM', name: 'Basrah International', country: 'Iraq', countryFlag: '🇮🇶', fir: 'ORBB', isCapital: false },
    { icao: 'ORNI', name: 'Al-Ashraf International', country: 'Iraq', countryFlag: '🇮🇶', fir: 'ORBB', isCapital: false },
    { icao: 'ORSU', name: 'Sulaymaniyah International', country: 'Iraq', countryFlag: '🇮🇶', fir: 'ORBB', isCapital: false },

    // Pakistan airports
    { icao: 'OPKC', name: 'Karachi Jinnah Intl', country: 'Pakistan', countryFlag: '🇵🇰', fir: 'OPKR', isCapital: false },
    { icao: 'OPLA', name: 'Lahore Allama Iqbal Intl', country: 'Pakistan', countryFlag: '🇵🇰', fir: 'OPLR', isCapital: false },

    // Yemen airports
    { icao: 'OYAA', name: 'Aden International', country: 'Yemen', countryFlag: '🇾🇪', fir: 'OYSC', isCapital: false },

    // Egypt airports
    { icao: 'HECA', name: 'Cairo International', country: 'Egypt', countryFlag: '🇪🇬', fir: 'HECC', isCapital: true },

    // Azerbaijan airports
    { icao: 'UBBB', name: 'Baku Heydar Aliyev International', country: 'Azerbaijan', countryFlag: '🇦🇿', fir: 'UBBA', isCapital: true },

    // UDDD airports
    { icao: 'UDDD', name: 'Yerevan Zvartnots International', country: 'UDDD', countryFlag: '🇦🇲', fir: 'UDDD', isCapital: true },
];

export const FIRS: FirInfo[] = [
    { icao: 'LCCC', name: 'Nicosia FIR', geojsonCode: 'LCCC' },
    { icao: 'LLLL', name: 'Tel Aviv FIR', geojsonCode: 'LLTA' },
    { icao: 'OAKX', name: 'Kabul FIR', geojsonCode: 'OAKX' },
    { icao: 'OBBB', name: 'Bahrain FIR', geojsonCode: 'OBBB' },
    { icao: 'OEJD', name: 'Jeddah FIR', geojsonCode: 'OEJD' },
    { icao: 'OIIX', name: 'Tehran FIR', geojsonCode: 'OIIX' },
    { icao: 'OJAC', name: 'Amman FIR', geojsonCode: 'OJAC' },
    { icao: 'OPKR', name: 'Karachi FIR', geojsonCode: 'OPKR' },
    { icao: 'OPLR', name: 'Lahore FIR', geojsonCode: 'OPLR' },
    { icao: 'OKAC', name: 'Kuwait FIR', geojsonCode: 'OKAC' },
    { icao: 'OLBB', name: 'Beirut FIR', geojsonCode: 'OLBB' },
    { icao: 'OMAE', name: 'Emirates FIR', geojsonCode: 'OMAE' },
    { icao: 'OOMM', name: 'Muscat FIR', geojsonCode: 'OOMM' },
    { icao: 'ORBB', name: 'Baghdad FIR', geojsonCode: 'ORBB' },
    { icao: 'OSTT', name: 'Damascus FIR', geojsonCode: 'OSTT' },
    { icao: 'OTDF', name: 'Doha FIR', geojsonCode: 'OTDF' }, 
    { icao: 'OYSC', name: "Sana'a FIR", geojsonCode: 'OYSC' },
    { icao: 'HECC', name: 'Cairo FIR', geojsonCode: 'HECC' },
    { icao: 'UBBA', name: 'Baku FIR', geojsonCode: 'UBBA' },

    // { icao: 'UDDD', name: 'Yerevan FIR', geojsonCode: 'UDDD' },
    // { icao: 'UTAV', name: 'Turkmenabat FIR', geojsonCode: 'UTAV' },
    // { icao: 'UTAA', name: 'Ashgabat FIR', geojsonCode: 'UTAA' },
    // { icao: 'UTAT', name: 'DASHOGUZ FIR', geojsonCode: 'UTAT' },
    // { icao: 'UTAK', name: 'TURKMENBASHI FIR', geojsonCode: 'UTAK' },

    // { icao: 'LTAA', name: 'Ankara FIR', geojsonCode: 'LTAA' },
    // { icao: 'LTBB', name: 'Istanbul FIR', geojsonCode: 'LTBB' },
    // { icao: 'VIDF', name: 'Delhi FIR', geojsonCode: 'VIDF' },
    // { icao: 'VABF', name: 'Mumbai FIR', geojsonCode: 'VABF' },
    // { icao: 'VABF', name: 'Mumbai FIR', geojsonCode: 'VABF' },
    // { icao: 'ZSHA', name: 'Shanghai FIR', geojsonCode: 'ZSHA' },

];

export function getFirForAirport(icao: string): string | null {
    const airport = AIRPORTS.find(a => a.icao === icao);
    return airport ? airport.fir : null;
}

export function getAirportsByFir(firIcao: string): string[] {
    return AIRPORTS.filter(a => a.fir === firIcao).map(a => a.icao);
}

export function getAllAirportIcaos(): string[] {
    return AIRPORTS.map(a => a.icao);
}

export function getAllFirIcaos(): string[] {
    return FIRS.map(f => f.icao);
}
export function isIcaoFir(icao: string): boolean {
    return FIRS.some(f => f.icao === icao);
}