import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import {
  CalendarEvent,
  CalendarViewType,
  ClubCategory,
  RutgersCampus,
} from '../types/event';
import { enrichEvent } from '../utils/dateUtils';
import { ClubRecord } from '../../lib/types';

interface CalendarContextType {
  events: CalendarEvent[];
  filteredEvents: CalendarEvent[];
  clubs: ClubRecord[];
  setClubs: (clubs: ClubRecord[]) => void;
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
  goToToday: () => void;
  navigateDate: (direction: 'prev' | 'next') => void;
  view: CalendarViewType;
  setView: (view: CalendarViewType) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedCategory: ClubCategory | 'All';
  setSelectedCategory: (cat: ClubCategory | 'All') => void;
  selectedCampus: RutgersCampus | 'All';
  setSelectedCampus: (campus: RutgersCampus | 'All') => void;
  selectedEvent: CalendarEvent | null;
  setSelectedEvent: (event: CalendarEvent | null) => void;
  loadDatabaseData: () => Promise<void>;
}

const CalendarContext = createContext<CalendarContextType | null>(null);

export const CalendarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Grabs from live database via API; empty if no records exist
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [clubs, setClubs] = useState<ClubRecord[]>([]);

  // Current view date
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  // Default state is 'agenda' (List view)
  const [view, setView] = useState<CalendarViewType>('agenda');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ClubCategory | 'All'>('All');
  const [selectedCampus, setSelectedCampus] = useState<RutgersCampus | 'All'>('All');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Load events and clubs from live database via API
  const loadDatabaseData = async () => {
    try {
      const [eventsRes, clubsRes] = await Promise.all([
        fetch('/api/events'),
        fetch('/api/clubs'),
      ]);

      if (eventsRes.ok) {
        const data = await eventsRes.json();
        if (data.events && Array.isArray(data.events)) {
          const enriched = data.events.map((item: any, idx: number) => enrichEvent(item, idx));
          setEvents(enriched);
        }
      }

      if (clubsRes.ok) {
        const cData = await clubsRes.json();
        if (cData.clubs && Array.isArray(cData.clubs)) {
          setClubs(cData.clubs);
        }
      }
    } catch (err) {
      console.warn('Failed to load data from API:', err);
    }
  };

  useEffect(() => {
    loadDatabaseData();
  }, []);

  // Date Navigation
  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (view === 'day') {
        d.setDate(d.getDate() + (direction === 'next' ? 1 : -1));
      } else if (view === 'week') {
        d.setDate(d.getDate() + (direction === 'next' ? 7 : -7));
      } else if (view === 'month') {
        d.setMonth(d.getMonth() + (direction === 'next' ? 1 : -1));
      } else {
        d.setDate(d.getDate() + (direction === 'next' ? 7 : -7));
      }
      return d;
    });
  };

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const qClean = q.replace(/^@/, '');
        const matchesTitle = event.title.toLowerCase().includes(q);
        const matchesClub =
          event.club_name.toLowerCase().includes(q) ||
          event.club_handle.toLowerCase().includes(q) ||
          event.club_handle.toLowerCase().replace(/^@/, '').includes(qClean);
        const matchesLoc = event.location.toLowerCase().includes(q);
        const matchesDesc = (event.description || '').toLowerCase().includes(q);

        const isFreeFoodSearch =
          q === 'free food' ||
          q.includes('free food') ||
          q.includes('freefood') ||
          q === 'food' ||
          q === 'free' ||
          'free food'.includes(q) ||
          q.includes('pizza');
        const matchesFreeFood = Boolean(event.has_free_food) && isFreeFoodSearch;

        // Also check if search query matches any interest tag of this event's club
        const matchingClub = clubs.find(c => {
          const cName = c.name.toLowerCase();
          const cHandle = c.handle.toLowerCase().replace(/^@/, '');
          const isThisClub =
            event.club_name.toLowerCase().includes(cName) ||
            event.club_handle.toLowerCase().replace(/^@/, '') === cHandle;
          if (!isThisClub) return false;
          return (c.interests || []).some(interest => interest.toLowerCase().includes(q));
        });

        if (!matchesTitle && !matchesClub && !matchesLoc && !matchesDesc && !matchesFreeFood && !matchingClub) {
          return false;
        }
      }

      // Category filter
      if (selectedCategory !== 'All' && event.category !== selectedCategory) {
        return false;
      }

      // Campus filter
      if (selectedCampus !== 'All') {
        const normSelected = selectedCampus === 'Cook/Douglass' ? 'Cook/Doug' : selectedCampus;
        const normEvent = event.campus === 'Cook/Douglass' ? 'Cook/Doug' : event.campus;
        if (normSelected !== normEvent) {
          return false;
        }
      }

      return true;
    });
  }, [events, clubs, searchQuery, selectedCategory, selectedCampus]);

  return (
    <CalendarContext.Provider
      value={{
        events,
        filteredEvents,
        clubs,
        setClubs,
        currentDate,
        setCurrentDate,
        goToToday,
        navigateDate,
        view,
        setView,
        searchQuery,
        setSearchQuery,
        selectedCategory,
        setSelectedCategory,
        selectedCampus,
        setSelectedCampus,
        selectedEvent,
        setSelectedEvent,
        loadDatabaseData,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
};

export const useCalendar = (): CalendarContextType => {
  const context = useContext(CalendarContext);
  if (!context) {
    throw new Error('useCalendar must be used within a CalendarProvider');
  }
  return context;
};
