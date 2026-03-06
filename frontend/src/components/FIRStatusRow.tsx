import React from 'react';
import { FirInfo, NotamStatus, FirStatusItem } from '../types';
import { Radio } from 'lucide-react';

interface FIRStatusRowProps {
    firs: FirInfo[];
    firData: Record<string, FirStatusItem>;
    loading: boolean;
}

const STATUS_BG: Record<NotamStatus, string> = {
    green: 'bg-notam-green/20 border-notam-green text-notam-green',
    orange: 'bg-notam-orange/20 border-notam-orange text-notam-orange',
    red: 'bg-notam-red/20 border-notam-red text-notam-red',
    unknown: 'bg-notam-surface border-notam-border text-notam-muted',
};

const STATUS_DOT: Record<NotamStatus, string> = {
    green: 'bg-notam-green',
    orange: 'bg-notam-orange',
    red: 'bg-notam-red animate-pulse',
    unknown: 'bg-notam-muted',
};

const FIRStatusRow: React.FC<FIRStatusRowProps> = ({ firs, firData, loading }) => {
    return (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <Radio size={14} className="text-blue-400" />
                <span className="text-xs font-semibold text-notam-muted uppercase tracking-widest">FIR Status</span>
            </div>
            <div className="flex flex-wrap gap-2">
                {firs.map(fir => {
                    const data = firData[fir.icao];
                    const status: NotamStatus = loading ? 'unknown' : (data?.status ?? 'unknown');
                    const hasEscat = data?.hasEscat ?? false;

                    return (
                        <div
                            key={fir.icao}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${STATUS_BG[status]}`}
                            title={`${fir.name} — ${status.toUpperCase()}`}
                        >
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`} />
                            <span className="font-mono font-bold">{fir.icao}</span>
                            <span className="hidden sm:inline text-[10px] opacity-70">
                                {fir.name.replace(' FIR', '')}
                            </span>
                            {hasEscat && (
                                <span className="bg-red-700 text-red-100 text-[9px] px-1 rounded font-bold ml-0.5">
                                    ESCAT
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default FIRStatusRow;
