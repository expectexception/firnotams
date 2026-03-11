import React from 'react';
import * as LucideIcons from 'lucide-react';
import { TOKEN_STYLES, TOKEN_INFO } from '../../utils/weather/tokenConfig';

interface Token {
  type: string;
  value: string;
  idx: number;
}

interface Section {
  title: string;
  icon: string;
  tokens: Token[];
}

interface PeriodCardProps {
  section: Section;
  cardIndex: number;
}

export default function PeriodCard({ section, cardIndex }: PeriodCardProps) {
  const SectionIcon = (LucideIcons as any)[section.icon] || LucideIcons.HelpCircle;

  return (
    <div className="period-card border border-slate-700 bg-slate-900 rounded-xl p-4 shadow-lg mb-4">
      {/* Section Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
          <SectionIcon className="w-4 h-4 text-cyan-400" />
        </div>
        <h4 className="font-semibold text-slate-200 text-base">{section.title}</h4>
      </div>

      {/* Token Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {section.tokens.map((token, tokenIndex) => {
          const info = TOKEN_INFO[token.type] || TOKEN_INFO.unknown;
          const style = TOKEN_STYLES[token.type] || TOKEN_STYLES.unknown;
          const TokenIcon = (LucideIcons as any)[info.icon] || LucideIcons.HelpCircle;
          const explanation = info.explain(token.value);

          return (
            <div
              key={tokenIndex}
              data-idx={token.idx}
              className="explanation-item bg-slate-950 border border-slate-800 rounded-lg p-4 hover:border-cyan-500/30 transition-all group"
              style={{ animationDelay: `${cardIndex * 0.1 + tokenIndex * 0.05}s` }}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg ${style.bg} flex items-center justify-center`}>
                    <TokenIcon className={`w-4 h-4 ${style.text}`} />
                  </div>
                  <div>
                    <code className="px-2 py-0.5 rounded bg-slate-900 font-mono font-semibold text-slate-100 text-sm border border-slate-800">
                      {token.value}
                    </code>
                  </div>
                </div>
                <span className="text-[9px] font-bold text-slate-600 bg-slate-900 px-1.5 py-0.5 rounded">
                  #{token.idx + 1}
                </span>
              </div>

              {/* Card Label */}
              <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400/70 mb-2">
                {info.title}
              </div>

              {/* Card Explanation */}
              <p
                className="text-sm text-slate-400 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: explanation }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
