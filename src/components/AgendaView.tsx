import React, { useState, useMemo } from 'react';
import { useCalendar } from '../context/CalendarContext';
import {
  COLOR_MAP,
  getCampusColor,
  generateGoogleCalendarUrl,
  formatIsoDate,
} from '../utils/dateUtils';
import {
  Calendar,
  Clock,
  MapPin,
  CalendarPlus,
  ArrowUpRight,
  ChevronDown,
  ChevronsUpDown,
  History,
  Search,
} from 'lucide-react';
import { CalendarEvent } from '../types/event';

/**
 * Formats ISO date string (YYYY-MM-DD) into user-friendly label with today/tomorrow/past badges
 */
function formatDateHeaderLabel(
  isoDate: string,
  todayIso: string
): {
  label: string;
  badge?: string;
  isToday: boolean;
  isPast: boolean;
} {
  const isToday = isoDate === todayIso;
  const isPast = isoDate < todayIso;

  try {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);

    const [ty, tm, td] = todayIso.split('-').map(Number);
    const todayObj = new Date(ty, tm - 1, td);
    const diffDays = Math.round(
      (dateObj.getTime() - todayObj.getTime()) / (1000 * 60 * 60 * 24)
    );

    const formatted = dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    if (isToday) {
      return { label: formatted, badge: 'Today', isToday: true, isPast: false };
    }
    if (diffDays === 1) {
      return { label: formatted, badge: 'Tomorrow', isToday: false, isPast: false };
    }
    if (isPast) {
      return { label: formatted, badge: 'Past', isToday: false, isPast: true };
    }
    return { label: formatted, isToday: false, isPast: false };
  } catch {
    return { label: isoDate, isToday, isPast };
  }
}

export const AgendaView: React.FC = () => {
  const { filteredEvents, setSelectedEvent, searchQuery } = useCalendar();

  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});
  const [showPastEvents, setShowPastEvents] = useState(false);

  // Today in local ISO format YYYY-MM-DD
  const todayIso = useMemo(() => formatIsoDate(new Date()), []);
  const isSearching = Boolean(searchQuery && searchQuery.trim().length > 0);

  // Sort events chronologically: earliest to latest
  const sortedEvents = useMemo(() => {
    return [...filteredEvents].sort((a, b) => {
      if (a.parsedDate !== b.parsedDate) {
        return a.parsedDate.localeCompare(b.parsedDate);
      }
      if (a.is_all_day !== b.is_all_day) {
        return a.is_all_day ? -1 : 1;
      }
      return a.startMinutes - b.startMinutes;
    });
  }, [filteredEvents]);

  // Separate upcoming (today and future) from past events
  const upcomingEvents = useMemo(() => {
    return sortedEvents.filter((e) => e.parsedDate >= todayIso);
  }, [sortedEvents, todayIso]);

  const pastEvents = useMemo(() => {
    return sortedEvents.filter((e) => e.parsedDate < todayIso);
  }, [sortedEvents, todayIso]);

  // Group events by parsedDate
  const groupedUpcoming: Record<string, CalendarEvent[]> = useMemo(() => {
    const res: Record<string, CalendarEvent[]> = {};
    for (const ev of upcomingEvents) {
      const k = ev.parsedDate;
      if (!res[k]) res[k] = [];
      res[k].push(ev);
    }
    return res;
  }, [upcomingEvents]);

  const groupedPast: Record<string, CalendarEvent[]> = useMemo(() => {
    const res: Record<string, CalendarEvent[]> = {};
    for (const ev of pastEvents) {
      const k = ev.parsedDate;
      if (!res[k]) res[k] = [];
      res[k].push(ev);
    }
    return res;
  }, [pastEvents]);

  // All active dates currently visible
  const activeDateKeys = useMemo(() => {
    if (isSearching || showPastEvents) {
      return [...Object.keys(groupedUpcoming), ...Object.keys(groupedPast)];
    }
    return Object.keys(groupedUpcoming);
  }, [isSearching, showPastEvents, groupedUpcoming, groupedPast]);

  const allCollapsed =
    activeDateKeys.length > 0 && activeDateKeys.every((k) => collapsedDates[k]);

  const toggleDate = (dateKey: string) => {
    setCollapsedDates((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey],
    }));
  };

  const toggleAll = () => {
    if (allCollapsed) {
      setCollapsedDates({});
    } else {
      const next: Record<string, boolean> = {};
      activeDateKeys.forEach((k) => {
        next[k] = true;
      });
      setCollapsedDates(next);
    }
  };

  // Helper to render a collapsible date group
  const renderDateSection = (dateIso: string, dayEvents: CalendarEvent[]) => {
    const dateInfo = formatDateHeaderLabel(dateIso, todayIso);
    const isCollapsed = Boolean(collapsedDates[dateIso]);

    return (
      <div key={dateIso} className="space-y-3">
        {/* Sticky Collapsible Date Header */}
        <button
          type="button"
          onClick={() => toggleDate(dateIso)}
          className="sticky top-2 z-20 w-full flex items-center justify-between rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)]/95 px-4 py-2.5 shadow-xs backdrop-blur-md transition-all hover:border-[#cc0033]/50 hover:bg-[var(--bg-secondary)] active:scale-[0.995] text-left cursor-pointer group"
          title={isCollapsed ? 'Click to expand this date' : 'Click to collapse this date'}
        >
          <div className="flex items-center gap-2.5">
            <ChevronDown
              size={16}
              className={`text-[var(--text-muted)] group-hover:text-[#cc0033] transition-transform duration-200 ${
                isCollapsed ? '-rotate-90' : 'rotate-0'
              }`}
            />
            <span
              className={`flex size-2.5 rounded-full ${
                dateInfo.isToday
                  ? 'bg-emerald-500 ring-4 ring-emerald-500/25'
                  : dateInfo.isPast
                  ? 'bg-amber-500 ring-2 ring-amber-500/25'
                  : 'bg-neutral-300'
              }`}
            />
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
              {dateInfo.label}
            </h3>
            {dateInfo.badge && (
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  dateInfo.isToday
                    ? 'bg-[#cc0033] text-white shadow-2xs'
                    : dateInfo.badge === 'Tomorrow'
                    ? 'bg-sky-100 text-sky-800 border border-sky-300'
                    : 'bg-amber-100 text-amber-900 border border-amber-300 font-bold shadow-2xs'
                }`}
              >
                {dateInfo.badge}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--text-muted)]">
              {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'}
            </span>
            <span className="text-[11px] font-medium text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
              {isCollapsed ? 'Expand' : 'Collapse'}
            </span>
          </div>
        </button>

        {/* Event Cards Grid */}
        {!isCollapsed && (
          <div className="grid gap-3 animate-fade-in">
            {dayEvents.map((event) => {
              const palette = COLOR_MAP[event.color_scheme];
              const campusColor = getCampusColor(event.campus);

              return (
                <div
                  key={event.id}
                  onClick={() => setSelectedEvent(event)}
                  className="group relative cursor-pointer rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 sm:p-5 transition-all hover:border-[#cc0033]/40 hover:bg-[var(--bg-primary)] hover:shadow-xs"
                >
                  {/* Colored accent indicator */}
                  <div
                    className="absolute top-4 bottom-4 left-0 w-1.5 rounded-r"
                    style={{ backgroundColor: palette.bar }}
                  />

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between pl-2">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${palette.badge}`}
                        >
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
                        {event.has_free_food && (
                          <span
                            className="inline-flex items-center gap-1 rounded-md border border-[#fdba74] bg-[#ffedd5] px-2 py-0.5 text-[11px] font-bold text-[#c2410c] shadow-2xs"
                          >
                            <span>🍕</span>
                            <span>FREE FOOD!!</span>
                          </span>
                        )}
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
                      {(event.important_links.length > 0 || event.post_url) && (
                        <div className="flex flex-wrap items-center gap-2 pt-2">
                          {event.post_url && !event.important_links.includes(event.post_url) && (
                            <a
                              href={event.post_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 rounded-md bg-[#E1306C]/10 px-2.5 py-1 text-[11px] font-semibold text-[#E1306C] hover:bg-[#E1306C]/20 transition-colors"
                            >
                              <ArrowUpRight size={12} />
                              <span>Instagram Post</span>
                            </a>
                          )}
                          {event.important_links.map((link, idx) => (
                            <a
                              key={idx}
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                link.includes('instagram')
                                  ? 'bg-[#E1306C]/10 text-[#E1306C] hover:bg-[#E1306C]/20 font-semibold'
                                  : 'bg-[var(--bg-tertiary)] text-[#cc0033] hover:bg-[#cc0033]/10'
                              }`}
                            >
                              <ArrowUpRight size={12} />
                              <span>
                                {link.includes('forms')
                                  ? 'RSVP Form'
                                  : link.includes('discord')
                                  ? 'Discord'
                                  : link.includes('instagram')
                                  ? 'Instagram Post'
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
        )}
      </div>
    );
  };

  const totalUpcomingCount = upcomingEvents.length;
  const totalPastCount = pastEvents.length;
  const hasUpcoming = totalUpcomingCount > 0;
  const hasPast = totalPastCount > 0;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-[var(--bg-primary)] p-4 sm:p-6 lg:p-8 select-none">
      <div className="mx-auto w-full max-w-4xl">
        {/* Header Toolbar */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border-color)] pb-4">
          <div>
            <h2 className="text-[20px] font-bold text-[var(--text-primary)]">
              All Rutgers Club & Campus Events
            </h2>
            <p className="text-[13px] text-[var(--text-muted)]">
              {isSearching ? (
                <>
                  Found <span className="font-semibold text-[var(--text-primary)]">{sortedEvents.length}</span> event{sortedEvents.length === 1 ? '' : 's'} matching "{searchQuery}" across all dates
                </>
              ) : (
                <>
                  Showing <span className="font-semibold text-[var(--text-primary)]">{totalUpcomingCount}</span> upcoming event{totalUpcomingCount === 1 ? '' : 's'} starting from today
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            {activeDateKeys.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:border-[#cc0033]/40 hover:text-[var(--text-primary)] transition-all cursor-pointer shadow-2xs"
                title={allCollapsed ? 'Expand all date groups' : 'Collapse all date groups'}
              >
                <ChevronsUpDown size={14} className="text-[#cc0033]" />
                <span>{allCollapsed ? 'Expand All' : 'Collapse All'}</span>
              </button>
            )}

            {!isSearching && hasPast && (
              <button
                type="button"
                onClick={() => setShowPastEvents((prev) => !prev)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all cursor-pointer shadow-2xs ${
                  showPastEvents
                    ? 'border-[#cc0033] bg-[#cc0033]/10 text-[#cc0033]'
                    : 'border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-[#cc0033]/40 hover:text-[var(--text-primary)]'
                }`}
                title={showPastEvents ? 'Hide past events' : 'Show past events from earlier this semester'}
              >
                <History size={14} />
                <span>{showPastEvents ? 'Hide Past' : `Past Events (${totalPastCount})`}</span>
              </button>
            )}
          </div>
        </div>

        {/* Empty State */}
        {sortedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Calendar size={48} className="text-[var(--text-muted)] opacity-40 mb-3" />
            <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">
              No matching events found
            </h3>
            <p className="text-[13px] text-[var(--text-muted)] mt-1 max-w-md">
              {isSearching
                ? `No events found matching "${searchQuery}". Try searching with different keywords.`
                : 'No event records match your current campus or category filter.'}
            </p>
          </div>
        ) : !isSearching && !hasUpcoming && !showPastEvents ? (
          /* When there are no upcoming events, but past events exist */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar size={48} className="text-[var(--text-muted)] opacity-40 mb-3" />
            <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">
              No upcoming events scheduled
            </h3>
            <p className="text-[13px] text-[var(--text-muted)] mt-1 max-w-md">
              There are no upcoming events currently listed starting from today. You can browse {totalPastCount} past event{totalPastCount === 1 ? '' : 's'} from earlier this semester.
            </p>
            {hasPast && (
              <button
                type="button"
                onClick={() => setShowPastEvents(true)}
                className="mt-4 flex items-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] hover:border-[#cc0033] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] transition-all cursor-pointer shadow-xs"
              >
                <History size={14} className="text-[#cc0033]" />
                <span>Show {totalPastCount} Past Events</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {/* UPCOMING EVENTS SECTION (starts at today and scrolls down chronologically) */}
            {Object.keys(groupedUpcoming).length > 0 && (
              <div className="space-y-8">
                {Object.entries(groupedUpcoming).map(([dateIso, events]) =>
                  renderDateSection(dateIso, events)
                )}
              </div>
            )}

            {/* SEARCH RESULTS: MATCHING PAST EVENTS (if searching and past events match) */}
            {isSearching && hasPast && (
              <div className="space-y-6 pt-4">
                <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2 text-[var(--text-muted)]">
                  <History size={15} className="text-[#cc0033]" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Past Events Matching Search ({totalPastCount})
                  </span>
                </div>
                <div className="space-y-8">
                  {Object.entries(groupedPast).map(([dateIso, events]) =>
                    renderDateSection(dateIso, events)
                  )}
                </div>
              </div>
            )}

            {/* DEFAULT VIEW: TOGGLEABLE PAST EVENTS SECTION AT BOTTOM */}
            {!isSearching && showPastEvents && hasPast && (
              <div className="space-y-6 pt-6 border-t border-[var(--border-color)] animate-fade-in">
                <div className="flex items-center justify-between text-[var(--text-muted)] pb-2">
                  <div className="flex items-center gap-2">
                    <History size={15} className="text-[#cc0033]" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Past Events from Earlier This Semester ({totalPastCount})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPastEvents(false)}
                    className="text-xs font-medium text-[#cc0033] hover:underline cursor-pointer"
                  >
                    Hide Past
                  </button>
                </div>
                <div className="space-y-8">
                  {Object.entries(groupedPast).map(([dateIso, events]) =>
                    renderDateSection(dateIso, events)
                  )}
                </div>
              </div>
            )}

            {/* BOTTOM BANNER: QUICK TOGGLE TO REVEAL PAST EVENTS */}
            {!isSearching && !showPastEvents && hasPast && hasUpcoming && (
              <div className="pt-6 pb-2 border-t border-[var(--border-color)] flex flex-col items-center justify-center text-center">
                <button
                  type="button"
                  onClick={() => setShowPastEvents(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] hover:border-[#cc0033]/50 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer shadow-2xs active:scale-95"
                >
                  <History size={14} className="text-[#cc0033]" />
                  <span>Show {totalPastCount} Past Events from Earlier This Semester</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
