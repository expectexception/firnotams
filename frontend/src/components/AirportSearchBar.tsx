import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, MapPin, X, Plane, Globe } from 'lucide-react';

interface Airport {
    icao: string;
    iata?: string;
    name: string;
    city?: string;
    country?: string;
    lat: number;
    lon: number;
    firIcao: string;
    firName: string;
}

interface AirportSearchBarProps {
    airports: Airport[];
    onSelect: (airport: Airport) => void;
}

const AirportSearchBar: React.FC<AirportSearchBarProps> = ({ airports, onSelect }) => {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const resultsRef = useRef<HTMLDivElement>(null);

    const filteredResults = useMemo(() => {
        if (!query.trim() || query.length < 2) return [];
        const lowerQuery = query.toLowerCase();
        return airports
            .filter(a => 
                a.icao.toLowerCase().includes(lowerQuery) ||
                (a.iata && a.iata.toLowerCase().includes(lowerQuery)) ||
                a.name.toLowerCase().includes(lowerQuery) ||
                (a.city && a.city.toLowerCase().includes(lowerQuery))
            )
            .slice(0, 8);
    }, [query, airports]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, filteredResults.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            if (selectedIndex >= 0 && selectedIndex < filteredResults.length) {
                handleSelect(filteredResults[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    const handleSelect = (airport: Airport) => {
        onSelect(airport);
        setQuery('');
        setIsOpen(false);
        setSelectedIndex(-1);
    };

    return (
        <div className="absolute top-6 left-6 w-full max-w-sm px-0 z-[1000]" ref={containerRef}>
            <div className="relative group">
                {/* Search Bar Background with Glassmorphism */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                
                <div className="relative flex items-center bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-1 shadow-2xl overflow-hidden">
                    <div className="flex items-center justify-center w-10 h-10 text-cyan-400">
                        <Search size={18} />
                    </div>
                    
                    <input
                        type="text"
                        placeholder="Search Airport code, name or city..."
                        className="flex-1 bg-transparent border-none outline-none text-white text-[13px] font-medium placeholder:text-slate-500 py-2 pr-4"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setIsOpen(true);
                            setSelectedIndex(-1);
                        }}
                        onFocus={() => setIsOpen(true)}
                        onKeyDown={handleKeyDown}
                    />

                    {query && (
                        <button 
                            onClick={() => setQuery('')}
                            className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Results List */}
                {isOpen && filteredResults.length > 0 && (
                    <div 
                        ref={resultsRef}
                        className="absolute mt-3 w-full bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
                    >
                        <div className="p-2 border-b border-white/5 bg-white/[0.02]">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2">Suggestions</span>
                        </div>
                        
                        <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
                            {filteredResults.map((airport, index) => (
                                <button
                                    key={airport.icao}
                                    onClick={() => handleSelect(airport)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    className={`w-full flex items-center gap-3 p-3 text-left transition-all relative ${
                                        selectedIndex === index ? 'bg-cyan-500/10' : 'hover:bg-white/[0.03]'
                                    }`}
                                >
                                    {selectedIndex === index && (
                                        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
                                    )}
                                    
                                    <div className={`w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 border border-white/5 transition-colors ${selectedIndex === index ? 'border-cyan-500/30 text-cyan-400' : 'text-slate-400'}`}>
                                        <Plane size={16} className={selectedIndex === index ? 'animate-pulse' : ''} />
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[13px] font-bold text-slate-100 truncate">{airport.name}</span>
                                            <span className="text-[10px] font-mono font-bold bg-white/5 text-cyan-400 px-1.5 py-0.5 rounded border border-white/10">{airport.icao}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <MapPin size={10} className="text-slate-500" />
                                            <p className="text-[11px] text-slate-400 truncate">
                                                {airport.city}{airport.country ? `, ${airport.country}` : ''} 
                                                <span className="mx-1.5 opacity-30">|</span>
                                                <span className="text-[10px] text-slate-500">{airport.firIcao}</span>
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                
                {isOpen && query.length >= 2 && filteredResults.length === 0 && (
                    <div className="absolute mt-3 w-full bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 text-center shadow-2xl overflow-hidden">
                        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3">
                            <Globe size={18} className="text-slate-600" />
                        </div>
                        <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">No Airports Found</p>
                        <p className="text-[11px] text-slate-500 mt-1">Try searching for ICAO codes like 'OMDB' or 'OERK'</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AirportSearchBar;
