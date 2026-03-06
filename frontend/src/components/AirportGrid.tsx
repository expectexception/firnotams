import React from 'react';
import { AirportInfo, LocationNotams } from '../types';
import FlipCard from './FlipCard';
import { MapPin, Star } from 'lucide-react';

interface AirportGridProps {
    airports: AirportInfo[];
    notamData: Record<string, LocationNotams>;
    loading: boolean;
}

function groupByCountry(airports: AirportInfo[]): Record<string, AirportInfo[]> {
    const groups: Record<string, AirportInfo[]> = {};
    for (const airport of airports) {
        if (!groups[airport.country]) groups[airport.country] = [];
        groups[airport.country].push(airport);
    }
    return groups;
}

const AirportGrid: React.FC<AirportGridProps> = ({ airports, notamData, loading }) => {
    const capitalAirports = airports.filter(a => a.isCapital);
    const nonCapitalAirports = airports.filter(a => !a.isCapital);
    const countryGroups = groupByCountry(nonCapitalAirports);
    const countries = Object.keys(countryGroups).sort();

    return (
        <div className="space-y-8">
            {/* Capital airports section */}
            {capitalAirports.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <Star size={15} className="text-yellow-400" fill="currentColor" />
                        <h2 className="text-sm font-bold text-notam-text uppercase tracking-widest">
                            Capital / Primary Airports
                        </h2>
                        <span className="text-xs text-notam-muted bg-notam-surface px-2 py-0.5 rounded-full border border-notam-border">
                            {capitalAirports.length}
                        </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {capitalAirports.map(airport => (
                            <FlipCard
                                key={airport.icao}
                                airport={airport}
                                notamData={notamData[airport.icao] ?? null}
                                loading={loading && !notamData[airport.icao]}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Divider */}
            {capitalAirports.length > 0 && nonCapitalAirports.length > 0 && (
                <div className="border-t border-notam-border/50" />
            )}

            {/* Country groups */}
            {nonCapitalAirports.length > 0 && (
                <div className="space-y-6">
                    <div className="flex items-center gap-2">
                        <MapPin size={15} className="text-notam-muted" />
                        <h2 className="text-sm font-bold text-notam-text uppercase tracking-widest">
                            All Airports by Country
                        </h2>
                        <span className="text-xs text-notam-muted bg-notam-surface px-2 py-0.5 rounded-full border border-notam-border">
                            {nonCapitalAirports.length}
                        </span>
                    </div>

                    {countries.map(country => {
                        const airportsInCountry = countryGroups[country];
                        const flag = airportsInCountry[0]?.countryFlag ?? '';
                        return (
                            <div key={country}>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-lg">{flag}</span>
                                    <h3 className="text-xs font-semibold text-notam-muted uppercase tracking-wider">
                                        {country}
                                    </h3>
                                    <div className="flex-1 h-px bg-notam-border/50" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {airportsInCountry.map(airport => (
                                        <FlipCard
                                            key={airport.icao}
                                            airport={airport}
                                            notamData={notamData[airport.icao] ?? null}
                                            loading={loading && !notamData[airport.icao]}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default AirportGrid;
