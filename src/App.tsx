import React from 'react';
import { CalendarProvider, useCalendar } from './context/CalendarContext';
import { Header } from './components/Header';
import { WeekView } from './components/WeekView';
import { DayView } from './components/DayView';
import { MonthView } from './components/MonthView';
import { AgendaView } from './components/AgendaView';
import { EventDetailModal } from './components/EventDetailModal';

const CalendarShell: React.FC = () => {
  const { view } = useCalendar();

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Red Top Header with month navigation, search, campus & category dropdowns, and view switcher */}
      <Header />

      {/* Main Full-Width Content Area */}
      <main className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-primary)]">
        {view === 'agenda' && <AgendaView />}
        {view === 'week' && <WeekView />}
        {view === 'day' && <DayView />}
        {view === 'month' && <MonthView />}
      </main>

      {/* Event Details Modal */}
      <EventDetailModal />
    </div>
  );
};

export function App() {
  return (
    <CalendarProvider>
      <CalendarShell />
    </CalendarProvider>
  );
}

export default App;
