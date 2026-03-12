/**
 * TAF Decoder - Token Configuration
 * Contains styles and info for all token types
 */

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function getCardinalDirection(degrees: number) {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return directions[Math.round(degrees / 22.5) % 16];
}

export function formatTimePeriod(value: string) {
  const match = value.match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
  if (!match) return value;
  const [, startDay, startHour, endDay, endHour] = match;
  return `Day ${startDay} at ${startHour}:00 UTC to Day ${endDay} at ${endHour}:00 UTC`;
}

// Token styles for dark theme
export const TOKEN_STYLES: Record<string, { bg: string, text: string, border: string }> = {
  reportType: { bg: 'bg-slate-700', text: 'text-slate-200', border: 'border-slate-600' },
  stationId: { bg: 'bg-sky-900/70', text: 'text-sky-300', border: 'border-sky-700' },
  issueTime: { bg: 'bg-violet-900/70', text: 'text-violet-300', border: 'border-violet-700' },
  validPeriod: { bg: 'bg-emerald-900/70', text: 'text-emerald-300', border: 'border-emerald-700' },
  wind: { bg: 'bg-cyan-900/70', text: 'text-cyan-300', border: 'border-cyan-700' },
  visibility: { bg: 'bg-amber-900/70', text: 'text-amber-300', border: 'border-amber-700' },
  skyCondition: { bg: 'bg-indigo-900/70', text: 'text-indigo-300', border: 'border-indigo-700' },
  weather: { bg: 'bg-teal-900/70', text: 'text-teal-300', border: 'border-teal-700' },
  fm: { bg: 'bg-blue-900/70', text: 'text-blue-300', border: 'border-blue-700' },
  tempo: { bg: 'bg-orange-900/70', text: 'text-orange-300', border: 'border-orange-700' },
  becmg: { bg: 'bg-lime-900/70', text: 'text-lime-300', border: 'border-lime-700' },
  prob: { bg: 'bg-fuchsia-900/70', text: 'text-fuchsia-300', border: 'border-fuchsia-700' },
  timePeriod: { bg: 'bg-gray-700', text: 'text-gray-300', border: 'border-gray-600' },
  nsw: { bg: 'bg-green-900/70', text: 'text-green-300', border: 'border-green-700' },
  cavok: { bg: 'bg-sky-900/70', text: 'text-sky-300', border: 'border-sky-700' },
  windShear: { bg: 'bg-red-900/70', text: 'text-red-300', border: 'border-red-700' },
  nil: { bg: 'bg-red-950/70', text: 'text-red-400', border: 'border-red-800' },
  qnh: { bg: 'bg-indigo-950/70', text: 'text-indigo-300', border: 'border-indigo-800' },
  tempMax: { bg: 'bg-rose-950/70', text: 'text-rose-300', border: 'border-rose-800' },
  tempMin: { bg: 'bg-blue-950/70', text: 'text-blue-300', border: 'border-blue-800' },
  minAltimeter: { bg: 'bg-slate-700', text: 'text-slate-200', border: 'border-slate-600' },
  icing: { bg: 'bg-cyan-950/70', text: 'text-cyan-300', border: 'border-cyan-800' },
  turbulence: { bg: 'bg-orange-950/70', text: 'text-orange-300', border: 'border-orange-800' },
  unknown: { bg: 'bg-slate-700', text: 'text-slate-400', border: 'border-slate-600' }
};

export const TOKEN_INFO: Record<string, any> = {
  reportType: {
    title: 'Type of Report',
    icon: 'FileText',
    explain: (value: string) => {
      const types: Record<string, string> = {
        'TAF': '<strong>TAF</strong> indicates a routine Terminal Aerodrome Forecast.',
        'AMD': '<strong>TAF AMD</strong> indicates an amended forecast.',
        'COR': '<strong>COR</strong> indicates a corrected forecast.',
        'RTD': '<strong>RTD</strong> indicates a routine delayed forecast.'
      };
      return types[value] || value;
    }
  },
  stationId: {
    title: 'ICAO Station Identifier',
    icon: 'Plane',
    explain: (value: string) => `<strong>${value}</strong>. ICAO identifier for the airport.`
  },
  issueTime: {
    title: 'Date and Time of Issue',
    icon: 'Clock',
    explain: (value: string) => {
      const day = value.substring(0, 2);
      const hour = value.substring(2, 4);
      const minute = value.substring(4, 6);
      return `Issued on the <strong>${ordinal(parseInt(day))}</strong> at <strong>${hour}:${minute} UTC</strong>.`;
    }
  },
  validPeriod: {
    title: 'Date and Time Valid',
    icon: 'Calendar',
    explain: (value: string) => {
      const [start, end] = value.split('/');
      const sDay = start.substring(0, 2);
      const sHour = start.substring(2, 4);
      const eDay = end.substring(0, 2);
      const eHour = end.substring(2, 4);
      return `Valid from <strong>${ordinal(parseInt(sDay))} at ${sHour}:00 UTC</strong> to <strong>${ordinal(parseInt(eDay))} at ${eHour}:00 UTC</strong>.`;
    }
  },
  wind: {
    title: 'Forecast Wind',
    icon: 'Wind',
    explain: (value: string) => `<strong>Wind</strong>: ${value}`
  },
  visibility: {
    title: 'Forecast Visibility',
    icon: 'Eye',
    explain: (value: string) => `<strong>Visibility</strong>: ${value}`
  },
  skyCondition: {
    title: 'Sky Condition',
    icon: 'Cloudy',
    explain: (value: string) => `<strong>Sky Condition</strong>: ${value}`
  },
  weather: {
    title: 'Weather Phenomena',
    icon: 'CloudRain',
    explain: (value: string) => `<strong>Weather</strong>: ${value}`
  },
  nsw: {
    title: 'No Significant Weather',
    icon: 'Sun',
    explain: () => '<strong>No significant weather</strong> is expected.'
  },
  cavok: {
    title: 'CAVOK',
    icon: 'Sun',
    explain: () => '<strong>CAVOK</strong>: Ceiling and Visibility OK (Visibility 10km+, no cloud below 5000ft, no CB/TCU, no sig weather).'
  },
  windShear: {
    title: 'Wind Shear',
    icon: 'Wind',
    explain: (value: string) => `<strong>Wind Shear</strong>: ${value}`
  },
  qnh: {
    title: 'QNH',
    icon: 'Waves',
    explain: (value: string) => `<strong>QNH</strong>: ${value}`
  },
  nil: {
    title: 'NIL',
    icon: 'FileX',
    explain: () => '<strong>NIL</strong>: No weather data available for this period.'
  },
  tempMax: {
    title: 'Maximum Temperature',
    icon: 'Thermometer',
    explain: (value: string) => `<strong>Max Temp</strong>: ${value}`
  },
  tempMin: {
    title: 'Minimum Temperature',
    icon: 'Thermometer',
    explain: (value: string) => `<strong>Min Temp</strong>: ${value}`
  },
  minAltimeter: {
    title: 'Minimum Altimeter',
    icon: 'Waves',
    explain: (value: string) => `<strong>Min Altimeter</strong>: ${value}`
  },
  icing: {
    title: 'Icing',
    icon: 'Snowflake',
    explain: (value: string) => `<strong>Icing</strong>: ${value}`
  },
  turbulence: {
    title: 'Turbulence',
    icon: 'Wind',
    explain: (value: string) => `<strong>Turbulence</strong>: ${value}`
  },
  unknown: {
    title: 'Unknown Token',
    icon: 'HelpCircle',
    explain: (value: string) => `Unknown token: <strong>${value}</strong>`
  }
};
