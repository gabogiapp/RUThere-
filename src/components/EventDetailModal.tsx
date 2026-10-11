import React, { useState } from 'react';
import { useCalendar } from '../context/CalendarContext';
import {
  COLOR_MAP,
  getCampusColor,
  downloadIcsFile,
  generateGoogleCalendarUrl,
} from '../utils/dateUtils';
import {
  X,
  Clock,
  MapPin,
  ExternalLink,
  Share2,
  CalendarPlus,
  Download,
  Copy,
  Check,
  Users,
} from 'lucide-react';

export const EventDetailModal: React.FC = () => {
  const {
    selectedEvent,
    setSelectedEvent,
  } = useCalendar();

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedLocation, setCopiedLocation] = useState(false);

  if (!selectedEvent) return null;

  const palette = COLOR_MAP[selectedEvent.color_scheme];

  const handleCopyLocation = () => {
    navigator.clipboard.writeText(selectedEvent.location);
    setCopiedLocation(true);
    setTimeout(() => setCopiedLocation(false), 2000);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Rutgers map search url
  const mapSearchUrl = `https://maps.rutgers.edu/#/?q=${encodeURIComponent(
    selectedEvent.location
  )}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in"
      onClick={() => setSelectedEvent(null)}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-6 shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar with category & close button */}
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-md border px-2.5 py-0.5 text-[11px] font-semibold ${palette.badge}`}
            >
              {selectedEvent.category}
            </span>
            {(() => {
              const campusColor = getCampusColor(selectedEvent.campus);
              return (
                <span
                  className="rounded-md border px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: campusColor.bg,
                    color: campusColor.text,
                    borderColor: campusColor.border,
                  }}
                >
                  {selectedEvent.campus}
                </span>
              );
            })()}
          </div>

          <button
            type="button"
            onClick={() => setSelectedEvent(null)}
            className="flex size-7 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--border-color)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Title & Accent bar */}
        <div className="relative pl-3.5 mt-1">
          <span
            className="absolute top-1 bottom-1 left-0 w-1 rounded-full"
            style={{ backgroundColor: palette.bar }}
          />
          <h2 className="text-[20px] font-bold text-[var(--text-primary)] leading-snug">
            {selectedEvent.title}
          </h2>
          <div className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-secondary)]">
            <Users size={14} className="text-[#cc0033]" />
            <span>{selectedEvent.club_name}</span>
            <span className="text-[var(--text-muted)]">({selectedEvent.club_handle})</span>
          </div>
        </div>

        {/* Date, Time & Location Cards */}
        <div className="mt-5 space-y-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5 text-[13px]">
          {/* Date & Time */}
          <div className="flex items-start gap-3 text-[var(--text-primary)]">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-primary)] text-[#cc0033] shadow-2xs">
              <Clock size={16} />
            </div>
            <div>
              <p className="font-semibold">{selectedEvent.date}</p>
              <p className="font-mono text-[12px] text-[var(--text-secondary)] mt-0.5">
                {selectedEvent.time}
              </p>
            </div>
          </div>

          <div className="h-px bg-[var(--border-subtle)]" />

          {/* Location */}
          <div className="flex items-start justify-between gap-2 text-[var(--text-primary)]">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-primary)] text-[#cc0033] shadow-2xs">
                <MapPin size={16} />
              </div>
              <div>
                <p className="font-semibold">{selectedEvent.location}</p>
                <p className="text-[12px] text-[var(--text-muted)]">Rutgers University Campus</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCopyLocation}
                title="Copy location address"
                className="flex size-7 items-center justify-center rounded-md hover:bg-[var(--border-color)] text-[var(--text-secondary)] transition-colors"
              >
                {copiedLocation ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
              </button>
              <a
                href={mapSearchUrl}
                target="_blank"
                rel="noreferrer"
                title="Search on Rutgers Map"
                className="flex size-7 items-center justify-center rounded-md hover:bg-[var(--border-color)] text-[var(--text-secondary)] transition-colors"
              >
                <ExternalLink size={13} />
              </a>
            </div>
          </div>
        </div>

        {/* Description */}
        {selectedEvent.description && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
              Event Details
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              {selectedEvent.description}
            </p>
          </div>
        )}

        {/* Important Links from backend */}
        {selectedEvent.important_links && selectedEvent.important_links.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
              Important Links
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {selectedEvent.important_links.map((link, idx) => (
                <a
                  key={idx}
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] hover:border-[#cc0033] hover:text-[#cc0033] transition-colors shadow-2xs"
                >
                  <ExternalLink size={13} />
                  <span className="truncate max-w-[200px]">
                    {link.includes('forms')
                      ? 'Registration / RSVP Form'
                      : link.includes('discord')
                      ? 'Club Discord'
                      : link.includes('instagram')
                      ? 'Instagram Post'
                      : link}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons row (Share, ICS, GCal) */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-color)] pt-4">
          <button
            type="button"
            onClick={handleShare}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-[var(--bg-secondary)] px-3 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--border-color)] transition-colors"
          >
            {copiedLink ? <Check size={14} className="text-emerald-500" /> : <Share2 size={14} />}
            <span>{copiedLink ? 'Copied' : 'Share'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => downloadIcsFile(selectedEvent)}
              title="Download .ics file"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <Download size={14} />
              <span>.ICS</span>
            </button>

            <a
              href={generateGoogleCalendarUrl(selectedEvent)}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[#cc0033] px-3.5 text-[12px] font-semibold text-white hover:bg-[#b3002d] active:scale-95 transition-all shadow-xs"
            >
              <CalendarPlus size={15} />
              <span>Google Calendar</span>
            </a>
          </div>
        </div>

      </div>
    </div>
  );
};
