import { BackendEventItem, CalendarEvent, ColorPalette, ColorVariant, ClubCategory, RutgersCampus } from '../types/event';

export const CATEGORY_COLOR_MAP: Record<ClubCategory, ColorVariant> = {
  'Tech & Coding': 'blue',
  'Engineering': 'teal',
  'Academic & Professional': 'emerald',
  'Cultural & Identity': 'amber',
  'Social & Student Life': 'coral',
  'Arts & Media': 'indigo',
  'Sports & Recreation': 'rose',
  'Community & Service': 'purple',
};

export interface CampusColorTheme {
  bg: string;
  text: string;
  border: string;
}

export const CAMPUS_COLORS: Record<string, CampusColorTheme> = {
  'Busch': {
    bg: 'rgb(255, 128, 128)',
    text: '#7f1d1d',
    border: 'rgb(239, 110, 110)',
  },
  'Livingston': {
    bg: 'rgb(255, 204, 153)',
    text: '#7c2d12',
    border: 'rgb(245, 180, 120)',
  },
  'College Ave': {
    bg: 'rgb(255, 255, 187)',
    text: '#713f12',
    border: 'rgb(230, 230, 150)',
  },
  'Cook/Doug': {
    bg: 'rgb(204, 255, 204)',
    text: '#14532d',
    border: 'rgb(160, 235, 160)',
  },
  'Cook/Douglass': {
    bg: 'rgb(204, 255, 204)',
    text: '#14532d',
    border: 'rgb(160, 235, 160)',
  },
  'Virtual / Online': {
    bg: 'rgb(224, 231, 255)',
    text: '#312e81',
    border: 'rgb(199, 210, 254)',
  },
};

export function getCampusColor(campus?: string): CampusColorTheme {
  if (!campus) return { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' };
  if (CAMPUS_COLORS[campus]) return CAMPUS_COLORS[campus];
  if (campus.toLowerCase().includes('cook')) return CAMPUS_COLORS['Cook/Doug'];
  return { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' };
}

export const COLOR_MAP: Record<ColorVariant, ColorPalette> = {
  blue: {
    bar: '#3b7be8',
    fill: '#dfe9fb',
    ink: '#1f4a94',
    border: '#c4d7f8',
    badge: 'bg-[#dfe9fb] text-[#1f4a94] border-[#c4d7f8]',
  },
  purple: {
    bar: '#7a5ae0',
    fill: '#ebe4fb',
    ink: '#4a3294',
    border: '#d8caf6',
    badge: 'bg-[#ebe4fb] text-[#4a3294] border-[#d8caf6]',
  },
  amber: {
    bar: '#dc2626',
    fill: '#fee2e2',
    ink: '#991b1b',
    border: '#fca5a5',
    badge: 'bg-[#fee2e2] text-[#991b1b] border-[#fca5a5]',
  },
  emerald: {
    bar: '#2e9b5f',
    fill: '#dff2e6',
    ink: '#1d5e3a',
    border: '#bfe5cc',
    badge: 'bg-[#dff2e6] text-[#1d5e3a] border-[#bfe5cc]',
  },
  coral: {
    bar: '#cc0033',
    fill: '#ffe4e8',
    ink: '#880022',
    border: '#fecdd6',
    badge: 'bg-[#ffe4e8] text-[#880022] border-[#fecdd6]',
  },
  teal: {
    bar: '#0ea5e9',
    fill: '#e0f2fe',
    ink: '#0369a1',
    border: '#bae6fd',
    badge: 'bg-[#e0f2fe] text-[#0369a1] border-[#bae6fd]',
  },
  indigo: {
    bar: '#6366f1',
    fill: '#e0e7ff',
    ink: '#3730a3',
    border: '#c7d2fe',
    badge: 'bg-[#e0e7ff] text-[#3730a3] border-[#c7d2fe]',
  },
  rose: {
    bar: '#f43f5e',
    fill: '#ffe4e6',
    ink: '#9f1239',
    border: '#fecdd3',
    badge: 'bg-[#ffe4e6] text-[#9f1239] border-[#fecdd3]',
  },
};

const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/**
 * Parses free-form date strings like "Wednesday, Oct 24", "October 14, 2026", "2026-10-14"
 */
export function parseDateString(dateStr: string, referenceYear = new Date().getFullYear()): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];

  const trimmed = dateStr.trim();

  // Format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Format: MM/DD/YYYY or MM/DD
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slashMatch) {
    const m = parseInt(slashMatch[1], 10) - 1;
    const d = parseInt(slashMatch[2], 10);
    const y = slashMatch[3] ? (slashMatch[3].length === 2 ? 2000 + parseInt(slashMatch[3], 10) : parseInt(slashMatch[3], 10)) : referenceYear;
    return formatIsoDate(new Date(y, m, d));
  }

  // Words like "Today", "Tomorrow"
  const lower = trimmed.toLowerCase();
  const now = new Date();
  if (lower.includes('today')) {
    return formatIsoDate(now);
  }
  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return formatIsoDate(tomorrow);
  }

  // Try matching "Oct 24", "October 24", "Wednesday, Oct 24", etc.
  const regex = /(?:[A-Za-z]+,\s*)?([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i;
  const match = trimmed.match(regex);
  if (match) {
    const monthKey = match[1].toLowerCase();
    const day = parseInt(match[2], 10);
    const year = match[3] ? parseInt(match[3], 10) : referenceYear;

    if (monthKey in MONTH_NAMES) {
      const monthIdx = MONTH_NAMES[monthKey];
      return formatIsoDate(new Date(year, monthIdx, day));
    }
  }

  // Fallback Native Date parse
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return formatIsoDate(parsed);
  }

  return formatIsoDate(now);
}

/**
 * Parses time string like "8:00 PM - 9:30 PM", "7:00 PM", "12 PM - 2 PM"
 * Returns startMinutes, endMinutes (0 - 1440)
 */
export function parseTimeString(timeStr: string): { startMinutes: number; endMinutes: number; display: string; isAllDay: boolean } {
  const isAllDay = /all[- ]?day/i.test(timeStr || '') || /24[- ]?hour/i.test(timeStr || '');
  if (isAllDay) {
    return {
      startMinutes: 0,
      endMinutes: 1440,
      display: 'All Day',
      isAllDay: true,
    };
  }

  const fallback = { startMinutes: 18 * 60, endMinutes: 19 * 60 + 30, display: timeStr || '6:00 PM - 7:30 PM', isAllDay: false };
  if (!timeStr) return fallback;

  const parts = timeStr.split(/-|–|to/i).map(s => s.trim());

  const parseOneTime = (s: string): number | null => {
    const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!m) return null;
    let hours = parseInt(m[1], 10);
    const mins = m[2] ? parseInt(m[2], 10) : 0;
    const modifier = m[3] ? m[3].toLowerCase() : null;

    if (modifier === 'pm' && hours < 12) hours += 12;
    if (modifier === 'am' && hours === 12) hours = 0;
    // If no am/pm specified and hours between 1 and 6, assume PM (typical club meeting hours)
    if (!modifier && hours >= 1 && hours <= 7) hours += 12;

    return hours * 60 + mins;
  };

  const start = parseOneTime(parts[0]);
  let end = parts[1] ? parseOneTime(parts[1]) : null;

  if (start === null) return fallback;

  // If start was without am/pm but end had 'pm', check if start is AM or PM
  if (end !== null && end < start) {
    // maybe end is PM and start was also meant to be PM
    if (end + 12 * 60 > start && end + 12 * 60 < 1440) {
      end += 12 * 60;
    }
  }

  if (end === null || end <= start) {
    end = Math.min(start + 90, 1439); // default 90 min meeting
  }

  return {
    startMinutes: start,
    endMinutes: end,
    display: timeStr,
    isAllDay: false,
  };
}

export function formatIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatMinutesToTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mStr = m > 0 ? `:${String(m).padStart(2, '0')}` : '';
  return `${h12}${mStr} ${period}`;
}

export function getWeekDates(baseDate: Date): Date[] {
  const date = new Date(baseDate);
  const day = date.getDay(); // 0 is Sunday
  // Start week on Monday (matching time.fyi)
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));

  const week: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const nextDay = new Date(monday);
    nextDay.setDate(monday.getDate() + i);
    week.push(nextDay);
  }
  return week;
}

export function getMonthDays(currentDate: Date): { date: Date; isCurrentMonth: boolean; isToday: boolean }[] {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  const startDay = firstDayOfMonth.getDay(); // Sunday=0, Monday=1, etc.
  // We want grid to start Monday:
  const prevDaysCount = (startDay + 6) % 7;

  const days: { date: Date; isCurrentMonth: boolean; isToday: boolean }[] = [];
  const todayStr = formatIsoDate(new Date());

  // Previous month padding
  for (let i = prevDaysCount; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    days.push({
      date: d,
      isCurrentMonth: false,
      isToday: formatIsoDate(d) === todayStr,
    });
  }

  // Current month days
  for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
    const d = new Date(year, month, i);
    days.push({
      date: d,
      isCurrentMonth: true,
      isToday: formatIsoDate(d) === todayStr,
    });
  }

  // Next month padding to fill complete weeks (35 or 42 cells)
  const totalSlots = days.length <= 35 ? 35 : 42;
  const remaining = totalSlots - days.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    days.push({
      date: d,
      isCurrentMonth: false,
      isToday: formatIsoDate(d) === todayStr,
    });
  }

  return days;
}

export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Transforms BackendEventItem into rich CalendarEvent
 */
export function enrichEvent(item: BackendEventItem, idx: number): CalendarEvent {
  const parsedDate = parseDateString(item.date);
  const timeInfo = parseTimeString(item.time);

  const category = (item.category || 'Tech & Coding') as ClubCategory;
  // Strictly enforce category color to maintain consistent visual state across the entire site
  const color = CATEGORY_COLOR_MAP[category] || 'blue';

  const rawCampus = item.campus || 'College Ave';
  const campus = (rawCampus === 'Cook/Douglass' ? 'Cook/Doug' : rawCampus) as RutgersCampus;
  const is_all_day = Boolean(item.is_all_day || timeInfo.isAllDay);

  const links = Array.from(
    new Set([...(item.important_links || []), item.post_url].filter(Boolean))
  ) as string[];

  return {
    ...item,
    id: item.id || `event-${idx}-${Date.now().toString(36)}`,
    club_name: item.club_name || 'Rutgers University Student Club',
    club_handle: item.club_handle || '@rutgersclubs',
    category,
    campus,
    post_url: item.post_url,
    image_url: item.image_url,
    video_url: item.video_url,
    is_video: item.is_video,
    flyer_details: item.flyer_details,
    important_links: links,
    color_scheme: color,
    is_all_day,
    parsedDate,
    startMinutes: timeInfo.startMinutes,
    endMinutes: timeInfo.endMinutes,
    displayDuration: timeInfo.display,
  };
}

/**
 * Creates Google Calendar Link
 */
export function generateGoogleCalendarUrl(event: CalendarEvent): string {
  const [year, month, day] = event.parsedDate.split('-').map(Number);
  
  const startH = Math.floor(event.startMinutes / 60);
  const startM = event.startMinutes % 60;
  const endH = Math.floor(event.endMinutes / 60);
  const endM = event.endMinutes % 60;

  const startDate = new Date(year, month - 1, day, startH, startM);
  const endDate = new Date(year, month - 1, day, endH, endM);

  const formatGCal = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');

  const text = encodeURIComponent(`[RUThere] ${event.title}`);
  const details = encodeURIComponent(
    `Club: ${event.club_name} (${event.club_handle})\n` +
    `Campus: ${event.campus}\n` +
    `Category: ${event.category}\n` +
    (event.description ? `\nDetails:\n${event.description}\n` : '') +
    (event.important_links.length ? `\nLinks:\n${event.important_links.join('\n')}` : '')
  );
  const location = encodeURIComponent(`${event.location}, Rutgers University`);
  const dates = `${formatGCal(startDate)}/${formatGCal(endDate)}`;

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}`;
}

/**
 * Generates an .ics file download for Apple Calendar / Outlook / Google
 */
export function downloadIcsFile(event: CalendarEvent): void {
  const [year, month, day] = event.parsedDate.split('-').map(Number);
  const startH = Math.floor(event.startMinutes / 60);
  const startM = event.startMinutes % 60;
  const endH = Math.floor(event.endMinutes / 60);
  const endM = event.endMinutes % 60;

  const formatIcs = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');
  const start = formatIcs(new Date(year, month - 1, day, startH, startM));
  const end = formatIcs(new Date(year, month - 1, day, endH, endM));

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RUThere//Rutgers Clubs Events//EN',
    'BEGIN:VEVENT',
    `UID:${event.id}@ruthere.rutgers.edu`,
    `DTSTAMP:${formatIcs(new Date())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${(event.description || '').replace(/\n/g, '\\n')} Organized by ${event.club_name}`,
    `LOCATION:${event.location}, Rutgers University`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.setAttribute('download', `${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
