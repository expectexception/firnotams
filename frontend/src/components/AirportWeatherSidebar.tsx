import React, { useState } from 'react';
import { X, Wind, Cloud, Thermometer, Droplets, MapPin, Navigation, Info } from 'lucide-react';

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
        <div className="absolute left-4 top-4 bottom-4 z-[1001] w-80 md:w-96 flex flex-col pointer-events-none">
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

                    {/* METAR & TAF Placeholders */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                                <Activity size={16} className="text-blue-500" />
                                Operational Weather
                            </h3>
                            <span className="text-[10px] text-slate-500 font-medium">Coming Soon</span>
                        </div>

                        <div className="space-y-3">
                            {/* METAR Card */}
                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Wind size={40} className="text-blue-500" />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[11px] font-black text-blue-400 tracking-widest uppercase">METAR</span>
                                        <span className="text-[10px] text-slate-600 font-mono">00:00 UTC</span>
                                    </div>
                                    <div className="h-4 w-full bg-white/5 rounded animate-pulse mb-2" />
                                    <div className="h-4 w-2/3 bg-white/5 rounded animate-pulse" />
                                </div>
                            </div>

                            {/* TAF Card */}
                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Cloud size={40} className="text-indigo-500" />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[11px] font-black text-indigo-400 tracking-widest uppercase">TAF</span>
                                        <span className="text-[10px] text-slate-600 font-mono">24H FCST</span>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="h-3 w-full bg-white/5 rounded animate-pulse" />
                                        <div className="h-3 w-5/6 bg-white/5 rounded animate-pulse" />
                                        <div className="h-3 w-4/6 bg-white/5 rounded animate-pulse" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Overall Weather Placeholder */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                            <Info size={16} className="text-emerald-500" />
                            General Conditions
                        </h3>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 flex flex-col items-center text-center">
                                <Thermometer size={20} className="text-emerald-500 mb-2" />
                                <div className="h-4 w-8 bg-white/5 rounded animate-pulse mb-1" />
                                <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Temp</span>
                            </div>
                            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 flex flex-col items-center text-center">
                                <Droplets size={20} className="text-blue-500 mb-2" />
                                <div className="h-4 w-8 bg-white/5 rounded animate-pulse mb-1" />
                                <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Humidity</span>
                            </div>
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

const Activity = ({ size, className }: { size: number, className?: string }) => (
    <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className={className}
    >
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
);

export default AirportWeatherSidebar;
