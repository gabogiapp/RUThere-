import React, { useRef, useEffect, useState } from 'react';
import { useCalendar } from '../context/CalendarContext';
import { CalendarEvent } from '../types/event';
import {
  COLOR_MAP,
  getCampusColor,
  formatIsoDate,
  formatMinutesToTime,
  isSameDay,
} from '../utils/dateUtils';
import { MapPin, Users, Calendar, Clock, X, Film, Image as ImageIcon } from 'lucide-react';

const START_HOUR = 8;
const END_HOUR = 23;
const HOUR_HEIGHT = 65;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const MAX_DAY_COLUMNS = 2; // Allows 2 concurrent events side-by-side without overlapping

export const DayView: React.FC = () => {
  const {
    currentDate,
    filteredEvents,
    setSelectedEvent,
  } = useCalendar();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [moreModalData, setMoreModalData] = useState<{ date: Date; events: CalendarEvent[] } | null>(null);

  const dateKey = formatIsoDate(currentDate);
  const today = new Date();
  const isToday = isSameDay(currentDate, today);

  const dayEvents = filteredEvents.filter((e) => e.parsedDate === dateKey);
  const allDayEvents = dayEvents.filter((e) => e.is_all_day);
  const timedEvents = dayEvents.filter((e) => !e.is_all_day);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 70;
    }
  }, [currentDate]);

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

  const currentMinutes = today.getHours() * 60 + today.getMinutes();
  const showCurrentTime = isToday && currentMinutes >= START_HOUR * 60 && currentMinutes <= END_HOUR * 60;
  const currentTimeTop = (currentMinutes - START_HOUR * 60) * (HOUR_HEIGHT / 60);

  const formattedHeader = currentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Smart Concurrent Layout for Day View:
  // Allows up to 2 columns side-by-side so overlapping events don't stack on top of each other.
  // Any further concurrent events are cleanly placed in overflow.
  const computeDayTimedLayout = (items: CalendarEvent[]) => {
    const sorted = [...items].sort((a, b) => a.startMinutes - b.startMinutes);
    const columns: CalendarEvent[][] = [];
    const visibleItems: { event: CalendarEvent; colIdx: number; totalCols: number }[] = [];
    const overflowItems: CalendarEvent[] = [];

    for (const event of sorted) {
      let placedCol = -1;
      for (let i = 0; i < MAX_DAY_COLUMNS; i++) {
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
        overflowItems.push(event);
      }
    }

    const actualMaxCols = Math.min(Math.max(columns.length, 1), MAX_DAY_COLUMNS);
    const finalizedVisible = visibleItems.map((item) => ({
      ...item,
      totalCols: actualMaxCols,
    }));

    return { visibleItems: finalizedVisible, overflowItems };
  };

  const { visibleItems, overflowItems } = computeDayTimedLayout(timedEvents);

  const overflowTop = (() => {
    if (overflowItems.length === 0) return 0;
    const minStart = Math.min(...overflowItems.map((e) => e.startMinutes));
    const maxEnd = Math.max(...overflowItems.map((e) => e.endMinutes));
    const startY = (Math.max(minStart, START_HOUR * 60) - START_HOUR * 60) * (HOUR_HEIGHT / 60);
    const endY = (Math.min(maxEnd, END_HOUR * 60) - START_HOUR * 60) * (HOUR_HEIGHT / 60);
    const centerY = (startY + endY) / 2;
    return Math.max(centerY - 16, 20);
  })();

  const visibleAllDay = allDayEvents.slice(0, 3);
  const extraAllDayCount = allDayEvents.length - 3;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-primary)] select-none">
      
      {/* Day Header banner */}
      <div className="flex h-12 items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-6">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-[#cc0033]" />
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
            {formattedHeader}
          </h2>
          {isToday && (
            <span className="rounded-full bg-[#cc0033]/10 px-2 py-0.5 text-[11px] font-bold text-[#cc0033]">
              Today
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {dayEvents.length > 3 && (
            <button
              type="button"
              onClick={() => setMoreModalData({ date: currentDate, events: dayEvents })}
              className="flex items-center gap-1 rounded-full bg-[#cc0033]/10 hover:bg-[#cc0033] hover:text-white px-2.5 py-0.5 text-[11px] font-bold text-[#cc0033] transition-colors cursor-pointer"
            >
              <span>View All ({dayEvents.length})</span>
            </button>
          )}
          <p className="text-[12px] text-[var(--text-muted)] font-mono">
            {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'} scheduled
          </p>
        </div>
      </div>

      {/* All-Day Events Section (at the top of the calendar) */}
      {allDayEvents.length > 0 && (
        <div className="flex items-center border-b border-[var(--border-color)] bg-[var(--bg-secondary)] pr-4 py-2.5 shrink-0">
          <div className="w-20 shrink-0 flex items-center justify-center text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            All-Day
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2">
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
                  className="group flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 shadow-2xs transition-all hover:shadow-xs hover:brightness-[0.98]"
                >
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ backgroundColor: palette.bar }}
                  />
                  <span className="text-[12px] font-bold">{event.title}</span>
                  <span className={`rounded-md border px-1.5 py-0.2 text-[10px] font-semibold ${palette.badge}`}>
                    {event.category}
                  </span>
                  <span
                    className="rounded-md border px-1.5 py-0.2 text-[10px] font-semibold"
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
                onClick={() => setMoreModalData({ date: currentDate, events: allDayEvents })}
                className="text-[11px] font-bold text-[#cc0033] hover:underline px-2 py-1 cursor-pointer"
              >
                +{extraAllDayCount} more
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grid container */}
      <div
        ref={scrollRef}
        className="relative flex flex-1 overflow-y-auto overflow-x-hidden"
      >
        {/* Time labels axis */}
        <div className="w-16 shrink-0 py-2 select-none border-r border-[var(--border-subtle)]">
          {Array.from({ length: TOTAL_HOURS }).map((_, i) => {
            const hour = START_HOUR + i;
            const period = hour >= 12 ? 'PM' : 'AM';
            const displayH = hour % 12 === 0 ? 12 : hour % 12;
            return (
              <div
                key={hour}
                style={{ height: `${HOUR_HEIGHT}px` }}
                className="-translate-y-2 pr-3 text-right text-[11px] font-medium text-[var(--text-muted)]"
              >
                {displayH} {period}
              </div>
            );
          })}
        </div>

        {/* Day timeline area */}
        <div
          className="calendar-grid-lines relative flex-1 p-2"
          style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}
        >
          {/* Current time red line */}
          {showCurrentTime && (
            <div
              style={{ top: `${currentTimeTop}px` }}
              className="pointer-events-none absolute inset-x-0 z-30 h-0.5 bg-[#cc0033]"
            >
              <span className="absolute -top-[3px] -left-1 size-2 rounded-full bg-[#cc0033]" />
            </div>
          )}

          {timedEvents.length === 0 && allDayEvents.length === 0 ? (
            <div className="flex h-96 flex-col items-center justify-center text-[var(--text-muted)]">
              <Calendar size={32} className="opacity-30 mb-2" />
              <p className="text-[14px] font-medium">No club events on this day</p>
              <p className="text-[12px]">Check other days or search for specific clubs</p>
            </div>
          ) : (
            visibleItems.map(({ event, colIdx, totalCols }) => {
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
                  style={{
                    top: `${top}px`,
                    height: `${Math.max(height - 4, 38)}px`,
                    left: `calc(${leftPct}% + 12px)`,
                    width: `calc(${widthPct}% - 18px)`,
                    backgroundColor: palette.fill,
                    color: palette.ink,
                  }}
                  className="group absolute cursor-pointer rounded-xl border border-[var(--border-subtle)] p-3 shadow-2xs transition-all hover:shadow-md hover:brightness-[0.97] hover:z-20 overflow-hidden"
                >
                  {/* Left accent bar */}
                  <span
                    className="pointer-events-none absolute top-2 bottom-2 left-1.5 w-1 rounded-full"
                    style={{ backgroundColor: palette.bar }}
                  />

                  <div className="pl-2">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-[14px] font-bold leading-tight">
                          {event.title}
                        </h3>
                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${palette.badge}`}>
                          {event.category}
                        </span>
                        <span
                          className="rounded-md border px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            backgroundColor: campusColor.bg,
                            color: campusColor.text,
                            borderColor: campusColor.border,
                          }}
                        >
                          {event.campus}
                        </span>
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
                      </div>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] opacity-85">
                      <div className="flex items-center gap-1 font-mono font-medium">
                        <Clock size={12} className="text-[#cc0033]" />
                        <span>{formatMinutesToTime(event.startMinutes)} – {formatMinutesToTime(event.endMinutes)}</span>
                      </div>
                      <span>•</span>
                      <span className="font-medium flex items-center gap-1">
                        <Users size={12} /> {event.club_name} ({event.club_handle})
                      </span>
                      {event.location && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <MapPin size={12} /> {event.location}
                          </span>
                        </>
                      )}
                    </div>

                    {height >= 80 && event.description && (
                      <p className="mt-1.5 line-clamp-2 text-[12px] opacity-75">
                        {event.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Overlap Overflow Pill: "+(N) more" */}
          {overflowItems.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMoreModalData({ date: currentDate, events: dayEvents });
              }}
              style={{
                top: `${overflowTop}px`,
                right: '16px',
              }}
              className="absolute z-30 flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#cc0033] px-3 text-[11px] font-bold text-white shadow-md hover:bg-[#b3002d] transition-all cursor-pointer ring-1 ring-white/20"
              title={`Click to view all ${dayEvents.length} events for this day`}
            >
              <span>+{overflowItems.length} more events</span>
            </button>
          )}
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

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-[var(--border-color)] p-3 px-4 sm:px-5 bg-[var(--bg-secondary)]/50 shrink-0">
              <span className="text-[12px] text-[var(--text-muted)]">
                Click any event to view full details
              </span>
              <button
                type="button"
                onClick={() => setMoreModalData(null)}
                className="text-[12px] font-semibold text-[#cc0033] hover:underline cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
