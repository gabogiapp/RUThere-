export interface BrightDataPostRecord {
  id: string;
  caption?: string;
  datetime?: string;
  url?: string;
  likes?: number;
  comments?: number;
  type?: string;
  content_type?: string;
  image_url?: string;
  video_url?: string;
  video_play_url?: string;
}

export interface BrightDataProfileRecord {
  account?: string;
  user_id?: string;
  full_name?: string;
  biography?: string;
  followers?: number;
  following?: number;
  posts_count?: number;
  url?: string;
  profile_image_link?: string;
  is_verified?: boolean;
  posts?: BrightDataPostRecord[];
  [key: string]: any;
}

export interface ClubRecord {
  id?: number | string;
  handle: string;
  name: string;
  category?: string;
  url?: string;
  biography?: string;
  followers?: number;
  following?: number;
  posts_count?: number;
  interests?: string[];
  related_interests?: string[];
  last_scraped_at?: string | Date;
}

export interface EventRecord {
  id: string;
  club_id?: number | string;
  club_handle: string;
  club_name: string;
  instagram_post_id?: string;
  post_url: string;
  title: string;
  date?: string;
  time?: string;
  location: string;
  description?: string;
  important_links: string[];
  event_time?: string;
  campus?: string;
  category?: string;
  color_scheme?: string;
  is_event: boolean;
  created_at?: string;
  image_url?: string;
  video_url?: string;
  is_video?: boolean;
  flyer_details?: string;
  extraction_source?: "gemini" | "heuristic";
}

export interface ExtractedEventSchema {
  is_event: boolean;
  title: string;
  date: string;
  time: string;
  location: string;
  campus: string;
  category: string;
  important_links: string[];
  post_url?: string;
  image_url?: string;
  video_url?: string;
  is_video?: boolean;
  flyer_details?: string;
}

export type Club = ClubRecord;
export type ClubEvent = EventRecord;
export type BrightDataInstagramPost = BrightDataPostRecord;
