import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

const UTCClock: React.FC = () => {
    const [time, setTime] = useState(() => new Date());

    useEffect(() => {
        const interval = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    const pad = (n: number) => String(n).padStart(2, '0');
    const hours = pad(time.getUTCHours());
    const minutes = pad(time.getUTCMinutes());
    const seconds = pad(time.getUTCSeconds());
    const dateStr = time.toUTCString().slice(0, 16);

    return (
        <div className="flex items-center gap-2 text-notam-muted">
            <Clock size={14} className="text-blue-400" />
            <span className="font-mono text-sm tracking-wider">
                <span className="text-notam-text font-semibold">{hours}:{minutes}:{seconds}</span>
                <span className="text-xs ml-1 text-blue-400">UTC</span>
            </span>
            <span className="text-xs text-notam-muted hidden sm:inline">{dateStr}</span>
        </div>
    );
};

export default UTCClock;
