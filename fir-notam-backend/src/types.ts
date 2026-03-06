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
    isActive: boolean;
    isPermanent: boolean;
    isEstimated: boolean;
    startsAtUtc?: string;
    endsAtUtc?: string;
    matchedKeywords: string[];
    confidence: 'high' | 'medium' | 'low';
}

export interface NotamItem {
    id: string;
    text: string;
    status: NotamStatus;
    hasEscat: boolean;
    hasInterference: boolean;
    analysis?: NotamAnalysis;
}

export interface LocationNotams {
    icao: string;
    status: NotamStatus;
    hasEscat: boolean;
    hasInterference: boolean;
    notams: NotamItem[];
    error?: string;
    cachedAt: number;
    lastCheckedAt?: number;
    lastSuccessfulUpdate?: number;
    isComplete?: boolean;
    dataSource?: 'db-cache' | 'db-stale' | 'scraped-live' | 'api-live' | 'mixed-live';
}

export interface BulkNotamResponse {
    locations: Record<string, LocationNotams>;
    timestamp: number;
}

export interface FaaNotam {
    properties?: {
        coreNOTAMData?: {
            notam?: {
                id?: string;
                text?: string;
                location?: string;
                classification?: string;
                schedule?: string;
            }
        }
    }
}

export interface FaaApiResponse {
    items?: FaaNotam[];
    pageSize?: number;
    pageNum?: number;
    totalCount?: number;
}
