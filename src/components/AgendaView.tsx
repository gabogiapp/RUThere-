import React from 'react';
import { useCalendar } from '../context/CalendarContext';
import { COLOR_MAP, getCampusColor, downloadIcsFile, generateGoogleCalendarUrl } from '../utils/dateUtils';
import {
  Calendar,
  Clock,
  MapPin,
  ExternalLink,
  Share2,
  CalendarPlus,
  ArrowUpRight,
} from 'lucide-react';

export const AgendaView: React.FC = () => {
  const {
    filteredEvents,
    setSelectedEvent,
    resetToSampleData,
  } = useCalendar();

  // Sort events chronologically by parsedDate then startMinutes
  const sortedEvents = [...filteredEvents].sort((a, b) => {
    if (a.parsedDate !== b.parsedDate) {
      return a.parsedDate.localeCompare(b.parsedDate);
    }
    return a.startMinutes - b.startMinutes;
  });

  // Group events by human-friendly date string
  const groupedEvents: Record<string, typeof sortedEvents> = {};
  for (const event of sortedEvents) {
    const key = event.date || event.parsedDate;
    if (!groupedEvents[key]) {
      groupedEvents[key] = [];
    }
    groupedEvents[key].push(event);
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-[var(--bg-primary)] p-4 sm:p-6 lg:p-8 select-none">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-6 flex items-center justify-between border-b border-[var(--border-color)] pb-4">
          <div>
            <h2 className="text-[20px] font-bold text-[var(--text-primary)]">
              All Rutgers Club & Campus Events
            </h2>
            <p className="text-[13px] text-[var(--text-muted)]">
              Showing {sortedEvents.length} events across all clubs
            </p>
          </div>
        </div>

        {Object.keys(groupedEvents).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Calendar size={48} className="text-[var(--text-muted)] opacity-40 mb-3" />
            <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">
              No matching events found
            </h3>
            <p className="text-[13px] text-[var(--text-muted)] mt-1">
              Database currently has no event records, or no events match current filters.
            </p>
            <button
              type="button"
              onClick={resetToSampleData}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#cc0033] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#b3002d] transition-all shadow-xs cursor-pointer"
            >
              Load Sample Data for Testing
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedEvents).map(([dateLabel, events]) => (
              <div key={dateLabel} className="space-y-3">
                
                {/* Date header */}
                <div className="sticky top-0 z-10 flex items-center gap-2 bg-[var(--bg-primary)]/90 backdrop-blur-md py-1">
                  <span className="flex size-2 rounded-full bg-[#cc0033]" />
                  <h3 className="text-[14px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    {dateLabel}
                  </h3>
                  <div className="h-px flex-1 bg-[var(--border-color)]" />
                </div>

                {/* Event Cards */}
                <div className="grid gap-3">
                  {events.map((event) => {
                    const palette = COLOR_MAP[event.color_scheme];
                    const campusColor = getCampusColor(event.campus);

                    return (
                      <div
                        key={event.id}
                        onClick={() => setSelectedEvent(event)}
                        className="group relative cursor-pointer rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 sm:p-5 transition-all hover:border-[#cc0033]/40 hover:bg-[var(--bg-primary)] hover:shadow-sm"
                      >
                        {/* Colored accent indicator */}
                        <div
                          className="absolute top-4 bottom-4 left-0 w-1.5 rounded-r"
                          style={{ backgroundColor: palette.bar }}
                        />

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between pl-2">
                          <div className="flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${palette.badge}`}>
                                {event.category}
                              </span>
                              <span
                                className="rounded-md border px-2 py-0.5 text-[11px] font-semibold"
                                style={{
                                  backgroundColor: campusColor.bg,
                                  color: campusColor.text,
                                  borderColor: campusColor.border,
                                }}
                              >
                                {event.campus}
                              </span>
                              <span className="text-[12px] font-medium text-[var(--text-muted)]">
                                {event.club_name} ({event.club_handle})
                              </span>
                            </div>

                            <h4 className="text-[16px] font-bold text-[var(--text-primary)] group-hover:text-[#cc0033] transition-colors">
                              {event.title}
                            </h4>

                            <div className="flex flex-wrap items-center gap-4 text-[13px] text-[var(--text-secondary)] pt-1">
                              <div className="flex items-center gap-1.5 font-mono">
                                <Clock size={14} className="text-[var(--text-muted)]" />
                                <span>{event.time}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <MapPin size={14} className="text-[var(--text-muted)]" />
                                <span>{event.location}</span>
                              </div>
                            </div>

                            {event.description && (
                              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed pt-1 line-clamp-2">
                                {event.description}
                              </p>
                            )}

                            {/* Important links preview */}
                            {event.important_links.length > 0 && (
                              <div className="flex flex-wrap items-center gap-2 pt-2">
                                {event.important_links.map((link, idx) => (
                                  <a
                                    key={idx}
                                    href={link}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-tertiary)] px-2.5 py-1 text-[11px] font-medium text-[#cc0033] hover:bg-[#cc0033]/10 transition-colors"
                                  >
                                    <ArrowUpRight size={12} />
                                    <span>
                                      {link.includes('forms')
                                        ? 'RSVP Form'
                                        : link.includes('discord')
                                        ? 'Discord'
                                        : link.includes('instagram')
                                        ? 'Instagram'
                                        : 'Link'}
                                    </span>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Quick Action buttons */}
                          <div className="flex items-center gap-1 self-end sm:self-start pt-2 sm:pt-0">
                            <a
                              href={generateGoogleCalendarUrl(event)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Add to Google Calendar"
                              className="flex size-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--border-color)] hover:text-[#cc0033] transition-colors"
                            >
                              <CalendarPlus size={15} />
                            </a>
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};
