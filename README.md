# RUThere: Rutgers University Club & Campus Events Calendar

**RUThere** is a modern, high-performance web application designed for Rutgers University students to discover, track, and synchronize campus club events in real time.

It bridges the gap between fragmented social media announcements and student schedules by coupling a responsive calendar frontend with an asynchronous scraping pipeline and **Google Gemini Multimodal AI** for event extraction, campus classification, and calendar synchronization.

---

## ✨ Features & Architecture Highlights

### 📅 Frontend Calendar Interface
- **4 Responsive Calendar Views**: Seamless switching between **Agenda / List** (Default), **Week**, **Day**, and **Month** views.
- **Campus-Wide Filtering**: Instant filtering across *All Campuses*, *College Ave*, *Busch*, *Livingston*, *Cook/Douglass*, and *Virtual / Online*.
- **Club Category Taxonomy**: Color-coded category tags with live event counts (*Tech & Coding*, *Engineering*, *Academic & Professional*, *Cultural & Identity*, *Social & Student Life*, *Arts & Media*, *Sports & Recreation*, *Community & Service*).
- **Two-Tier Semantic Fuzzy Search (Fuse.js)**: Typo-tolerant search across event titles, descriptions, locations, and clubs using Gemini-generated primary interests and related academic domains.
- **1-Click Calendar Synchronization**:
  - **Add to Google Calendar**: Generates pre-populated event links (title, time, venue, description).
  - **Download .ICS**: RFC-compliant calendar files compatible with Apple Calendar, Microsoft Outlook, and standard clients.
- **Event Detail Modal**:
  - High-resolution flyer graphic view.
  - **Direct MP4 In-App Video Player**: Resolves Instagram Reels and video posts directly to bypass iframe embedding restrictions.
  - **Rutgers Maps Directions**: 1-click location queries directly to `maps.rutgers.edu`.
  - **`🍕 FREE FOOD!!` Badges**: Visual indicator highlighting events offering pizza, boba, snacks, or catered meals.

---

## 🤖 Google Gemini Multimodal AI Engine

RUThere uses **Google Gemini** (`gemini-3.1-flash-lite`, with fallback to `gemini-3.6-flash` and `gemini-3.5-flash`) to transform noisy, unstructured social media announcements into verified, structured calendar events:

1. **Multimodal Vision Analysis**: Simultaneously processes base64-encoded flyer image graphics and post caption text. Critical event details printed directly onto poster artwork (room numbers, guest speakers, QR codes) are extracted via visual reasoning even when missing from captions.
2. **Strict Negative Filtering**: Eliminates feed noise by distinguishing actual upcoming gatherings (`is_event: true`) from non-events (`is_event: false`), such as Executive Board (E-Board) spotlights, banquet recap photo dumps, memes, and apparel announcements.
3. **Rutgers Spatial & Campus Inference**: Automatically maps venues to the correct Rutgers campus based on local building codes and room identifiers (e.g., *BSC / SERC / ARC* ➔ Busch; *CASC / Scott Hall / SAC* ➔ College Ave; *RBS / The Shed* ➔ Livingston; *Loree / DSC* ➔ Cook/Douglass).
4. **🍕 Free Food Detection**: Analyzes flyer artwork and caption text for pizza slices, snacks, drinks, boba, or catered refreshments, automatically flagging events with `has_free_food: true`.
5. **Resilient Key Pool & Rate Limiter (`GeminiKeyPool`)**:
   - Multi-key round-robin rotation supporting multiple API keys.
   - Strict per-key RPM enforcement (~5.2s minimum spacing between requests to the same key).
   - Rolling 60-second window tracking to guarantee adherence to rate limits.
   - **429 Quota Quarantine**: Automatically isolates keys hitting daily free-tier limits (500 RPD) and switches to next available keys.
   - **Model Fallback Cascade**: Advances to secondary models if quotas are exhausted.
   - **Deterministic Fallback**: Local heuristic/regex extractor guarantees pipeline uptime if the API is unreachable.

---

## 🚀 Backend Ingestion Architecture

```
[450+ Club Handles] ──► [Vercel Cron Trigger] ──► [Bright Data Scraper]
                                                         │
                                               (Async Webhook Callback)
                                                         ▼
[Next.js Calendar] ◄── [Neon PostgreSQL] ◄── [Gemini Multimodal AI]
```

- **Phase 1 (The Trigger)**: `/api/cron/trigger-scrape` runs bi-daily (12:00 AM & 12:00 PM), batches 450+ Rutgers club handles in chunks of 20, and initiates asynchronous jobs with Bright Data (`gd_l1vikfch901nx3by4`). It exits in `<100ms`, preventing serverless function timeouts.
- **Phase 2 (Webhook Processing)**: `/api/webhooks/brightdata` securely verifies incoming payloads via secret token, deduplicates posts by `instagram_post_id`, batches records for Gemini multimodal extraction, and upserts valid events into the database.
- **Database Tier**: Connects to **Neon Serverless PostgreSQL** when `DATABASE_URL` is configured, with an automatic local JSON storage fallback (`.data/database.json`) for zero-dependency development.

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
    "title": { "type": "string" },
    "date": { "type": "string", "description": "Day and date (e.g. 'Wednesday, Oct 24')." },
    "time": { "type": "string", "description": "Start time or window (e.g. '8:00 PM - 9:30 PM')." },
    "location": { "type": "string", "description": "Building, room, or venue." },
    "campus": {
      "type": "string",
      "enum": ["Busch", "College Ave", "Livingston", "Cook/Doug", "Virtual / Online"]
    },
    "category": {
      "type": "string",
      "enum": [
        "Tech & Coding", "Engineering", "Academic & Professional",
        "Cultural & Identity", "Social & Student Life", "Arts & Media",
        "Sports & Recreation", "Community & Service"
      ]
    },
    "has_free_food": { "type": "boolean" },
    "flyer_details": { "type": "string" },
    "important_links": { "type": "array", "items": { "type": "string" } },
    "post_url": { "type": "string" },
    "image_url": { "type": "string" },
    "video_url": { "type": "string" }
  },
  "required": ["is_event", "title", "date", "time", "location", "campus", "category"]
}
```

---

## 🛠️ Getting Started

### 1. Setup Environment

Create or edit your `.env` file (see `.env.example`):

```env
# Bright Data Social API Configuration
BRIGHTDATA_API_KEY=your_brightdata_api_key_here
BRIGHTDATA_DATASET_ID=gd_l1vikfch901nx3by4
BRIGHTDATA_WEBHOOK_SECRET=test_secret_token_123

# Database (Neon Serverless PostgreSQL - optional; falls back to local storage if omitted)
DATABASE_URL=postgresql://user:password@ep-...neon.tech/neondb?sslmode=require

# Google Gemini API (Single Key or Multi-Key Pool)
GEMINI_API_KEY=your_gemini_api_key_here
# GEMINI_API_KEYS=key1,key2,key3
# GEMINI_MODEL=gemini-3.1-flash-lite
# GEMINI_RPM=12
```

### 2. Run the Web Application

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

- **`GET /api/events`**: Lists events, with optional fuzzy query (`?q=...`) and club filter (`?club=...`).
- **`GET /api/clubs`**: Lists registered Rutgers student organizations.
- **`POST /api/scrape`**: Queries Bright Data with an array of Instagram profile URLs.
- **`GET /api/scrape?snapshot_id=...`**: Polls snapshot progress and downloads records.
- **`POST /api/webhooks/brightdata`**: Phase 2 webhook ingestion handler.
- **`GET /api/cron/trigger-scrape`**: Phase 1 scheduled scrape trigger.
- **`GET /api/video?url=...`**: Resolves direct CDN MP4 streams for Instagram reels and video posts.
- **`GET /api/video/download?url=...`**: Streams MP4 video file downloads.

---

## 🌐 Distributed Systems Architecture (Future Scaling)

To scale across multiple universities in the future, the ingestion pipeline can be scaled horizontally with dedicated serverless cron jobs provisioned per institution based on club volume. Each cron worker and API backend would interface with a centralized, multi-tenant database partitioned by university to store all clubs and events. As user traffic and campus coverage grow, both frontend and backend services can scale horizontally to handle demand. Eventually, the system can decouple into independent microservices dedicated to web scraping, AI extraction, and calendar delivery.
