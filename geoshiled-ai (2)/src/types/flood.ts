export type RiskCategory = 'Low' | 'Moderate' | 'High' | 'Very High';

export type DashboardSection =
  | 'overview'
  | 'forecast'
  | 'simulator'
  | 'montecarlo'
  | 'responder';

export type OverviewMapMode = 'tamilnadu-3d' | 'grid-2d';
export type DataSourceMode = 'live' | 'simulated';
export type TamilNaduRegion =
  | 'Coastal Plains'
  | 'Cauvery Delta'
  | 'Western Ghats'
  | 'Interior Plateau'
  | 'Southern Basin';

export interface FloodInputs {
  rainfall: number;        // mm/hour (0 - 180)
  slope: number;           // degrees (0 - 45)
  soil_saturation: number; // 0 - 1
  drainage_risk: number;   // 0 - 1
  elevation: number;       // 0 - 100 relative elevation units
}

export interface FactorContribution {
  factor: string;
  key: keyof FloodInputs;
  weightPercent: number;
  rawImpact: number;
  summary: string;
}

export interface PredictionResult {
  risk_probability: number;
  risk_category: RiskCategory;
  source: 'demo-engine' | 'fastapi-backend' | 'fallback-demo';
  latencyMs?: number;
  fallbackReason?: string;
  contributions: FactorContribution[];
}

export interface ScenarioEnvelope {
  bestCase: {
    probability: number;
    category: RiskCategory;
    inputs: FloodInputs;
  };
  expected: {
    probability: number;
    category: RiskCategory;
    inputs: FloodInputs;
  };
  worstCase: {
    probability: number;
    category: RiskCategory;
    inputs: FloodInputs;
  };
}

export interface SensitivityItem {
  parameter: string;
  key: keyof FloodInputs;
  lowProb: number;
  baseProb: number;
  highProb: number;
  deltaSpan: number;
}

export interface GridSectorTemplate {
  id: string;
  row: number;
  col: number;
  name: string;
  zone: string;
  baseSlope: number;
  baseSoilOffset: number;
  baseDrainageOffset: number;
  baseElevation: number;
  rainfallMultiplier: number;
  populationEstimate: string;
  infrastructureNote: string;
}

export interface GridCellData {
  id: string;
  row: number;
  col: number;
  name: string;
  zone: string;
  inputs: FloodInputs;
  riskProbability: number;
  riskCategory: RiskCategory;
  contributions: FactorContribution[];
  populationEstimate: string;
  infrastructureNote: string;
}

export interface TamilNaduDistrictTemplate {
  id: string;
  code: string;
  name: string;
  region: TamilNaduRegion;
  lat: number;
  lon: number;
  elevationMeters: number;
  relativeElevation: number; // 0-100 normalized for flood model
  baseSlope: number;
  baseDrainageRisk: number;
  baseSoilSaturation: number;
  monsoonMultiplier: number; // Relative intensity during simulated stress presets
  basinNote: string;
}

export interface DistrictHourlyPoint {
  timeIso: string;
  hourOffset: number; // -12 to +23
  label: string;
  phase: 'observed' | 'forecast';
  rainfallMm: number;
  soilSaturation: number;
  estimatedRisk: number;
}

export interface TamilNaduDistrictData extends TamilNaduDistrictTemplate {
  mapX: number; // 3D world X coordinate
  mapZ: number; // 3D world Z coordinate
  weatherSource: 'open-meteo-live' | 'synthetic-fallback' | 'simulated-scenario';
  temperatureC: number;
  humidityPct: number;
  observedRainfallMm: number;
  lastUpdatedIso: string;
  inputs: FloodInputs;
  riskProbability: number;
  riskCategory: RiskCategory;
  contributions: FactorContribution[];
  hourlySeries: DistrictHourlyPoint[];
}

export interface LiveFeedStatus {
  loading: boolean;
  source: 'open-meteo-live' | 'synthetic-fallback';
  lastSyncedAt: string | null;
  errorNote: string | null;
}

export type StormPattern = 'steady' | 'intensifying' | 'peak_decay' | 'double_squall';

export interface ForecastPoint {
  hourOffset: number; // -12 to +horizon
  label: string;
  phase: 'historical' | 'forecast';
  observedRainfall: number | null;
  predictedRainfall: number | null;
  forecastLower: number | null;
  forecastUpper: number | null;
  cumulativeMm: number;
  projectedSaturation: number;
  estimatedRisk: number;
}

export interface MonteCarloConfig {
  iterations: number;
  rainfallUncertaintyPct: number; // e.g., 20 means +/-20%
  terrainUncertaintyPct: number;  // slope, soil, elevation noise
  drainageUncertaintyPct: number; // drainage uncertainty
  highRiskThreshold: number;      // 0 - 1, default 0.65
}

export interface HistogramBin {
  rangeLabel: string;
  midpoint: number;
  count: number;
  percent: number;
  category: RiskCategory;
}

export interface ExceedancePoint {
  thresholdPct: number;
  exceedancePct: number;
}

export interface MonteCarloResult {
  iterations: number;
  seed: number;
  runtimeMs: number;
  mean: number;
  stdDev: number;
  p10: number;
  median: number;
  p90: number;
  min: number;
  max: number;
  exceedingThresholdCount: number;
  exceedingThresholdPct: number;
  highRiskThreshold: number;
  histogram: HistogramBin[];
  exceedanceCurve: ExceedancePoint[];
}

export interface ScenarioPreset {
  id: string;
  name: string;
  description: string;
  stormPattern: StormPattern;
  inputs: FloodInputs;
}

export interface BackendConfig {
  mode: 'demo' | 'fastapi';
  endpointUrl: string;
}

export interface ChecklistItem {
  id: string;
  category: 'Drainage' | 'Logistics' | 'Coordination' | 'Public Info';
  label: string;
  completed: boolean;
  priority: 'Standard' | 'Elevated' | 'Priority';
}
