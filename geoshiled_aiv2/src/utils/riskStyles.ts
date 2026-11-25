import { RiskCategory } from '../types/flood';

export interface RiskVisualMeta {
  label: RiskCategory;
  shortCode: string;
  symbol: string;
  textClass: string;
  cellBg: string;
  cellBorder: string;
  cellText: string;
  barFill: string;
  chartHex: string;
}

export const RISK_VISUALS: Record<RiskCategory, RiskVisualMeta> = {
  Low: {
    label: 'Low',
    shortCode: 'LOW',
    symbol: '●',
    textClass: 'text-[#86EFAC]',
    cellBg: 'bg-[#1D3521] hover:bg-[#244329]',
    cellBorder: 'border-[#33663B]',
    cellText: 'text-[#DCFCE7]',
    barFill: 'bg-[#4ADE80]',
    chartHex: '#4ADE80',
  },
  Moderate: {
    label: 'Moderate',
    shortCode: 'MOD',
    symbol: '◆',
    textClass: 'text-[#FDE047]',
    cellBg: 'bg-[#4A3B0E] hover:bg-[#5B4911]',
    cellBorder: 'border-[#96781A]',
    cellText: 'text-[#FEF9C3]',
    barFill: 'bg-[#FACC15]',
    chartHex: '#FACC15',
  },
  High: {
    label: 'High',
    shortCode: 'HIGH',
    symbol: '▲',
    textClass: 'text-[#FDBA74]',
    cellBg: 'bg-[#5B2A11] hover:bg-[#6E3415]',
    cellBorder: 'border-[#B8541F]',
    cellText: 'text-[#FFEDD5]',
    barFill: 'bg-[#FB923C]',
    chartHex: '#FB923C',
  },
  'Very High': {
    label: 'Very High',
    shortCode: 'CRIT',
    symbol: '✖',
    textClass: 'text-[#FCA5A5]',
    cellBg: 'bg-[#5A181A] hover:bg-[#6F1E20]',
    cellBorder: 'border-[#B9383C]',
    cellText: 'text-[#FEE2E2]',
    barFill: 'bg-[#F87171]',
    chartHex: '#F87171',
  },
};

export function formatPct(probability: number, decimals = 1): string {
  return `${(probability * 100).toFixed(decimals)}%`;
}
