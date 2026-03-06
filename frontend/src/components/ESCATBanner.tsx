import React, { useState, useEffect } from 'react';
import { AlertTriangle, Shield, X } from 'lucide-react';

interface ESCATBannerProps {
    affectedLocations: string[];
}

const ESCATBanner: React.FC<ESCATBannerProps> = ({ affectedLocations }) => {
    const [isVisible, setIsVisible] = useState(true);

    // Reset visibility if affected locations change
    useEffect(() => {
        if (affectedLocations.length > 0) {
            setIsVisible(true);
        }
    }, [affectedLocations.join(',')]);

    // Auto-dismiss after 10 seconds
    useEffect(() => {
        if (isVisible && affectedLocations.length > 0) {
            const timer = setTimeout(() => {
                setIsVisible(false);
            }, 10000);
            return () => clearTimeout(timer);
        }
    }, [isVisible, affectedLocations.join(',')]);

    if (!isVisible || affectedLocations.length === 0) return null;

    return (
        <div className="escat-banner bg-red-900/90 border border-red-500 rounded-lg px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[0_0_20px_rgba(239,68,68,0.3)] backdrop-blur-sm">
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-shrink-0">
                    <Shield size={20} className="text-red-400" fill="currentColor" />
                    <AlertTriangle size={20} className="text-red-300" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-red-200 font-bold text-sm tracking-widest uppercase">
                            ⚡ ESCAT / Security Alert
                        </span>
                        <span className="text-red-300 text-xs">
                            Security control / ADIZ restriction detected at:
                        </span>
                        <div className="flex flex-wrap gap-1">
                            {affectedLocations.map(loc => (
                                <span
                                    key={loc}
                                    className="bg-red-700 text-red-100 text-xs font-mono font-bold px-2 py-0.5 rounded"
                                >
                                    {loc}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <button
                onClick={() => setIsVisible(false)}
                className="text-red-400 hover:text-red-200 transition-colors p-1 bg-red-950/50 hover:bg-red-900 rounded flex-shrink-0"
                title="Dismiss"
            >
                <X size={18} />
            </button>
        </div>
    );
};

export default ESCATBanner;
