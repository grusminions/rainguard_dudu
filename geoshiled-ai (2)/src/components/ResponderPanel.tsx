import {
  Check,
  CheckSquare,
  Copy,
  Download,
  MapPin,
  Plus,
  RotateCcw,
  Sliders,
  Square,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ChecklistItem,
  FloodInputs,
  GridCellData,
  MonteCarloResult,
  OverviewMapMode,
  RiskCategory,
  TamilNaduDistrictData,
} from '../types/flood';
import { formatPct, RISK_VISUALS } from '../utils/riskStyles';

interface ResponderPanelProps {
  mapMode: OverviewMapMode;
  districts: TamilNaduDistrictData[];
  gridCells: GridCellData[];
  inputs: FloodInputs;
  monteCarlo: MonteCarloResult;
  checklist: ChecklistItem[];
  onToggleChecklistItem: (id: string) => void;
  onAddChecklistItem: (label: string, category: ChecklistItem['category']) => void;
  onResetChecklist: () => void;
  onInspectCellOnMap: (cellId: string) => void;
  onInspectDistrictOn3DMap: (districtId: string) => void;
  onLoadCellIntoSimulator: (cell: GridCellData) => void;
  onLoadDistrictIntoSimulator: (district: TamilNaduDistrictData) => void;
}

type DraftMode = 'internal' | 'community';

export function ResponderPanel({
  mapMode,
  districts,
  gridCells,
  inputs,
  monteCarlo,
  checklist,
  onToggleChecklistItem,
  onAddChecklistItem,
  onResetChecklist,
  onInspectCellOnMap,
  onInspectDistrictOn3DMap,
  onLoadCellIntoSimulator,
  onLoadDistrictIntoSimulator,
}: ResponderPanelProps) {
  const [scopeMode, setScopeMode] = useState<'tamilnadu' | 'grid'>(
    mapMode === 'tamilnadu-3d' ? 'tamilnadu' : 'grid'
  );
  const [draftMode, setDraftMode] = useState<DraftMode>('internal');
  const [customDraft, setCustomDraft] = useState<string>('');
  const [isDraftEdited, setIsDraftEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [newTaskCategory, setNewTaskCategory] = useState<ChecklistItem['category']>('Drainage');
  const [checklistFilter, setChecklistFilter] = useState<'All' | ChecklistItem['category']>('All');

  const analysis = useMemo(() => {
    if (scopeMode === 'tamilnadu') {
      const sorted = [...districts].sort((a, b) => b.riskProbability - a.riskProbability);
      const vulnerableDistricts = sorted.slice(0, 7);
      const avgRisk = districts.reduce((s, d) => s + d.riskProbability, 0) / districts.length;
      const counts: Record<RiskCategory, number> = {
        'Very High': 0,
        High: 0,
        Moderate: 0,
        Low: 0,
      };
      for (const d of districts) counts[d.riskCategory]++;

      let overallCategory: RiskCategory = 'Low';
      if (counts['Very High'] >= 3 || avgRisk >= 0.68) overallCategory = 'Very High';
      else if (counts['Very High'] + counts.High >= 4 || avgRisk >= 0.50) overallCategory = 'High';
      else if (counts['Very High'] + counts.High + counts.Moderate >= 5 || avgRisk >= 0.30)
        overallCategory = 'Moderate';

      const topDriver = vulnerableDistricts[0]?.contributions[0]?.factor ?? 'Rainfall Intensity';
      const topThreeSummary = vulnerableDistricts
        .slice(0, 3)
        .map((d) => `${d.name} (${d.code}, ${formatPct(d.riskProbability, 0)})`)
        .join('; ');

      return {
        totalNodes: districts.length,
        nodeLabel: 'Tamil Nadu districts',
        vulnerableDistricts,
        vulnerableCells: [] as GridCellData[],
        avgRisk,
        counts,
        overallCategory,
        topDriver,
        topThreeSummary,
      };
    }

    const sorted = [...gridCells].sort((a, b) => b.riskProbability - a.riskProbability);
    const vulnerableCells = sorted.slice(0, 7);
    const avgRisk = gridCells.reduce((s, c) => s + c.riskProbability, 0) / gridCells.length;
    const counts: Record<RiskCategory, number> = {
      'Very High': 0,
      High: 0,
      Moderate: 0,
      Low: 0,
    };
    for (const c of gridCells) counts[c.riskCategory]++;

    let overallCategory: RiskCategory = 'Low';
    if (counts['Very High'] >= 4 || avgRisk >= 0.72) overallCategory = 'Very High';
    else if (counts['Very High'] + counts.High >= 6 || avgRisk >= 0.55) overallCategory = 'High';
    else if (counts['Very High'] + counts.High + counts.Moderate >= 8 || avgRisk >= 0.32)
      overallCategory = 'Moderate';

    const topDriver = vulnerableCells[0]?.contributions[0]?.factor ?? 'Rainfall Intensity';
    const topThreeSummary = vulnerableCells
      .slice(0, 3)
      .map((c) => `${c.name} (${c.id}, ${formatPct(c.riskProbability, 0)})`)
      .join('; ');

    return {
      totalNodes: gridCells.length,
      nodeLabel: 'synthetic basin sectors',
      vulnerableDistricts: [] as TamilNaduDistrictData[],
      vulnerableCells,
      avgRisk,
      counts,
      overallCategory,
      topDriver,
      topThreeSummary,
    };
  }, [scopeMode, districts, gridCells]);

  const generatedDraft = useMemo(() => {
    if (draftMode === 'internal') {
      return [
        '[SIMULATION DRAFT — PROTOTYPE BRIEF ONLY · NOT TRANSMITTED · NOT AN OFFICIAL ORDER]',
        '',
        `Scope: ${scopeMode === 'tamilnadu' ? 'Tamil Nadu 16-District Monitor' : '5×5 Synthetic Basin Grid'}`,
        `Estimated Risk Tier: ${analysis.overallCategory.toUpperCase()} (Mean: ${formatPct(analysis.avgRisk)})`,
        `Simulator Stress Inputs: Rainfall ${inputs.rainfall.toFixed(1)} mm/hr | Soil Saturation ${inputs.soil_saturation.toFixed(2)} | Drainage Risk ${inputs.drainage_risk.toFixed(2)}`,
        `Monte Carlo Sensitivity: ${monteCarlo.exceedingThresholdPct.toFixed(1)}% of ${monteCarlo.iterations.toLocaleString()} runs exceed ${Math.round(monteCarlo.highRiskThreshold * 100)}% threshold.`,
        '',
        `Highest-Ranked Monitored Nodes: ${analysis.topThreeSummary}.`,
        `Primary Estimated Driver: ${analysis.topDriver}.`,
        '',
        'Suggested Readiness Review (Non-Binding Prototype Checklist):',
        '- Review dewatering pump readiness across low-elevation coastal, delta, and underpass zones.',
        '- Confirm standby barricades for localized waterlogging corridors.',
        '- Coordinate verification strictly with authorized district disaster management authorities.',
        '',
        'Disclaimer: Weather observations via Open-Meteo (or synthetic fallback); flood-risk scores are prototype model estimates for SIH 2026.',
      ].join('\n');
    }

    return [
      '[SIMULATION DRAFT — COMMUNITY ADVISORY TEMPLATE · NOT FOR BROADCAST]',
      '',
      `Weather Readiness Notice (Prototype ${analysis.overallCategory} Flood-Risk Estimate):`,
      `Current model estimates highlight elevated waterlogging sensitivity in ${analysis.topThreeSummary}.`,
      '',
      'Preparedness Information (Draft Template):',
      '- Avoid crossing waterlogged underpasses, causeways, and low-lying drainage channels.',
      '- Follow updates exclusively from official district administration and authorized meteorological bulletins.',
      '- Keep emergency contacts, backup lighting, and essential supplies accessible.',
      '',
      'Disclaimer: Prototype hackathon draft only. Does NOT constitute an official alert or evacuation instruction.',
    ].join('\n');
  }, [analysis, draftMode, inputs, monteCarlo, scopeMode]);

  useEffect(() => {
    if (!isDraftEdited) {
      setCustomDraft(generatedDraft);
    }
  }, [generatedDraft, isDraftEdited]);

  const activeDraftText = isDraftEdited ? customDraft : generatedDraft;
  const completedCount = checklist.filter((item) => item.completed).length;
  const completionPct = checklist.length ? Math.round((completedCount / checklist.length) * 100) : 0;

  const filteredChecklist =
    checklistFilter === 'All'
      ? checklist
      : checklist.filter((item) => item.category === checklistFilter);

  const overallVisual = RISK_VISUALS[analysis.overallCategory];

  const handleCopyDraft = async () => {
    try {
      await navigator.clipboard.writeText(activeDraftText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable
    }
  };

  const handleDownloadDraft = () => {
    const blob = new Blob([activeDraftText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rainguard-ai-${scopeMode}-${draftMode}-draft.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAddChecklist = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newTaskLabel.trim();
    if (!trimmed) return;
    onAddChecklistItem(trimmed, newTaskCategory);
    setNewTaskLabel('');
  };

  return (
    <div className="space-y-8">
      {/* Header & Strict Honesty Boundary */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#3C351A]">
        <div>
          <p className="text-xs font-medium text-[#C4B5FD]">
            Decision-Support Prototype · Local Draft Only · Does Not Transmit Alerts or Dispatch
            Units
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#FBF7E8] tracking-tight mt-1.5 text-balance">
            Responder Intelligence & Readiness Desk
          </h1>
          <p className="text-sm text-[#C8BE9C] mt-2 max-w-3xl leading-relaxed">
            Translates Tamil Nadu district telemetry or 5×5 basin outputs into structured readiness
            summaries, vulnerable location rankings, and non-broadcast draft briefs. Never issues
            official evacuation instructions.
          </p>
        </div>

        <div className="flex flex-col sm:items-end gap-2 shrink-0">
          <div
            role="group"
            aria-label="Responder dataset scope"
            className="inline-flex items-center gap-1 p-1 rounded-md bg-[#1F1B0B] border border-[#3C351A]"
          >
            <button
              type="button"
              onClick={() => {
                setScopeMode('tamilnadu');
                setIsDraftEdited(false);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                scopeMode === 'tamilnadu'
                  ? 'bg-[#FACC15] text-[#161307]'
                  : 'text-[#C8BE9C] hover:text-[#FBF7E8]'
              }`}
            >
              16 TN Districts
            </button>
            <button
              type="button"
              onClick={() => {
                setScopeMode('grid');
                setIsDraftEdited(false);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                scopeMode === 'grid'
                  ? 'bg-[#FACC15] text-[#161307]'
                  : 'text-[#C8BE9C] hover:text-[#FBF7E8]'
              }`}
            >
              5×5 Grid Sectors
            </button>
          </div>
          <div className={`font-display text-xl font-bold ${overallVisual.textClass}`}>
            {overallVisual.symbol} {analysis.overallCategory} Risk
          </div>
        </div>
      </div>

      {/* Incident Summary + Tier Breakdown */}
      <section className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <h2 className="font-display text-lg font-semibold text-[#FBF7E8]">
              Incident Summary ({scopeMode === 'tamilnadu' ? 'Tamil Nadu View' : '5×5 Basin View'})
            </h2>
            <p className="text-sm text-[#E8DFC0] leading-relaxed">
              Across{' '}
              <span className="font-mono font-semibold text-[#FACC15]">
                {analysis.totalNodes} {analysis.nodeLabel}
              </span>
              ,{' '}
              <span className="font-mono font-semibold text-[#FDBA74]">
                {analysis.counts['Very High'] + analysis.counts.High}
              </span>{' '}
              register High or Very High estimated flood probability (mean{' '}
              <span className="font-mono">{formatPct(analysis.avgRisk)}</span>). Monte Carlo
              sensitivity analysis indicates{' '}
              <span className="font-mono font-semibold text-[#C4B5FD]">
                {monteCarlo.exceedingThresholdPct.toFixed(1)}%
              </span>{' '}
              of {monteCarlo.iterations.toLocaleString()} simulator runs exceed the{' '}
              {Math.round(monteCarlo.highRiskThreshold * 100)}% demonstration threshold, led
              primarily by <span className="text-[#FBF7E8] font-medium">{analysis.topDriver}</span>.
            </p>
          </div>

          <dl className="grid grid-cols-4 gap-4 lg:gap-6 shrink-0 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-[#352F17] lg:pl-6">
            {(['Very High', 'High', 'Moderate', 'Low'] as const).map((tier) => (
              <div key={tier}>
                <dt className={`text-[11px] font-mono ${RISK_VISUALS[tier].textClass}`}>
                  {RISK_VISUALS[tier].symbol} {RISK_VISUALS[tier].shortCode}
                </dt>
                <dd className="font-mono tabular-nums text-2xl font-bold text-[#FBF7E8] mt-1">
                  {analysis.counts[tier]}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Potentially Vulnerable Locations Ranked Table */}
      <section className="bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#352F17]">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#FBF7E8]">
              {scopeMode === 'tamilnadu'
                ? 'Potentially Vulnerable Tamil Nadu Districts'
                : 'Potentially Vulnerable Synthetic Sectors'}
            </h2>
            <p className="text-xs text-[#968D6D] mt-0.5">
              Top 7 ranked by current model-estimated flood-risk probability
            </p>
          </div>
          <span className="text-xs font-mono text-[#968D6D]">Prototype model estimates</span>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[680px]">
            <thead className="border-b border-[#3C351A] text-[11px] font-mono text-[#968D6D]">
              <tr>
                <th className="py-2.5 pr-3 font-medium">Location</th>
                <th className="py-2.5 px-3 font-medium">Region & Hydrological Context</th>
                <th className="py-2.5 px-3 font-medium text-right">Rainfall</th>
                <th className="py-2.5 px-3 font-medium text-right">Drainage Risk</th>
                <th className="py-2.5 px-3 font-medium text-right">Est. Risk</th>
                <th className="py-2.5 pl-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#352F17] text-xs">
              {scopeMode === 'tamilnadu'
                ? analysis.vulnerableDistricts.map((dist) => {
                    const vis = RISK_VISUALS[dist.riskCategory];
                    return (
                      <tr key={dist.id} className="hover:bg-[#282310] transition-colors">
                        <td className="py-3 pr-3 whitespace-nowrap">
                          <span className="font-mono font-semibold text-[#FACC15] mr-2">
                            {dist.code}
                          </span>
                          <span className="font-medium text-[#FBF7E8]">{dist.name}</span>
                        </td>
                        <td className="py-3 px-3 text-[#C8BE9C]">
                          <span>{dist.region}</span>
                          <span className="text-[#968D6D]"> · {dist.basinNote}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#FACC15]">
                          {dist.inputs.rainfall.toFixed(1)} mm/h
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#C4B5FD]">
                          {dist.inputs.drainage_risk.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className={`font-semibold ${vis.textClass}`}>
                            {vis.symbol} {formatPct(dist.riskProbability)}
                          </span>
                        </td>
                        <td className="py-3 pl-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onInspectDistrictOn3DMap(dist.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-[#3C351A] text-[#C8BE9C] hover:text-[#FACC15] hover:border-[#FACC15]/50 transition-colors cursor-pointer"
                            >
                              <MapPin className="w-3 h-3" />
                              <span>3D Map</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onLoadDistrictIntoSimulator(dist)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-[#C4B5FD]/35 text-[#C4B5FD] hover:bg-[#C4B5FD]/15 transition-colors cursor-pointer"
                            >
                              <Sliders className="w-3 h-3" />
                              <span>Simulate</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                : analysis.vulnerableCells.map((cell) => {
                    const vis = RISK_VISUALS[cell.riskCategory];
                    return (
                      <tr key={cell.id} className="hover:bg-[#282310] transition-colors">
                        <td className="py-3 pr-3 whitespace-nowrap">
                          <span className="font-mono font-semibold text-[#FACC15] mr-2">
                            {cell.id}
                          </span>
                          <span className="font-medium text-[#FBF7E8]">{cell.name}</span>
                        </td>
                        <td className="py-3 px-3 text-[#C8BE9C]">
                          <span>{cell.zone}</span>
                          <span className="text-[#968D6D]"> · {cell.infrastructureNote}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#FACC15]">
                          {cell.inputs.rainfall.toFixed(1)} mm/h
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#C4B5FD]">
                          {cell.inputs.drainage_risk.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className={`font-semibold ${vis.textClass}`}>
                            {vis.symbol} {formatPct(cell.riskProbability)}
                          </span>
                        </td>
                        <td className="py-3 pl-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onInspectCellOnMap(cell.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-[#3C351A] text-[#C8BE9C] hover:text-[#FACC15] hover:border-[#FACC15]/50 transition-colors cursor-pointer"
                            >
                              <MapPin className="w-3 h-3" />
                              <span>Grid</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onLoadCellIntoSimulator(cell)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-[#C4B5FD]/35 text-[#C4B5FD] hover:bg-[#C4B5FD]/15 transition-colors cursor-pointer"
                            >
                              <Sliders className="w-3 h-3" />
                              <span>Simulate</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bottom Split: Resource-Readiness Checklist + Draft Emergency Alert Composer */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-6 bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#352F17]">
            <div>
              <h2 className="font-display text-base font-semibold text-[#FBF7E8]">
                Resource-Readiness Checklist
              </h2>
              <p className="text-xs text-[#968D6D] mt-0.5 font-mono tabular-nums">
                {completedCount} of {checklist.length} readiness items checked ({completionPct}%)
              </p>
            </div>
            <button
              type="button"
              onClick={onResetChecklist}
              className="inline-flex items-center gap-1 text-xs text-[#968D6D] hover:text-[#FACC15] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>

          <div className="h-1.5 w-full rounded-full bg-[#161307] overflow-hidden">
            <div
              className="h-full bg-[#FACC15] transition-all duration-200"
              style={{ width: `${completionPct}%` }}
            />
          </div>

          <div className="flex flex-wrap gap-1">
            {(['All', 'Drainage', 'Logistics', 'Coordination', 'Public Info'] as const).map(
              (cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setChecklistFilter(cat)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                    checklistFilter === cat
                      ? 'bg-[#2B2510] text-[#FACC15]'
                      : 'text-[#968D6D] hover:text-[#FBF7E8]'
                  }`}
                >
                  {cat}
                </button>
              )
            )}
          </div>

          <ul className="divide-y divide-[#352F17]">
            {filteredChecklist.map((item) => (
              <li key={item.id} className="py-3">
                <button
                  type="button"
                  onClick={() => onToggleChecklistItem(item.id)}
                  className="w-full flex items-start gap-3 text-left group cursor-pointer"
                >
                  {item.completed ? (
                    <CheckSquare className="w-4 h-4 text-[#FACC15] shrink-0 mt-0.5" />
                  ) : (
                    <Square className="w-4 h-4 text-[#968D6D] group-hover:text-[#FACC15] shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-xs sm:text-sm leading-snug ${
                        item.completed ? 'line-through text-[#968D6D]' : 'text-[#FBF7E8]'
                      }`}
                    >
                      {item.label}
                    </div>
                    <div className="text-[11px] text-[#968D6D] mt-1 font-mono">
                      {item.category} · {item.priority}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <form
            onSubmit={handleAddChecklist}
            className="pt-3 border-t border-[#352F17] flex flex-col sm:flex-row gap-2"
          >
            <input
              type="text"
              value={newTaskLabel}
              onChange={(e) => setNewTaskLabel(e.target.value)}
              placeholder="Add local readiness verification step..."
              aria-label="New readiness checklist item"
              className="flex-1 px-3 py-2 text-xs bg-[#161307] border border-[#3C351A] rounded-md text-[#FBF7E8] placeholder:text-[#857D5E] focus:border-[#FACC15] focus:outline-none"
            />
            <select
              value={newTaskCategory}
              onChange={(e) => setNewTaskCategory(e.target.value as ChecklistItem['category'])}
              aria-label="Checklist item category"
              className="px-2.5 py-2 text-xs bg-[#161307] border border-[#3C351A] rounded-md text-[#C8BE9C] focus:border-[#FACC15] focus:outline-none"
            >
              <option value="Drainage">Drainage</option>
              <option value="Logistics">Logistics</option>
              <option value="Coordination">Coordination</option>
              <option value="Public Info">Public Info</option>
            </select>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1 px-3.5 py-2 text-xs font-semibold rounded-md bg-[#2B2510] border border-[#524824] text-[#FACC15] hover:border-[#FACC15] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </form>
        </div>

        <div className="xl:col-span-6 bg-[#1F1B0B] border border-[#3C351A] rounded-lg p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#352F17]">
            <div>
              <h2 className="font-display text-base font-semibold text-[#FBF7E8]">
                Draft Emergency Alert Composer
              </h2>
              <p className="text-xs text-[#968D6D] mt-0.5">
                Offline draft template only — never broadcasts or dispatches
              </p>
            </div>

            <div className="inline-flex items-center gap-1 p-1 rounded-md bg-[#161307] border border-[#352F17]">
              <button
                type="button"
                onClick={() => {
                  setDraftMode('internal');
                  setIsDraftEdited(false);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  draftMode === 'internal'
                    ? 'bg-[#2B2510] text-[#FACC15]'
                    : 'text-[#968D6D] hover:text-[#FBF7E8]'
                }`}
              >
                Internal Brief
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftMode('community');
                  setIsDraftEdited(false);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  draftMode === 'community'
                    ? 'bg-[#2B2510] text-[#C4B5FD]'
                    : 'text-[#968D6D] hover:text-[#FBF7E8]'
                }`}
              >
                Community Draft
              </button>
            </div>
          </div>

          <textarea
            value={activeDraftText}
            onChange={(e) => {
              setCustomDraft(e.target.value);
              setIsDraftEdited(true);
            }}
            rows={13}
            aria-label="Draft alert text editor"
            className="w-full p-3.5 text-xs font-mono leading-relaxed bg-[#161307] border border-[#3C351A] rounded-md text-[#E8DFC0] focus:border-[#C4B5FD] focus:outline-none resize-y"
          />

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyDraft}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md bg-[#FACC15] text-[#161307] hover:bg-[#FDE047] transition-colors cursor-pointer whitespace-nowrap"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Draft Copied' : 'Copy Draft'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadDraft}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md border border-[#C4B5FD]/40 bg-[#C4B5FD]/10 text-[#C4B5FD] hover:bg-[#C4B5FD]/20 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export .txt</span>
              </button>
            </div>

            {isDraftEdited && (
              <button
                type="button"
                onClick={() => setIsDraftEdited(false)}
                className="text-xs font-medium text-[#968D6D] hover:text-[#FACC15] cursor-pointer"
              >
                Sync with live simulation
              </button>
            )}
          </div>

          <p className="text-[11px] text-[#968D6D] leading-relaxed pt-2 border-t border-[#352F17]">
            Safety notice: RainGuard AI is a hackathon simulation prototype. This composer only
            formats local text drafts and cannot send SMS/CAP alerts, dispatch response units, or
            issue official evacuation orders.
          </p>
        </div>
      </section>
    </div>
  );
}
