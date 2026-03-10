import { useState, useEffect, useCallback } from 'react';
import { AirportInfo, FirInfo, SystemConfig, LocationNotams, FirStatusItem, BulkNotamResponse, BulkFirResponse } from '../types';
import { fetchBulkNotams, fetchBulkFirs, fetchConfig } from '../api/notams';
import { selectTop3FirNotams } from '../utils/notamParsers';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useNotamData() {
    const [airports, setAirports] = useState<AirportInfo[]>([]);
    const [firs, setFirs] = useState<FirInfo[]>([]);
    const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
    const [configLoaded, setConfigLoaded] = useState(false);

    const [notamData, setNotamData] = useState<Record<string, LocationNotams>>({});
    const [firData, setFirData] = useState<Record<string, FirStatusItem>>({});
    const [geoJson, setGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
    const [loading, setLoading] = useState(true);
    const [firLoading, setFirLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    // Load System Config first
    useEffect(() => {
        fetchConfig()
            .then(data => {
                setAirports(data.airports);
                setFirs(data.firs);
                setSystemConfig(data.config);
                setConfigLoaded(true);
            })
            .catch(err => {
                console.error('Failed to load system config:', err);
                setError('Unable to connect to the NOTAM service. Please check your connection and try again.');
                setLoading(false);
                setFirLoading(false);
            });
    }, []);

    // Load GeoJSON once
    useEffect(() => {
        fetch('fir.geojson')
            .then(res => res.json())
            .then((data) => {
                setGeoJson(data as GeoJSON.FeatureCollection);
            })
            .catch(err => {
                console.error('Failed to load GeoJSON:', err);
            });
    }, []);

    const loadAllData = useCallback(async (isManual = false) => {
        if (!configLoaded || airports.length === 0) return;

        if (isManual) setRefreshing(true);
        else setLoading(true);

        setError(null);

        try {
            const fetchAirportsEnabled = systemConfig?.fetchAirports !== false;
            const activeAirports = fetchAirportsEnabled ? airports : [];
            const allAirportIcaos = activeAirports.map(a => a.icao);
            const allFirIcaos = firs.map(f => f.icao);

            if (allAirportIcaos.length === 0 && allFirIcaos.length === 0) {
                setLoading(false);
                return;
            }

            const [notamRes, firRes] = await Promise.allSettled([
                fetchBulkNotams([...allAirportIcaos, ...allFirIcaos], isManual),
                fetchBulkFirs(allFirIcaos),
            ]);

            if (notamRes.status === 'fulfilled') {
                const rawData = (notamRes.value as BulkNotamResponse).locations ?? {};
                const processedData: Record<string, LocationNotams> = {};

                for (const [icao, locationData] of Object.entries(rawData)) {
                    const result = selectTop3FirNotams(locationData.notams ?? []);
                    const fallbackFirStatus = firRes.status === 'fulfilled'
                        ? (firRes.value as BulkFirResponse).firs?.[icao]?.status
                        : undefined;
                    const displayNotams = result.notams.length > 0
                        ? result.notams
                        : (locationData.notams ?? []).slice(0, 3);
                    processedData[icao] = {
                        ...locationData,
                        status: result.status !== 'unknown' ? result.status : (fallbackFirStatus ?? locationData.status),
                        hasEscat: result.hasEscat,
                        hasInterference: result.hasInterference || locationData.hasInterference,
                        notams: displayNotams,
                    };
                }

                setNotamData(processedData);

                if (firRes.status === 'fulfilled') {
                    const rawFirData = (firRes.value as BulkFirResponse).firs ?? {};
                    const patchedFirData: Record<string, FirStatusItem> = { ...rawFirData };

                    const severityRank: Record<string, number> = { unknown: 0, green: 1, orange: 2, red: 3 };
                    const worstStatus = (a: string | undefined, b: string | undefined): string => {
                        const ra = severityRank[a ?? 'unknown'] ?? 0;
                        const rb = severityRank[b ?? 'unknown'] ?? 0;
                        return ra >= rb ? (a ?? 'unknown') : (b ?? 'unknown');
                    };

                    for (const [icao, loc] of Object.entries(processedData)) {
                        if (patchedFirData[icao]) {
                            const combinedStatus = worstStatus(patchedFirData[icao].status, loc.status !== 'unknown' ? loc.status : undefined);
                            patchedFirData[icao] = {
                                ...patchedFirData[icao],
                                status: combinedStatus as any,
                                hasEscat: loc.hasEscat || patchedFirData[icao].hasEscat,
                                hasInterference: loc.hasInterference ?? false,
                            };
                        }
                    }
                    setFirData(patchedFirData);
                    setFirLoading(false);
                } else {
                    setFirLoading(false);
                }
            } else {
                const reason = notamRes.reason instanceof Error ? notamRes.reason.message : String(notamRes.reason);
                setError(`Failed to load NOTAM data: ${reason}`);

                if (firRes.status === 'fulfilled') {
                    setFirData((firRes.value as BulkFirResponse).firs ?? {});
                    setFirLoading(false);
                }
            }

            setLastRefresh(new Date());
        } catch (err: any) {
            console.error('Load Error:', err);
            setError(err?.message || 'Unknown error occurred');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [configLoaded, airports, firs, systemConfig]);

    useEffect(() => {
        if (configLoaded) loadAllData();
    }, [configLoaded, loadAllData]);

    useEffect(() => {
        const interval = setInterval(() => loadAllData(), REFRESH_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [loadAllData]);

    return {
        airports,
        firs,
        systemConfig,
        notamData,
        firData,
        geoJson,
        loading,
        firLoading,
        error,
        lastRefresh,
        refreshing,
        loadAllData,
        setError
    };
}
