import React, { useState, useEffect } from 'react';
import { useCalendar } from '../context/CalendarContext';
import { getMonthDays, formatIsoDate, COLOR_MAP, getCampusColor } from '../utils/dateUtils';
import { CalendarEvent } from '../types/event';
import { Calendar, Clock, MapPin, Users, X, Film, Image as ImageIcon, ArrowRight } from 'lucide-react';

export const MonthView: React.FC = () => {
  const {
    currentDate,
    setCurrentDate,
    setView,
    filteredEvents,
    setSelectedEvent,
  } = useCalendar();

  const [moreModalData, setMoreModalData] = useState<{ date: Date; events: CalendarEvent[] } | null>(null);

  // Close "+N more" popup when Escape key is pressed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && moreModalData) {
        setMoreModalData(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moreModalData]);

  const days = getMonthDays(currentDate);

  // Group events by parsedDate
  const eventsByDate: Record<string, CalendarEvent[]> = {};
  for (const event of filteredEvents) {
    if (!eventsByDate[event.parsedDate]) {
      eventsByDate[event.parsedDate] = [];
    }
    eventsByDate[event.parsedDate].push(event);
  }

  const weekDayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-primary)] select-none">
      
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-center text-[12px] font-semibold text-[var(--text-secondary)]">
        {weekDayNames.map((name) => (
          <div key={name} className="py-2 border-r border-[var(--border-subtle)] last:border-r-0">
            {name}
          </div>
        ))}
      </div>

      {/* Month Days Grid */}
      <div className="grid flex-1 grid-cols-7 grid-rows-5 lg:grid-rows-6 border-b border-[var(--border-subtle)] bg-[var(--border-subtle)] gap-px overflow-y-auto">
        {days.map(({ date, isCurrentMonth, isToday }, idx) => {
          const dateStr = formatIsoDate(date);
          const dayEvents = [...(eventsByDate[dateStr] || [])].sort((a, b) => {
            if (a.is_all_day !== b.is_all_day) return a.is_all_day ? -1 : 1;
            return a.startMinutes - b.startMinutes;
          });

          return (
            <div
              key={idx}
              onClick={() => {
                setCurrentDate(date);
              }}
              className={`flex flex-col bg-[var(--bg-primary)] p-1.5 transition-colors hover:bg-[var(--bg-secondary)]/50 min-h-[90px] ${
                !isCurrentMonth ? 'opacity-40 bg-[var(--bg-secondary)]/40' : ''
              }`}
            >
              {/* Day header number */}
              <div className="flex items-center justify-between pb-1">
                <span
                  className={`flex size-6 items-center justify-center rounded-full text-[12px] font-semibold ${
                    isToday
                      ? 'bg-[#cc0033] text-white font-bold'
                      : 'text-[var(--text-primary)]'
                  }`}
                >
                  {date.getDate()}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'}
                  </span>
                )}
              </div>

              {/* Event chips preview in day cell */}
              <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                {dayEvents.slice(0, 3).map((event) => {
                  const palette = COLOR_MAP[event.color_scheme];
                  const campusColor = getCampusColor(event.campus);
                  return (
                    <div
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEvent(event);
                      }}
                      style={{
                        backgroundColor: palette.fill,
                        color: palette.ink,
                      }}
                      className="group relative cursor-pointer truncate rounded-[5px] pl-2.5 pr-1.5 py-0.5 text-[11px] font-medium transition-all hover:brightness-95 hover:shadow-2xs flex items-center"
                    >
                      {/* Left accent bar */}
                      <span
                        className="pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-[2.5px] rounded-full"
                        style={{ backgroundColor: palette.bar }}
                      />
                      <span
                        className="size-1.5 rounded-full border shrink-0 mr-1"
                        style={{
                          backgroundColor: campusColor.bg,
                          borderColor: campusColor.border,
                        }}
                        title={event.campus}
                      />
                      <span className="truncate block flex-1">{event.title}</span>
                    </div>
                  );
                })}

                {dayEvents.length > 3 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMoreModalData({ date, events: dayEvents });
                    }}
                    className="text-left text-[10px] font-semibold text-[#cc0033] hover:underline pl-1 cursor-pointer"
                  >
                    +{dayEvents.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Centered Dimmed "+N more" Events Modal */}
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
