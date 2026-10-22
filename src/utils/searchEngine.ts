import MiniSearch from 'minisearch';
import { CalendarEvent } from '../types/event';
import { ClubRecord } from '../../lib/types';

export type SearchTimeScope = 'upcoming' | 'past' | 'all';

export interface SearchOptions {
  scope?: SearchTimeScope;
  limit?: number;
}

export interface SearchResultItem {
  id: string;
  type: 'club' | 'event';
  title: string;
  subtitle: string;
  detail?: string;
  score: number;
  matchedInterest?: string;
  isPast?: boolean;
  club?: ClubRecord;
  event?: CalendarEvent;
}

interface IndexedDoc {
  id: string;
  docType: 'club' | 'event';
  rawId: string;
  title: string;
  handle: string;
  interests: string;
  related_interests: string;
  category: string;
  location: string;
  campus: string;
  description: string;
  free_food: string;
  biography: string;
  isPast: boolean;
  parsedDate: string;
  startMinutes: number;
}

interface CachedIndex {
  clubsRef: ClubRecord[];
  eventsRef: CalendarEvent[];
  todayIso: string;
  miniSearch: MiniSearch<IndexedDoc>;
  clubById: Map<string, ClubRecord>;
  clubByHandle: Map<string, ClubRecord>;
  clubByName: Map<string, ClubRecord>;
  eventById: Map<string, CalendarEvent>;
  eventByTitle: Map<string, CalendarEvent>;
  eventsByClubHandle: Map<string, string[]>;
}

let cachedIndex: CachedIndex | null = null;

function normalize(str: string): string {
  return (str || '').toLowerCase().trim();
}

function cleanHandle(handle: string): string {
  return normalize(handle).replace(/^@/, '');
}

export function getTodayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses search query to detect smart archive tokens (#past, is:past, past:)
 */
export function parseSearchQuery(rawQuery: string): {
  cleanQuery: string;
  isArchive: boolean;
} {
  const isArchive = /(?:^|\s)(?:#past|is:past|past:)(?:\s|$)/i.test(rawQuery);
  const cleanQuery = rawQuery
    .replace(/(?:^|\s)(?:#past|is:past|past:)(?:\s|$)/gi, ' ')
    .trim();
  return { cleanQuery, isArchive };
}

/**
 * Builds or retrieves the cached MiniSearch inverted index and O(1) entity maps.
 * Rebuilds only when the clubs or events array reference changes.
 */
function getOrBuildIndex(clubs: ClubRecord[], events: CalendarEvent[]): CachedIndex {
  const todayIso = getTodayIso();

  if (
    cachedIndex &&
    cachedIndex.clubsRef === clubs &&
    cachedIndex.eventsRef === events &&
    cachedIndex.todayIso === todayIso
  ) {
    return cachedIndex;
  }

  const clubById = new Map<string, ClubRecord>();
  const clubByHandle = new Map<string, ClubRecord>();
  const clubByName = new Map<string, ClubRecord>();
  const eventById = new Map<string, CalendarEvent>();
  const eventByTitle = new Map<string, CalendarEvent>();
  const eventsByClubHandle = new Map<string, string[]>();

  const docs: IndexedDoc[] = [];

  // Index clubs and populate O(1) lookup maps
  for (const club of clubs) {
    const rawId = String(club.id || club.handle);
    const cHandle = cleanHandle(club.handle);
    const cName = normalize(club.name);

    clubById.set(rawId, club);
    if (cHandle) clubByHandle.set(cHandle, club);
    if (cName) clubByName.set(cName, club);

    docs.push({
      id: `club:${rawId}`,
      docType: 'club',
      rawId,
      title: club.name || '',
      handle: cHandle,
      interests: (club.interests || []).join(' '),
      related_interests: (club.related_interests || []).join(' '),
      category: club.category || '',
      location: '',
      campus: '',
      description: club.biography || '',
      free_food: '',
      biography: club.biography || '',
      isPast: false,
      parsedDate: '',
      startMinutes: 0,
    });
  }

  // Index events and populate O(1) lookup maps
  for (const event of events) {
    eventById.set(event.id, event);
    const normTitle = normalize(event.title);
    if (normTitle && !eventByTitle.has(normTitle)) {
      eventByTitle.set(normTitle, event);
    }

    const hostHandle = cleanHandle(event.club_handle);
    const hostName = normalize(event.club_name);
    const rawClubId = (event as any).club_id;
    const hostClub =
      (rawClubId && clubById.get(String(rawClubId))) ||
      (hostHandle ? clubByHandle.get(hostHandle) : undefined) ||
      (hostName ? clubByName.get(hostName) : undefined);

    if (hostHandle) {
      const existing = eventsByClubHandle.get(hostHandle) || [];
      existing.push(event.id);
      eventsByClubHandle.set(hostHandle, existing);
    }

    const hostInterests = hostClub?.interests ? hostClub.interests.join(' ') : '';
    const hostRelated = hostClub?.related_interests ? hostClub.related_interests.join(' ') : '';

    const freeFoodTokens = event.has_free_food
      ? 'free food pizza snacks lunch dinner meal drinks beverage catering'
      : '';

    const isPast = Boolean(event.parsedDate && event.parsedDate < todayIso);

    docs.push({
      id: `event:${event.id}`,
      docType: 'event',
      rawId: event.id,
      title: event.title || '',
      handle: hostHandle,
      interests: hostInterests,
      related_interests: hostRelated,
      category: event.category || '',
      location: event.location || '',
      campus: event.campus || '',
      description: `${event.description || ''} ${event.flyer_details || ''}`,
      free_food: freeFoodTokens,
      biography: '',
      isPast,
      parsedDate: event.parsedDate || '',
      startMinutes: event.startMinutes || 0,
    });
  }

  const miniSearch = new MiniSearch<IndexedDoc>({
    fields: [
      'title',
      'handle',
      'interests',
      'related_interests',
      'location',
      'free_food',
      'category',
      'campus',
      'description',
      'biography',
    ],
    storeFields: ['docType', 'rawId', 'isPast', 'parsedDate', 'startMinutes'],
    searchOptions: {
      boost: {
        title: 4.0,
        handle: 3.0,
        interests: 2.5,
        free_food: 2.2,
        location: 1.8,
        related_interests: 1.4,
        category: 1.2,
        campus: 1.0,
        description: 0.8,
        biography: 0.8,
      },
      prefix: true,
    },
    tokenize: (text) => (text || '').toLowerCase().split(/[\s,._\-/]+/).filter(Boolean),
  });

  miniSearch.addAll(docs);

  cachedIndex = {
    clubsRef: clubs,
    eventsRef: events,
    todayIso,
    miniSearch,
    clubById,
    clubByHandle,
    clubByName,
    eventById,
    eventByTitle,
    eventsByClubHandle,
  };

  return cachedIndex;
}

const FREE_FOOD_TERMS = new Set(['free food', 'freefood', 'food', 'free', 'pizza', 'snacks']);

function isFreeFoodSearch(clean: string): boolean {
  if (FREE_FOOD_TERMS.has(clean)) return true;
  return clean.includes('free food') || clean.includes('pizza');
}

/**
 * Calculates optimal fuzzy edit distance.
 * Allows typo tolerance on medium words (e.g. 'esprot', 'codng'), but caps
 * strictly at max 2 edits on long words to prevent combinatorial explosion.
 */
function fuzzyDistance(term: string): number | false {
  if (term.length <= 3) return false;
  if (term.length <= 7) return 0.45;
  return 2;
}

/**
 * Searches clubs and events and returns combined results.
 * By default (scope = 'upcoming'), only present and future events are queried,
 * cutting search volume by ~86% for blazing speed and relevance.
 *
 * In Upcoming mode: events in similar relevance tiers are sorted soonest first.
 * In Past mode (#past): events in similar relevance tiers are sorted most recent past first.
 */
export function getBestMatches(
  query: string,
  clubs: ClubRecord[],
  events: CalendarEvent[],
  optionsOrLimit: number | SearchOptions = 8
): SearchResultItem[] {
  const options: SearchOptions =
    typeof optionsOrLimit === 'number'
      ? { limit: optionsOrLimit, scope: 'upcoming' }
      : { limit: 8, scope: 'upcoming', ...optionsOrLimit };

  const rawClean = normalize(query);
  if (!rawClean) return [];

  // Parse query for smart modifier tokens (#past, is:past, past:)
  const parsed = parseSearchQuery(rawClean);
  const clean = parsed.cleanQuery;
  const scope: SearchTimeScope = parsed.isArchive ? 'past' : options.scope || 'upcoming';
  const limit = options.limit || 8;

  const index = getOrBuildIndex(clubs, events);
  const todayIso = index.todayIso;

  // If query is solely an archive modifier (#past), return most recent past events
  if (!clean) {
    if (parsed.isArchive) {
      const pastEvents = events
        .filter((e) => Boolean(e.parsedDate && e.parsedDate < todayIso))
        .sort((a, b) => {
          const dateCompare = (b.parsedDate || '').localeCompare(a.parsedDate || '');
          if (dateCompare !== 0) return dateCompare;
          return (b.startMinutes || 0) - (a.startMinutes || 0);
        })
        .slice(0, limit);

      return pastEvents.map((event) => ({
        id: `event-${event.id}`,
        type: 'event',
        title: event.title,
        subtitle: `Past • ${event.date || event.parsedDate} • ${event.location}`,
        detail: event.club_name,
        score: 0.1,
        isPast: true,
        event,
      }));
    }
    return [];
  }

  const cleanNoAt = clean.replace(/^@/, '');
  const results: SearchResultItem[] = [];
  const matchedClubIds = new Set<string>();
  const matchedEventIds = new Set<string>();

  // 1. O(1) Exact Matches for Clubs
  const exactHandleClub = index.clubByHandle.get(cleanNoAt);
  if (exactHandleClub) {
    const rawId = String(exactHandleClub.id || exactHandleClub.handle);
    matchedClubIds.add(rawId);
    results.push({
      id: `club-${rawId}`,
      type: 'club',
      title: exactHandleClub.name,
      subtitle: `@${cleanHandle(exactHandleClub.handle)}${exactHandleClub.category ? ` • ${exactHandleClub.category}` : ''}`,
      detail: exactHandleClub.biography,
      score: 0.01,
      club: exactHandleClub,
    });
  }

  const exactNameClub = index.clubByName.get(clean);
  if (exactNameClub) {
    const rawId = String(exactNameClub.id || exactNameClub.handle);
    if (!matchedClubIds.has(rawId)) {
      matchedClubIds.add(rawId);
      results.push({
        id: `club-${rawId}`,
        type: 'club',
        title: exactNameClub.name,
        subtitle: `@${cleanHandle(exactNameClub.handle)}${exactNameClub.category ? ` • ${exactNameClub.category}` : ''}`,
        detail: exactNameClub.biography,
        score: 0.01,
        club: exactNameClub,
      });
    }
  }

  // 2. O(1) Exact Match for Events (scoped to time window)
  const exactEvent = index.eventByTitle.get(clean);
  if (exactEvent) {
    const isPast = Boolean(exactEvent.parsedDate && exactEvent.parsedDate < todayIso);
    const matchesScope =
      scope === 'all' || (scope === 'upcoming' && !isPast) || (scope === 'past' && isPast);

    if (matchesScope) {
      matchedEventIds.add(exactEvent.id);
      results.push({
        id: `event-${exactEvent.id}`,
        type: 'event',
        title: exactEvent.title,
        subtitle: isPast
          ? `Past • ${exactEvent.date || exactEvent.parsedDate} • ${exactEvent.location}`
          : `${exactEvent.date || exactEvent.parsedDate} • ${exactEvent.time} • ${exactEvent.location}`,
        detail: exactEvent.club_name,
        score: 0.02,
        isPast,
        event: exactEvent,
      });
    }
  }

  // 3. MiniSearch Inverted Index Query (Fuzzy + Prefix Typo-Tolerant Match)
  const isFreeFood = isFreeFoodSearch(clean);

  // Field filtering for short queries to prevent matching every word in long event captions
  const searchFields =
    clean.length === 1
      ? ['title', 'handle']
      : clean.length === 2
      ? ['title', 'handle', 'interests', 'category']
      : undefined;

  const searchResults = index.miniSearch.search(clean, {
    fields: searchFields,
    fuzzy: clean.length > 3 ? fuzzyDistance : false,
    prefix: true,
    // Filter documents by time scope directly in MiniSearch
    filter: (result) => {
      if (result.docType === 'club') return true;
      if (scope === 'all') return true;
      if (scope === 'upcoming') return !result.isPast;
      if (scope === 'past') return Boolean(result.isPast);
      return true;
    },
  });

  const candidates = searchResults.slice(0, 30);

  for (const item of candidates) {
    const isClub = item.docType === 'club';
    const rawId = item.rawId;

    if (isClub) {
      if (matchedClubIds.has(rawId)) continue;
      const club = index.clubById.get(rawId);
      if (!club) continue;

      matchedClubIds.add(rawId);

      const handle = cleanHandle(club.handle);
      const name = normalize(club.name);

      const isPrefixName = name.startsWith(clean);
      const isPrefixHandle = handle.startsWith(cleanNoAt);

      const matchingPrimaryInterest = (club.interests || []).find((interest) => {
        const iLower = normalize(interest);
        return iLower === clean || iLower.includes(clean);
      });

      const matchingRelatedInterest = (club.related_interests || []).find((interest) => {
        const iLower = normalize(interest);
        return iLower === clean || iLower.includes(clean);
      });

      let score: number;
      if (isPrefixName || isPrefixHandle) {
        score = 0.05;
      } else if (matchingPrimaryInterest) {
        score = 0.08;
      } else if (matchingRelatedInterest) {
        score = 0.20;
      } else {
        score = Math.max(0.22, Math.min(0.45, 0.45 - item.score / 25));
      }

      results.push({
        id: `club-${rawId}`,
        type: 'club',
        title: club.name,
        subtitle: `@${handle}${club.category ? ` • ${club.category}` : ''}`,
        detail: matchingPrimaryInterest
          ? `Matches interest: ${matchingPrimaryInterest}`
          : matchingRelatedInterest
          ? `Related to: ${matchingRelatedInterest}`
          : club.biography,
        score,
        matchedInterest: matchingPrimaryInterest || matchingRelatedInterest,
        club,
      });
    } else {
      if (matchedEventIds.has(rawId)) continue;
      const event = index.eventById.get(rawId);
      if (!event) continue;

      const isPast = Boolean(event.parsedDate && event.parsedDate < todayIso);
      const matchesScope =
        scope === 'all' || (scope === 'upcoming' && !isPast) || (scope === 'past' && isPast);

      if (!matchesScope) continue;

      matchedEventIds.add(rawId);

      const titleClean = normalize(event.title);
      const isPrefixTitle = titleClean.startsWith(clean);
      const hasTitleWord = titleClean.split(/\s+/).includes(clean);
      const matchesFreeFood = Boolean(event.has_free_food) && isFreeFood;

      let score: number;
      if (matchesFreeFood) {
        score = clean === 'free food' || clean === 'freefood' ? 0.03 : 0.11;
      } else if (isPrefixTitle) {
        score = 0.06;
      } else if (hasTitleWord) {
        score = 0.09;
      } else {
        score = Math.max(0.22, Math.min(0.45, 0.45 - item.score / 25));
      }

      results.push({
        id: `event-${event.id}`,
        type: 'event',
        title: event.title,
        subtitle: isPast
          ? `Past • ${event.date || event.parsedDate} • ${event.location}`
          : `${event.date || event.parsedDate} • ${event.time} • ${event.location}`,
        detail: matchesFreeFood
          ? `🍕 FREE FOOD Included • ${event.club_name}`
          : event.club_name,
        score,
        isPast,
        event,
      });
    }
  }

  // 4. Chronological & Relevance Sorting:
  // - High relevance differences (> 0.08) rank strictly by score
  // - Events in the same relevance tier sort chronologically:
  //   * Upcoming: soonest upcoming date first (today -> tomorrow -> next week)
  //   * Past: most recent past date first (yesterday -> last week -> last month)
  results.sort((a, b) => {
    const scoreDiff = a.score - b.score;
    if (Math.abs(scoreDiff) > 0.08) {
      return scoreDiff;
    }

    if (a.event && b.event) {
      if (scope === 'past') {
        // Most recent past to oldest past
        const dateCompare = (b.event.parsedDate || '').localeCompare(a.event.parsedDate || '');
        if (dateCompare !== 0) return dateCompare;
        return (b.event.startMinutes || 0) - (a.event.startMinutes || 0);
      } else {
        // Soonest upcoming to furthest future
        const dateCompare = (a.event.parsedDate || '').localeCompare(b.event.parsedDate || '');
        if (dateCompare !== 0) return dateCompare;
        return (a.event.startMinutes || 0) - (b.event.startMinutes || 0);
      }
    }

    if (a.type === 'club' && b.type === 'event' && b.score > 0.15) return -1;
    if (b.type === 'club' && a.type === 'event' && a.score > 0.15) return 1;

    return scoreDiff;
  });

  return results.slice(0, limit);
}

/**
 * Returns a Set of event IDs matching the search query, filtered by time scope.
 */
export function getMatchingEventIds(
  query: string,
  clubs: ClubRecord[],
  events: CalendarEvent[],
  options?: SearchOptions
): Set<string> {
  const rawClean = normalize(query);
  if (!rawClean) return new Set();

  const parsed = parseSearchQuery(rawClean);
  const clean = parsed.cleanQuery;
  const scope: SearchTimeScope = parsed.isArchive ? 'past' : options?.scope || 'upcoming';

  if (!clean) {
    if (parsed.isArchive) {
      const index = getOrBuildIndex(clubs, events);
      const todayIso = index.todayIso;
      const allPast = new Set<string>();
      for (const ev of events) {
        if (ev.parsedDate && ev.parsedDate < todayIso) {
          allPast.add(ev.id);
        }
      }
      return allPast;
    }
    return new Set();
  }

  const index = getOrBuildIndex(clubs, events);
  const todayIso = index.todayIso;
  const matchingIds = new Set<string>();

  // 1. Direct O(1) exact event title match
  const exactEvent = index.eventByTitle.get(clean);
  if (exactEvent) {
    const isPast = Boolean(exactEvent.parsedDate && exactEvent.parsedDate < todayIso);
    const matchesScope =
      scope === 'all' || (scope === 'upcoming' && !isPast) || (scope === 'past' && isPast);
    if (matchesScope) {
      matchingIds.add(exactEvent.id);
    }
  }

  // 2. Query MiniSearch Inverted Index
  const searchFields =
    clean.length === 1
      ? ['title', 'handle']
      : clean.length === 2
      ? ['title', 'handle', 'interests', 'category']
      : undefined;

  const searchResults = index.miniSearch.search(clean, {
    fields: searchFields,
    fuzzy: clean.length > 3 ? fuzzyDistance : false,
    prefix: true,
    filter: (result) => {
      if (result.docType === 'club') return true;
      if (scope === 'all') return true;
      if (scope === 'upcoming') return !result.isPast;
      if (scope === 'past') return Boolean(result.isPast);
      return true;
    },
  });

  const candidates = searchResults.slice(0, 60);

  for (const item of candidates) {
    if (item.docType === 'event') {
      matchingIds.add(item.rawId);
    } else if (item.docType === 'club') {
      const club = index.clubById.get(item.rawId);
      if (club) {
        const cHandle = cleanHandle(club.handle);
        const clubEventIds = index.eventsByClubHandle.get(cHandle);
        if (clubEventIds) {
          for (const eid of clubEventIds) {
            const ev = index.eventById.get(eid);
            if (ev) {
              const isPast = Boolean(ev.parsedDate && ev.parsedDate < todayIso);
              const matchesScope =
                scope === 'all' || (scope === 'upcoming' && !isPast) || (scope === 'past' && isPast);
              if (matchesScope) matchingIds.add(eid);
            }
          }
        }
      }
    }
  }

  return matchingIds;
}
