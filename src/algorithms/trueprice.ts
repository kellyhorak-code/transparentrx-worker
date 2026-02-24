export interface TruePriceResult {
  trueLow: number;
  trueMid: number;
  trueHigh: number;
  confidence: 'high' | 'medium' | 'low';
  layers: Array<{
    name: string;
    value: number;
    description: string;
  }>;
}

export function calculateTruePrice(
  drug: any,
  zip?: string
): TruePriceResult {
  // NADAC precedence logic
  let baseCost: number;
  let source: string;
  
  if (drug.nadac_price && drug.nadac_price > 0) {
    baseCost = drug.nadac_price;
    source = 'NADAC';
  } else if (drug.cms_price && drug.cms_price > 0) {
    baseCost = drug.cms_price;
    source = 'CMS Part D';
  } else if (drug.awp_price && drug.awp_price > 0) {
    baseCost = drug.awp_price * 0.85;
    source = 'AWP';
  } else {
    baseCost = 10.00;
    source = 'estimate';
  }

  // Geographic multiplier
  let geoMultiplier = 1.0;
  if (zip) {
    const region = zip.substring(0, 3);
    const multipliers: Record<string, number> = {
      '100': 1.25,
      '902': 1.35,
      '606': 1.15,
      '752': 1.10,
      '981': 1.20,
    };
    geoMultiplier = multipliers[region] || 1.0;
  }

  // Dosage form adjustment
  let formMultiplier = 1.0;
  const form = (drug.dosage_form || '').toLowerCase();
  if (form.includes('inject')) formMultiplier = 1.4;
  else if (form.includes('cream')) formMultiplier = 1.2;
  else if (form.includes('inhaler')) formMultiplier = 1.3;
  else if (form.includes('liquid')) formMultiplier = 1.15;

  const adjustedBase = baseCost * geoMultiplier * formMultiplier;
  
  const trueLow = adjustedBase * 1.15;
  const trueMid = adjustedBase * 1.40;
  const trueHigh = adjustedBase * 1.80;

  let confidence: 'high' | 'medium' | 'low' = 'medium';
  if (source === 'NADAC') {
    if (drug.last_updated) {
      const daysOld = (Date.now() - new Date(drug.last_updated).getTime()) / (1000 * 60 * 60 * 24);
      confidence = daysOld < 30 ? 'high' : daysOld < 90 ? 'medium' : 'low';
    }
  }

  const layers = [
    {
      name: 'Acquisition Cost',
      value: adjustedBase,
      description: `What pharmacy pays (${source})`
    },
    {
      name: 'Dispensing Fee',
      value: adjustedBase * 0.10,
      description: 'Pharmacy handling + overhead'
    },
    {
      name: 'PBM Spread',
      value: adjustedBase * 0.15,
      description: 'Pharmacy benefit manager margin'
    },
    {
      name: 'Retail Markup',
      value: adjustedBase * 0.15,
      description: 'Pharmacy profit margin'
    }
  ];

  return {
    trueLow,
    trueMid,
    trueHigh,
    confidence,
    layers
  };
}