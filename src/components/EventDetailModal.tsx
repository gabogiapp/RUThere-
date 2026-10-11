import React, { useState, useEffect } from 'react';
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
  Instagram,
  Sparkles,
  Film,
} from 'lucide-react';

export const EventDetailModal: React.FC = () => {
  const {
    selectedEvent,
    setSelectedEvent,
  } = useCalendar();

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedLocation, setCopiedLocation] = useState(false);
  const [mediaError, setMediaError] = useState(false);

  // Close popup when Escape key is pressed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedEvent(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSelectedEvent]);

  // Reset media error when selectedEvent changes
  useEffect(() => {
    setMediaError(false);
  }, [selectedEvent?.id]);

  if (!selectedEvent) return null;

  const palette = COLOR_MAP[selectedEvent.color_scheme];
  const hasVideo = Boolean(selectedEvent.video_url && !mediaError);
  const hasImage = Boolean(selectedEvent.image_url && !hasVideo && !mediaError);
  const hasMedia = hasVideo || hasImage;

  // Filter out redundant origin post links from important_links so only external resources show
  const externalLinks = (selectedEvent.important_links || []).filter((link) => {
    if (!link) return false;
    const cleanLink = link.trim().toLowerCase();
    if (selectedEvent.post_url && cleanLink === selectedEvent.post_url.trim().toLowerCase()) {
      return false;
    }
    if (cleanLink.includes('instagram.com/p/') || cleanLink.includes('instagram.com/reel/')) {
      return false;
    }
    return true;
  });

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5 md:p-6 animate-fade-in"
      onClick={() => setSelectedEvent(null)}
    >
      <div
        className={`relative w-full ${
          hasMedia ? 'max-w-4xl' : 'max-w-xl'
        } max-h-[90vh] md:max-h-[85vh] flex flex-col md:flex-row overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-2xl transition-all`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Side: Media Column (Image or Video) */}
        {hasMedia && (
          <div className="w-full md:w-[44%] lg:w-[42%] bg-black/95 dark:bg-black flex flex-col items-center justify-center p-3 sm:p-4 relative shrink-0 border-b md:border-b-0 md:border-r border-[var(--border-subtle)] overflow-hidden max-h-[36vh] md:max-h-[85vh]">
            {hasVideo ? (
              <div className="relative w-full h-full flex flex-col items-center justify-center">
                <video
                  src={selectedEvent.video_url}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full max-h-[30vh] md:max-h-[76vh] object-contain rounded-xl shadow-lg bg-black"
                  onError={() => setMediaError(true)}
                />
                <div className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-black/75 backdrop-blur-xs px-2 py-0.5 text-[10px] font-semibold text-white/90 shadow-xs pointer-events-none">
                  <Film size={11} className="text-[#E1306C]" />
                  <span>Video</span>
                </div>
              </div>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center group">
                <img
                  src={selectedEvent.image_url}
                  alt={selectedEvent.title}
                  className="w-full max-h-[32vh] md:max-h-[76vh] object-contain rounded-xl shadow-lg transition-transform duration-300 group-hover:scale-[1.01]"
                  loading="lazy"
                  onError={() => setMediaError(true)}
                />
              </div>
            )}
          </div>
        )}

        {/* Right Side: Information Column */}
        <div className="flex-1 flex flex-col min-w-0 max-h-[90vh] md:max-h-[85vh] overflow-hidden">
          {/* Top Bar with Badges and Close button */}
          <div className="flex items-center justify-between p-4 sm:p-5 pb-3 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/90 backdrop-blur-xs shrink-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
              title="Close modal (Esc)"
              className="flex size-7 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--border-color)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0 ml-2"
            >
              <X size={16} />
            </button>
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Title & Accent bar */}
            <div className="relative pl-3.5">
              <span
                className="absolute top-1 bottom-1 left-0 w-1 rounded-full"
                style={{ backgroundColor: palette.bar }}
              />
              <h2 className="text-[18px] sm:text-[20px] font-bold text-[var(--text-primary)] leading-snug">
                {selectedEvent.title}
              </h2>
              <div className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-secondary)]">
                <Users size={14} className="text-[#cc0033] shrink-0" />
                <span className="truncate">{selectedEvent.club_name}</span>
                <span className="text-[var(--text-muted)] shrink-0">({selectedEvent.club_handle})</span>
              </div>
            </div>

            {/* Date, Time & Location Cards */}
            <div className="space-y-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5 text-[13px]">
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

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyLocation}
                    title="Copy location address"
                    className="flex size-7 items-center justify-center rounded-md hover:bg-[var(--border-color)] text-[var(--text-secondary)] transition-colors cursor-pointer"
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

            {/* Gemini Vision Extracted Flyer Details */}
            {selectedEvent.flyer_details && (
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 text-[12px] text-[var(--text-secondary)] shadow-2xs">
                <div className="flex items-center gap-1.5 font-semibold text-purple-600 dark:text-purple-400">
                  <Sparkles size={13} />
                  <span>Extracted from Flyer Graphic</span>
                </div>
                <p className="mt-1 leading-relaxed text-[var(--text-primary)]">
                  {selectedEvent.flyer_details}
                </p>
              </div>
            )}

            {/* Description */}
            {selectedEvent.description && (
              <div>
                <p className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                  Event Details
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  {selectedEvent.description}
                </p>
              </div>
            )}

            {/* Important Links from backend */}
            {externalLinks.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                  Important Links
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {externalLinks.map((link, idx) => (
                    <a
                      key={idx}
                      href={link.startsWith('http') || link.startsWith('mailto:') ? link : `https://${link}`}
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
                          : link.includes('linktr.ee')
                          ? 'Linktree'
                          : link.startsWith('mailto:')
                          ? link.replace('mailto:', '')
                          : link}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons Footer (Share, Origin Post, ICS, GCal) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-color)] p-3.5 sm:px-5 bg-[var(--bg-secondary)]/50 backdrop-blur-xs shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleShare}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-[var(--bg-secondary)] px-3 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--border-color)] transition-colors cursor-pointer"
              >
                {copiedLink ? <Check size={14} className="text-emerald-500" /> : <Share2 size={14} />}
                <span>{copiedLink ? 'Copied' : 'Share'}</span>
              </button>

              {selectedEvent.post_url && (
                <a
                  href={selectedEvent.post_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 text-[12px] font-medium text-[var(--text-primary)] hover:border-[#E1306C] hover:text-[#E1306C] transition-colors"
                >
                  <Instagram size={14} className="text-[#E1306C]" />
                  <span>Origin Post</span>
                </a>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadIcsFile(selectedEvent)}
                title="Download .ics file"
                className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer"
              >
                <Download size={14} />
                <span>.ICS</span>
              </button>

              <a
                href={generateGoogleCalendarUrl(selectedEvent)}
                target="_blank"
                rel="noreferrer"
                className="flex h-9 items-center gap-1.5 rounded-lg bg-[#cc0033] px-3.5 text-[12px] font-semibold text-white hover:bg-[#b3002d] active:scale-95 transition-all shadow-xs cursor-pointer"
              >
                <CalendarPlus size={15} />
                <span>Google Calendar</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
