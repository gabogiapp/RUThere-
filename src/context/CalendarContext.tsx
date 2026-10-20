import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import {
  CalendarEvent,
  CalendarViewType,
  ClubCategory,
  RutgersCampus,
} from '../types/event';
import { enrichEvent } from '../utils/dateUtils';
import { ClubRecord } from '../../lib/types';
import { getMatchingEventIds } from '../utils/searchEngine';

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
    const isSearching = Boolean(searchQuery.trim());
    const matchingIds = isSearching ? getMatchingEventIds(searchQuery, clubs, events) : null;

    return events.filter(event => {
      // Search query filter (O(1) set lookup)
      if (matchingIds && !matchingIds.has(event.id)) {
        return false;
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
