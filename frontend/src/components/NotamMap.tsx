import React, { useMemo, useCallback, useState, useRef, memo, useEffect } from 'react';
// @ts-ignore
import Map, { Source, Layer, MapRef, Popup } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FirInfo, LocationNotams, NotamStatus, FirStatusItem, SelectedAirport } from '../types';
import AirportSearchBar from './AirportSearchBar';

interface NotamMapProps {
    geoJson: GeoJSON.FeatureCollection | null;
    firs: FirInfo[];
    firData: Record<string, FirStatusItem>;
    notamData: Record<string, LocationNotams>;
    loading: boolean;
    activeFilter?: NotamStatus | 'all' | 'escat' | 'interference';
    onFirClick?: (firIcao: string) => void;
    onAirportClick?: (airport: SelectedAirport) => void;
}

const STATUS_FILL: Record<NotamStatus, string> = {
    green: '#16a34a',
    orange: '#d97706',
    red: '#dc2626',
    unknown: '#94a3b8',
};

const STATUS_FILL_OPACITY: Record<NotamStatus, number> = {
    green: 0.25,
    orange: 0.3,
    red: 0.35,
    unknown: 0.1,
};

const STATUS_STROKE: Record<NotamStatus, string> = {
    green: '#22c55e',
    orange: '#f59e0b',
    red: '#ef4444',
    unknown: '#cbd5e1',
};

const MAP_STYLE: any = {
    version: 8,
    sources: {
        cartodb: {
            type: 'raster',
            tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
            tileSize: 256
        }
    },
    layers: [
        {
            id: 'background',
            type: 'background',
            paint: { 'background-color': 'rgba(0,0,0,0)' }
        },
        {
            id: 'cartodb-tiles',
            type: 'raster',
            source: 'cartodb',
            minzoom: 0,
            maxzoom: 19
        }
    ]
};

const MAP_PROJECTION: any = { type: 'globe' };
const INTERACTIVE_LAYER_IDS = ['fir-fills', 'airport-hit-area'];
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%', background: 'transparent' };

const pointInRing = (point: [number, number], ring: number[][]): boolean => {
    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];

        const intersects = ((yi > y) !== (yj > y)) &&
            (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
        if (intersects) inside = !inside;
    }

    return inside;
};

interface AirportPoint {
    icao: string;
    iata?: string;
    name: string;
    city?: string;
    country?: string;
    lat: number;
    lon: number;
}

interface FirAirportGroup {
    icao: string;
    name: string;
    geojsonCode?: string;
    airports: AirportPoint[];
}

interface FirAirportsData {
    firs: FirAirportGroup[];
}

const isPointInGeometry = (point: [number, number], geometry: GeoJSON.Geometry): boolean => {
    if (geometry.type === 'Polygon') {
        const [outer, ...holes] = geometry.coordinates as number[][][];
        if (!outer || !pointInRing(point, outer)) return false;
        return !holes.some(hole => pointInRing(point, hole));
    }

    if (geometry.type === 'MultiPolygon') {
        return (geometry.coordinates as number[][][][]).some((polygon) => {
            const [outer, ...holes] = polygon;
            if (!outer || !pointInRing(point, outer)) return false;
            return !holes.some(hole => pointInRing(point, hole));
        });
    }

    return false;
};

const NotamMap: React.FC<NotamMapProps> = memo(({ geoJson, firs, firData, notamData: _notamData, loading, activeFilter = 'all', onFirClick, onAirportClick }) => {
    const mapRef = useRef<MapRef>(null);
    const [hoverInfo, setHoverInfo] = useState<{ feature: any, x: number, y: number } | null>(null);
    const [airportData, setAirportData] = useState<FirAirportsData | null>(null);
    const [selectedAirportInternal, setSelectedAirportInternal] = useState<SelectedAirport | null>(null);

    useEffect(() => {
        let isMounted = true;

        const loadAirports = async () => {
            try {
                const airportsUrl = `${import.meta.env.BASE_URL}fir_airports.json`;
                const res = await fetch(airportsUrl);
                if (!res.ok) return;
                const json = await res.json() as FirAirportsData;
                if (isMounted) setAirportData(json);
            } catch {
                // Keep map functional even if airport overlay data fails to load.
            }
        };

        loadAirports();

        return () => {
            isMounted = false;
        };
    }, []);
    
    const geoLookup = useMemo(() => {
        const map: Record<string, string[]> = {};
        for (const fir of firs) {
            if (fir.geojsonCode) {
                if (!map[fir.geojsonCode]) map[fir.geojsonCode] = [];
                map[fir.geojsonCode].push(fir.icao);
            }
        }
        return map;
    }, [firs]);

    const featureStatusMap = useMemo(() => {
        const statusMap: Record<string, { status: NotamStatus, hasInterference: boolean, hasEscat: boolean }> = {};
        const severityRank: Record<string, number> = { unknown: 0, green: 1, orange: 2, red: 3 };

        if (!geoJson?.features) return statusMap;

        for (const feature of geoJson.features) {
            const icaoCode = feature.properties?.icaocode;
            if (!icaoCode) continue;

            const targetIcaos = geoLookup[icaoCode];
            if (!targetIcaos || targetIcaos.length === 0) {
                statusMap[icaoCode] = { status: 'unknown', hasInterference: false, hasEscat: false };
                continue;
            }

            let worstStatus: NotamStatus = 'unknown';
            let hasInterference = false;
            let hasEscat = false;

            for (const firIcao of targetIcaos) {
                const data = firData[firIcao];
                const nd = _notamData[firIcao];
                const currentStatus = data?.status ?? 'unknown';
                if (severityRank[currentStatus] > severityRank[worstStatus]) worstStatus = currentStatus;
                if (data?.hasEscat || nd?.hasEscat) hasEscat = true;
                if (data?.hasInterference || nd?.hasInterference) hasInterference = true;
            }

            statusMap[icaoCode] = { status: worstStatus, hasInterference, hasEscat };
        }
        return statusMap;
    }, [geoJson, geoLookup, firData, _notamData]);

    const styledGeoJson = useMemo(() => {
        if (!geoJson?.features) return null;

        const features = geoJson.features.map(f => {
            const icaoCode = f.properties?.icaocode as string | undefined;
            if (!icaoCode || !geoLookup[icaoCode]) return null;

            const { status, hasEscat, hasInterference } = featureStatusMap[icaoCode] || { status: 'unknown', hasEscat: false, hasInterference: false };

            let isVisible = true;
            if (activeFilter !== 'all') {
                if (activeFilter === 'escat') isVisible = hasEscat;
                else if (activeFilter === 'interference') isVisible = hasInterference;
                else isVisible = status === activeFilter;
            }

            if (!isVisible) return null;

            return {
                ...f,
                properties: {
                    ...f.properties,
                    fillColor: STATUS_FILL[status] || '#94a3b8',
                    fillOpacity: loading ? 0.1 : (STATUS_FILL_OPACITY[status] || 0.1),
                    strokeColor: STATUS_STROKE[status] || '#cbd5e1',
                    strokeOpacity: status !== 'unknown' ? 0.8 : 0.3,
                    strokeWidth: status !== 'unknown' ? 2 : 1,
                    status,
                    hasEscat,
                    hasInterference
                }
            };
        }).filter(Boolean) as GeoJSON.Feature[];

        return { ...geoJson, features };
    }, [geoJson, featureStatusMap, loading, activeFilter, geoLookup]);

    const airportGeoJson = useMemo<GeoJSON.FeatureCollection | null>(() => {
        if (!airportData?.firs?.length || !geoJson?.features?.length) return null;

        const firMetaByIcao = new globalThis.Map<string, FirInfo>();
        firs.forEach((fir) => firMetaByIcao.set(fir.icao, fir));

        const firFeaturesByGeoCode = new globalThis.Map<string, GeoJSON.Feature[]>();
        geoJson.features.forEach((feature) => {
            const code = feature.properties?.icaocode as string | undefined;
            if (!code) return;
            const list = firFeaturesByGeoCode.get(code) ?? [];
            list.push(feature);
            firFeaturesByGeoCode.set(code, list);
        });

        const features: GeoJSON.Feature[] = [];

        airportData.firs.forEach((group) => {
            const firMeta = firMetaByIcao.get(group.icao);
            const geoCode = firMeta?.geojsonCode || group.geojsonCode || group.icao;
            const firFeatures = firFeaturesByGeoCode.get(geoCode) ?? [];

            group.airports.forEach((airport) => {
                if (typeof airport.lon !== 'number' || typeof airport.lat !== 'number') return;
                const point: [number, number] = [airport.lon, airport.lat];

                const isInsideAssociatedFir = firFeatures.length > 0
                    ? firFeatures.some((firFeature: GeoJSON.Feature) => {
                        if (!firFeature.geometry) return false;
                        return isPointInGeometry(point, firFeature.geometry);
                    })
                    : true;

                if (!isInsideAssociatedFir) return;

                features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: point,
                    },
                    properties: {
                        type: 'airport',
                        icao: airport.icao,
                        iata: airport.iata || '',
                        name: airport.name,
                        city: airport.city || '',
                        country: airport.country || '',
                        firIcao: group.icao,
                        firName: group.name || firMeta?.name || group.icao,
                    },
                });
            });
        });

        return {
            type: 'FeatureCollection',
            features,
        };
    }, [airportData, geoJson, firs]);

    const flattenedAirports = useMemo(() => {
        if (!airportData?.firs) return [];
        return airportData.firs.flatMap(group => 
            group.airports.map(a => ({
                ...a,
                firIcao: group.icao,
                firName: group.name
            }))
        );
    }, [airportData]);

    const handleAirportSearch = useCallback((airport: any) => {
        if (!mapRef.current) return;

        mapRef.current.flyTo({
            center: [airport.lon, airport.lat],
            zoom: 8,
            duration: 3000,
            essential: true
        });

        const airportObj: SelectedAirport = {
            icao: airport.icao,
            iata: airport.iata,
            name: airport.name,
            city: airport.city,
            country: airport.country,
            firIcao: airport.firIcao,
            firName: airport.firName,
            coordinates: [airport.lon, airport.lat]
        };
        setSelectedAirportInternal(airportObj);
        onAirportClick?.(airportObj);
    }, [onAirportClick]);

    const onHover = useCallback((event: any) => {
        const { features, point } = event;
        const hoveredFeature = features && features[0];
        if (hoveredFeature) {
            setHoverInfo({ feature: hoveredFeature, x: point.x, y: point.y });
            if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'pointer';
        } else {
            setHoverInfo(null);
            if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
        }
    }, []);

    const onClick = useCallback((event: any) => {
        const feature = event.features && event.features[0];
        if (feature) {
            if (feature.properties?.type === 'airport') {
                const coords = feature.geometry?.coordinates as [number, number] | undefined;
                if (!coords) return;

                const airportObj: SelectedAirport = {
                    icao: String(feature.properties?.icao || ''),
                    iata: String(feature.properties?.iata || ''),
                    name: String(feature.properties?.name || 'Airport'),
                    city: String(feature.properties?.city || ''),
                    country: String(feature.properties?.country || ''),
                    firIcao: String(feature.properties?.firIcao || ''),
                    firName: String(feature.properties?.firName || ''),
                    coordinates: coords,
                };
                setSelectedAirportInternal(airportObj);
                onAirportClick?.(airportObj);
                return;
            }

            const icaoCode = feature.properties?.icaocode;
            const targetIcaos = icaoCode ? geoLookup[icaoCode] : [];
            if (targetIcaos && targetIcaos.length > 0) onFirClick?.(targetIcaos[0]);
        }
    }, [geoLookup, onFirClick]);

    const renderTooltip = () => {
        if (!hoverInfo) return null;

        const feature = hoverInfo.feature;

        if (feature.properties?.type === 'airport') {
            const airportName = feature.properties?.name as string;
            const airportIcao = feature.properties?.icao as string;
            const airportIata = feature.properties?.iata as string;
            const city = feature.properties?.city as string;
            const country = feature.properties?.country as string;
            const firName = feature.properties?.firName as string;
            const firIcao = feature.properties?.firIcao as string;

            return (
                <div
                    className="pointer-events-none absolute z-[1000]"
                    style={{
                        left: hoverInfo.x,
                        top: hoverInfo.y,
                        transform: 'translate(-50%, calc(-100% - 14px))',
                    }}
                >
                    <div className="relative overflow-hidden rounded-xl border border-cyan-400/25 bg-slate-950/95 shadow-[0_8px_32px_rgba(6,182,212,0.25)] backdrop-blur-xl"
                        style={{ minWidth: '220px', maxWidth: '280px' }}
                    >
                        <div className="h-[2.5px] w-full bg-cyan-400/80" />
                        <div className="px-3.5 py-3">
                            <p className="truncate text-[13px] font-semibold leading-snug tracking-tight text-slate-100">{airportName}</p>
                            <p className="mt-0.5 font-mono text-[10px] tracking-[0.1em] text-cyan-300">{airportIcao}{airportIata ? ` / ${airportIata}` : ''}</p>
                            <p className="mt-1 text-[10.5px] text-slate-300">{city}{country ? `, ${country}` : ''}</p>
                            <div className="my-2 h-px bg-white/[0.06]" />
                            <p className="text-[10.5px] text-slate-400">Associated FIR: <span className="text-slate-200">{firName} ({firIcao})</span></p>
                            <p className="mt-2 text-[9.5px] font-medium uppercase tracking-[0.1em] text-cyan-300">Click to open airport card</p>
                        </div>
                    </div>
                    <div className="absolute left-1/2 h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-slate-950" />
                </div>
            );
        }

        const icaoCode = feature.properties?.icaocode;
        const targetIcaos = icaoCode ? geoLookup[icaoCode] : [];
        if (!targetIcaos || targetIcaos.length === 0) return null;

        const { status, hasEscat, hasInterference } = feature.properties;

        const statusStyles: Record<string, { label: string; dotClass: string; accentClass: string; pillClass: string }> = {
            green:   {
                label:       'Normal Operations',
                dotClass:    'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]',
                accentClass: 'bg-green-400',
                pillClass:   'bg-green-500/10 text-green-400 border border-green-500/20 ring-1 ring-green-500/10',
            },
            orange:  {
                label:       'Restricted / PPR',
                dotClass:    'bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.8)]',
                accentClass: 'bg-orange-400',
                pillClass:   'bg-orange-500/10 text-orange-400 border border-orange-500/20 ring-1 ring-orange-500/10',
            },
            red:     {
                label:       'Closed / Unavailable',
                dotClass:    'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]',
                accentClass: 'bg-red-400',
                pillClass:   'bg-red-500/10 text-red-400 border border-red-500/20 ring-1 ring-red-500/10',
            },
            unknown: {
                label:       'No Data Available',
                dotClass:    'bg-slate-500',
                accentClass: 'bg-slate-600',
                pillClass:   'bg-slate-500/10 text-slate-400 border border-slate-500/20',
            },
        };
        const ss = statusStyles[status] ?? statusStyles.unknown;

        const participatingFirs = targetIcaos.map((icao: string) => firs.find(f => f.icao === icao)).filter(Boolean);
        const firNamesDisplay = participatingFirs.map((f: any) => f?.name).join(' · ');
        const firIcaosDisplay = participatingFirs.map((f: any) => f?.icao).join(' / ');

        return (
            <div
                className="pointer-events-none absolute z-[1000]"
                style={{
                    left: hoverInfo.x,
                    top: hoverInfo.y,
                    transform: 'translate(-50%, calc(-100% - 14px))',
                }}
            >
                <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-slate-950/95 shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-xl"
                    style={{ minWidth: '210px', maxWidth: '268px' }}
                >
                    <div className={`h-[2.5px] w-full ${ss.accentClass} opacity-70`} />
                    <div className="px-3.5 py-3">
                        <div className="flex items-start gap-2.5">
                            <div className={`mt-[5px] h-2 w-2 flex-shrink-0 rounded-full ${ss.dotClass}`} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-semibold leading-snug tracking-tight text-slate-100">
                                    {firNamesDisplay}
                                </p>
                                <p className="mt-0.5 font-mono text-[10px] tracking-[0.1em] text-slate-500">
                                    {firIcaosDisplay}
                                </p>
                            </div>
                        </div>
                        <div className="my-2.5 h-px bg-white/[0.06]" />
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-semibold tracking-wide ${ss.pillClass}`}>
                            {ss.label}
                        </span>
                        {(hasEscat || hasInterference) && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {hasEscat && (
                                    <span className="inline-flex items-center gap-1 rounded-md border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-red-400">
                                        ⚡ ESCAT
                                    </span>
                                )}
                                {hasInterference && (
                                    <span className="inline-flex items-center gap-1 rounded-md border border-indigo-400/25 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-indigo-400">
                                        🛰 GNSS
                                    </span>
                                )}
                            </div>
                        )}
                        <p className="mt-2.5 text-[9.5px] font-medium uppercase tracking-[0.1em] text-slate-600">
                            Click to view NOTAMs →
                        </p>
                    </div>
                </div>
                <div className="absolute left-1/2 h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-slate-950" />
            </div>
        );
    };

    return (
        <div className="absolute inset-0 z-0 overflow-hidden bg-[#040914]">
            <div
                className="pointer-events-none absolute inset-0 z-0"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='400' height='400' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23FFFFFF'%3E%3Ccircle cx='35' cy='35' r='1' opacity='0.8'/%3E%3Ccircle cx='180' cy='50' r='0.5' opacity='0.4'/%3E%3Ccircle cx='320' cy='80' r='1.5' opacity='0.6'/%3E%3Ccircle cx='90' cy='150' r='0.5' opacity='0.7'/%3E%3Ccircle cx='250' cy='210' r='1' opacity='0.5'/%3E%3Ccircle cx='50' cy='280' r='0.5' opacity='0.4'/%3E%3Ccircle cx='350' cy='330' r='1' opacity='0.8'/%3E%3Ccircle cx='150' cy='360' r='0.5' opacity='0.6'/%3E%3Ccircle cx='280' cy='20' r='0.5' opacity='0.5'/%3E%3Ccircle cx='15' cy='180' r='1' opacity='0.3'/%3E%3Ccircle cx='210' cy='310' r='0.5' opacity='0.8'/%3E%3Ccircle cx='380' cy='150' r='1' opacity='0.5'/%3E%3C/g%3E%3C/svg%3E")`,
                    backgroundSize: '400px 400px',
                    backgroundRepeat: 'repeat',
                }}
            />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(56,189,248,0.04),transparent_40%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(129,140,248,0.05),transparent_50%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_85%,rgba(16,185,129,0.03),transparent_40%)]" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[80vh] w-[80vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/10 blur-[130px]" />
            {loading && (
                <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-3">
                        <div className="relative h-10 w-10">
                            <div className="absolute inset-0 rounded-full border-2 border-slate-700/50" />
                            <div className="absolute inset-0 rounded-full border-2 border-t-blue-400 border-r-transparent border-b-transparent border-l-transparent spinner" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_#60a5fa]" />
                            </div>
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[13px] font-medium tracking-wide text-slate-300">Loading FIR status</span>
                            <span className="text-[11px] text-slate-600">Fetching airspace data…</span>
                        </div>
                    </div>
                </div>
            )}

            <Map
                attributionControl={false}
                ref={mapRef}
                mapLib={maplibregl}
                initialViewState={{ longitude: 55, latitude: 28, zoom: 2.5 }}
                mapStyle={MAP_STYLE}
                style={MAP_CONTAINER_STYLE}
                interactiveLayerIds={INTERACTIVE_LAYER_IDS}
                onMouseMove={onHover}
                onMouseLeave={() => {
                    setHoverInfo(null);
                    if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
                }}
                onClick={onClick}
                onLoad={(e) => {
                    const map = e.target;
                    
                    // Create a custom airport icon (airplane)
                    const svgString = `
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="9" stroke="#06b6d4" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="12" cy="12" r="4" stroke="#06b6d4" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M12 12H12.01" stroke="#06b6d4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
                    `;
                    
                    const blob = new Blob([svgString], { type: 'image/svg+xml' });
                    const url = URL.createObjectURL(blob);
                    const img = new Image();
                    img.src = url;
                    img.onload = () => {
                        if (!map.hasImage('airport-icon')) {
                            map.addImage('airport-icon', img);
                        }
                    };
                }}
                projection={MAP_PROJECTION}
            >
                {styledGeoJson && (
                    <Source id="firs" type="geojson" data={styledGeoJson as any}>
                        <Layer
                            id="fir-fills"
                            type="fill"
                            paint={{
                                'fill-color': ['get', 'fillColor'],
                                'fill-opacity': [
                                    'case',
                                    ['boolean', ['feature-state', 'hover'], false],
                                    0.4,
                                    ['get', 'fillOpacity']
                                ]
                            }}
                        />
                        <Layer
                            id="fir-borders"
                            type="line"
                            paint={{
                                'line-color': ['get', 'strokeColor'],
                                'line-opacity': ['get', 'strokeOpacity'],
                                'line-width': ['get', 'strokeWidth']
                            }}
                        />
                    </Source>
                )}
                
                {airportGeoJson && (
                    <Source id="airports" type="geojson" data={airportGeoJson as any}>
                        <Layer
                            id="airport-hit-area"
                            type="circle"
                            paint={{
                                'circle-radius': 14,
                                'circle-color': 'rgba(0,0,0,0)',
                            }}
                        />
                        <Layer
                            id="airport-icons"
                            type="symbol"
                            layout={{
                                'icon-image': 'airport-icon',
                                'icon-size': [
                                    'interpolate',
                                    ['linear'],
                                    ['zoom'],
                                    2, 0.6,
                                    5, 0.8,
                                    8, 1.0
                                ],
                                'icon-allow-overlap': true,
                                'text-field': ['get', 'icao'],
                                'text-font': ['Open Sans Semibold'],
                                'text-size': [
                                    'interpolate',
                                    ['linear'],
                                    ['zoom'],
                                    4, 9,
                                    8, 11
                                ],
                                'text-offset': [0, 1.5],
                                'text-anchor': 'top',
                                'text-allow-overlap': false,
                            }}
                            paint={{
                                'text-color': '#f1f5f9',
                                'text-halo-color': '#0f172a',
                                'text-halo-width': 1.6,
                                'icon-opacity': [
                                    'interpolate',
                                    ['linear'],
                                    ['zoom'],
                                    2, 0.8,
                                    5, 1
                                ]
                            }}
                        />
                    </Source>
                )}
               
                {renderTooltip()}
                <AirportSearchBar airports={flattenedAirports} onSelect={handleAirportSearch} />
            </Map>
        </div>
    );
});

export default NotamMap;
