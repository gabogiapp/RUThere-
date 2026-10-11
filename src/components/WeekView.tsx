import React, { useRef, useEffect } from 'react';
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
import { MapPin } from 'lucide-react';

const START_HOUR = 8; // 8 AM
const END_HOUR = 23; // 11 PM
const HOUR_HEIGHT = 60; // 60px per hour (1px per minute)
const TOTAL_HOURS = END_HOUR - START_HOUR;
const TOTAL_MINUTES = TOTAL_HOURS * 60;

export const WeekView: React.FC = () => {
  const {
    currentDate,
    filteredEvents,
    setSelectedEvent,
  } = useCalendar();

  const scrollRef = useRef<HTMLDivElement>(null);
  const weekDates = getWeekDates(currentDate);
  const today = new Date();

  // Scroll to roughly 9 AM or current time on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 60; // 9 AM
    }
  }, []);

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

  // Calculate layout coordinates for overlapping events
  const computeEventLayout = (dayEvents: CalendarEvent[]) => {
    const sorted = [...dayEvents].sort((a, b) => a.startMinutes - b.startMinutes);
    const columns: CalendarEvent[][] = [];

    return sorted.map((event) => {
      // Find the first column where this event does not overlap with the last event
      let colIdx = 0;
      while (
        columns[colIdx] &&
        columns[colIdx][columns[colIdx].length - 1].endMinutes > event.startMinutes
      ) {
        colIdx++;
      }

      if (!columns[colIdx]) {
        columns[colIdx] = [];
      }
      columns[colIdx].push(event);

      // Simple collision width estimate
      return { event, colIdx };
    });
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

          return (
            <div
              key={d.toISOString()}
              className="flex h-10 min-w-0 flex-1 items-center justify-between border-l border-[var(--border-subtle)] px-2"
            >
              <div className="flex items-center gap-1.5 truncate">
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
            </div>
          );
        })}
      </div>

      {/* 2. Scrollable Calendar Grid */}
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
            const dayEvents = eventsByDay[dateKey] || [];
            const isToday = isSameDay(d, today);
            const layout = computeEventLayout(dayEvents);
            const maxCols = Math.max(...layout.map(l => l.colIdx), 0) + 1;

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

                {/* Render Events */}
                {layout.map(({ event, colIdx }) => {
                  const palette = COLOR_MAP[event.color_scheme];
                  const campusColor = getCampusColor(event.campus);
                  const clampedStart = Math.max(event.startMinutes, START_HOUR * 60);
                  const clampedEnd = Math.min(event.endMinutes, END_HOUR * 60);
                  
                  const top = (clampedStart - START_HOUR * 60) * (HOUR_HEIGHT / 60);
                  const durationMins = Math.max(clampedEnd - clampedStart, 30);
                  const height = durationMins * (HOUR_HEIGHT / 60);

                  const widthPct = 100 / maxCols;
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
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
