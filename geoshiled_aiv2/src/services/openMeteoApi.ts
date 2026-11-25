import { projectLonLatToWorld, TAMIL_NADU_DISTRICTS } from '../data/tamilNaduDistricts';
import { clamp, evaluateFloodRisk } from '../engine/floodModel';
import {
  DistrictHourlyPoint,
  FloodInputs,
  TamilNaduDistrictData,
  TamilNaduDistrictTemplate,
} from '../types/flood';

interface OpenMeteoLocationPayload {
  latitude?: number;
  longitude?: number;
  elevation?: number;
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    rain?: number;
  };
  hourly?: {
    time?: string[];
    precipitation?: Array<number | null>;
    rain?: Array<number | null>;
    soil_moisture_0_to_7cm?: Array<number | null>;
  };
}

export interface LiveTamilNaduFetchResult {
  districts: TamilNaduDistrictData[];
  source: 'open-meteo-live' | 'synthetic-fallback';
  syncedAtIso: string;
  errorNote: string | null;
}

function formatHourOffsetLabel(offset: number): string {
  if (offset === 0) return 'Now';
  return offset > 0 ? `+${offset}h` : `${offset}h`;
}

/**
 * Builds deterministic synthetic Tamil Nadu district telemetry when Open-Meteo
 * is unreachable OR when the user switches to Simulated Stress Preset mode.
 */
export function buildSimulatedTamilNaduDistricts(
  globalInputs: FloodInputs,
  sourceTag: 'synthetic-fallback' | 'simulated-scenario' = 'simulated-scenario'
): TamilNaduDistrictData[] {
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const slopeShift = (globalInputs.slope - 15) * 0.25;
  const satShift = globalInputs.soil_saturation - 0.65;
  const drainShift = globalInputs.drainage_risk - 0.6;

  return TAMIL_NADU_DISTRICTS.map((dist, idx) => {
    const { x, z } = projectLonLatToWorld(dist.lon, dist.lat);
    const rainfall = Number(
      clamp(globalInputs.rainfall * dist.monsoonMultiplier, 0, 180).toFixed(1)
    );
    const soilSat = Number(clamp(dist.baseSoilSaturation + satShift * 0.65, 0.08, 0.99).toFixed(2));
    const drainRisk = Number(clamp(dist.baseDrainageRisk + drainShift * 0.65, 0.08, 0.99).toFixed(2));
    const slope = Number(clamp(dist.baseSlope + slopeShift, 0.5, 45).toFixed(1));
    const elevation = dist.relativeElevation;

    const inputs: FloodInputs = {
      rainfall,
      slope,
      soil_saturation: soilSat,
      drainage_risk: drainRisk,
      elevation,
    };

    const evaluated = evaluateFloodRisk(inputs);

    // 36-hour series (-12h to +23h)
    const hourlySeries: DistrictHourlyPoint[] = [];
    let rollingSat = clamp(soilSat - 0.12, 0.1, 0.96);

    for (let h = -12; h <= 23; h++) {
      const wave =
        Math.sin((h + 12 + idx * 1.3) * 0.28) * 0.22 +
        Math.cos((h + idx * 0.7) * 0.45) * 0.11;
      const trend = h <= 0 ? 0.55 + ((h + 12) / 12) * 0.45 : 1.04 - (h / 24) * 0.22;
      const hrRain = Number(clamp(rainfall * (trend + wave), 0.2, 180).toFixed(1));
      rollingSat = clamp(rollingSat + hrRain * 0.0005 - 0.007, 0.1, 0.99);
      const hrEval = evaluateFloodRisk({
        ...inputs,
        rainfall: hrRain,
        soil_saturation: rollingSat,
      });

      hourlySeries.push({
        timeIso: new Date(nowMs + h * 3600_000).toISOString(),
        hourOffset: h,
        label: formatHourOffsetLabel(h),
        phase: h <= 0 ? 'observed' : 'forecast',
        rainfallMm: hrRain,
        soilSaturation: Number(rollingSat.toFixed(2)),
        estimatedRisk: hrEval.probability,
      });
    }

    return {
      ...dist,
      mapX: x,
      mapZ: z,
      weatherSource: sourceTag,
      temperatureC: Number((29.5 - dist.elevationMeters * 0.0055 - rainfall * 0.025).toFixed(1)),
      humidityPct: Math.round(clamp(68 + rainfall * 0.24 + soilSat * 14, 52, 99)),
      observedRainfallMm: rainfall,
      lastUpdatedIso: nowIso,
      inputs,
      riskProbability: evaluated.probability,
      riskCategory: evaluated.category,
      contributions: evaluated.contributions,
      hourlySeries,
    };
  });
}

function parseOpenMeteoDistrict(
  template: TamilNaduDistrictTemplate,
  payload: OpenMeteoLocationPayload | undefined,
  syncedAtIso: string
): TamilNaduDistrictData {
  const { x, z } = projectLonLatToWorld(template.lon, template.lat);
  const current = payload?.current;
  const hourly = payload?.hourly;

  // Open-Meteo reports hourly precipitation in mm/hr. Soil moisture is volumetric (0.0 - ~0.55 m3/m3)
  const rawPrecip =
    typeof current?.precipitation === 'number'
      ? current.precipitation
      : typeof current?.rain === 'number'
        ? current.rain
        : 0;
  const observedRain = Number(clamp(rawPrecip, 0, 180).toFixed(1));

  const times = hourly?.time ?? [];
  const precips = hourly?.precipitation ?? [];
  const soils = hourly?.soil_moisture_0_to_7cm ?? [];

  // Find index closest to current.time (or index 12 since past_hours=12)
  let nowIndex = Math.min(12, Math.max(0, times.length - 1));
  if (current?.time && times.length > 0) {
    const curPrefix = current.time.slice(0, 13); // YYYY-MM-DDTHH
    const matched = times.findIndex((t) => t.startsWith(curPrefix));
    if (matched !== -1) nowIndex = matched;
  }

  // Normalize volumetric soil moisture (typically 0.05..0.50 m3/m3) to 0..1 saturation index
  const currentSoilRaw = soils[nowIndex];
  const liveSoilSaturation =
    typeof currentSoilRaw === 'number' && !Number.isNaN(currentSoilRaw)
      ? Number(clamp(currentSoilRaw / 0.48, 0.12, 0.98).toFixed(2))
      : template.baseSoilSaturation;

  const inputs: FloodInputs = {
    rainfall: observedRain,
    slope: template.baseSlope,
    soil_saturation: liveSoilSaturation,
    drainage_risk: template.baseDrainageRisk,
    elevation: template.relativeElevation,
  };

  const evaluated = evaluateFloodRisk(inputs);

  // Extract 36-hour window (-12h to +23h around nowIndex)
  const hourlySeries: DistrictHourlyPoint[] = [];
  const startIdx = Math.max(0, nowIndex - 12);
  const endIdx = Math.min(times.length - 1, nowIndex + 23);

  for (let i = startIdx; i <= endIdx; i++) {
    const offset = i - nowIndex;
    const hrRain = Number(clamp(Number(precips[i] ?? 0), 0, 180).toFixed(1));
    const hrSoilRaw = soils[i];
    const hrSat =
      typeof hrSoilRaw === 'number' && !Number.isNaN(hrSoilRaw)
        ? Number(clamp(hrSoilRaw / 0.48, 0.12, 0.98).toFixed(2))
        : liveSoilSaturation;

    const hrEval = evaluateFloodRisk({
      ...inputs,
      rainfall: hrRain,
      soil_saturation: hrSat,
    });

    hourlySeries.push({
      timeIso: times[i] ?? syncedAtIso,
      hourOffset: offset,
      label: formatHourOffsetLabel(offset),
      phase: offset <= 0 ? 'observed' : 'forecast',
      rainfallMm: hrRain,
      soilSaturation: hrSat,
      estimatedRisk: hrEval.probability,
    });
  }

  return {
    ...template,
    mapX: x,
    mapZ: z,
    weatherSource: 'open-meteo-live',
    temperatureC:
      typeof current?.temperature_2m === 'number'
        ? Number(current.temperature_2m.toFixed(1))
        : Number((29 - template.elevationMeters * 0.005).toFixed(1)),
    humidityPct:
      typeof current?.relative_humidity_2m === 'number'
        ? Math.round(current.relative_humidity_2m)
        : 74,
    observedRainfallMm: observedRain,
    lastUpdatedIso: current?.time ?? syncedAtIso,
    inputs,
    riskProbability: evaluated.probability,
    riskCategory: evaluated.category,
    contributions: evaluated.contributions,
    hourlySeries,
  };
}

/**
 * Fetches live current + 36h hourly rainfall, temperature, humidity, and soil moisture
 * for all 16 Tamil Nadu districts in ONE batched keyless request to Open-Meteo.
 * Automatically falls back to clearly labeled synthetic Tamil Nadu monsoon data on failure.
 */
export async function fetchLiveTamilNaduDataset(
  fallbackInputs: FloodInputs
): Promise<LiveTamilNaduFetchResult> {
  const lats = TAMIL_NADU_DISTRICTS.map((d) => d.lat.toFixed(4)).join(',');
  const lons = TAMIL_NADU_DISTRICTS.map((d) => d.lon.toFixed(4)).join(',');

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lats}` +
    `&longitude=${lons}` +
    `&current=temperature_2m,relative_humidity_2m,precipitation,rain` +
    `&hourly=precipitation,rain,soil_moisture_0_to_7cm` +
    `&past_hours=12&forecast_hours=24&timezone=Asia%2FKolkata`;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 7000);
  const syncedAtIso = new Date().toISOString();

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    window.clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Open-Meteo HTTP ${response.status}`);
    }

    const raw: unknown = await response.json();
    const list: OpenMeteoLocationPayload[] = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object'
        ? [raw as OpenMeteoLocationPayload]
        : [];

    if (list.length !== TAMIL_NADU_DISTRICTS.length) {
      throw new Error('Incomplete multi-district response from Open-Meteo');
    }

    const districts = TAMIL_NADU_DISTRICTS.map((tpl, idx) =>
      parseOpenMeteoDistrict(tpl, list[idx], syncedAtIso)
    );

    return {
      districts,
      source: 'open-meteo-live',
      syncedAtIso,
      errorNote: null,
    };
  } catch (err) {
    window.clearTimeout(timeoutId);
    const reason =
      err instanceof DOMException && err.name === 'AbortError'
        ? 'Open-Meteo request timed out — displaying synthetic Tamil Nadu fallback dataset'
        : err instanceof Error
          ? `${err.message} — displaying synthetic Tamil Nadu fallback dataset`
          : 'Open-Meteo unreachable — displaying synthetic Tamil Nadu fallback dataset';

    return {
      districts: buildSimulatedTamilNaduDistricts(fallbackInputs, 'synthetic-fallback'),
      source: 'synthetic-fallback',
      syncedAtIso,
      errorNote: reason,
    };
  }
}
