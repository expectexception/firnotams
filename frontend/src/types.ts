export type NotamStatus = 'red' | 'orange' | 'green' | 'unknown';

export interface NotamAnalysis {
    aField?: string;
    bField?: string;
    cField?: string;
    dField?: string;
    qCode?: string;
    eField?: string;
    fField?: string;
    gField?: string;
    notamId?: string;
    notamType?: 'N' | 'R' | 'C' | 'S';
    replacedId?: string;
    isActive?: boolean;
    isPermanent?: boolean;
    isEstimated?: boolean;
    startsAtUtc?: string;
    endsAtUtc?: string;
    matchedKeywords?: string[];
    confidence?: 'high' | 'medium' | 'low';
    hasInterference?: boolean;
}

export interface NotamItem {
    id: string;
    text: string;
    status: NotamStatus;
    hasEscat: boolean;
    hasInterference?: boolean;
    analysis?: NotamAnalysis;
}

export interface LocationNotams {
    icao: string;
    status: NotamStatus;
    hasEscat: boolean;
    hasInterference?: boolean;
    notams: NotamItem[];
    error?: string;
    cachedAt: number;
    lastCheckedAt?: number;
    dataSource?: 'scraped-live' | 'db-cache';
}

export interface BulkNotamResponse {
    locations: Record<string, LocationNotams>;
    timestamp: number;
}

export interface FirStatusItem {
    status: NotamStatus;
    hasEscat: boolean;
    hasInterference: boolean;
    airports: string[];
}

export interface BulkFirResponse {
    firs: Record<string, FirStatusItem>;
    timestamp: number;
}

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
    geojsonCode: string;
}

export interface SystemConfig {
    fetchAirports: boolean;
    fetchFirs: boolean;
}

export interface ConfigResponse {
    airports: AirportInfo[];
    firs: FirInfo[];
    config: SystemConfig;
    timestamp: number;
}

export interface SelectedAirport {
    icao: string;
    iata?: string;
    name: string;
    city?: string;
    country?: string;
    firIcao: string;
    firName: string;
    coordinates: [number, number];
}
