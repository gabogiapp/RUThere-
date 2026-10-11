import React, { useRef, useEffect } from 'react';
import { useCalendar } from '../context/CalendarContext';
import {
  COLOR_MAP,
  getCampusColor,
  formatIsoDate,
  formatMinutesToTime,
  isSameDay,
} from '../utils/dateUtils';
import { MapPin, ExternalLink, Users, Calendar } from 'lucide-react';

const START_HOUR = 8;
const END_HOUR = 23;
const HOUR_HEIGHT = 65;
const TOTAL_HOURS = END_HOUR - START_HOUR;

export const DayView: React.FC = () => {
  const {
    currentDate,
    filteredEvents,
    setSelectedEvent,
  } = useCalendar();

  const scrollRef = useRef<HTMLDivElement>(null);
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

  const currentMinutes = today.getHours() * 60 + today.getMinutes();
  const showCurrentTime = isToday && currentMinutes >= START_HOUR * 60 && currentMinutes <= END_HOUR * 60;
  const currentTimeTop = (currentMinutes - START_HOUR * 60) * (HOUR_HEIGHT / 60);

  const formattedHeader = currentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

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
        <p className="text-[12px] text-[var(--text-muted)] font-mono">
          {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'} scheduled
        </p>
      </div>

      {/* All-Day Events Section (at the top of the calendar) */}
      {allDayEvents.length > 0 && (
        <div className="flex items-center border-b border-[var(--border-color)] bg-[var(--bg-secondary)] pr-4 py-2.5 shrink-0">
          <div className="w-20 shrink-0 flex items-center justify-center text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            All-Day
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {allDayEvents.map((event) => {
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
            timedEvents.map((event) => {
              const palette = COLOR_MAP[event.color_scheme];
              const campusColor = getCampusColor(event.campus);
              const clampedStart = Math.max(event.startMinutes, START_HOUR * 60);
              const clampedEnd = Math.min(event.endMinutes, END_HOUR * 60);
              const top = (clampedStart - START_HOUR * 60) * (HOUR_HEIGHT / 60);
              const durationMins = Math.max(clampedEnd - clampedStart, 30);
              const height = durationMins * (HOUR_HEIGHT / 60);

              return (
                <div
                  key={event.id}
                  onClick={() => setSelectedEvent(event)}
                  style={{
                    top: `${top}px`,
                    height: `${Math.max(height - 4, 38)}px`,
                    backgroundColor: palette.fill,
                    color: palette.ink,
                  }}
                  className="group absolute inset-x-4 cursor-pointer rounded-lg border border-[var(--border-subtle)] p-3 shadow-2xs transition-all hover:shadow-md hover:brightness-[0.97]"
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
                      </div>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] opacity-85">
                      <span className="font-mono font-medium">
                        {formatMinutesToTime(event.startMinutes)} – {formatMinutesToTime(event.endMinutes)}
                      </span>
                      <span>•</span>
                      <span className="font-medium flex items-center gap-1">
                        <Users size={12} /> {event.club_name} ({event.club_handle})
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <MapPin size={12} /> {event.location}
                      </span>
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
        </div>
      </div>
    </div>
  );
};
