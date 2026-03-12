import React, { useState } from 'react';
import { X, Wind, Cloud, Thermometer, Droplets, MapPin, Navigation, Info, Activity } from 'lucide-react';
import LiveApplicability from './weather/LiveApplicability';

interface SelectedAirport {
    icao: string;
    iata?: string;
    name: string;
    city?: string;
    country?: string;
    firIcao: string;
    firName: string;
    coordinates: [number, number];
}

interface AirportWeatherSidebarProps {
    airport: SelectedAirport | null;
    onClose: () => void;
}

const AirportWeatherSidebar: React.FC<AirportWeatherSidebarProps> = ({ airport, onClose }) => {
    if (!airport) return null;

    return (
        <div className="absolute left-4 top-4 bottom-4 z-[1001] w-[calc(100%-2rem)] max-w-sm md:max-w-md lg:max-w-2xl flex flex-col pointer-events-none transition-all duration-500">
            <div className="flex-1 bg-slate-950/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col pointer-events-auto animate-in slide-in-from-left duration-500 ease-out fill-mode-forwards">
                {/* Header */}
                <div className="relative h-32 flex-shrink-0">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-indigo-600/20" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,0.15),transparent_70%)]" />
                    
                    <button 
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 rounded-xl bg-black/20 hover:bg-black/40 text-slate-400 hover:text-white transition-all border border-white/5 z-10"
                    >
                        <X size={18} />
                    </button>

                    <div className="absolute bottom-4 left-6 right-6">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-[10px] font-black tracking-widest text-blue-400 uppercase">
                                {airport.icao}
                            </span>
                            {airport.iata && (
                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-white/5 text-[10px] font-black tracking-widest text-slate-400 uppercase">
                                    {airport.iata}
                                </span>
                            )}
                        </div>
                        <h2 className="text-xl font-bold text-white truncate leading-tight">
                            {airport.name}
                        </h2>
                        <div className="flex items-center gap-1.5 text-slate-400 mt-0.5">
                            <MapPin size={12} className="text-blue-500/60" />
                            <span className="text-xs font-medium">{airport.city}{airport.country ? `, ${airport.country}` : ''}</span>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                    {/* Location Info */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Coordinates</p>
                            <p className="text-sm font-mono text-slate-200">
                                {airport.coordinates[1].toFixed(4)}°, {airport.coordinates[0].toFixed(4)}°
                            </p>
                        </div>
                        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">FIR</p>
                            <p className="text-sm font-semibold text-slate-200 truncate" title={airport.firName}>
                                {airport.firName}
                            </p>
                            <p className="text-[10px] font-mono text-blue-400/60">{airport.firIcao}</p>
                        </div>
                    </div>

                    {/* Operational Weather - Live Applicability */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                                <Activity size={16} className="text-blue-500" />
                                Weather Forecast
                            </h3>
                            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">Live</span>
                        </div>

                        <div className="mt-4">
                            <LiveApplicability initialIcao={airport.icao} />
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-900/40 border-t border-white/5 text-center">
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em]">
                        Operational Awareness Dashboard
                    </p>
                </div>
            </div>
        </div>
    );
};


export default AirportWeatherSidebar;
