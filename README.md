# RUThere: Rutgers University Club & Campus Events Calendar

**RUThere** is a modern, high-performance web application designed for Rutgers University students to explore, track, and synchronize all available university and student club events in real time.

It couples a responsive calendar frontend with an asynchronous ingestion pipeline for scraping Instagram posts from Rutgers club profiles, extracting structured event data, and serving it via Next.js App Router API routes.

---

## ✨ Frontend Features & Layout

- **Red Top Navigation Bar**:
  - **Month Navigator**: `< October 2026 >` with directional controls for swift month-to-month browsing.
  - **Search Bar**: Live keyword search across events, clubs, locations, and descriptions.
  - **Campus Filter**: Fast filtering across *All Campuses*, *College Ave*, *Busch*, *Livingston*, *Cook/Douglass*, and *Virtual / Online*.
  - **Club Categories Filter**: Color-coded category selector with real-time event counts (*Tech & Coding*, *Engineering*, *Academic & Professional*, *Cultural*, *Social*, *Arts & Media*, *Sports*, *Community*).
  - **View Switcher**: Segmented toggle between **Agenda / List** (Default), **Week**, **Day**, and **Month** views.
- **Full-Width Calendar Views**:
  - Maximized screen space for event listings, weekly schedule grids, daily breakdowns, and full month calendars.
- **Calendar Synchronization**:
  - **Add to Google Calendar**: Pre-filled event title, time, location, and description.
  - **Download .ICS**: Works with Apple Calendar, Microsoft Outlook, and standard calendar clients.

---

## 🚀 Backend Ingestion Architecture

- **Bright Data Social Media Scraper Integration**: Queries Bright Data Datasets API (`gd_l1vikfch901nx3by4`) with arrays of Instagram URLs.
- **Two-Phase Architecture**:
  - **Phase 1 (The Trigger)**: `/api/cron/trigger-scrape` batches club URLs in chunks of 20 and initiates async jobs with webhook delivery.
  - **Phase 2 (Webhook Processing)**: `/api/webhooks/brightdata` securely verifies incoming payloads, extracts upcoming events, and stores them.
- **Event Extraction Engine**: Implements the schema defined in `example.json` (`is_event`, `title`, `date`, `time`, `location`, `important_links`) from post captions.
- **Dual Runtime Support**:
  - **Next.js App Router**: REST API routes (`/api/events`, `/api/clubs`, `/api/scrape`, `/api/cron/trigger-scrape`, `/api/webhooks/brightdata`) + Calendar App.
  - **Python CLI & Module (`scraper.py`)**: Standalone scraper and event extractor.
- **Database Abstraction**: Connects to Neon PostgreSQL when `DATABASE_URL` is set, with an automatic local fallback for seamless development.

---

## 📋 Event Data Schema (`example.json`)

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

## 🛠️ Getting Started

### 1. Setup Environment

Create or edit your `.env` file:

```env
BRIGHTDATA_API_KEY=your-api-key-here
BRIGHTDATA_DATASET_ID=gd_l1vikfch901nx3by4
BRIGHTDATA_WEBHOOK_SECRET=test_secret_token_123

# Optional: Neon Serverless PostgreSQL connection string
# DATABASE_URL=postgresql://user:password@ep-...neon.tech/neondb?sslmode=require
```

### 2. Run the Next.js Web Application

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📡 API Endpoints

- **`GET /api/events`**: Lists events, with optional fuzzy query filtering (`?q=...`) and club filter (`?club=...`).
- **`GET /api/clubs`**: Lists registered Rutgers clubs.
- **`POST /api/scrape`**: Queries Bright Data with an array of Instagram profile URLs.
- **`GET /api/scrape?snapshot_id=...`**: Polls Bright Data snapshot progress and downloads records.
- **`POST /api/webhooks/brightdata`**: Phase 2 webhook ingestion handler.
- **`GET /api/cron/trigger-scrape`**: Phase 1 Vercel Cron trigger endpoint.