import React, { useRef, useEffect, useState } from 'react';
import { useCalendar } from '../context/CalendarContext';
import { CalendarEvent } from '../types/event';
import {
  COLOR_MAP,
  getCampusColor,
  formatIsoDate,
  formatMinutesToTime,
  getWeekDates,
  isSameDay,
} from '../utils/dateUtils';
import { MapPin, Clock, X, Users, Calendar, Film, Image as ImageIcon, ArrowRight } from 'lucide-react';

const START_HOUR = 8; // 8 AM
const END_HOUR = 23; // 11 PM
const HOUR_HEIGHT = 60; // 60px per hour (1px per minute)
const TOTAL_HOURS = END_HOUR - START_HOUR;
const TOTAL_MINUTES = TOTAL_HOURS * 60;
const MAX_SIMULTANEOUS_COLUMNS = 2; // Prevents cards from squishing into tiny slivers

export const WeekView: React.FC = () => {
  const {
    currentDate,
    setCurrentDate,
    setView,
    filteredEvents,
    setSelectedEvent,
  } = useCalendar();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [moreModalData, setMoreModalData] = useState<{ date: Date; events: CalendarEvent[] } | null>(null);

  const weekDates = getWeekDates(currentDate);
  const today = new Date();

  // Scroll to roughly 9 AM on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 60; // 9 AM
    }
  }, []);

  // Close "+N more" popup on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && moreModalData) {
        setMoreModalData(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moreModalData]);

  // Current time position for today's red line
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const showCurrentTime = currentMinutes >= START_HOUR * 60 && currentMinutes <= END_HOUR * 60;
  const currentTimeTop = (currentMinutes - START_HOUR * 60) * (HOUR_HEIGHT / 60);

  // Group events by day ISO string
  const eventsByDay: Record<string, CalendarEvent[]> = {};
  for (const date of weekDates) {
    const key = formatIsoDate(date);
    eventsByDay[key] = [];
  }

  for (const event of filteredEvents) {
    if (event.parsedDate in eventsByDay) {
      eventsByDay[event.parsedDate].push(event);
    }
  }

  // Check if any day has all-day events
  const hasAnyAllDay = weekDates.some((d) => {
    const dKey = formatIsoDate(d);
    return (eventsByDay[dKey] || []).some((e) => e.is_all_day);
  });

  // Smart Anti-Squish Layout:
  // Caps horizontal overlapping columns to MAX_SIMULTANEOUS_COLUMNS (2).
  // Any further concurrent events are collapsed into a "+(count) more" badge.
  const computeAntiSquishLayout = (dayTimedEvents: CalendarEvent[]) => {
    const sorted = [...dayTimedEvents].sort((a, b) => a.startMinutes - b.startMinutes);
    const columns: CalendarEvent[][] = [];
    const visibleItems: { event: CalendarEvent; colIdx: number; totalCols: number }[] = [];
    const overflowItems: CalendarEvent[] = [];

    for (const event of sorted) {
      let placedCol = -1;
      for (let i = 0; i < MAX_SIMULTANEOUS_COLUMNS; i++) {
        const lastInCol = columns[i]?.[columns[i].length - 1];
        if (!lastInCol || lastInCol.endMinutes <= event.startMinutes) {
          placedCol = i;
          break;
        }
      }

      if (placedCol !== -1) {
        if (!columns[placedCol]) columns[placedCol] = [];
        columns[placedCol].push(event);
        visibleItems.push({ event, colIdx: placedCol, totalCols: 1 });
      } else {
        // Exceeds max columns -> overflow to prevent horizontal squishing!
        overflowItems.push(event);
      }
    }

    const actualMaxCols = Math.min(Math.max(columns.length, 1), MAX_SIMULTANEOUS_COLUMNS);
    const finalizedVisible = visibleItems.map((item) => ({
      ...item,
      totalCols: actualMaxCols,
    }));

    return { visibleItems: finalizedVisible, overflowItems };
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-primary)] select-none">
      
      {/* 1. Week Day Headers */}
      <div className="flex border-b border-[var(--border-color)] bg-[var(--bg-secondary)] pl-14 pr-2">
        {weekDates.map((d) => {
          const isToday = isSameDay(d, today);
          const isSelected = isSameDay(d, currentDate);
          const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
          const dayNum = d.getDate();
          const dateKey = formatIsoDate(d);
          const dayEvents = eventsByDay[dateKey] || [];

          return (
            <div
              key={d.toISOString()}
              className="flex h-11 min-w-0 flex-1 items-center justify-between border-l border-[var(--border-subtle)] px-2"
            >
              <div
                onClick={() => {
                  setCurrentDate(d);
                }}
                className="flex items-center gap-1.5 truncate cursor-pointer hover:opacity-80 transition-opacity"
              >
                <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                  {dayName}
                </span>
                <span
                  className={`flex size-6 items-center justify-center rounded-full text-[12px] font-bold ${
                    isToday
                      ? 'bg-[#cc0033] text-white'
                      : isSelected
                      ? 'border border-[var(--text-primary)] text-[var(--text-primary)]'
                      : 'text-[var(--text-primary)]'
                  }`}
                >
                  {dayNum}
                </span>
              </div>

              {/* Day Event Count Pill -> opens centered modal */}
              {dayEvents.length > 2 && (
                <button
                  type="button"
                  onClick={() => setMoreModalData({ date: d, events: dayEvents })}
                  className="flex items-center justify-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold transition-all cursor-pointer shadow-2xs self-center my-auto bg-[#cc0033]/10 text-[#cc0033] hover:bg-[#cc0033] hover:text-white"
                  title={`View all ${dayEvents.length} events for this day`}
                >
                  <span>+{dayEvents.length - 2}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 2. Pinned All-Day Events Row at the Top */}
      {hasAnyAllDay && (
        <div className="flex border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/80 select-none shrink-0">
          <div className="w-14 shrink-0 py-2 flex items-center justify-center text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            All-day
          </div>
          <div className="flex flex-1">
            {weekDates.map((d) => {
              const dateKey = formatIsoDate(d);
              const allDayList = (eventsByDay[dateKey] || []).filter((e) => e.is_all_day);
              const visibleAllDay = allDayList.slice(0, 2);
              const extraAllDayCount = allDayList.length - 2;

              return (
                <div
                  key={dateKey}
                  className="flex-1 min-w-0 border-l border-[var(--border-subtle)] p-1 space-y-1"
                >
                  {visibleAllDay.map((event) => {
                    const palette = COLOR_MAP[event.color_scheme];
                    const campusColor = getCampusColor(event.campus);

                    return (
                      <div
                        key={event.id}
                        onClick={() => setSelectedEvent(event)}
                        style={{
                          backgroundColor: palette.fill,
                          color: palette.ink,
                        }}
                        className="group flex cursor-pointer items-center justify-between gap-1 rounded-[6px] border border-[var(--border-subtle)] px-2 py-1 shadow-2xs hover:shadow-xs hover:brightness-95 transition-all"
                        title={`${event.title} (${event.campus})`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span
                            className="size-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: palette.bar }}
                          />
                          <span className="truncate text-[11px] font-bold">
                            {event.title}
                          </span>
                        </div>
                        <span
                          className="rounded border px-1 py-0.2 text-[9px] font-semibold shrink-0"
                          style={{
                            backgroundColor: campusColor.bg,
                            color: campusColor.text,
                            borderColor: campusColor.border,
                          }}
                        >
                          {event.campus}
                        </span>
                      </div>
                    );
                  })}

                  {/* "+X more" button for overflow all-day events */}
                  {extraAllDayCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setMoreModalData({ date: d, events: allDayList })}
                      className="text-left text-[10px] font-bold text-[#cc0033] hover:underline pl-1 cursor-pointer block"
                    >
                      +{extraAllDayCount} more
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Scrollable Calendar Grid */}
      <div
        ref={scrollRef}
        className="relative flex flex-1 overflow-y-auto overflow-x-hidden"
        style={{ scrollBehavior: 'smooth' }}
      >
        {/* Time labels axis */}
        <div className="w-14 shrink-0 py-2 select-none">
          {Array.from({ length: TOTAL_HOURS }).map((_, i) => {
            const hour = START_HOUR + i;
            const period = hour >= 12 ? 'PM' : 'AM';
            const displayH = hour % 12 === 0 ? 12 : hour % 12;
            return (
              <div
                key={hour}
                style={{ height: `${HOUR_HEIGHT}px` }}
                className="-translate-y-2 pr-2.5 text-right text-[10px] font-medium text-[var(--text-muted)]"
              >
                {displayH} {period}
              </div>
            );
          })}
        </div>

        {/* 7 Columns for Weekdays */}
        <div
          className="relative flex flex-1"
          style={{ height: `${TOTAL_MINUTES * (HOUR_HEIGHT / 60)}px` }}
        >
          {weekDates.map((d) => {
            const dateKey = formatIsoDate(d);
            const allEventsOnDay = eventsByDay[dateKey] || [];
            const timedEvents = allEventsOnDay.filter((e) => !e.is_all_day);
            const isToday = isSameDay(d, today);

            const { visibleItems, overflowItems } = computeAntiSquishLayout(timedEvents);

            // Compute overflow badge position centered vertically within the overflow time range
            const overflowTop = (() => {
              if (overflowItems.length === 0) return 0;
              const minStart = Math.min(...overflowItems.map((e) => e.startMinutes));
              const maxEnd = Math.max(...overflowItems.map((e) => e.endMinutes));
              const startY = (Math.max(minStart, START_HOUR * 60) - START_HOUR * 60) * (HOUR_HEIGHT / 60);
              const endY = (Math.min(maxEnd, END_HOUR * 60) - START_HOUR * 60) * (HOUR_HEIGHT / 60);
              const centerY = (startY + endY) / 2;
              return Math.max(centerY - 14, 20);
            })();

            return (
              <div
                key={dateKey}
                className="calendar-grid-lines relative min-w-0 flex-1 border-l border-[var(--border-subtle)]"
              >
                {/* Red Current Time Line if this is today */}
                {isToday && showCurrentTime && (
                  <div
                    style={{ top: `${currentTimeTop}px` }}
                    className="pointer-events-none absolute inset-x-0 z-30 h-0.5 bg-[#cc0033]"
                  >
                    <span className="absolute -top-[3px] -left-1 size-2 rounded-full bg-[#cc0033] shadow-xs" />
                  </div>
                )}

                {/* Render Timed Events (Never squished below 50% width) */}
                {visibleItems.map(({ event, colIdx, totalCols }) => {
                  const palette = COLOR_MAP[event.color_scheme];
                  const campusColor = getCampusColor(event.campus);
                  const clampedStart = Math.max(event.startMinutes, START_HOUR * 60);
                  const clampedEnd = Math.min(event.endMinutes, END_HOUR * 60);
                  
                  const top = (clampedStart - START_HOUR * 60) * (HOUR_HEIGHT / 60);
                  const durationMins = Math.max(clampedEnd - clampedStart, 30);
                  const height = durationMins * (HOUR_HEIGHT / 60);

                  const widthPct = 100 / totalCols;
                  const leftPct = colIdx * widthPct;

                  return (
                    <div
                      key={event.id}
                      onClick={() => setSelectedEvent(event)}
                      role="button"
                      tabIndex={0}
                      aria-label={`${event.title}, ${event.time}`}
                      style={{
                        top: `${top + 1}px`,
                        height: `${Math.max(height - 2, 28)}px`,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        backgroundColor: palette.fill,
                        color: palette.ink,
                      }}
                      className="group/chip absolute cursor-pointer select-none overflow-hidden rounded-[7px] pr-2 pl-3 text-left transition-all duration-150 hover:brightness-[0.96] hover:shadow-sm hover:z-20 border border-[var(--border-subtle)]"
                    >
                      {/* Left accent color bar */}
                      <span
                        className="pointer-events-none absolute top-1 bottom-1 left-1 w-[3px] rounded-full"
                        style={{ backgroundColor: palette.bar }}
                      />

                      <div className="flex h-full flex-col justify-start py-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="truncate text-[12px] leading-4 font-semibold">
                            {event.title}
                          </p>
                        </div>

                        {height >= 45 && (
                          <div className="flex items-center gap-1.5 truncate text-[11px] leading-3.5 opacity-80 mt-0.5">
                            <span className="font-mono">
                              {formatMinutesToTime(event.startMinutes)}
                            </span>
                            <span>•</span>
                            <span
                              className="rounded border px-1 py-0.2 text-[9px] font-semibold shrink-0"
                              style={{
                                backgroundColor: campusColor.bg,
                                color: campusColor.text,
                                borderColor: campusColor.border,
                              }}
                            >
                              {event.campus}
                            </span>
                          </div>
                        )}

                        {height >= 70 && (
                          <div className="flex items-center gap-1 truncate text-[10px] opacity-70 mt-1">
                            <MapPin size={10} className="shrink-0" />
                            <span className="truncate">{event.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Overlap Anti-Squish Pill: "+(N) more" -> opens centered dimmed modal */}
                {overflowItems.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMoreModalData({ date: d, events: allEventsOnDay });
                    }}
                    style={{
                      top: `${overflowTop}px`,
                      left: '4px',
                      right: '4px',
                    }}
                    className="absolute z-20 flex h-7 items-center justify-center gap-1.5 rounded-lg bg-[#cc0033] px-2 text-[11px] font-bold text-white shadow-md hover:bg-[#b3002d] transition-all cursor-pointer ring-1 ring-white/20"
                    title={`Click to view all ${allEventsOnDay.length} events for this day`}
                  >
                    <span>+{overflowItems.length} more</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Centered Dimmed "+N more" Events Modal (Matching MonthView style & design) */}
      {moreModalData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in"
          onClick={() => setMoreModalData(null)}
        >
          <div
            className="relative w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-2xl transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-color)] p-4 sm:px-5 bg-[var(--bg-primary)] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-[#cc0033]/10 text-[#cc0033] shadow-2xs">
                  <Calendar size={18} />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[var(--text-primary)]">
                    {moreModalData.date.toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </h3>
                  <p className="text-[12px] text-[var(--text-muted)]">
                    {moreModalData.events.length} events scheduled on this day
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMoreModalData(null)}
                title="Close (Esc)"
                className="flex size-7 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--border-color)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable Event List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5 max-h-[60vh]">
              {moreModalData.events.map((event) => {
                const palette = COLOR_MAP[event.color_scheme];
                const campusColor = getCampusColor(event.campus);

                return (
                  <div
                    key={event.id}
                    onClick={() => {
                      setSelectedEvent(event);
                      setMoreModalData(null);
                    }}
                    className="group relative cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3 transition-all hover:bg-[var(--bg-primary)] hover:border-[#cc0033]/40 hover:shadow-md"
                  >
                    {/* Left Accent indicator bar */}
                    <span
                      className="absolute top-2.5 bottom-2.5 left-0 w-1 rounded-r-full"
                      style={{ backgroundColor: palette.bar }}
                    />

                    <div className="pl-2 space-y-1.5">
                      {/* Badges row */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold border ${palette.badge}`}
                        >
                          {event.category}
                        </span>
                        <span
                          className="rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{
                            backgroundColor: campusColor.bg,
                            color: campusColor.text,
                            borderColor: campusColor.border,
                          }}
                        >
                          {event.campus}
                        </span>
                        {event.has_free_food && (
                          <span
                            className="inline-flex items-center gap-1 rounded border border-[#fdba74] bg-[#ffedd5] px-1.5 py-0.5 text-[10px] font-bold text-[#c2410c]"
                          >
                            <span>🍕</span>
                            <span>FREE FOOD!!</span>
                          </span>
                        )}
                        {event.video_url && (
                          <span className="flex items-center gap-1 rounded bg-[#E1306C]/10 border border-[#E1306C]/30 text-[#E1306C] px-1.5 py-0.5 text-[10px] font-medium">
                            <Film size={10} />
                            <span>Video</span>
                          </span>
                        )}
                        {!event.video_url && event.image_url && (
                          <span className="flex items-center gap-1 rounded bg-black/5 border border-[var(--border-subtle)] text-[var(--text-secondary)] px-1.5 py-0.5 text-[10px] font-medium">
                            <ImageIcon size={10} />
                            <span>Flyer</span>
                          </span>
                        )}
                        {event.is_all_day && (
                          <span className="rounded bg-amber-100 border border-amber-300 text-amber-800 px-1.5 py-0.5 text-[10px] font-bold">
                            All Day
                          </span>
                        )}
                      </div>

                      {/* Event Title */}
                      <h4 className="text-[14px] font-bold text-[var(--text-primary)] group-hover:text-[#cc0033] transition-colors leading-snug line-clamp-2">
                        {event.title}
                      </h4>

                      {/* Time & Location */}
                      <div className="flex flex-wrap items-center gap-3 text-[12px] text-[var(--text-secondary)] font-mono">
                        <div className="flex items-center gap-1">
                          <Clock size={12} className="text-[#cc0033]" />
                          <span>{event.time}</span>
                        </div>
                        {event.location && (
                          <div className="flex items-center gap-1 truncate max-w-[200px]">
                            <MapPin size={12} className="text-[var(--text-muted)] shrink-0" />
                            <span className="truncate">{event.location}</span>
                          </div>
                        )}
                      </div>

                      {/* Club info */}
                      <div className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                        <Users size={12} className="shrink-0" />
                        <span className="truncate">{event.club_name}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer with Day View Switcher */}
            <div className="flex items-center justify-between border-t border-[var(--border-color)] p-3 px-4 sm:px-5 bg-[var(--bg-secondary)]/50 shrink-0">
              <span className="text-[12px] text-[var(--text-muted)]">
                Click any event to view full details
              </span>
              <button
                type="button"
                onClick={() => {
                  setCurrentDate(moreModalData.date);
                  setView('day');
                  setMoreModalData(null);
                }}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#cc0033] hover:underline cursor-pointer"
              >
                <span>Open in Day View</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
