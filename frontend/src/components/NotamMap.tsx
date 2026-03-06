import React, { useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { FirInfo, LocationNotams, NotamStatus, FirStatusItem } from '../types';

// Fix Leaflet marker icon paths broken by bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

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

// Build lookup: geojsonCode -> FIR icaos[]
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

const NotamMap: React.FC<NotamMapProps> = ({ geoJson, firs, firData, notamData: _notamData, loading, activeFilter = 'all', onFirClick }) => {
    const geoJsonRef = useRef<L.GeoJSON | null>(null);
    const geoLookup = buildGeoLookup(firs);

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
            if (severityRank[currentStatus] > severityRank[worstStatus]) {
                worstStatus = currentStatus;
            }

            if (data?.hasEscat || nd?.hasEscat) hasEscat = true;
            if (data?.hasInterference || nd?.hasInterference) hasInterference = true;
        }

        let isVisible = true;
        if (activeFilter !== 'all') {
            if (activeFilter === 'escat') {
                isVisible = hasEscat;
            } else if (activeFilter === 'interference') {
                isVisible = hasInterference;
            } else {
                isVisible = worstStatus === activeFilter;
            }
        }

        return { status: worstStatus, isVisible, hasInterference, hasEscat };
    }, [firData, _notamData, geoLookup, activeFilter]);

    // Update polygon colors when data changes
    useEffect(() => {
        if (!geoJsonRef.current) return;
        geoJsonRef.current.eachLayer((layer: any) => {
            const { status, isVisible } = getFeatureStatus(layer.feature as GeoJSON.Feature);

            layer.setStyle({
                fillColor: STATUS_FILL[status],
                fillOpacity: isVisible ? (loading ? 0.1 : STATUS_FILL_OPACITY[status]) : 0,
                color: STATUS_STROKE[status],
                weight: isVisible ? (status !== 'unknown' ? 2 : 1) : 0,
                opacity: isVisible ? (status !== 'unknown' ? 0.8 : 0.3) : 0,
                stroke: isVisible,
                fill: isVisible,
            });

            if (layer._path) {
                layer._path.style.pointerEvents = isVisible ? 'auto' : 'none';
            }
        });
    }, [firData, loading, activeFilter, getFeatureStatus]);

    const styleFeature = (feature: GeoJSON.Feature | undefined): L.PathOptions => {
        const { status, isVisible } = getFeatureStatus(feature);

        return {
            fillColor: STATUS_FILL[status],
            fillOpacity: isVisible ? STATUS_FILL_OPACITY[status] : 0,
            color: STATUS_STROKE[status],
            weight: isVisible ? (status !== 'unknown' ? 2 : 1) : 0,
            opacity: isVisible ? (status !== 'unknown' ? 0.8 : 0.3) : 0,
            stroke: isVisible,
            fill: isVisible,
        } as L.PathOptions;
    };

    const onEachFeature = (feature: GeoJSON.Feature, layer: L.Layer) => {
        const icaoCode = feature?.properties?.icaocode as string | undefined;
        const targetIcaos = icaoCode ? geoLookup[icaoCode] : [];

        if (!targetIcaos || targetIcaos.length === 0) return;

        const { status, hasEscat, hasInterference } = getFeatureStatus(feature);

        const statusColor = status === 'green' ? '#22c55e' : status === 'orange' ? '#f59e0b' : status === 'red' ? '#ef4444' : '#94a3b8';
        const statusLabel = status === 'green' ? 'Normal Operations'
            : status === 'orange' ? 'Restricted / PPR'
                : status === 'red' ? 'Closed / Unavailable'
                    : 'No Data Available';

        // Join names for shared polygons
        const participatingFirs = targetIcaos.map(icao => firs.find(f => f.icao === icao)).filter(Boolean);
        const firNamesDisplay = participatingFirs.map(f => f?.name).join(' / ');
        const firIcaosDisplay = participatingFirs.map(f => f?.icao).join(' / ');

        const pathLayer = layer as L.Path;

        // Tooltip on hover
        pathLayer.bindTooltip(
            `<div style="padding:10px 12px; font-family:'Outfit',sans-serif; min-width:180px;">
                <div style="font-weight:800; color:#f1f5f9; font-size:13px;">${firNamesDisplay}</div>
                <div style="font-family:monospace; color:#94a3b8; font-size:10px; margin-top:2px;">${firIcaosDisplay}</div>
                <div style="margin-top:6px; font-weight:600; font-size:11px; color:${statusColor};">${statusLabel}</div>
                ${hasEscat ? `<div style="margin-top:4px; color:#fca5a5; font-size:10px; font-weight:800;">⚡ ESCAT ACTIVE</div>` : ''}
                ${hasInterference ? `<div style="margin-top:4px; color:#c7d2fe; font-size:10px; font-weight:800;">🛰️ GNSS ALERT</div>` : ''}
                <div style="margin-top:6px; color:#475569; font-size:9px; text-transform:uppercase; letter-spacing:0.05em;">Click for NOTAMs</div>
            </div>`,
            { className: 'notam-tooltip', sticky: true, offset: [0, 0], direction: 'auto' }
        );

        pathLayer.on('mouseover', () => {
            const { isVisible } = getFeatureStatus(feature);
            if (!isVisible) return;
            pathLayer.setStyle({ fillOpacity: 0.5, weight: 3, opacity: 1 });
        });
        pathLayer.on('mouseout', () => {
            pathLayer.setStyle(styleFeature(feature));
        });
        pathLayer.on('click', () => {
            const { isVisible } = getFeatureStatus(feature);
            if (!isVisible || targetIcaos.length === 0) return;
            // For shared polygons, trigger click on the first one or we might need a menu
            // But usually the modal shows the targeted FIR. Let's use the first one.
            onFirClick?.(targetIcaos[0]);
        });
    };

    // Filter GeoJSON to only include target FIRs
    const filteredGeoJson: GeoJSON.FeatureCollection | null = geoJson
        ? {
            ...geoJson,
            features: geoJson.features.filter(feature => {
                const code = feature?.properties?.icaocode as string | undefined;
                return code && geoLookup[code] !== undefined;
            }),
        }
        : null;

    return (
        <div className="absolute inset-0 bg-notam-bg z-0">
            {loading && (
                <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-notam-bg/60 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full spinner" />
                        <span className="text-notam-muted text-sm">Loading FIR status…</span>
                    </div>
                </div>
            )}
            <MapContainer
                center={[28, 55]}
                zoom={4}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
                attributionControl={false}
                maxBounds={[[-90, -180], [90, 180]]}
                maxBoundsViscosity={1.0}
                minZoom={3}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    subdomains="abcd"
                    maxZoom={19}
                    noWrap={true}
                />
                {filteredGeoJson && (
                    <GeoJSON
                        key={JSON.stringify(Object.values(firData).map(d => d.status))}
                        data={filteredGeoJson}
                        style={styleFeature}
                        onEachFeature={onEachFeature}
                        ref={(ref) => { geoJsonRef.current = ref; }}
                    />
                )}
            </MapContainer>
        </div>
    );
};

export default NotamMap;
