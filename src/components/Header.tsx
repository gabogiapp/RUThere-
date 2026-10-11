import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  X,
  MapPin,
  Tag,
  Check,
} from 'lucide-react';
import { useCalendar } from '../context/CalendarContext';
import { CalendarViewType, ClubCategory, RutgersCampus, ColorVariant } from '../types/event';
import {
  COLOR_MAP,
  CATEGORY_COLOR_MAP,
  getCampusColor,
  getMonthDays,
  isSameDay,
  formatIsoDate,
} from '../utils/dateUtils';

const CAMPUSES: (RutgersCampus | 'All')[] = [
  'All',
  'College Ave',
  'Busch',
  'Livingston',
  'Cook/Doug',
  'Virtual / Online',
];

const CATEGORIES: { label: ClubCategory; color: ColorVariant }[] = (
  Object.keys(CATEGORY_COLOR_MAP) as ClubCategory[]
).map((cat) => ({
  label: cat,
  color: CATEGORY_COLOR_MAP[cat],
}));

export const Header: React.FC = () => {
  const {
    currentDate,
    setCurrentDate,
    navigateDate,
    goToToday,
    view,
    setView,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedCampus,
    setSelectedCampus,
    events,
  } = useCalendar();

  const [campusDropdownOpen, setCampusDropdownOpen] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [calendarPopoverOpen, setCalendarPopoverOpen] = useState(false);

  const campusRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const monthRef = useRef<HTMLDivElement>(null);

  // Close popovers when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (campusRef.current && !campusRef.current.contains(target)) {
        setCampusDropdownOpen(false);
      }
      if (categoryRef.current && !categoryRef.current.contains(target)) {
        setCategoryDropdownOpen(false);
      }
      if (monthRef.current && !monthRef.current.contains(target)) {
        setCalendarPopoverOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCampusDropdownOpen(false);
        setCategoryDropdownOpen(false);
        setCalendarPopoverOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const formattedMonthYear = currentDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const views: { key: CalendarViewType; label: string }[] = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'agenda', label: 'List' },
  ];

  const activeCategoryObj = CATEGORIES.find((c) => c.label === selectedCategory);
  const activeCampusColor = selectedCampus !== 'All' ? getCampusColor(selectedCampus) : null;

  // Mini calendar grid days
  const popoverDays = getMonthDays(currentDate);
  const eventDateSet = new Set(events.map((e) => e.parsedDate));

  return (
    <header className="sticky top-0 z-40 border-b border-[#b3002d] bg-[#cc0033] select-none shadow-sm">
      <div className="flex h-14 items-center justify-between gap-2 px-3 md:px-5">
        
        {/* 1. Left Group: Search Bar */}
        <div className="relative flex flex-1 max-w-xs sm:max-w-sm md:max-w-md items-center min-w-[130px]">
          <Search
            size={15}
            className="absolute left-3 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search clubs, rooms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-xl bg-white pl-9 pr-8 text-[13px] text-[#141414] placeholder-gray-400 outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-white transition-all shadow-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 flex size-5 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* 2. Middle Group: Campus & Club Category Dropdowns */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          
          {/* Campus Dropdown */}
          <div ref={campusRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setCampusDropdownOpen(!campusDropdownOpen);
                setCategoryDropdownOpen(false);
                setCalendarPopoverOpen(false);
              }}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-white/95 px-2.5 sm:px-3 text-[12px] font-medium text-[#141414] ring-1 ring-black/10 hover:bg-white transition-colors shadow-xs shrink-0"
            >
              {activeCampusColor ? (
                <span
                  className="size-2.5 rounded-full border shrink-0"
                  style={{
                    backgroundColor: activeCampusColor.bg,
                    borderColor: activeCampusColor.border,
                  }}
                />
              ) : (
                <MapPin size={13} className="text-[#cc0033]" />
              )}
              <span className="max-w-[90px] sm:max-w-[125px] truncate">
                {selectedCampus === 'All' ? 'Campus: All' : selectedCampus}
              </span>
              <ChevronDown size={13} className="text-gray-500 opacity-70" />
            </button>

            {campusDropdownOpen && (
              <div className="absolute left-0 sm:right-0 sm:left-auto top-11 z-50 w-52 rounded-xl border border-[var(--border-color)] bg-white text-[var(--text-primary)] p-1.5 shadow-xl animate-fade-in text-[12px]">
                <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  <span>Select Campus</span>
                  {selectedCampus !== 'All' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCampus('All');
                        setCampusDropdownOpen(false);
                      }}
                      className="text-[#cc0033] hover:underline normal-case"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {CAMPUSES.map((campus) => {
                  const isSelected = selectedCampus === campus;
                  const count =
                    campus === 'All'
                      ? events.length
                      : events.filter(
                          (e) =>
                            e.campus === campus ||
                            (campus === 'Cook/Doug' && e.campus === 'Cook/Douglass')
                        ).length;
                  const cColor = campus !== 'All' ? getCampusColor(campus) : null;

                  return (
                    <button
                      key={campus}
                      type="button"
                      onClick={() => {
                        setSelectedCampus(campus);
                        setCampusDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-[#cc0033]/10 font-semibold text-[#cc0033]'
                          : 'text-[#141414] hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {cColor ? (
                          <span
                            className="size-2.5 rounded-full border shrink-0"
                            style={{
                              backgroundColor: cColor.bg,
                              borderColor: cColor.border,
                            }}
                          />
                        ) : (
                          <span className="size-2.5 rounded-full bg-gray-300 shrink-0" />
                        )}
                        <span className="truncate">{campus}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400 font-mono">{count}</span>
                        {isSelected && <Check size={13} className="text-[#cc0033]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Club Categories Dropdown */}
          <div ref={categoryRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setCategoryDropdownOpen(!categoryDropdownOpen);
                setCampusDropdownOpen(false);
                setCalendarPopoverOpen(false);
              }}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-white/95 px-2.5 sm:px-3 text-[12px] font-medium text-[#141414] ring-1 ring-black/10 hover:bg-white transition-colors shadow-xs shrink-0"
            >
              {activeCategoryObj ? (
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ backgroundColor: COLOR_MAP[activeCategoryObj.color].bar }}
                />
              ) : (
                <Tag size={13} className="text-[#cc0033]" />
              )}
              <span className="max-w-[90px] sm:max-w-[125px] truncate">
                {selectedCategory === 'All' ? 'Category: All' : selectedCategory}
              </span>
              <ChevronDown size={13} className="text-gray-500 opacity-70" />
            </button>

            {categoryDropdownOpen && (
              <div className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-[var(--border-color)] bg-white text-[var(--text-primary)] p-1.5 shadow-xl animate-fade-in text-[12px]">
                <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  <span>Club Categories</span>
                  {selectedCategory !== 'All' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory('All');
                        setCategoryDropdownOpen(false);
                      }}
                      className="text-[#cc0033] hover:underline normal-case"
                    >
                      Reset
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('All');
                    setCategoryDropdownOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                    selectedCategory === 'All'
                      ? 'bg-[#cc0033]/10 font-semibold text-[#cc0033]'
                      : 'text-[#141414] hover:bg-gray-100'
                  }`}
                >
                  <span>All Categories</span>
                  <span className="text-[10px] text-gray-400 font-mono">{events.length}</span>
                </button>

                <div className="my-1 h-px bg-gray-100" />

                {CATEGORIES.map(({ label, color }) => {
                  const isSelected = selectedCategory === label;
                  const count = events.filter((e) => e.category === label).length;
                  const palette = COLOR_MAP[color];

                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(label);
                        setCategoryDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-[#cc0033]/10 font-semibold text-[#cc0033]'
                          : 'text-[#141414] hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="size-2 rounded-full shrink-0"
                          style={{ backgroundColor: palette.bar }}
                        />
                        <span className="truncate">{label}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono ml-1">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* 3. Right Group: Month Navigation Bar (to the left of View Selector) & View Selector */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          
          {/* Month Bar with Arrows and Interactive Month Calendar Popover (hidden when in List view) */}
          {view !== 'agenda' && (
            <div ref={monthRef} className="relative flex items-center rounded-xl bg-white/95 px-1 py-1 ring-1 ring-black/10 shrink-0 shadow-xs">
              <button
                type="button"
                onClick={() => navigateDate('prev')}
                className="flex size-7 items-center justify-center rounded-lg text-gray-700 hover:bg-black/5 hover:text-[#141414] transition-colors"
                title="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setCalendarPopoverOpen((prev) => !prev);
                  setCampusDropdownOpen(false);
                  setCategoryDropdownOpen(false);
                }}
                className="flex items-center gap-1 px-2 py-0.5 text-[13px] font-bold text-[#141414] hover:text-[#cc0033] transition-colors min-w-[95px] sm:min-w-[125px] justify-center"
                title="Click to view month calendar"
              >
                <span className="truncate">{formattedMonthYear}</span>
                <ChevronDown
                  size={12}
                  className={`text-gray-500 transition-transform duration-150 ${
                    calendarPopoverOpen ? 'rotate-180 text-[#cc0033]' : ''
                  }`}
                />
              </button>

              <button
                type="button"
                onClick={() => navigateDate('next')}
                className="flex size-7 items-center justify-center rounded-lg text-gray-700 hover:bg-black/5 hover:text-[#141414] transition-colors"
                title="Next month"
              >
                <ChevronRight size={16} />
              </button>

              {/* Small Month Calendar Popover */}
              {calendarPopoverOpen && (
                <div className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-[var(--border-color)] bg-white text-[var(--text-primary)] p-3.5 shadow-2xl animate-fade-in text-[12px]">
                  {/* Popover Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)] mb-2">
                    <span className="text-[13px] font-bold text-[#141414]">
                      {formattedMonthYear}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        goToToday();
                        setCalendarPopoverOpen(false);
                      }}
                      className="rounded-md bg-[#cc0033]/10 px-2 py-0.5 text-[11px] font-semibold text-[#cc0033] hover:bg-[#cc0033]/20 transition-colors"
                    >
                      Today
                    </button>
                  </div>

                  {/* Days of week */}
                  <div className="grid grid-cols-7 gap-1 text-center font-semibold text-gray-400 text-[10px] uppercase mb-1">
                    {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
                      <div key={d} className="py-1">
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Days Grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {popoverDays.map((dayObj, idx) => {
                      const isSelected = isSameDay(dayObj.date, currentDate);
                      const dateKey = formatIsoDate(dayObj.date);
                      const hasEvents = eventDateSet.has(dateKey);

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setCurrentDate(dayObj.date);
                            setCalendarPopoverOpen(false);
                          }}
                          className={`relative flex h-8 flex-col items-center justify-center rounded-lg text-[12px] font-medium transition-all ${
                            isSelected
                              ? 'bg-[#cc0033] text-white font-bold shadow-xs'
                              : dayObj.isToday
                              ? 'ring-1 ring-[#cc0033] text-[#cc0033] font-bold hover:bg-red-50'
                              : !dayObj.isCurrentMonth
                              ? 'text-gray-300 hover:text-gray-600 hover:bg-gray-50'
                              : 'text-gray-800 hover:bg-gray-100 hover:text-black'
                          }`}
                        >
                          <span>{dayObj.date.getDate()}</span>
                          {hasEvents && (
                            <span
                              className={`size-1 rounded-full ${
                                isSelected ? 'bg-white' : 'bg-[#cc0033]'
                              }`}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. View Selector (Day, Week, Month, List) */}
          <div className="flex items-center rounded-xl bg-white/95 p-1 ring-1 ring-black/10 shrink-0 shadow-xs">
            {views.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={`relative flex h-7 items-center rounded-lg px-2 sm:px-3 text-[12px] font-medium transition-all ${
                  view === v.key
                    ? 'bg-[#cc0033] text-white shadow-xs font-semibold'
                    : 'text-gray-600 hover:text-[#141414] hover:bg-black/5'
                }`}
              >
                <span>{v.label}</span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </header>
  );
};
