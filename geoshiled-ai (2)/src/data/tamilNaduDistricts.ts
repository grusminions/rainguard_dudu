import { TamilNaduDistrictTemplate } from '../types/flood';

// Geographic projection center & scale for Tamil Nadu in Three.js world space
// Center ~ (78.45 E, 10.80 N) -> maps to (0, 0) in XZ plane (width ~10.8, height ~14.4)
export const TN_GEO_CENTER = {
  lon: 78.45,
  lat: 10.82,
  scaleX: 2.35, // East-West units per degree longitude
  scaleZ: 2.48, // North-South units per degree latitude
};

export function projectLonLatToWorld(lon: number, lat: number): { x: number; z: number } {
  const x = (lon - TN_GEO_CENTER.lon) * TN_GEO_CENTER.scaleX;
  // North is -Z in Three.js so top-down view aligns North upward
  const z = -(lat - TN_GEO_CENTER.lat) * TN_GEO_CENTER.scaleZ;
  return { x, z };
}

/**
 * Simplified accurate clockwise polygon of Tamil Nadu (lon, lat)
 * Traces Pulicat -> Northern border -> Western Ghats -> Kanyakumari -> Gulf of Mannar -> Coromandel Coast
 */
export const TAMIL_NADU_OUTLINE_LONLAT: ReadonlyArray<readonly [number, number]> = [
  [80.31, 13.48], // Pulicat / NE corner
  [80.02, 13.44],
  [79.64, 13.26], // Tiruttani
  [79.18, 13.16], // Chittoor border
  [78.78, 13.06], // Gudiyatham / Vellore north
  [78.42, 12.92], // Vaniyambadi
  [78.08, 12.78], // Krishnagiri
  [77.78, 12.76], // Hosur
  [77.66, 12.42], // Denkanikottai
  [77.72, 12.10], // Hogenakkal
  [77.60, 11.86], // Stanley Reservoir west
  [77.12, 11.78], // Sathyamangalam hills
  [76.68, 11.68], // Mudumalai
  [76.34, 11.54], // Gudalur / Nilgiris west
  [76.48, 11.24], // Nilgiris south-west
  [76.76, 10.96], // Coimbatore west
  [76.84, 10.68], // Pollachi / Palakkad gap
  [76.96, 10.30], // Valparai / Anaimalai
  [77.18, 10.05], // Kodaikanal west
  [77.20, 9.68],  // Theni / Cumbum
  [77.38, 9.34],  // Srivilliputhur hills
  [77.22, 8.96],  // Tenkasi / Courtallam
  [77.26, 8.58],  // Papanasam / Agasthyamalai
  [77.18, 8.26],  // Nagercoil west
  [77.54, 8.08],  // Kanyakumari southern tip
  [77.88, 8.22],  // Kudankulam coast
  [78.13, 8.49],  // Tiruchendur
  [78.18, 8.81],  // Thoothukudi
  [78.48, 9.10],  // Sayalkudi
  [78.92, 9.26],  // Kilakarai
  [79.32, 9.28],  // Rameswaram / Pamban
  [78.96, 9.52],  // Palk Bay inner curve
  [79.10, 9.90],  // Thondi
  [79.36, 10.18], // Adirampattinam
  [79.85, 10.28], // Point Calimere (Kodikkarai)
  [79.86, 10.77], // Nagapattinam
  [79.86, 11.16], // Poompuhar / Mayiladuthurai coast
  [79.78, 11.52], // Pichavaram / Chidambaram
  [79.79, 11.76], // Cuddalore
  [79.84, 11.95], // Puducherry coast
  [79.96, 12.24], // Marakkanam
  [80.20, 12.62], // Mahabalipuram
  [80.29, 13.08], // Chennai Marina
  [80.34, 13.30], // Ennore
];

// Major river corridors for 3D hydrological context (lon, lat)
export const TAMIL_NADU_RIVERS: Array<{
  name: string;
  coords: ReadonlyArray<readonly [number, number]>;
}> = [
  {
    name: 'Cauvery',
    coords: [
      [77.77, 12.11],
      [77.84, 11.78],
      [77.74, 11.34],
      [78.08, 11.02],
      [78.70, 10.82],
      [79.14, 10.81],
      [79.62, 10.95],
      [79.85, 11.14],
    ],
  },
  {
    name: 'Palar',
    coords: [
      [78.58, 12.76],
      [79.13, 12.92],
      [79.56, 12.86],
      [79.97, 12.68],
      [80.17, 12.46],
    ],
  },
  {
    name: 'Vaigai',
    coords: [
      [77.46, 9.95],
      [77.80, 10.02],
      [78.12, 9.92],
      [78.52, 9.72],
      [78.84, 9.38],
      [79.01, 9.33],
    ],
  },
  {
    name: 'Thamirabarani',
    coords: [
      [77.36, 8.70],
      [77.69, 8.73],
      [77.92, 8.66],
      [78.12, 8.63],
    ],
  },
];

/**
 * 16 Key Tamil Nadu Districts across Coastal Plains, Cauvery Delta,
 * Western Ghats / Hills, Interior Plateau, and Southern Basin.
 */
export const TAMIL_NADU_DISTRICTS: TamilNaduDistrictTemplate[] = [
  {
    id: 'chennai',
    code: 'CHN',
    name: 'Chennai',
    region: 'Coastal Plains',
    lat: 13.0827,
    lon: 80.2707,
    elevationMeters: 7,
    relativeElevation: 8,
    baseSlope: 2,
    baseDrainageRisk: 0.78,
    baseSoilSaturation: 0.66,
    monsoonMultiplier: 1.24,
    basinNote: 'Adyar, Cooum & Buckingham Canal coastal urban basin',
  },
  {
    id: 'chengalpattu',
    code: 'CGL',
    name: 'Chengalpattu',
    region: 'Coastal Plains',
    lat: 12.6921,
    lon: 79.9756,
    elevationMeters: 36,
    relativeElevation: 20,
    baseSlope: 4,
    baseDrainageRisk: 0.64,
    baseSoilSaturation: 0.62,
    monsoonMultiplier: 1.16,
    basinNote: 'Chembarambakkam & Palar suburban lake cascade',
  },
  {
    id: 'villupuram',
    code: 'VPM',
    name: 'Villupuram',
    region: 'Coastal Plains',
    lat: 11.9401,
    lon: 79.4861,
    elevationMeters: 44,
    relativeElevation: 25,
    baseSlope: 4,
    baseDrainageRisk: 0.56,
    baseSoilSaturation: 0.58,
    monsoonMultiplier: 1.08,
    basinNote: 'Thenpennaiyar river alluvial plains & irrigation tanks',
  },
  {
    id: 'cuddalore',
    code: 'CDL',
    name: 'Cuddalore',
    region: 'Coastal Plains',
    lat: 11.748,
    lon: 79.7714,
    elevationMeters: 6,
    relativeElevation: 7,
    baseSlope: 2,
    baseDrainageRisk: 0.76,
    baseSoilSaturation: 0.70,
    monsoonMultiplier: 1.22,
    basinNote: 'Gadilam–Pennaiyar coastal estuary & low-lying backwaters',
  },
  {
    id: 'nagapattinam',
    code: 'NGP',
    name: 'Nagapattinam',
    region: 'Cauvery Delta',
    lat: 10.7672,
    lon: 79.8449,
    elevationMeters: 4,
    relativeElevation: 5,
    baseSlope: 1,
    baseDrainageRisk: 0.80,
    baseSoilSaturation: 0.74,
    monsoonMultiplier: 1.20,
    basinNote: 'Tail-end Cauvery delta drainage canals & coastal tidal flats',
  },
  {
    id: 'thanjavur',
    code: 'TNJ',
    name: 'Thanjavur',
    region: 'Cauvery Delta',
    lat: 10.787,
    lon: 79.1378,
    elevationMeters: 57,
    relativeElevation: 24,
    baseSlope: 2,
    baseDrainageRisk: 0.60,
    baseSoilSaturation: 0.68,
    monsoonMultiplier: 1.05,
    basinNote: 'Grand Anicut (Kallanai) Cauvery-Vennar distributary network',
  },
  {
    id: 'tiruchirappalli',
    code: 'TRY',
    name: 'Tiruchirappalli',
    region: 'Cauvery Delta',
    lat: 10.7905,
    lon: 78.7047,
    elevationMeters: 85,
    relativeElevation: 36,
    baseSlope: 5,
    baseDrainageRisk: 0.50,
    baseSoilSaturation: 0.56,
    monsoonMultiplier: 0.96,
    basinNote: 'Upper Anicut (Mukkombu) Cauvery–Kollidam bifurcation point',
  },
  {
    id: 'vellore',
    code: 'VLR',
    name: 'Vellore',
    region: 'Interior Plateau',
    lat: 12.9165,
    lon: 79.1325,
    elevationMeters: 216,
    relativeElevation: 54,
    baseSlope: 11,
    baseDrainageRisk: 0.44,
    baseSoilSaturation: 0.50,
    monsoonMultiplier: 0.92,
    basinNote: 'Palar valley basin bounded by Javadi hill spurs',
  },
  {
    id: 'salem',
    code: 'SLM',
    name: 'Salem',
    region: 'Interior Plateau',
    lat: 11.6643,
    lon: 78.146,
    elevationMeters: 278,
    relativeElevation: 62,
    baseSlope: 14,
    baseDrainageRisk: 0.42,
    baseSoilSaturation: 0.48,
    monsoonMultiplier: 0.88,
    basinNote: 'Thirumanimutharu corridor & Shevaroy foothill runoff',
  },
  {
    id: 'erode',
    code: 'ERD',
    name: 'Erode',
    region: 'Interior Plateau',
    lat: 11.341,
    lon: 77.7172,
    elevationMeters: 171,
    relativeElevation: 48,
    baseSlope: 8,
    baseDrainageRisk: 0.46,
    baseSoilSaturation: 0.52,
    monsoonMultiplier: 0.90,
    basinNote: 'Bhavani–Cauvery confluence & Lower Bhavani canal zone',
  },
  {
    id: 'coimbatore',
    code: 'CBE',
    name: 'Coimbatore',
    region: 'Western Ghats',
    lat: 11.0168,
    lon: 76.9558,
    elevationMeters: 411,
    relativeElevation: 68,
    baseSlope: 15,
    baseDrainageRisk: 0.48,
    baseSoilSaturation: 0.54,
    monsoonMultiplier: 0.95,
    basinNote: 'Noyyal urban lake system & Western Ghats rain-shadow edge',
  },
  {
    id: 'nilgiris',
    code: 'NLG',
    name: 'The Nilgiris',
    region: 'Western Ghats',
    lat: 11.4102,
    lon: 76.695,
    elevationMeters: 2240,
    relativeElevation: 94,
    baseSlope: 34,
    baseDrainageRisk: 0.52,
    baseSoilSaturation: 0.72,
    monsoonMultiplier: 1.18,
    basinNote: 'Steep montane slopes prone to intense orographic runoff',
  },
  {
    id: 'madurai',
    code: 'MDU',
    name: 'Madurai',
    region: 'Southern Basin',
    lat: 9.9252,
    lon: 78.1198,
    elevationMeters: 134,
    relativeElevation: 42,
    baseSlope: 6,
    baseDrainageRisk: 0.54,
    baseSoilSaturation: 0.52,
    monsoonMultiplier: 0.94,
    basinNote: 'Vaigai river urban floodway & interconnected temple tanks',
  },
  {
    id: 'ramanathapuram',
    code: 'RMD',
    name: 'Ramanathapuram',
    region: 'Coastal Plains',
    lat: 9.3639,
    lon: 78.8395,
    elevationMeters: 8,
    relativeElevation: 10,
    baseSlope: 2,
    baseDrainageRisk: 0.62,
    baseSoilSaturation: 0.55,
    monsoonMultiplier: 1.06,
    basinNote: 'Low-lying Vaigai tail-end peninsula & Gulf of Mannar shore',
  },
  {
    id: 'tirunelveli',
    code: 'TNV',
    name: 'Tirunelveli',
    region: 'Southern Basin',
    lat: 8.7139,
    lon: 77.7567,
    elevationMeters: 47,
    relativeElevation: 28,
    baseSlope: 7,
    baseDrainageRisk: 0.58,
    baseSoilSaturation: 0.60,
    monsoonMultiplier: 1.12,
    basinNote: 'Thamirabarani perennial basin fed by Papanasam catchment',
  },
  {
    id: 'kanyakumari',
    code: 'KKM',
    name: 'Kanyakumari',
    region: 'Southern Basin',
    lat: 8.0883,
    lon: 77.5385,
    elevationMeters: 30,
    relativeElevation: 22,
    baseSlope: 13,
    baseDrainageRisk: 0.60,
    baseSoilSaturation: 0.65,
    monsoonMultiplier: 1.14,
    basinNote: 'Dual-monsoon coastal tip with steep Agasthyamalai runoff',
  },
];

/**
 * Computes stylized topographic height (0 to 0.72 world units) across Tamil Nadu
 * so Western Ghats highlands rise naturally on the western edge while eastern coastal
 * plains and Cauvery delta slope smoothly toward the Bay of Bengal.
 */
export function getTamilNaduTerrainHeight(worldX: number, worldZ: number): number {
  // Convert world back to approximate lon/lat
  const lon = worldX / TN_GEO_CENTER.scaleX + TN_GEO_CENTER.lon;
  const lat = -worldZ / TN_GEO_CENTER.scaleZ + TN_GEO_CENTER.lat;

  // Western Ghats spine ridge (strongest near Nilgiris 76.6, 11.4 and Kodaikanal 77.3, 10.2)
  const nilgiriPeak =
    0.78 * Math.exp(-((lon - 76.68) ** 2 / 0.24 + (lat - 11.42) ** 2 / 0.28));
  const anaimalaiPeak =
    0.58 * Math.exp(-((lon - 77.15) ** 2 / 0.22 + (lat - 10.25) ** 2 / 0.35));
  const agasthyaPeak =
    0.45 * Math.exp(-((lon - 77.32) ** 2 / 0.16 + (lat - 8.85) ** 2 / 0.32));
  const shevaroyPeak =
    0.34 * Math.exp(-((lon - 78.22) ** 2 / 0.22 + (lat - 11.82) ** 2 / 0.22));
  const javadiPeak =
    0.26 * Math.exp(-((lon - 78.88) ** 2 / 0.26 + (lat - 12.60) ** 2 / 0.20));

  // Gentle west-to-east slope toward Bay of Bengal
  const westTilt = Math.max(0, (79.7 - lon) * 0.055);
  return Math.min(0.95, 0.06 + westTilt + nilgiriPeak + anaimalaiPeak + agasthyaPeak + shevaroyPeak + javadiPeak);
}
