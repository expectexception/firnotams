import React, { useMemo, useCallback, useState, useRef } from 'react';
// @ts-ignore
import Map, { Source, Layer, MapRef } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FirInfo, LocationNotams, NotamStatus, FirStatusItem } from '../types';

interface NotamMapProps {
    geoJson: GeoJSON.FeatureCollection | null;
    firs: FirInfo[];
    firData: Record<string, FirStatusItem>;
    notamData: Record<string, LocationNotams>;
    loading: boolean;
    activeFilter?: NotamStatus | 'all' | 'escat' | 'interference';
    onFirClick?: (firIcao: string) => void;
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

function buildGeoLookup(firs: FirInfo[]): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    for (const fir of firs) {
        if (fir.geojsonCode) {
            if (!map[fir.geojsonCode]) map[fir.geojsonCode] = [];
            map[fir.geojsonCode].push(fir.icao);
        }
    }
    return map;
}

const MAP_STYLE: any = {
    version: 8,
    sources: {
        cartodb: {
            type: 'raster',
            tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; CARTO'
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
const INTERACTIVE_LAYER_IDS = ['fir-fills'];
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%', background: 'transparent' };

const NotamMap: React.FC<NotamMapProps> = ({ geoJson, firs, firData, notamData: _notamData, loading, activeFilter = 'all', onFirClick }) => {
    const mapRef = useRef<MapRef>(null);
    const [hoverInfo, setHoverInfo] = useState<{ feature: any, x: number, y: number } | null>(null);
    const geoLookup = useMemo(() => buildGeoLookup(firs), [firs]);

    const getFeatureStatus = useCallback((feature: GeoJSON.Feature | undefined): { status: NotamStatus, isVisible: boolean, hasInterference: boolean, hasEscat: boolean } => {
        const icaoCode = feature?.properties?.icaocode;
        const targetIcaos = icaoCode ? geoLookup[icaoCode] : [];

        if (!targetIcaos || targetIcaos.length === 0) {
            return { status: 'unknown', isVisible: activeFilter === 'all', hasInterference: false, hasEscat: false };
        }

        let worstStatus: NotamStatus = 'unknown';
        let hasInterference = false;
        let hasEscat = false;

        const severityRank: Record<string, number> = { unknown: 0, green: 1, orange: 2, red: 3 };

        for (const firIcao of targetIcaos) {
            const data = firData[firIcao];
            const nd = _notamData[firIcao];
            const currentStatus = data?.status ?? 'unknown';
            if (severityRank[currentStatus] > severityRank[worstStatus]) worstStatus = currentStatus;
            if (data?.hasEscat || nd?.hasEscat) hasEscat = true;
            if (data?.hasInterference || nd?.hasInterference) hasInterference = true;
        }

        let isVisible = true;
        if (activeFilter !== 'all') {
            if (activeFilter === 'escat') isVisible = hasEscat;
            else if (activeFilter === 'interference') isVisible = hasInterference;
            else isVisible = worstStatus === activeFilter;
        }

        return { status: worstStatus, isVisible, hasInterference, hasEscat };
    }, [firData, _notamData, geoLookup, activeFilter]);

    const styledGeoJson = useMemo(() => {
        if (!geoJson?.features) return null;

        const features = geoJson.features.map(f => {
            const { status, isVisible, hasEscat, hasInterference } = getFeatureStatus(f as GeoJSON.Feature);
            const icaoCode = f.properties?.icaocode as string | undefined;
            const hasTargets = icaoCode && geoLookup[icaoCode];
            if (!isVisible || !hasTargets) return null;

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
    }, [geoJson, getFeatureStatus, loading, geoLookup]);

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
            const icaoCode = feature.properties?.icaocode;
            const targetIcaos = icaoCode ? geoLookup[icaoCode] : [];
            if (targetIcaos && targetIcaos.length > 0) onFirClick?.(targetIcaos[0]);
        }
    }, [geoLookup, onFirClick]);

    const renderTooltip = () => {
        if (!hoverInfo) return null;

        const feature = hoverInfo.feature;
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
                    {/* Coloured top accent bar */}
                    <div className={`h-[2.5px] w-full ${ss.accentClass} opacity-70`} />

                    <div className="px-3.5 py-3">
                        {/* FIR name row */}
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

                        {/* Separator */}
                        <div className="my-2.5 h-px bg-white/[0.06]" />

                        {/* Status pill */}
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-semibold tracking-wide ${ss.pillClass}`}>
                            {ss.label}
                        </span>

                        {/* Alert badges */}
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

                        {/* CTA hint */}
                        <p className="mt-2.5 text-[9.5px] font-medium uppercase tracking-[0.1em] text-slate-600">
                            Click to view NOTAMs →
                        </p>
                    </div>
                </div>

                {/* Downward arrow */}
                <div className="absolute left-1/2 h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-slate-950" />
            </div>
        );
    };

    return (
        <div className="absolute inset-0 z-0 overflow-hidden bg-[#040914]">

            {/* Star field */}
            <div
                className="pointer-events-none absolute inset-0 z-0"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='400' height='400' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23FFFFFF'%3E%3Ccircle cx='35' cy='35' r='1' opacity='0.8'/%3E%3Ccircle cx='180' cy='50' r='0.5' opacity='0.4'/%3E%3Ccircle cx='320' cy='80' r='1.5' opacity='0.6'/%3E%3Ccircle cx='90' cy='150' r='0.5' opacity='0.7'/%3E%3Ccircle cx='250' cy='210' r='1' opacity='0.5'/%3E%3Ccircle cx='50' cy='280' r='0.5' opacity='0.4'/%3E%3Ccircle cx='350' cy='330' r='1' opacity='0.8'/%3E%3Ccircle cx='150' cy='360' r='0.5' opacity='0.6'/%3E%3Ccircle cx='280' cy='20' r='0.5' opacity='0.5'/%3E%3Ccircle cx='15' cy='180' r='1' opacity='0.3'/%3E%3Ccircle cx='210' cy='310' r='0.5' opacity='0.8'/%3E%3Ccircle cx='380' cy='150' r='1' opacity='0.5'/%3E%3C/g%3E%3C/svg%3E")`,
                    backgroundSize: '400px 400px',
                    backgroundRepeat: 'repeat',
                }}
            />

            {/* Nebula gradients */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(56,189,248,0.04),transparent_40%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(129,140,248,0.05),transparent_50%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_85%,rgba(16,185,129,0.03),transparent_40%)]" />

            {/* Globe ambient glow */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[80vh] w-[80vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/10 blur-[130px]" />

            {/* Loading overlay */}
            {loading && (
                <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-3">
                        {/* Spinner */}
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
                {renderTooltip()}
            </Map>
        </div>
    );
};

export default NotamMap;