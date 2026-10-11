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
  Film,
  Play,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';

/**
 * Checks if a URL points to a direct video file/stream
 */
function isDirectVideoUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.includes('instagram.com/p/') || lower.includes('instagram.com/reel/')) {
    return false;
  }
  return (
    lower.includes('.mp4') ||
    lower.includes('.webm') ||
    lower.includes('.mov') ||
    lower.includes('.ogg') ||
    lower.includes('blob:') ||
    lower.includes('/video/') ||
    lower.includes('googlevideo') ||
    (lower.includes('cdninstagram.com') && lower.includes('mp4'))
  );
}

export const EventDetailModal: React.FC = () => {
  const {
    selectedEvent,
    setSelectedEvent,
  } = useCalendar();

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedLocation, setCopiedLocation] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | null>(null);
  const [isResolvingVideo, setIsResolvingVideo] = useState(false);
  const [resolveFailed, setResolveFailed] = useState(false);

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

  // Reset states when selectedEvent changes
  useEffect(() => {
    setMediaError(false);
    setResolvedVideoUrl(null);
    setIsResolvingVideo(false);
    setResolveFailed(false);

    if (selectedEvent) {
      const isDirect = isDirectVideoUrl(selectedEvent.video_url);
      if (isDirect && selectedEvent.video_url) {
        setResolvedVideoUrl(selectedEvent.video_url);
        setIsPlayingVideo(!selectedEvent.image_url);
      } else if (selectedEvent.is_video && !selectedEvent.image_url) {
        // Auto-resolve if event is solely a video with no image
        setIsPlayingVideo(true);
        triggerResolveVideo(selectedEvent.video_url || selectedEvent.post_url, selectedEvent.id);
      } else {
        setIsPlayingVideo(false);
      }
    } else {
      setIsPlayingVideo(false);
    }
  }, [selectedEvent?.id]);

  const triggerResolveVideo = async (targetUrl?: string, eventId?: string) => {
    const urlToResolve = targetUrl || selectedEvent?.video_url || selectedEvent?.post_url;
    if (!urlToResolve) return;

    if (isDirectVideoUrl(urlToResolve)) {
      setResolvedVideoUrl(urlToResolve);
      setIsPlayingVideo(true);
      return;
    }

    setIsPlayingVideo(true);
    setIsResolvingVideo(true);
    setResolveFailed(false);

    try {
      const idParam = eventId || selectedEvent?.id || '';
      const res = await fetch(
        `/api/video?url=${encodeURIComponent(urlToResolve)}&eventId=${encodeURIComponent(idParam)}`
      );
      const data = await res.json();
      if (data.success && data.video_url) {
        setResolvedVideoUrl(data.video_url);
      } else {
        setResolveFailed(true);
      }
    } catch (e) {
      console.warn('Failed to resolve video:', e);
      setResolveFailed(true);
    } finally {
      setIsResolvingVideo(false);
    }
  };

  if (!selectedEvent) return null;

  const palette = COLOR_MAP[selectedEvent.color_scheme];

  // Video determination
  const activeVideoUrl = resolvedVideoUrl || (isDirectVideoUrl(selectedEvent.video_url) ? selectedEvent.video_url : null);
  const hasPlayableVideo = Boolean(activeVideoUrl) || Boolean(selectedEvent.is_video) || Boolean(selectedEvent.video_url);
  const hasImage = Boolean(selectedEvent.image_url && !mediaError);
  const hasMedia = hasPlayableVideo || hasImage;

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

  const downloadVideoUrl = `/api/video/download?url=${encodeURIComponent(
    activeVideoUrl || selectedEvent.video_url || selectedEvent.post_url
  )}&filename=${encodeURIComponent(selectedEvent.title)}`;

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
        {/* Left Side: Media Column (Image or Playable Video) */}
        {hasMedia && (
          <div className="w-full md:w-[44%] lg:w-[42%] bg-black/95 flex flex-col items-center justify-center p-3 sm:p-4 relative shrink-0 border-b md:border-b-0 md:border-r border-[var(--border-subtle)] overflow-hidden max-h-[38vh] md:max-h-[85vh]">
            {/* View switcher & download toggle */}
            <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
              {hasPlayableVideo && (
                <a
                  href={downloadVideoUrl}
                  target="_blank"
                  rel="noreferrer"
                  download={`${selectedEvent.title}.mp4`}
                  className="flex items-center gap-1 rounded-lg bg-black/80 backdrop-blur-xs px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-black hover:text-[#E1306C] transition-colors shadow-md cursor-pointer border border-white/20"
                  title="Download MP4 video"
                >
                  <Download size={12} />
                  <span className="hidden sm:inline">Download</span>
                </a>
              )}

              {hasPlayableVideo && hasImage && (
                isPlayingVideo ? (
                  <button
                    type="button"
                    onClick={() => setIsPlayingVideo(false)}
                    className="flex items-center gap-1.5 rounded-lg bg-black/80 backdrop-blur-xs px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-black transition-colors shadow-md cursor-pointer border border-white/20"
                    title="View flyer poster image"
                  >
                    <ImageIcon size={12} />
                    <span>Flyer</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => triggerResolveVideo()}
                    className="flex items-center gap-1.5 rounded-lg bg-[#E1306C] hover:bg-[#d0245f] text-white px-2.5 py-1 text-[11px] font-semibold transition-all shadow-md cursor-pointer active:scale-95"
                    title="Play post video"
                  >
                    <Play size={12} className="fill-current" />
                    <span>Play Video</span>
                  </button>
                )
              )}
            </div>

            {/* Playable Video View */}
            {isPlayingVideo || (!hasImage && hasPlayableVideo) ? (
              <div className="relative w-full h-full min-h-[250px] md:min-h-[420px] flex flex-col items-center justify-center">
                {isResolvingVideo ? (
                  /* Loading state while resolving direct MP4 stream */
                  <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
                    <div className="flex size-14 items-center justify-center rounded-full bg-[#E1306C]/20 border border-[#E1306C]/40 text-[#E1306C]">
                      <Loader2 size={26} className="animate-spin" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Extracting Video Stream...</p>
                      <p className="text-xs text-white/60 max-w-[260px]">
                        Resolving direct high-definition stream from Instagram to bypass embed limits.
                      </p>
                    </div>
                  </div>
                ) : activeVideoUrl ? (
                  /* Direct HTML5 Video Player */
                  <>
                    <video
                      key={activeVideoUrl}
                      src={activeVideoUrl}
                      controls
                      autoPlay
                      playsInline
                      loop
                      preload="auto"
                      poster={selectedEvent.image_url}
                      className="w-full max-h-[36vh] md:max-h-[80vh] object-contain rounded-xl shadow-lg bg-black"
                      onError={() => {
                        setResolveFailed(true);
                      }}
                    />
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/75 backdrop-blur-xs px-2 py-0.5 text-[10px] font-semibold text-white/90 shadow-xs pointer-events-none">
                      <Film size={11} className="text-[#E1306C]" />
                      <span>Playing Direct MP4</span>
                    </div>
                  </>
                ) : (
                  /* Graceful Instagram restricted fallback (replaces blocked iframe) */
                  <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
                    <div className="flex size-12 items-center justify-center rounded-full bg-white/10 text-white/80">
                      <Film size={22} />
                    </div>
                    <div className="space-y-1 max-w-[280px]">
                      <p className="text-sm font-semibold">Instagram In-Browser Blocked</p>
                      <p className="text-xs text-white/60">
                        Instagram restricts playing this video directly in an embedded frame.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {selectedEvent.image_url && (
                        <button
                          type="button"
                          onClick={() => setIsPlayingVideo(false)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition-colors cursor-pointer"
                        >
                          <ImageIcon size={13} />
                          <span>View Flyer</span>
                        </button>
                      )}
                      <a
                        href={selectedEvent.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E1306C] hover:bg-[#c1275d] text-xs font-semibold text-white transition-colors shadow-xs"
                      >
                        <Instagram size={13} />
                        <span>Watch on Instagram</span>
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Flyer Image View with optional Play Overlay */
              <div className="relative w-full h-full flex items-center justify-center group">
                <img
                  src={selectedEvent.image_url}
                  alt={selectedEvent.title}
                  className="w-full max-h-[34vh] md:max-h-[80vh] object-contain rounded-xl shadow-lg transition-transform duration-300 group-hover:scale-[1.01]"
                  loading="lazy"
                  onError={() => setMediaError(true)}
                />

                {/* Big Center Play Button Overlay if post has video */}
                {hasPlayableVideo && (
                  <button
                    type="button"
                    onClick={() => triggerResolveVideo()}
                    className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors group/play cursor-pointer rounded-xl"
                    title="Click to play video"
                  >
                    <div className="flex size-14 items-center justify-center rounded-full bg-[#E1306C] text-white shadow-xl transition-transform duration-200 group-hover/play:scale-110 active:scale-95">
                      <Play size={24} className="ml-1 fill-current" />
                    </div>
                  </button>
                )}
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
              {selectedEvent.has_free_food && (
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-[#fdba74] bg-[#ffedd5] px-2.5 py-0.5 text-[11px] font-bold text-[#c2410c] shadow-2xs"
                >
                  <span>🍕</span>
                  <span>FREE FOOD!!</span>
                </span>
              )}
              {hasPlayableVideo && (
                <span className="inline-flex items-center gap-1 rounded-md border border-[#E1306C]/30 bg-[#E1306C]/10 px-2 py-0.5 text-[11px] font-semibold text-[#E1306C]">
                  <Film size={11} />
                  <span>Video Post</span>
                </span>
              )}
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
              {hasPlayableVideo && (
                <a
                  href={downloadVideoUrl}
                  target="_blank"
                  rel="noreferrer"
                  download={`${selectedEvent.title}.mp4`}
                  title="Download MP4 video file directly"
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 text-[12px] font-medium text-[var(--text-primary)] hover:border-[#E1306C] hover:text-[#E1306C] transition-colors shadow-2xs"
                >
                  <Download size={14} className="text-[#E1306C]" />
                  <span>Video</span>
                </a>
              )}

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
