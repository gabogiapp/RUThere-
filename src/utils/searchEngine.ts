import MiniSearch from 'minisearch';
import { CalendarEvent } from '../types/event';
import { ClubRecord } from '../../lib/types';

export interface SearchResultItem {
  id: string;
  type: 'club' | 'event';
  title: string;
  subtitle: string;
  detail?: string;
  score: number;
  matchedInterest?: string;
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
}

interface CachedIndex {
  clubsRef: ClubRecord[];
  eventsRef: CalendarEvent[];
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

/**
 * Builds or retrieves the cached MiniSearch inverted index and O(1) entity maps.
 * Rebuilds only when the clubs or events array reference changes.
 */
function getOrBuildIndex(clubs: ClubRecord[], events: CalendarEvent[]): CachedIndex {
  if (
    cachedIndex &&
    cachedIndex.clubsRef === clubs &&
    cachedIndex.eventsRef === events
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
    storeFields: ['docType', 'rawId'],
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
 * Searches clubs and events and returns combined results sorted strictly by best match score.
 * Employs Tier 1/2 exact/prefix priority boosting + cached MiniSearch Radix inverted index.
 */
export function getBestMatches(
  query: string,
  clubs: ClubRecord[],
  events: CalendarEvent[],
  limit = 8
): SearchResultItem[] {
  const clean = normalize(query);
  if (!clean) return [];

  const index = getOrBuildIndex(clubs, events);
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

  // 2. O(1) Exact Match for Events
  const exactEvent = index.eventByTitle.get(clean);
  if (exactEvent) {
    matchedEventIds.add(exactEvent.id);
    results.push({
      id: `event-${exactEvent.id}`,
      type: 'event',
      title: exactEvent.title,
      subtitle: `${exactEvent.date || exactEvent.parsedDate} • ${exactEvent.time} • ${exactEvent.location}`,
      detail: exactEvent.club_name,
      score: 0.02,
      event: exactEvent,
    });
  }

  // 3. MiniSearch Inverted Index Query (Fuzzy + Prefix Typo-Tolerant Match)
  const isFreeFood = isFreeFoodSearch(clean);

  // For 1-character queries: search ONLY title and handle with prefix matching (no deep body search)
  // For 2-character queries: search title, handle, interests, category
  // For 3+ character queries: full search across all fields with fuzzy typo tolerance
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
  });

  // Evaluate top candidates from inverted index (capping candidate pool for sub-millisecond response)
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
        subtitle: `${event.date || event.parsedDate} • ${event.time} • ${event.location}`,
        detail: matchesFreeFood
          ? `🍕 FREE FOOD Included • ${event.club_name}`
          : event.club_name,
        score,
        event,
      });
    }
  }

  // 4. Sort strictly by best match score (lowest score first)
  results.sort((a, b) => a.score - b.score);

  return results.slice(0, limit);
}

/**
 * Returns a Set of event IDs that match the search query in O(1) per event.
 * Uses the pre-indexed inverted index and O(1) club event map to avoid quadratic scans.
 */
export function getMatchingEventIds(
  query: string,
  clubs: ClubRecord[],
  events: CalendarEvent[]
): Set<string> {
  const clean = normalize(query);
  if (!clean) return new Set();

  const index = getOrBuildIndex(clubs, events);
  const matchingIds = new Set<string>();

  // 1. Direct O(1) exact event title match
  const exactEvent = index.eventByTitle.get(clean);
  if (exactEvent) {
    matchingIds.add(exactEvent.id);
  }

  // 2. Query MiniSearch Inverted Index
  // For short queries, filter search fields to avoid matching every word in long event captions
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
            matchingIds.add(eid);
          }
        }
      }
    }
  }

  return matchingIds;
}
