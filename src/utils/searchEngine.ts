import Fuse, { IFuseOptions } from 'fuse.js';
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

const clubFuseOptions: IFuseOptions<ClubRecord> = {
  includeScore: true,
  threshold: 0.38,
  ignoreLocation: true,
  minMatchCharLength: 2,
  keys: [
    { name: 'name', weight: 0.35 },
    { name: 'handle', weight: 0.25 },
    { name: 'interests', weight: 0.25 },
    { name: 'related_interests', weight: 0.1 },
    { name: 'category', weight: 0.05 },
    { name: 'biography', weight: 0.05 },
  ],
};

const eventFuseOptions: IFuseOptions<CalendarEvent> = {
  includeScore: true,
  threshold: 0.38,
  ignoreLocation: true,
  minMatchCharLength: 2,
  keys: [
    { name: 'title', weight: 0.4 },
    { name: 'location', weight: 0.2 },
    { name: 'club_name', weight: 0.2 },
    { name: 'club_handle', weight: 0.15 },
    { name: 'category', weight: 0.1 },
    { name: 'campus', weight: 0.1 },
    { name: 'description', weight: 0.1 },
  ],
};

/**
 * Searches clubs and events and returns combined results sorted strictly by best match score.
 */
export function getBestMatches(
  query: string,
  clubs: ClubRecord[],
  events: CalendarEvent[],
  limit = 8
): SearchResultItem[] {
  const clean = query.trim().toLowerCase();
  if (!clean) return [];

  const results: SearchResultItem[] = [];

  // 1. Direct / Exact checks for Clubs
  const matchedClubIds = new Set<string>();
  const cleanNoAt = clean.replace(/^@/, '');

  for (const club of clubs) {
    const handleClean = club.handle.toLowerCase().replace(/^@/, '');
    const nameClean = club.name.toLowerCase();
    const clubId = String(club.id || club.handle);

    // Exact or prefix name / handle match
    const isExactName = nameClean === clean;
    const isExactHandle = handleClean === cleanNoAt;
    const isPrefixName = nameClean.startsWith(clean);
    const isPrefixHandle = handleClean.startsWith(cleanNoAt);

    // Check primary focus interests (Tier 1)
    const matchingPrimaryInterest = (club.interests || []).find((interest) => {
      const iLower = interest.toLowerCase();
      return iLower === clean || iLower.includes(clean);
    });

    // Check related topics / sub-disciplines (Tier 2)
    const matchingRelatedInterest = (club.related_interests || []).find((interest) => {
      const iLower = interest.toLowerCase();
      return iLower === clean || iLower.includes(clean);
    });

    if (isExactName || isExactHandle) {
      matchedClubIds.add(clubId);
      results.push({
        id: `club-${clubId}`,
        type: 'club',
        title: club.name,
        subtitle: `@${handleClean}${club.category ? ` • ${club.category}` : ''}`,
        detail: matchingPrimaryInterest ? `Matches interest: ${matchingPrimaryInterest}` : club.biography,
        score: 0.01,
        matchedInterest: matchingPrimaryInterest,
        club,
      });
    } else if (isPrefixName || isPrefixHandle) {
      matchedClubIds.add(clubId);
      results.push({
        id: `club-${clubId}`,
        type: 'club',
        title: club.name,
        subtitle: `@${handleClean}${club.category ? ` • ${club.category}` : ''}`,
        detail: matchingPrimaryInterest ? `Matches interest: ${matchingPrimaryInterest}` : club.biography,
        score: 0.05,
        matchedInterest: matchingPrimaryInterest,
        club,
      });
    } else if (matchingPrimaryInterest) {
      // Primary focus gets priority ranking
      matchedClubIds.add(clubId);
      results.push({
        id: `club-${clubId}`,
        type: 'club',
        title: club.name,
        subtitle: `@${handleClean}${club.category ? ` • ${club.category}` : ''}`,
        detail: `Matches interest: ${matchingPrimaryInterest}`,
        score: 0.08,
        matchedInterest: matchingPrimaryInterest,
        club,
      });
    } else if (matchingRelatedInterest) {
      // Related topic gets secondary ranking
      matchedClubIds.add(clubId);
      results.push({
        id: `club-${clubId}`,
        type: 'club',
        title: club.name,
        subtitle: `@${handleClean}${club.category ? ` • ${club.category}` : ''}`,
        detail: `Related to: ${matchingRelatedInterest}`,
        score: 0.20,
        matchedInterest: matchingRelatedInterest,
        club,
      });
    }
  }

  // 2. Direct / Exact checks for Events
  const matchedEventIds = new Set<string>();

  for (const event of events) {
    const titleClean = event.title.toLowerCase();
    const isExactTitle = titleClean === clean;
    const isPrefixTitle = titleClean.startsWith(clean);
    const hasTitleWord = titleClean.split(/\s+/).includes(clean) || (clean.length >= 3 && titleClean.includes(clean));
    const hasRoomMatch = event.location.toLowerCase().includes(clean);

    if (isExactTitle) {
      matchedEventIds.add(event.id);
      results.push({
        id: `event-${event.id}`,
        type: 'event',
        title: event.title,
        subtitle: `${event.date || event.parsedDate} • ${event.time} • ${event.location}`,
        detail: event.club_name,
        score: 0.02,
        event,
      });
    } else if (isPrefixTitle) {
      matchedEventIds.add(event.id);
      results.push({
        id: `event-${event.id}`,
        type: 'event',
        title: event.title,
        subtitle: `${event.date || event.parsedDate} • ${event.time} • ${event.location}`,
        detail: event.club_name,
        score: 0.06,
        event,
      });
    } else if (hasTitleWord) {
      matchedEventIds.add(event.id);
      results.push({
        id: `event-${event.id}`,
        type: 'event',
        title: event.title,
        subtitle: `${event.date || event.parsedDate} • ${event.time} • ${event.location}`,
        detail: event.club_name,
        score: 0.09,
        event,
      });
    } else if (hasRoomMatch && clean.length >= 3) {
      matchedEventIds.add(event.id);
      results.push({
        id: `event-${event.id}`,
        type: 'event',
        title: event.title,
        subtitle: `${event.date || event.parsedDate} • ${event.time} • ${event.location}`,
        detail: event.club_name,
        score: 0.15,
        event,
      });
    } else {
      // Check if this event is hosted by a club whose primary focus matches the query
      const hostClub = clubs.find((c) => {
        const cName = c.name.toLowerCase();
        const cHandle = c.handle.toLowerCase().replace(/^@/, '');
        return (
          event.club_name.toLowerCase().includes(cName) ||
          event.club_handle.toLowerCase().replace(/^@/, '') === cHandle
        );
      });

      const hostHasPrimaryInterest = hostClub && (hostClub.interests || []).some((interest) => {
        const iLower = interest.toLowerCase();
        return iLower === clean || iLower.includes(clean);
      });

      if (hostHasPrimaryInterest) {
        matchedEventIds.add(event.id);
        results.push({
          id: `event-${event.id}`,
          type: 'event',
          title: event.title,
          subtitle: `${event.date || event.parsedDate} • ${event.time} • ${event.location}`,
          detail: event.club_name,
          score: 0.12,
          event,
        });
      }
    }
  }

  // 3. Fuzzy search for Clubs using Fuse.js
  const remainingClubs = clubs.filter((c) => !matchedClubIds.has(String(c.id || c.handle)));
  if (remainingClubs.length > 0) {
    const clubFuse = new Fuse(remainingClubs, clubFuseOptions);
    const clubFuzzyResults = clubFuse.search(clean);

    for (const item of clubFuzzyResults) {
      const club = item.item;
      const score = item.score ?? 0.4;
      const handleClean = club.handle.toLowerCase().replace(/^@/, '');

      const matchingInterest = (club.interests || []).find((interest) =>
        interest.toLowerCase().includes(clean)
      );

      results.push({
        id: `club-${club.id || club.handle}`,
        type: 'club',
        title: club.name,
        subtitle: `@${handleClean}${club.category ? ` • ${club.category}` : ''}`,
        detail: matchingInterest ? `Matches interest: ${matchingInterest}` : club.biography,
        score,
        matchedInterest: matchingInterest,
        club,
      });
    }
  }

  // 4. Fuzzy search for Events using Fuse.js
  const remainingEvents = events.filter((e) => !matchedEventIds.has(e.id));
  if (remainingEvents.length > 0) {
    const eventFuse = new Fuse(remainingEvents, eventFuseOptions);
    const eventFuzzyResults = eventFuse.search(clean);

    for (const item of eventFuzzyResults) {
      const event = item.item;
      const score = item.score ?? 0.4;

      results.push({
        id: `event-${event.id}`,
        type: 'event',
        title: event.title,
        subtitle: `${event.date || event.parsedDate} • ${event.time} • ${event.location}`,
        detail: event.club_name,
        score,
        event,
      });
    }
  }

  // 5. Sort strictly by best match (lowest score first)
  results.sort((a, b) => a.score - b.score);

  return results.slice(0, limit);
}
