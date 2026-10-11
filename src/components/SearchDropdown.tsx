import React, { useEffect, useRef } from 'react';
import { SearchResultItem } from '../utils/searchEngine';
import { Users, Calendar } from 'lucide-react';

interface SearchDropdownProps {
  results: SearchResultItem[];
  selectedIndex: number;
  isOpen: boolean;
  query: string;
  onSelectResult: (item: SearchResultItem) => void;
  onMouseEnterItem: (index: number) => void;
}

export const SearchDropdown: React.FC<SearchDropdownProps> = ({
  results,
  selectedIndex,
  isOpen,
  query,
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
    if (query.trim().length < 2) return null;
    return (
      <div className="absolute left-0 right-0 top-11 z-50 rounded-xl border border-[var(--border-color)] bg-white p-3 shadow-xl animate-fade-in text-[12px] text-gray-500">
        <p className="font-medium text-[#141414]">No matches found</p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Try searching by club name, room location, or an interest like &quot;coding&quot; or &quot;gaming&quot;.
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
      <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 mb-1">
        <span>Best Matches</span>
        <span className="font-normal font-mono text-[9px] lowercase text-gray-400">
          use arrows & enter
        </span>
      </div>

      <div className="space-y-0.5">
        {results.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          const isClub = item.type === 'club';

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
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {isClub ? <Users size={13} /> : <Calendar size={13} />}
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

              {/* Clean text badge (No emojis) */}
              <div className="shrink-0 mt-0.5">
                {isClub ? (
                  <span className="inline-flex items-center rounded border border-red-200/80 bg-red-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#cc0033]">
                    Club
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
