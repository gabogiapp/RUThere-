export interface BackendEventItem {
  is_event: boolean;
  title: string;
  date: string; // e.g. "Wednesday, Oct 24", "October 14, 2026", "2026-10-14"
  time: string; // e.g. "8:00 PM - 9:30 PM", "7:00 PM"
  location: string;
  important_links: string[];
  is_all_day?: boolean;
  
  // Optional enriched metadata (from scraper / user tags / club catalog)
  id?: string;
  club_name?: string;
  club_handle?: string;
  category?: ClubCategory;
  campus?: RutgersCampus;
  description?: string;
  color_scheme?: ColorVariant;
  post_url?: string;
  image_url?: string;
  video_url?: string;
  flyer_details?: string;
  extraction_source?: 'gemini' | 'heuristic';
}

export type ClubCategory =
  | 'Tech & Coding'
  | 'Engineering'
  | 'Academic & Professional'
  | 'Cultural & Identity'
  | 'Social & Student Life'
  | 'Arts & Media'
  | 'Sports & Recreation'
  | 'Community & Service';

export type RutgersCampus =
  | 'College Ave'
  | 'Busch'
  | 'Livingston'
  | 'Cook/Doug'
  | 'Cook/Douglass'
  | 'Virtual / Online';

export type ColorVariant =
  | 'blue'
  | 'purple'
  | 'amber'
  | 'emerald'
  | 'coral'
  | 'teal'
  | 'indigo'
  | 'rose';

export interface CalendarEvent extends BackendEventItem {
  id: string;
  club_name: string;
  club_handle: string;
  category: ClubCategory;
  campus: RutgersCampus;
  color_scheme: ColorVariant;
  is_all_day: boolean;
  // Computed time attributes
  parsedDate: string; // ISO format YYYY-MM-DD
  startMinutes: number; // minutes from 00:00 (e.g. 18:00 -> 1080)
  endMinutes: number; // minutes from 00:00 (e.g. 19:30 -> 1170)
  displayDuration: string;
}

export type CalendarViewType = 'week' | 'day' | 'month' | 'agenda';

export interface ColorPalette {
  bar: string;
  fill: string;
  ink: string;
  border: string;
  badge: string;
}
