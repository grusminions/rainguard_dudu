import { ChecklistItem, GridSectorTemplate, ScenarioPreset } from '../types/flood';

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'monsoon-active',
    name: 'Active Monsoon Surge',
    description: 'Elevated rainfall over saturated mid-basin soil with constrained urban drainage.',
    stormPattern: 'intensifying',
    inputs: {
      rainfall: 75,
      slope: 15,
      soil_saturation: 0.8,
      drainage_risk: 0.7,
      elevation: 30,
    },
  },
  {
    id: 'cloudburst-stress',
    name: 'Cloudburst Stress Test',
    description: 'Extreme convective rainfall burst testing low-elevation catchment limits.',
    stormPattern: 'double_squall',
    inputs: {
      rainfall: 132,
      slope: 24,
      soil_saturation: 0.91,
      drainage_risk: 0.84,
      elevation: 18,
    },
  },
  {
    id: 'baseline-watch',
    name: 'Routine Monsoon Baseline',
    description: 'Moderate intermittent showers with functioning stormwater conveyance.',
    stormPattern: 'steady',
    inputs: {
      rainfall: 26,
      slope: 9,
      soil_saturation: 0.42,
      drainage_risk: 0.34,
      elevation: 58,
    },
  },
  {
    id: 'drainage-mitigated',
    name: 'Drainage Mitigated Basin',
    description: 'Heavy rain scenario demonstrating reduced localized risk after culvert clearing.',
    stormPattern: 'peak_decay',
    inputs: {
      rainfall: 84,
      slope: 11,
      soil_saturation: 0.68,
      drainage_risk: 0.22,
      elevation: 44,
    },
  },
];

// 5x5 Synthetic Demonstration Catchment Grid (25 Monitored Sectors)
// Rows A (North Upland) -> E (South Riverine Lowland), Cols 1 (West) -> 5 (East)
export const GRID_SECTORS: GridSectorTemplate[] = [
  // Row A (0) - Northern Uplands & Foothills
  {
    id: 'A1', row: 0, col: 0, name: 'North Ridge Crest', zone: 'Upper Catchment',
    baseSlope: 28, baseSoilOffset: -0.14, baseDrainageOffset: -0.22, baseElevation: 86,
    rainfallMultiplier: 1.08, populationEstimate: '~2,400 residents (synthetic)',
    infrastructureNote: 'Hillslope runoff channels & retention check-dams',
  },
  {
    id: 'A2', row: 0, col: 1, name: 'Vindhya Terrace', zone: 'Upper Catchment',
    baseSlope: 22, baseSoilOffset: -0.10, baseDrainageOffset: -0.16, baseElevation: 78,
    rainfallMultiplier: 1.05, populationEstimate: '~4,100 residents (synthetic)',
    infrastructureNote: 'Stepped stormwater spillways along arterial road',
  },
  {
    id: 'A3', row: 0, col: 2, name: 'Reservoir Headworks', zone: 'Upper Catchment',
    baseSlope: 18, baseSoilOffset: -0.05, baseDrainageOffset: -0.10, baseElevation: 72,
    rainfallMultiplier: 1.12, populationEstimate: '~1,800 residents (synthetic)',
    infrastructureNote: 'Upstream detention basin & spillway monitoring zone',
  },
  {
    id: 'A4', row: 0, col: 3, name: 'East Pine Escarpment', zone: 'Upper Catchment',
    baseSlope: 31, baseSoilOffset: -0.12, baseDrainageOffset: -0.18, baseElevation: 82,
    rainfallMultiplier: 1.04, populationEstimate: '~2,900 residents (synthetic)',
    infrastructureNote: 'Steep cut-slope highway corridor',
  },
  {
    id: 'A5', row: 0, col: 4, name: 'Quarried Bluff', zone: 'Upper Catchment',
    baseSlope: 25, baseSoilOffset: -0.08, baseDrainageOffset: -0.08, baseElevation: 74,
    rainfallMultiplier: 0.96, populationEstimate: '~3,300 residents (synthetic)',
    infrastructureNote: 'Excavated quarry pits prone to rapid sheet flow',
  },

  // Row B (1) - Upper Suburban Transition
  {
    id: 'B1', row: 1, col: 0, name: 'West Orchard Slope', zone: 'Mid-Upper Basin',
    baseSlope: 14, baseSoilOffset: -0.04, baseDrainageOffset: -0.12, baseElevation: 62,
    rainfallMultiplier: 1.02, populationEstimate: '~6,200 residents (synthetic)',
    infrastructureNote: 'Permeable agricultural fringe with unpaved drains',
  },
  {
    id: 'B2', row: 1, col: 1, name: 'Tech Park Corridor', zone: 'Mid-Upper Basin',
    baseSlope: 9, baseSoilOffset: 0.02, baseDrainageOffset: 0.04, baseElevation: 54,
    rainfallMultiplier: 1.04, populationEstimate: '~14,500 daytime (synthetic)',
    infrastructureNote: 'High impervious surface ratio with box culverts',
  },
  {
    id: 'B3', row: 1, col: 2, name: 'Central Feeder Canal', zone: 'Mid-Upper Basin',
    baseSlope: 7, baseSoilOffset: 0.08, baseDrainageOffset: 0.14, baseElevation: 44,
    rainfallMultiplier: 1.10, populationEstimate: '~9,800 residents (synthetic)',
    infrastructureNote: 'Confluence of three upland stormwater feeder nallahs',
  },
  {
    id: 'B4', row: 1, col: 3, name: 'University Heights', zone: 'Mid-Upper Basin',
    baseSlope: 12, baseSoilOffset: -0.06, baseDrainageOffset: -0.14, baseElevation: 60,
    rainfallMultiplier: 0.98, populationEstimate: '~8,400 campus pop (synthetic)',
    infrastructureNote: 'Moderately elevated plateau with retention lawns',
  },
  {
    id: 'B5', row: 1, col: 4, name: 'East Freight Yard', zone: 'Mid-Upper Basin',
    baseSlope: 5, baseSoilOffset: 0.05, baseDrainageOffset: 0.12, baseElevation: 48,
    rainfallMultiplier: 0.95, populationEstimate: '~5,100 workers (synthetic)',
    infrastructureNote: 'Wide concrete aprons with aging lateral drains',
  },

  // Row C (2) - Urban Core & Transit Underpasses
  {
    id: 'C1', row: 2, col: 0, name: 'West Ring Road', zone: 'Urban Core',
    baseSlope: 6, baseSoilOffset: 0.04, baseDrainageOffset: 0.08, baseElevation: 42,
    rainfallMultiplier: 0.99, populationEstimate: '~11,200 residents (synthetic)',
    infrastructureNote: 'Grade-separated underpass prone to surface ponding',
  },
  {
    id: 'C2', row: 2, col: 1, name: 'Old Market Basin', zone: 'Urban Core',
    baseSlope: 3, baseSoilOffset: 0.12, baseDrainageOffset: 0.22, baseElevation: 26,
    rainfallMultiplier: 1.07, populationEstimate: '~19,400 residents (synthetic)',
    infrastructureNote: 'Historic narrow masonry drains with high silt load',
  },
  {
    id: 'C3', row: 2, col: 2, name: 'Junction Underpass', zone: 'Urban Core',
    baseSlope: 2, baseSoilOffset: 0.14, baseDrainageOffset: 0.26, baseElevation: 20,
    rainfallMultiplier: 1.14, populationEstimate: '~22,000 commuters (synthetic)',
    infrastructureNote: 'Major rail-road depression; primary pumping station',
  },
  {
    id: 'C4', row: 2, col: 3, name: 'Civic Hospital Ward', zone: 'Urban Core',
    baseSlope: 5, baseSoilOffset: 0.06, baseDrainageOffset: 0.10, baseElevation: 36,
    rainfallMultiplier: 1.05, populationEstimate: '~13,600 residents (synthetic)',
    infrastructureNote: 'Priority access road & emergency power substation',
  },
  {
    id: 'C5', row: 2, col: 4, name: 'East Industrial Estate', zone: 'Urban Core',
    baseSlope: 4, baseSoilOffset: 0.08, baseDrainageOffset: 0.16, baseElevation: 32,
    rainfallMultiplier: 0.97, populationEstimate: '~10,300 workers (synthetic)',
    infrastructureNote: 'Low-gradient warehouse blocks near outfall drain',
  },

  // Row D (3) - Floodplain & Wetland Buffer
  {
    id: 'D1', row: 3, col: 0, name: 'Canal Colony West', zone: 'Floodplain',
    baseSlope: 4, baseSoilOffset: 0.10, baseDrainageOffset: 0.15, baseElevation: 28,
    rainfallMultiplier: 1.01, populationEstimate: '~12,800 residents (synthetic)',
    infrastructureNote: 'Embankment frontage with sluice gate control',
  },
  {
    id: 'D2', row: 3, col: 1, name: 'Kaveri Lowland', zone: 'Floodplain',
    baseSlope: 2, baseSoilOffset: 0.16, baseDrainageOffset: 0.24, baseElevation: 14,
    rainfallMultiplier: 1.09, populationEstimate: '~16,700 residents (synthetic)',
    infrastructureNote: 'Bowl-shaped depression adjacent to main collector',
  },
  {
    id: 'D3', row: 3, col: 2, name: 'Riverbend Flats', zone: 'Floodplain',
    baseSlope: 1, baseSoilOffset: 0.18, baseDrainageOffset: 0.28, baseElevation: 10,
    rainfallMultiplier: 1.15, populationEstimate: '~15,200 residents (synthetic)',
    infrastructureNote: 'Inner meander floodplain with high backwater sensitivity',
  },
  {
    id: 'D4', row: 3, col: 3, name: 'South Wetland Pocket', zone: 'Floodplain',
    baseSlope: 3, baseSoilOffset: 0.14, baseDrainageOffset: 0.12, baseElevation: 22,
    rainfallMultiplier: 1.06, populationEstimate: '~7,400 residents (synthetic)',
    infrastructureNote: 'Partially encroached natural retention marsh',
  },
  {
    id: 'D5', row: 3, col: 4, name: 'Bridge Approach East', zone: 'Floodplain',
    baseSlope: 6, baseSoilOffset: 0.06, baseDrainageOffset: 0.06, baseElevation: 34,
    rainfallMultiplier: 0.96, populationEstimate: '~8,900 residents (synthetic)',
    infrastructureNote: 'Elevated highway approach with cross-culverts',
  },

  // Row E (4) - Downstream Outfall & Deltaic Fringe
  {
    id: 'E1', row: 4, col: 0, name: 'Southwest Paddy Basin', zone: 'Outfall Zone',
    baseSlope: 2, baseSoilOffset: 0.12, baseDrainageOffset: 0.08, baseElevation: 24,
    rainfallMultiplier: 0.98, populationEstimate: '~4,600 residents (synthetic)',
    infrastructureNote: 'Low-lying agricultural flood-absorption fields',
  },
  {
    id: 'E2', row: 4, col: 1, name: 'Outfall Pumping Sump', zone: 'Outfall Zone',
    baseSlope: 1, baseSoilOffset: 0.16, baseDrainageOffset: 0.22, baseElevation: 12,
    rainfallMultiplier: 1.08, populationEstimate: '~9,100 residents (synthetic)',
    infrastructureNote: 'Terminal stormwater discharge gate & pump array',
  },
  {
    id: 'E3', row: 4, col: 2, name: 'Estuary Weir Sector', zone: 'Outfall Zone',
    baseSlope: 1, baseSoilOffset: 0.17, baseDrainageOffset: 0.20, baseElevation: 9,
    rainfallMultiplier: 1.11, populationEstimate: '~6,800 residents (synthetic)',
    infrastructureNote: 'Downstream weir sensitive to tailwater buildup',
  },
  {
    id: 'E4', row: 4, col: 3, name: 'Southern Beltway', zone: 'Outfall Zone',
    baseSlope: 4, baseSoilOffset: 0.08, baseDrainageOffset: 0.04, baseElevation: 30,
    rainfallMultiplier: 1.00, populationEstimate: '~10,500 residents (synthetic)',
    infrastructureNote: 'Raised arterial corridor serving as logistics route',
  },
  {
    id: 'E5', row: 4, col: 4, name: 'Southeast Dry Mound', zone: 'Outfall Zone',
    baseSlope: 10, baseSoilOffset: -0.05, baseDrainageOffset: -0.15, baseElevation: 56,
    rainfallMultiplier: 0.92, populationEstimate: '~5,400 residents (synthetic)',
    infrastructureNote: 'Elevated terrain suitable for staging logistics',
  },
];

export const INITIAL_READINESS_CHECKLIST: ChecklistItem[] = [
  {
    id: 'chk-1',
    category: 'Drainage',
    label: 'Inspect stormwater grates and clear debris at low-elevation underpasses',
    completed: true,
    priority: 'Priority',
  },
  {
    id: 'chk-2',
    category: 'Drainage',
    label: 'Verify backup diesel supply and priming on outfall dewatering pumps',
    completed: false,
    priority: 'Priority',
  },
  {
    id: 'chk-3',
    category: 'Logistics',
    label: 'Pre-stage portable water barricades and signage near Junction Underpass (C3)',
    completed: false,
    priority: 'Elevated',
  },
  {
    id: 'chk-4',
    category: 'Coordination',
    label: 'Confirm standby power continuity plan with Civic Hospital Ward (C4) engineering team',
    completed: false,
    priority: 'Priority',
  },
  {
    id: 'chk-5',
    category: 'Logistics',
    label: 'Review relief shelter supply inventory on elevated staging grounds (B4 / E5)',
    completed: true,
    priority: 'Standard',
  },
  {
    id: 'chk-6',
    category: 'Public Info',
    label: 'Prepare draft local commuter waterlogging advisory for municipal review (non-broadcast)',
    completed: false,
    priority: 'Elevated',
  },
];
