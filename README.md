# RUThere — Rutgers University Club & Campus Events Calendar

**RUThere** is a modern, high-performance web front end designed for Rutgers University students to explore, track, and synchronize all available university and student club events in real time.

---

## ✨ Features & Layout

- **Red Top Navigation Bar**:
  - **Month Navigator**: `< October 2026 >` with directional arrows for fast month-to-month browsing.
  - **Search Input**: Live keyword search across events, clubs, locations, and descriptions.
  - **Campus Dropdown**: Filter across *All Campuses*, *College Ave*, *Busch*, *Livingston*, *Cook/Douglass*, and *Virtual / Online*.
  - **Club Categories Dropdown**: Color-coded category selector with real-time event counts (*Tech & Coding*, *Engineering*, *Academic & Professional*, *Cultural*, *Social*, *Arts & Media*, *Sports*, *Community*).
  - **View Switcher**: Clean segmented control to switch between **List** (Default), **Week**, **Day**, and **Month** views.
- **Full-Width Main View**:
  - Eliminated sidebars to maximize screen space for the event feed and calendar grids.
- **Calendar Synchronization**:
  - One-click **Add to Google Calendar** with pre-filled title, time, location, and description.
  - One-click **Download .ICS** for Apple Calendar and Microsoft Outlook.

---

## 📋 Backend Data Schema (`example.json`)

RUThere directly consumes event objects following this schema:

```json
{
  "type": "object",
  "properties": {
    "is_event": {
      "type": "boolean",
      "description": "True if the post announces an upcoming event, false otherwise."
    },
    "title": {
      "type": "string"
    },
    "date": {
      "type": "string",
      "description": "Day and date (e.g. 'Wednesday, Oct 24')."
    },
    "time": {
      "type": "string",
      "description": "Start time or time window (e.g. '8:00 PM - 9:30 PM')."
    },
    "location": {
      "type": "string",
      "description": "Building, room, or virtual platform."
    },
    "important_links": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Any form links, registration URLs, or mentions like 'link in bio'."
    }
  },
  "required": ["is_event", "title", "date", "time", "location"]
}
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/)

### Installation & Run

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```