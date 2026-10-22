import React, { useEffect, useRef } from 'react';
import { SearchResultItem } from '../utils/searchEngine';
import { Users, Calendar, History } from 'lucide-react';

interface SearchDropdownProps {
  results: SearchResultItem[];
  selectedIndex: number;
  isOpen: boolean;
  query: string;
  isArchiveMode?: boolean;
  onToggleArchive?: () => void;
  onSelectResult: (item: SearchResultItem) => void;
  onMouseEnterItem: (index: number) => void;
}

export const SearchDropdown: React.FC<SearchDropdownProps> = ({
  results,
  selectedIndex,
  isOpen,
  query,
  isArchiveMode = false,
  onSelectResult,
  onMouseEnterItem,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Automatically scroll container to keep selected item in view
  useEffect(() => {
    if (!isOpen || selectedIndex < 0) return;
    const container = containerRef.current;
    if (!container) return;

    if (selectedIndex === 0) {
      container.scrollTop = 0;
      return;
    }

    const item = itemRefs.current[selectedIndex];
    if (item) {
      const itemTop = item.offsetTop;
      const itemBottom = itemTop + item.offsetHeight;
      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;

      if (itemTop < containerTop) {
        container.scrollTop = itemTop;
      } else if (itemBottom > containerBottom) {
        container.scrollTop = itemBottom - container.clientHeight;
      }
    }
  }, [selectedIndex, isOpen]);

  if (!isOpen || !query.trim()) return null;

  if (results.length === 0) {
    if (query.trim().length < 2 && !isArchiveMode) return null;
    return (
      <div className="absolute left-0 right-0 top-11 z-50 rounded-xl border border-[var(--border-color)] bg-white p-3.5 shadow-2xl animate-fade-in text-[12px] text-gray-500">
        <p className="font-semibold text-[#141414]">
          {isArchiveMode ? 'No past events found' : 'No matches found'}
        </p>
        <p className="text-[11px] text-gray-400 mt-1">
          {isArchiveMode
            ? 'Try searching with a broader keyword, club name, or room location.'
            : 'Try searching by club name, room location, or an interest like "coding" or "gaming".'}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute left-0 right-0 top-11 z-50 max-h-[380px] overflow-y-auto rounded-xl border border-[var(--border-color)] bg-white p-1.5 shadow-2xl animate-fade-in text-[12px]"
      tabIndex={-1}
      role="listbox"
    >
      {/* Dropdown Header */}
      <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border-b border-gray-100 mb-1">
        <div>
          {isArchiveMode ? (
            <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-100/70 border border-amber-200/80 px-1.5 py-0.5 rounded text-[9px] font-bold">
              <History size={10} />
              <span>Past Events</span>
            </span>
          ) : (
            <span className="text-gray-400">Best Matches</span>
          )}
        </div>

        <span className="font-normal font-mono text-[9px] lowercase text-gray-400">
          use arrows & enter
        </span>
      </div>

      <div className="space-y-0.5">
        {results.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          const isClub = item.type === 'club';
          const isPast = Boolean(item.isPast);

          return (
            <div
              key={item.id}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              role="option"
              aria-selected={isSelected}
              onMouseEnter={() => onMouseEnterItem(idx)}
              onClick={() => onSelectResult(item)}
              className={`flex items-start justify-between gap-2.5 rounded-lg p-2 cursor-pointer transition-colors ${
                isSelected ? 'bg-black/5 ring-1 ring-black/5' : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                {/* Icon indicator */}
                <div
                  className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md ${
                    isClub
                      ? 'bg-[#cc0033]/10 text-[#cc0033]'
                      : isPast
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {isClub ? (
                    <Users size={13} />
                  ) : isPast ? (
                    <History size={13} />
                  ) : (
                    <Calendar size={13} />
                  )}
                </div>

                {/* Text details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[#141414] truncate">
                      {item.title}
                    </span>
                  </div>

                  <p className="text-[11px] text-gray-500 truncate mt-0.5">
                    {item.subtitle}
                  </p>

                  {item.detail && (
                    <p className="text-[10px] text-gray-400 truncate mt-0.5 font-mono">
                      {item.detail}
                    </p>
                  )}
                </div>
              </div>

              {/* Clean text badge */}
              <div className="shrink-0 mt-0.5">
                {isClub ? (
                  <span className="inline-flex items-center rounded border border-red-200/80 bg-red-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#cc0033]">
                    Club
                  </span>
                ) : isPast ? (
                  <span className="inline-flex items-center gap-1 rounded border border-amber-300/80 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800">
                    <History size={9} />
                    <span>Past</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-600">
                    Event
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
