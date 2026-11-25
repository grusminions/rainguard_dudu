import { GRID_SECTORS } from '../data/presets';
import {
  ExceedancePoint,
  FactorContribution,
  FloodInputs,
  ForecastPoint,
  GridCellData,
  HistogramBin,
  MonteCarloConfig,
  MonteCarloResult,
  PredictionResult,
  RiskCategory,
  ScenarioEnvelope,
  SensitivityItem,
  StormPattern,
} from '../types/flood';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function classifyRisk(probability: number): RiskCategory {
  if (probability >= 0.75) return 'Very High';
  if (probability >= 0.55) return 'High';
  if (probability >= 0.30) return 'Moderate';
  return 'Low';
}

/**
 * Synthetic Hydrological Proxy Flood-Risk Engine (Demonstration Model)
 * Models nonlinear interactions between rainfall intensity, soil saturation,
 * drainage vulnerability, relative elevation, and terrain slope.
 * Strictly a synthetic demonstration model for SIH 2026.
 */
export function evaluateFloodRisk(inputs: FloodInputs): {
  probability: number;
  category: RiskCategory;
  contributions: FactorContribution[];
} {
  const rainfall = clamp(inputs.rainfall, 0, 180);
  const slope = clamp(inputs.slope, 0, 45);
  const soil = clamp(inputs.soil_saturation, 0, 1);
  const drainage = clamp(inputs.drainage_risk, 0, 1);
  const elevation = clamp(inputs.elevation, 0, 100);

  // Normalized factor stress components (0 to 1+)
  // 1. Rainfall stress: concave-exponential growth past 40 mm/hr
  const rainNorm = clamp(rainfall / 110, 0, 1.45);
  const rainScore = Math.pow(rainNorm, 1.08) * 2.25;

  // 2. Soil saturation: non-linear runoff amplification when > 0.65
  const soilScore = (0.45 * soil + 0.85 * Math.pow(soil, 2)) * 1.15;

  // 3. Drainage vulnerability: poor drainage traps urban runoff
  const drainageScore = (0.55 * drainage + 0.65 * Math.pow(drainage, 1.7)) * 1.25;

  // 4. Relative elevation: lower elevation collects catchment flow
  const lowElevFactor = 1 - elevation / 100;
  const elevationScore = Math.pow(lowElevFactor, 1.25) * 1.25;

  // 5. Terrain slope: U-shaped hydrological hazard
  // Very flat (<5 deg) -> poor gravity drainage / ponding;
  // Steep (>18 deg) -> fast flash runoff velocity;
  // Gentle (~8-12 deg) -> optimal controlled shedding.
  const flatPonding = Math.max(0, (8 - slope) / 8) * 0.48;
  const flashRunoff = Math.max(0, (slope - 12) / 33) * 0.68;
  const slopeScore = (flatPonding + flashRunoff + 0.12) * (0.4 + 0.6 * clamp(rainfall / 80, 0, 1));

  // Compounding synergy: heavy rain + saturated soil + clogged drainage
  const compoundSynergy = clamp(rainfall / 90, 0, 1.2) * soil * drainage * 0.85;

  // Calibrated logit centered so moderate conditions land near ~0.45 and
  // { rainfall: 75, slope: 15, soil_saturation: 0.8, drainage_risk: 0.7, elevation: 30 } lands ~0.81 (Very High)
  const rawIndex =
    rainScore + soilScore + drainageScore + elevationScore + slopeScore + compoundSynergy - 3.38;

  const probability = clamp(1 / (1 + Math.exp(-rawIndex)), 0.02, 0.99);
  const category = classifyRisk(probability);

  const rawParts = [
    {
      factor: 'Rainfall Intensity',
      key: 'rainfall' as const,
      val: rainScore + compoundSynergy * 0.4,
      summary: `${rainfall.toFixed(0)} mm/hr driving surface runoff`,
    },
    {
      factor: 'Drainage Risk',
      key: 'drainage_risk' as const,
      val: drainageScore + compoundSynergy * 0.3,
      summary: `${(drainage * 100).toFixed(0)}% conveyance restriction index`,
    },
    {
      factor: 'Soil Saturation',
      key: 'soil_saturation' as const,
      val: soilScore + compoundSynergy * 0.3,
      summary: `${(soil * 100).toFixed(0)}% moisture reducing infiltration`,
    },
    {
      factor: 'Relative Elevation',
      key: 'elevation' as const,
      val: elevationScore,
      summary: `Elevation ${elevation.toFixed(0)}/100 catchment position`,
    },
    {
      factor: 'Terrain Slope',
      key: 'slope' as const,
      val: slopeScore,
      summary:
        slope < 6
          ? `${slope.toFixed(0)}° flat gradient increases ponding`
          : slope > 18
            ? `${slope.toFixed(0)}° steep gradient accelerates runoff`
            : `${slope.toFixed(0)}° moderate shedding slope`,
    },
  ];

  const totalRaw = rawParts.reduce((sum, p) => sum + p.val, 0) || 1;
  const contributions: FactorContribution[] = rawParts
    .map((part) => ({
      factor: part.factor,
      key: part.key,
      rawImpact: Number(part.val.toFixed(3)),
      weightPercent: Math.round((part.val / totalRaw) * 100),
      summary: part.summary,
    }))
    .sort((a, b) => b.weightPercent - a.weightPercent);

  return {
    probability: Number(probability.toFixed(4)),
    category,
    contributions,
  };
}

export function buildDemoPrediction(inputs: FloodInputs): PredictionResult {
  const evaluated = evaluateFloodRisk(inputs);
  return {
    risk_probability: evaluated.probability,
    risk_category: evaluated.category,
    source: 'demo-engine',
    contributions: evaluated.contributions,
  };
}

/**
 * Generates Best-Case, Expected, and Worst-Case bounding scenarios around current inputs.
 */
export function computeScenarioEnvelope(inputs: FloodInputs): ScenarioEnvelope {
  const bestInputs: FloodInputs = {
    rainfall: Number(clamp(inputs.rainfall * 0.72, 0, 180).toFixed(1)),
    slope: Number(clamp(inputs.slope * 0.9, 0, 45).toFixed(1)),
    soil_saturation: Number(clamp(inputs.soil_saturation - 0.14, 0, 1).toFixed(2)),
    drainage_risk: Number(clamp(inputs.drainage_risk - 0.16, 0, 1).toFixed(2)),
    elevation: Number(clamp(inputs.elevation + 10, 0, 100).toFixed(0)),
  };

  const worstInputs: FloodInputs = {
    rainfall: Number(clamp(inputs.rainfall * 1.32, 0, 180).toFixed(1)),
    slope: Number(clamp(inputs.slope * 1.15, 0, 45).toFixed(1)),
    soil_saturation: Number(clamp(inputs.soil_saturation + 0.14, 0, 1).toFixed(2)),
    drainage_risk: Number(clamp(inputs.drainage_risk + 0.16, 0, 1).toFixed(2)),
    elevation: Number(clamp(inputs.elevation - 10, 0, 100).toFixed(0)),
  };

  const bestEval = evaluateFloodRisk(bestInputs);
  const expectedEval = evaluateFloodRisk(inputs);
  const worstEval = evaluateFloodRisk(worstInputs);

  return {
    bestCase: {
      probability: bestEval.probability,
      category: bestEval.category,
      inputs: bestInputs,
    },
    expected: {
      probability: expectedEval.probability,
      category: expectedEval.category,
      inputs,
    },
    worstCase: {
      probability: worstEval.probability,
      category: worstEval.category,
      inputs: worstInputs,
    },
  };
}

/**
 * One-at-a-time +/-20% sensitivity analysis across all 5 hydrological parameters.
 */
export function computeSensitivityAnalysis(inputs: FloodInputs): SensitivityItem[] {
  const baseProb = evaluateFloodRisk(inputs).probability;

  const specs: Array<{
    parameter: string;
    key: keyof FloodInputs;
    low: FloodInputs;
    high: FloodInputs;
  }> = [
    {
      parameter: 'Rainfall Intensity (±25%)',
      key: 'rainfall',
      low: { ...inputs, rainfall: clamp(inputs.rainfall * 0.75, 0, 180) },
      high: { ...inputs, rainfall: clamp(inputs.rainfall * 1.25, 0, 180) },
    },
    {
      parameter: 'Drainage Risk (±0.20)',
      key: 'drainage_risk',
      low: { ...inputs, drainage_risk: clamp(inputs.drainage_risk - 0.2, 0, 1) },
      high: { ...inputs, drainage_risk: clamp(inputs.drainage_risk + 0.2, 0, 1) },
    },
    {
      parameter: 'Soil Saturation (±0.20)',
      key: 'soil_saturation',
      low: { ...inputs, soil_saturation: clamp(inputs.soil_saturation - 0.2, 0, 1) },
      high: { ...inputs, soil_saturation: clamp(inputs.soil_saturation + 0.2, 0, 1) },
    },
    {
      parameter: 'Relative Elevation (±15)',
      key: 'elevation',
      low: { ...inputs, elevation: clamp(inputs.elevation + 15, 0, 100) },
      high: { ...inputs, elevation: clamp(inputs.elevation - 15, 0, 100) },
    },
    {
      parameter: 'Terrain Slope (±8°)',
      key: 'slope',
      low: { ...inputs, slope: clamp(inputs.slope - 8, 0, 45) },
      high: { ...inputs, slope: clamp(inputs.slope + 8, 0, 45) },
    },
  ];

  return specs
    .map((spec) => {
      const p1 = evaluateFloodRisk(spec.low).probability;
      const p2 = evaluateFloodRisk(spec.high).probability;
      const lowProb = Math.min(p1, p2);
      const highProb = Math.max(p1, p2);
      return {
        parameter: spec.parameter,
        key: spec.key,
        lowProb,
        baseProb,
        highProb,
        deltaSpan: Number((highProb - lowProb).toFixed(4)),
      };
    })
    .sort((a, b) => b.deltaSpan - a.deltaSpan);
}

/**
 * Generates the 5x5 interactive basin grid dynamically from global scenario parameters.
 * Global controls act as regional storm/basin baselines while each sector preserves
 * its topographic identity (elevation, slope, local drainage offset).
 */
export function generateBasinGrid(
  globalInputs: FloodInputs,
  cellOverrides: Record<string, Partial<FloodInputs>> = {}
): GridCellData[] {
  // Compute deltas relative to reference baseline { slope: 15, elevation: 30 }
  const slopeShift = (globalInputs.slope - 15) * 0.35;
  const elevShift = (globalInputs.elevation - 30) * 0.25;

  return GRID_SECTORS.map((sector) => {
    const override = cellOverrides[sector.id] || {};
    const computedInputs: FloodInputs = {
      rainfall: Number(
        clamp(
          override.rainfall ?? globalInputs.rainfall * sector.rainfallMultiplier,
          0,
          180
        ).toFixed(1)
      ),
      slope: Number(
        clamp(override.slope ?? sector.baseSlope + slopeShift, 0, 45).toFixed(1)
      ),
      soil_saturation: Number(
        clamp(
          override.soil_saturation ?? globalInputs.soil_saturation + sector.baseSoilOffset,
          0.05,
          0.99
        ).toFixed(2)
      ),
      drainage_risk: Number(
        clamp(
          override.drainage_risk ?? globalInputs.drainage_risk + sector.baseDrainageOffset,
          0.05,
          0.99
        ).toFixed(2)
      ),
      elevation: Number(
        clamp(override.elevation ?? sector.baseElevation + elevShift, 2, 98).toFixed(0)
      ),
    };

    const evaluated = evaluateFloodRisk(computedInputs);

    return {
      id: sector.id,
      row: sector.row,
      col: sector.col,
      name: sector.name,
      zone: sector.zone,
      inputs: computedInputs,
      riskProbability: evaluated.probability,
      riskCategory: evaluated.category,
      contributions: evaluated.contributions,
      populationEstimate: sector.populationEstimate,
      infrastructureNote: sector.infrastructureNote,
    };
  });
}

/**
 * Synthetic Historical + Experimental Rainfall Forecasting Series
 * Generates 12 hours of synthetic recent rainfall + adjustable experimental horizon (6h–48h).
 */
export function generateRainfallForecast(
  baseInputs: FloodInputs,
  horizonHours: number,
  pattern: StormPattern
): ForecastPoint[] {
  const points: ForecastPoint[] = [];
  const currentRain = Math.max(2, baseInputs.rainfall);
  let cumulativeMm = 0;
  let runningSat = clamp(baseInputs.soil_saturation - 0.14, 0.1, 0.96);

  // Recent 12 hours synthetic historical observations (-11h to 0h)
  for (let h = -11; h <= 0; h++) {
    const progress = (h + 11) / 11; // 0 to 1
    const wave = Math.sin(progress * Math.PI * 1.4) * 0.14 + Math.cos(h * 0.9) * 0.06;
    const histRain = Number(
      clamp(currentRain * (0.42 + 0.58 * progress + wave), 1, 180).toFixed(1)
    );
    cumulativeMm = Number((cumulativeMm + histRain).toFixed(1));
    runningSat = clamp(runningSat + histRain * 0.00055 - 0.008, 0.1, 0.99);

    const est = evaluateFloodRisk({
      ...baseInputs,
      rainfall: histRain,
      soil_saturation: runningSat,
    });

    points.push({
      hourOffset: h,
      label: h === 0 ? 'Now' : `${h}h`,
      phase: 'historical',
      observedRainfall: histRain,
      predictedRainfall: h === 0 ? histRain : null,
      forecastLower: h === 0 ? histRain : null,
      forecastUpper: h === 0 ? histRain : null,
      cumulativeMm,
      projectedSaturation: Number(runningSat.toFixed(2)),
      estimatedRisk: est.probability,
    });
  }

  // Experimental forecast hours (+1h to +horizonHours)
  for (let h = 1; h <= horizonHours; h++) {
    const t = h / horizonHours; // 0 -> 1
    let multiplier = 1;

    if (pattern === 'steady') {
      multiplier = 0.96 + Math.sin(h * 0.65) * 0.12 - t * 0.12;
    } else if (pattern === 'intensifying') {
      multiplier = 1.0 + Math.sin(t * Math.PI * 0.82) * 0.44 + Math.cos(h * 0.8) * 0.06;
    } else if (pattern === 'peak_decay') {
      multiplier = 1.18 * Math.exp(-t * 1.35) + 0.18 + Math.sin(h * 0.7) * 0.05;
    } else {
      // double_squall
      const squall1 = Math.exp(-Math.pow((t - 0.25) / 0.18, 2)) * 0.58;
      const squall2 = Math.exp(-Math.pow((t - 0.72) / 0.2, 2)) * 0.46;
      multiplier = 0.78 + squall1 + squall2;
    }

    const predicted = Number(clamp(currentRain * multiplier, 0.5, 180).toFixed(1));
    // Growing experimental spread band with forecast lead time
    const spreadRatio = 0.1 + 0.26 * Math.sqrt(t);
    const lower = Number(clamp(predicted * (1 - spreadRatio), 0, 180).toFixed(1));
    const upper = Number(clamp(predicted * (1 + spreadRatio), 0, 180).toFixed(1));

    cumulativeMm = Number((cumulativeMm + predicted).toFixed(1));
    runningSat = clamp(runningSat + predicted * 0.0007 - 0.011, 0.1, 0.99);

    const est = evaluateFloodRisk({
      ...baseInputs,
      rainfall: predicted,
      soil_saturation: runningSat,
    });

    points.push({
      hourOffset: h,
      label: `+${h}h`,
      phase: 'forecast',
      observedRainfall: null,
      predictedRainfall: predicted,
      forecastLower: lower,
      forecastUpper: upper,
      cumulativeMm,
      projectedSaturation: Number(runningSat.toFixed(2)),
      estimatedRisk: est.probability,
    });
  }

  return points;
}

// Fast deterministic PRNG (Mulberry32) so reruns can be seeded and reproducible
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard Normal via Box-Muller transform
function randomNormal(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function getPercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = clamp((p / 100) * (sorted.length - 1), 0, sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * Executes N (1,000+) Monte Carlo hydrological scenarios varying rainfall and terrain inputs
 * within user-configured uncertainty ranges. Runs synchronously in <25ms on standard laptops.
 */
export function runMonteCarloSimulation(
  baseInputs: FloodInputs,
  config: MonteCarloConfig,
  seed: number = Math.floor(Date.now() % 1_000_000)
): MonteCarloResult {
  const t0 = performance.now();
  const iterations = clamp(Math.round(config.iterations), 1000, 20000);
  const rng = createRng(seed);

  const rainSigma = (config.rainfallUncertaintyPct / 100) * 0.55;
  const terrainSigma = (config.terrainUncertaintyPct / 100) * 0.55;
  const drainageSigma = (config.drainageUncertaintyPct / 100) * 0.55;

  const samples = new Array<number>(iterations);
  let sum = 0;
  let exceedingCount = 0;

  for (let i = 0; i < iterations; i++) {
    const zRain = randomNormal(rng);
    const zSoil = randomNormal(rng);
    const zDrain = randomNormal(rng);
    const zSlope = randomNormal(rng);
    const zElev = randomNormal(rng);

    const sampledInputs: FloodInputs = {
      rainfall: clamp(baseInputs.rainfall * (1 + zRain * rainSigma), 0, 180),
      slope: clamp(baseInputs.slope + zSlope * (terrainSigma * 14), 0, 45),
      soil_saturation: clamp(
        baseInputs.soil_saturation + zSoil * (terrainSigma * 0.48),
        0,
        1
      ),
      drainage_risk: clamp(
        baseInputs.drainage_risk + zDrain * (drainageSigma * 0.48),
        0,
        1
      ),
      elevation: clamp(baseInputs.elevation + zElev * (terrainSigma * 22), 0, 100),
    };

    const prob = evaluateFloodRisk(sampledInputs).probability;
    samples[i] = prob;
    sum += prob;
    if (prob >= config.highRiskThreshold) {
      exceedingCount++;
    }
  }

  samples.sort((a, b) => a - b);

  const mean = sum / iterations;
  let sqDiffSum = 0;
  for (let i = 0; i < iterations; i++) {
    const d = samples[i] - mean;
    sqDiffSum += d * d;
  }
  const stdDev = Math.sqrt(sqDiffSum / iterations);

  const p10 = getPercentile(samples, 10);
  const median = getPercentile(samples, 50);
  const p90 = getPercentile(samples, 90);
  const min = samples[0];
  const max = samples[iterations - 1];

  // Build 20 histogram bins from 0% to 100% (each 5% wide)
  const binCount = 20;
  const counts = new Array<number>(binCount).fill(0);
  for (let i = 0; i < iterations; i++) {
    const binIdx = Math.min(binCount - 1, Math.floor(samples[i] * binCount));
    counts[binIdx]++;
  }

  const histogram: HistogramBin[] = counts.map((count, idx) => {
    const lo = idx * 5;
    const hi = lo + 5;
    const midpoint = (lo + hi) / 2;
    return {
      rangeLabel: `${lo}–${hi}%`,
      midpoint,
      count,
      percent: Number(((count / iterations) * 100).toFixed(2)),
      category: classifyRisk(midpoint / 100),
    };
  });

  // Exceedance probability curve at 5% intervals (0% to 100%)
  const exceedanceCurve: ExceedancePoint[] = [];
  for (let pct = 0; pct <= 100; pct += 5) {
    const threshold = pct / 100;
    // Binary search for first sample >= threshold
    let lo = 0;
    let hi = iterations;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (samples[mid] < threshold) lo = mid + 1;
      else hi = mid;
    }
    const above = iterations - lo;
    exceedanceCurve.push({
      thresholdPct: pct,
      exceedancePct: Number(((above / iterations) * 100).toFixed(1)),
    });
  }

  const runtimeMs = Number((performance.now() - t0).toFixed(1));

  return {
    iterations,
    seed,
    runtimeMs,
    mean: Number(mean.toFixed(4)),
    stdDev: Number(stdDev.toFixed(4)),
    p10: Number(p10.toFixed(4)),
    median: Number(median.toFixed(4)),
    p90: Number(p90.toFixed(4)),
    min: Number(min.toFixed(4)),
    max: Number(max.toFixed(4)),
    exceedingThresholdCount: exceedingCount,
    exceedingThresholdPct: Number(((exceedingCount / iterations) * 100).toFixed(1)),
    highRiskThreshold: config.highRiskThreshold,
    histogram,
    exceedanceCurve,
  };
}
