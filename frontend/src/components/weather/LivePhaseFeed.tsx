import React, { useMemo } from 'react';
import * as LucideIcons from 'lucide-react';
import { getWeatherIcon } from './IconMapper';
import { getZoneExplanation } from '../../utils/weather/zoneKnowledge';
import { TOKEN_INFO } from '../../utils/weather/tokenConfig';
import { isApplicableForPlanning } from '../../utils/weather/planningFilter';
import { assignTokenOwnership, filterTokensByOwnership } from '../../utils/weather/tokenOwnership';

interface LivePhaseFeedProps {
  phases: any[];
  onPhaseClick: (phase: any) => void;
  selectedPhase: any;
  filterWindow?: {
    start: Date;
    end: Date;
  } | null;
  filterMode?: string;
  enableSmartFiltering?: boolean;
  etaTime?: Date | null;
  stationId?: string | null;
}

export default function LivePhaseFeed({
  phases,
  onPhaseClick,
  selectedPhase,
  filterWindow,
  enableSmartFiltering = false,
  etaTime = null,
  stationId = null
}: LivePhaseFeedProps) {

  const isPhaseRelevant = (phase: any) => {
    if (!filterWindow) return true;
    if (!phase.validStart || !phase.validEnd) return true;

    const overlaps = (phase.validStart <= filterWindow.end) && (phase.validEnd >= filterWindow.start);
    return overlaps;
  };

  const tokenOwnership = useMemo(() => {
    if (!enableSmartFiltering) return new Map();
    return assignTokenOwnership(phases, isPhaseRelevant);
  }, [phases, enableSmartFiltering, filterWindow, etaTime]);

  const getPhaseStyle = (type: string) => {
    const styles: Record<string, any> = {
      initial: { bg: 'bg-cyan-900/10', border: 'border-cyan-500/20', text: 'text-cyan-400', badge: 'bg-cyan-500' },
      fm: { bg: 'bg-blue-900/10', border: 'border-blue-500/20', text: 'text-blue-400', badge: 'bg-blue-500' },
      tempo: { bg: 'bg-orange-900/10', border: 'border-orange-500/20', text: 'text-orange-400', badge: 'bg-orange-500' },
      becmg: { bg: 'bg-lime-900/10', border: 'border-lime-500/20', text: 'text-lime-400', badge: 'bg-lime-500' },
      prob: { bg: 'bg-fuchsia-900/10', border: 'border-fuchsia-500/20', text: 'text-fuchsia-400', badge: 'bg-fuchsia-500' }
    };
    return styles[type] || styles.initial;
  };

  return (
    <div className="space-y-4">
      {phases.map((phase, phaseIdx) => {
        if (!isPhaseRelevant(phase)) return null;
        if (enableSmartFiltering && !isApplicableForPlanning(phase)) return null;

        let displayTokens = phase.tokens;
        if (enableSmartFiltering && tokenOwnership.has(phase)) {
          displayTokens = filterTokensByOwnership(phase, displayTokens, tokenOwnership.get(phase));
        }

        const meaningfulTokens = displayTokens.filter((t: any) =>
          !['becmg', 'tempo', 'prob', 'fm', 'timePeriod', 'validPeriod', 'issueTime', 'reportType', 'stationId'].includes(t.type)
        );

        if (meaningfulTokens.length === 0 && enableSmartFiltering) return null;

        const isSelected = selectedPhase === phase;
        const style = getPhaseStyle(phase.type);

        return (
          <div
            key={phaseIdx}
            className={`
              ${style.bg} ${style.border} border rounded-lg p-4 cursor-pointer transition-all duration-200
              ${isSelected ? 'ring-2 ring-cyan-500/50 scale-[1.01]' : 'hover:scale-[1.01] hover:shadow-lg'}
            `}
            onClick={() => onPhaseClick(phase)}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${style.badge}`}></span>
              <span className={`text-xs font-semibold uppercase tracking-wider ${style.text}`}>
                {phase.title}
              </span>
              {phase.validStart && (
                <span className="text-[9px] text-slate-500 font-mono ml-auto">
                  {phase.validStart.getUTCHours().toString().padStart(2, '0')}:00
                  -
                  {phase.validEnd.getUTCHours().toString().padStart(2, '0')}:00Z
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-2 font-mono text-sm items-center">
              {displayTokens.filter((t: any) => {
                if (['issueTime', 'reportType', 'stationId', 'becmg', 'tempo', 'prob'].includes(t.type)) return false;
                return true;
              }).map((token: any) => {
                const info = TOKEN_INFO[token.type] || TOKEN_INFO.unknown;
                const explanation = getZoneExplanation(token.type, token.value, { stationId });
                const hazard = explanation?.operational?.hazard;

                return (
                  <div key={token.idx} className="flex items-center gap-1.5 group/token relative">
                    <span className={`opacity-70 group-hover/token:opacity-100 text-slate-400`}>
                      {getWeatherIcon(info?.icon || 'HelpCircle', `w-3.5 h-3.5`)}
                    </span>
                    <span 
                        className={`text-slate-200 ${hazard ? (hazard.level === 'DANGER' ? 'text-red-400' : 'text-amber-400') : ''}`}
                        title={hazard?.message || ''}
                    >
                      {token.value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
