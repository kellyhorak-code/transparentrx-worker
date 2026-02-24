import { calculateTruePrice, TruePriceResult } from '../algorithms/trueprice';
import { calculateDistortionScore, DistortionParams } from '../algorithms/distortion';
import { D1Database } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
}

interface DrugRow {
  ndc_11: string;
  proprietary_name: string | null;
  nonproprietary_name: string | null;
  dosage_form: string | null;
  strength: string | null;
  route: string | null;
  labeler_name: string | null;
  nadac_price: number | null;
  cms_price: number | null;
  awp_price: number | null;
  last_updated: string | null;
}

interface PriceRequest {
  ndc: string;
  userPrice: number;
  zip?: string;
  dailyDosage?: number;
}

export async function priceHandler(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as PriceRequest;
    const { ndc, userPrice, zip, dailyDosage = 1 } = body;

    // Get drug from database
    const drug = await (env.DB.prepare(`
      SELECT * FROM ndc_master WHERE ndc_11 = ?
    `).bind(ndc).first()) as DrugRow | null;

    if (!drug) {
      return new Response(JSON.stringify({ error: 'NDC not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Calculate TruePrice™
    const truePrice: TruePriceResult = calculateTruePrice(drug, zip);
    
    // Calculate economics
    const monthlyUserCost = userPrice * 30 * dailyDosage;
    const monthlyTrueCost = truePrice.trueMid * 30 * dailyDosage;
    const monthlySavings = monthlyUserCost - monthlyTrueCost;
    
    // Distortion Score
    const distortionParams: DistortionParams = {
      userPrice,
      trueMid: truePrice.trueMid,
      trueLow: truePrice.trueLow,
      trueHigh: truePrice.trueHigh,
      dataFreshness: drug.last_updated ? 0.9 : 0.5
    };
    const distortionScore = calculateDistortionScore(distortionParams);

    // Break-even
    const subscriptionCost = 12;
    const monthsToBreakeven = monthlySavings > 0 
      ? (subscriptionCost / monthlySavings).toFixed(1)
      : null;
    const annualNetGain = monthlySavings > 0 
      ? (monthlySavings * 12) - (subscriptionCost * 12)
      : null;

    const response = {
      ndc: drug.ndc_11,
      drugName: drug.proprietary_name || drug.nonproprietary_name || 'Unknown',
      userPrice,
      truePrice: {
        low: Number(truePrice.trueLow.toFixed(2)),
        mid: Number(truePrice.trueMid.toFixed(2)),
        high: Number(truePrice.trueHigh.toFixed(2)),
        confidence: truePrice.confidence
      },
      layers: truePrice.layers.map((l) => ({
        name: l.name,
        value: Number(l.value.toFixed(2)),
        description: l.description
      })),
      monthlySavings: Number(monthlySavings.toFixed(2)),
      annualSavings: Number((monthlySavings * 12).toFixed(2)),
      distortionScore,
      distortionLevel: getDistortionLevel(distortionScore),
      breakEven: {
        monthsToBreakeven: monthsToBreakeven ? Number(monthsToBreakeven) : null,
        annualNetGain: annualNetGain ? Number(annualNetGain.toFixed(2)) : null
      },
      sources: ['NADAC', 'CMS Part D', 'AWP'],
      lastUpdated: drug.last_updated
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function getDistortionLevel(score: number): string {
  if (score < 20) return 'Stable Pricing';
  if (score < 40) return 'Minor Distortion';
  if (score < 60) return 'Moderate Distortion';
  if (score < 80) return 'Significant Distortion';
  return 'Severe Retail Distortion';
}