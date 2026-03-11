/**
 * Zone-Based Knowledge System
 * Comprehensive educational content for TAF elements
 */

export const visibilityZone = {
  concept: {
    title: "Understanding Visibility",
    explanation: `Prevailing visibility is the greatest horizontal distance at which known objects can be seen and identified by unaided vision.`,
    keyPoints: [
      "Measured at eye level",
      "Reported as the greatest distance visible in at least half the horizon"
    ]
  },
  operational: (value: string, context: any = {}) => {
    const { stationId } = context;
    const isUS = stationId ? (stationId.startsWith('K') || stationId.startsWith('P') || stationId.startsWith('T')) : true;
    
    let miles = 0;
    let hazard: any = null;

    if (value === "P6SM") {
      miles = 7;
    } else if (value === "M1/4SM") {
      miles = 0.2;
      hazard = { level: "DANGER", message: "Extremely Low Visibility (< 1/4SM)" };
    } else if (value.endsWith("SM")) {
      const numPart = value.replace("SM", "").trim();
      miles = eval(numPart.replace(' ', '+')) || 0; // Simple parser
    } else {
      miles = parseInt(value) / 1609.34;
    }

    if (miles < 1) hazard = { level: "DANGER", message: "Low Visibility" };
    else if (miles < 3) hazard = { level: "WARNING", message: "IFR Visibility" };

    return { hazard };
  }
};

export const skyConditionZone = {
  operational: (value: string) => {
    const match = value.match(/^(SKC|CLR|NSC|NCD|FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)?(CB|TCU)?$/);
    if (!match) return null;

    const [, coverage, altCode, cloudType] = match;
    const altitude = altCode && altCode !== '///' ? parseInt(altCode) * 100 : null;
    const isCeiling = ["BKN", "OVC", "VV"].includes(coverage);

    let hazard: any = null;
    if (isCeiling && altitude !== null) {
      if (altitude < 500) hazard = { level: "DANGER", message: `Very Low Ceiling (${altitude}ft)` };
      else if (altitude < 1000) hazard = { level: "WARNING", message: `Low Ceiling (${altitude}ft)` };
    }

    if (cloudType === "CB") hazard = { level: "DANGER", message: "Cumulonimbus Clouds (CB)" };

    return { hazard };
  }
};

export const windZone = {
  operational: (value: string) => {
    const match = value.match(/^(VRB|\d{3})(\d{2,3})(G(\d{2,3}))?(KT|MPS|KMH)$/);
    if (!match) return null;

    const [, , speed, , guest] = match;
    const speedNum = parseInt(speed);
    const gustNum = guest ? parseInt(guest) : null;

    let hazard: any = null;
    if (gustNum && gustNum >= 35) hazard = { level: "DANGER", message: `Significant Gusts (${gustNum}KT)` };
    else if (speedNum >= 25) hazard = { level: "WARNING", message: `Strong Winds (${speedNum}KT)` };

    return { hazard };
  }
};

export const getZoneExplanation = (type: string, value: string, context: any = {}) => {
  if (type === 'visibility') return { operational: visibilityZone.operational(value, context) };
  if (type === 'skyCondition') return { operational: skyConditionZone.operational(value) };
  if (type === 'wind') return { operational: windZone.operational(value) };
  // Add more as needed
  return null;
};
