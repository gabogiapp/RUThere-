import React from 'react';
import { useCalendar } from '../context/CalendarContext';
import { getMonthDays, formatIsoDate, COLOR_MAP, getCampusColor } from '../utils/dateUtils';
import { CalendarEvent } from '../types/event';

export const MonthView: React.FC = () => {
  const {
    currentDate,
    setCurrentDate,
    setView,
    filteredEvents,
    setSelectedEvent,
  } = useCalendar();

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
                      setCurrentDate(date);
                      setView('day');
                    }}
                    className="text-left text-[10px] font-semibold text-[#cc0033] hover:underline pl-1"
                  >
                    +{dayEvents.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};
