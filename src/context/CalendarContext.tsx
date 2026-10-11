import React, { createContext, useContext, useState, useMemo } from 'react';
import {
  CalendarEvent,
  CalendarViewType,
  ClubCategory,
  RutgersCampus,
} from '../types/event';
import { enrichEvent } from '../utils/dateUtils';
import { SAMPLE_BACKEND_EVENTS } from '../data/sampleEvents';

interface CalendarContextType {
  events: CalendarEvent[];
  filteredEvents: CalendarEvent[];
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
  resetToSampleData: () => void;
}

const CalendarContext = createContext<CalendarContextType | null>(null);

export const CalendarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize events from sample backend data
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    return SAMPLE_BACKEND_EVENTS.map((item, idx) => enrichEvent(item, idx));
  });

  // Current view date
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const today = new Date();
    if (today.getFullYear() === 2026 && today.getMonth() === 9) {
      return today;
    }
    return new Date(2026, 9, 12);
  });

  // Default state is 'agenda' (List view)
  const [view, setView] = useState<CalendarViewType>('agenda');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ClubCategory | 'All'>('All');
  const [selectedCampus, setSelectedCampus] = useState<RutgersCampus | 'All'>('All');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Date Navigation
  const goToToday = () => {
    setCurrentDate(new Date(2026, 9, 12));
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

  const resetToSampleData = () => {
    const enriched = SAMPLE_BACKEND_EVENTS.map((item, idx) => enrichEvent(item, idx));
    setEvents(enriched);
  };

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = event.title.toLowerCase().includes(q);
        const matchesClub = event.club_name.toLowerCase().includes(q) || event.club_handle.toLowerCase().includes(q);
        const matchesLoc = event.location.toLowerCase().includes(q);
        const matchesDesc = (event.description || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesClub && !matchesLoc && !matchesDesc) {
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
  }, [events, searchQuery, selectedCategory, selectedCampus]);

  return (
    <CalendarContext.Provider
      value={{
        events,
        filteredEvents,
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
        resetToSampleData,
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
