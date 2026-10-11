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
} from 'lucide-react';

/**
 * Extracts Instagram embed URL from post or reel URL
 */
function getInstagramEmbedUrl(url?: string): string {
  if (!url) return '';
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([^/?#&]+)/i);
  if (match && match[1]) {
    return `https://www.instagram.com/p/${match[1]}/embed/captioned=0`;
  }
  return '';
}

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
    // If the event is primarily a video with no image, default to playing video
    if (selectedEvent) {
      const directVid = isDirectVideoUrl(selectedEvent.video_url);
      const igEmbed = getInstagramEmbedUrl(selectedEvent.video_url || (selectedEvent.is_video ? selectedEvent.post_url : undefined));
      const hasVid = directVid || Boolean(igEmbed) || Boolean(selectedEvent.is_video);
      setIsPlayingVideo(hasVid && !selectedEvent.image_url);
    } else {
      setIsPlayingVideo(false);
    }
  }, [selectedEvent?.id]);

  if (!selectedEvent) return null;

  const palette = COLOR_MAP[selectedEvent.color_scheme];

  // Video determination
  const isDirectVideo = isDirectVideoUrl(selectedEvent.video_url);
  const igEmbedUrl = getInstagramEmbedUrl(
    selectedEvent.video_url || (selectedEvent.is_video ? selectedEvent.post_url : undefined)
  );
  const hasPlayableVideo = isDirectVideo || Boolean(igEmbedUrl) || Boolean(selectedEvent.is_video);
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
          <div className="w-full md:w-[44%] lg:w-[42%] bg-black/95 dark:bg-black flex flex-col items-center justify-center p-3 sm:p-4 relative shrink-0 border-b md:border-b-0 md:border-r border-[var(--border-subtle)] overflow-hidden max-h-[38vh] md:max-h-[85vh]">
            {/* View switcher toggle if event has BOTH video and image */}
            {hasPlayableVideo && hasImage && (
              <div className="absolute top-2.5 right-2.5 z-20">
                {isPlayingVideo ? (
                  <button
                    type="button"
                    onClick={() => setIsPlayingVideo(false)}
                    className="flex items-center gap-1.5 rounded-lg bg-black/80 backdrop-blur-xs px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-black transition-colors shadow-md cursor-pointer border border-white/20"
                    title="View flyer poster image"
                  >
                    <ImageIcon size={12} />
                    <span>View Flyer</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsPlayingVideo(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-[#E1306C] hover:bg-[#d0245f] text-white px-2.5 py-1 text-[11px] font-semibold transition-all shadow-md cursor-pointer active:scale-95"
                    title="Play post video"
                  >
                    <Play size={12} className="fill-current" />
                    <span>Play Video</span>
                  </button>
                )}
              </div>
            )}

            {/* Playable Video View */}
            {isPlayingVideo || (!hasImage && hasPlayableVideo) ? (
              <div className="relative w-full h-full min-h-[250px] md:min-h-[420px] flex flex-col items-center justify-center">
                {isDirectVideo ? (
                  <video
                    key={selectedEvent.video_url}
                    src={selectedEvent.video_url}
                    controls
                    autoPlay
                    playsInline
                    loop
                    preload="auto"
                    poster={selectedEvent.image_url}
                    className="w-full max-h-[36vh] md:max-h-[80vh] object-contain rounded-xl shadow-lg bg-black"
                    onError={() => {
                      // Fallback to image if direct video source fails
                      setIsPlayingVideo(false);
                      setMediaError(true);
                    }}
                  />
                ) : igEmbedUrl ? (
                  <iframe
                    src={igEmbedUrl}
                    className="w-full h-full min-h-[280px] md:min-h-[500px] rounded-xl border-0 bg-black shadow-lg"
                    allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                    allowFullScreen
                    title="Instagram Video Player"
                  />
                ) : (
                  <video
                    src={selectedEvent.video_url}
                    controls
                    autoPlay
                    playsInline
                    loop
                    className="w-full max-h-[36vh] md:max-h-[80vh] object-contain rounded-xl shadow-lg bg-black"
                  />
                )}
                <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/75 backdrop-blur-xs px-2 py-0.5 text-[10px] font-semibold text-white/90 shadow-xs pointer-events-none">
                  <Film size={11} className="text-[#E1306C]" />
                  <span>Playing Video</span>
                </div>
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
                    onClick={() => setIsPlayingVideo(true)}
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
