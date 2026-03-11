import React from 'react';
import { TOKEN_STYLES } from '../../utils/weather/tokenConfig';

interface TokenBadgeProps {
  token: {
    type: string;
    value: string;
  };
  index: number;
  onClick: (index: number) => void;
}

export default function TokenBadge({ token, index, onClick }: TokenBadgeProps) {
  const style = TOKEN_STYLES[token.type] || TOKEN_STYLES.unknown;

  return (
    <span
      className={`token-badge inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium border cursor-pointer ${style.bg} ${style.text} ${style.border}`}
      onClick={() => onClick(index)}
    >
      {token.value}
    </span>
  );
}
