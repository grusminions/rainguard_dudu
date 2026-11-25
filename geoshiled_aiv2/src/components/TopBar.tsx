import { Menu, RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { DashboardSection } from '../types/flood';

interface TopBarProps {
  activeSection: DashboardSection;
  onSelectSection: (section: DashboardSection) => void;
  onRerunAll: () => void;
  isPredicting: boolean;
  onToggleMobileSidebar: () => void;
}

const NAV_ITEMS: Array<{ id: DashboardSection; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'simulator', label: 'Simulator' },
  { id: 'montecarlo', label: 'Monte Carlo' },
  { id: 'responder', label: 'Responder' },
];

export function TopBar({
  activeSection,
  onSelectSection,
  onRerunAll,
  isPredicting,
  onToggleMobileSidebar,
}: TopBarProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-[#161307]/95 backdrop-blur-sm border-b border-[#3C351A]">
      <div className="h-16 px-4 lg:px-6 flex items-center justify-between gap-8">
        {/* Zone 1: Single-element Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleMobileSidebar}
            aria-label="Open simulation controls"
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-md border border-[#3C351A] text-[#C8BE9C] hover:text-[#FBF7E8] hover:border-[#FACC15]/50 transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <a
            href="#overview"
            onClick={(e) => {
              e.preventDefault();
              onSelectSection('overview');
            }}
            className="font-display text-xl font-bold tracking-tight text-[#FACC15] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#C4B5FD] focus-visible:outline-offset-4 rounded"
          >
            RainGuard AI
          </a>
        </div>

        {/* Zone 2: 5 Single-Line Navigation Links */}
        <nav
          aria-label="Primary dashboard sections"
          className="hidden md:flex items-center gap-6 lg:gap-8"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#C4B5FD] focus-visible:outline-offset-4 rounded ${
                  isActive
                    ? 'text-[#FACC15]'
                    : 'text-[#C8BE9C] hover:text-[#FBF7E8]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[13px] h-[2px] bg-[#FACC15]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRerunAll}
            disabled={isPredicting}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-md bg-[#FACC15] text-[#161307] hover:bg-[#FDE047] active:translate-y-px disabled:opacity-60 transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#C4B5FD] focus-visible:outline-offset-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPredicting ? 'animate-spin' : ''}`} />
            <span>Rerun Analysis</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md border border-[#3C351A] text-[#C8BE9C] hover:text-[#FBF7E8] transition-colors"
          >
            {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Compact Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <nav
          aria-label="Mobile sections"
          className="md:hidden border-t border-[#3C351A] bg-[#1F1B0B] px-4 py-2 flex flex-wrap gap-2"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectSection(item.id);
                  setMobileNavOpen(false);
                }}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-[#FACC15]/15 text-[#FACC15] border border-[#FACC15]/40'
                    : 'text-[#C8BE9C] hover:text-[#FBF7E8]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      )}
    </header>
  );
}
