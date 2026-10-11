# RUThere: Rutgers Club Events Aggregator & Instagram Scraper

A full-stack asynchronous ingestion pipeline and testbed for scraping Instagram posts from Rutgers University club profiles, extracting event details according to the schema in `example.json`, and serving them via a searchable API and frontend interface.

Conforms to the system specification in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 🚀 Features

- **Bright Data Social Media Scraper Integration**: Queries Bright Data Datasets API (`gd_l1vikfch901nx3by4`) with arrays of Instagram URLs.
- **Asynchronous Execution & Snapshot Polling**: Handles Bright Data's `202 Accepted` response with automatic polling (`/progress/{snapshot_id}`) and download (`/snapshot/{snapshot_id}`).
- **Two-Phase Architecture**:
  - **Phase 1 (The Trigger)**: `/api/cron/trigger-scrape` batches club URLs in chunks of 20 and initiates async jobs with webhook delivery.
  - **Phase 2 (Webhook Processing)**: `/api/webhooks/brightdata` securely verifies incoming payloads, extracts upcoming events, and stores them.
- **Event Extraction Engine**: Implements the schema defined in `example.json` (`is_event`, `title`, `date`, `time`, `location`, `important_links`) from post captions.
- **Dual Runtime Support**:
  - **Python CLI & Module (`scraper.py`)**: Standalone scraper and event extractor.
  - **Next.js App Router (Fullstack)**: REST API routes + Testing Dashboard with **Fuse.js** fuzzy search.
- **Database Abstraction**: Connects to Neon PostgreSQL when `DATABASE_URL` is set, with an automatic local fallback (`.data/database.json`) for seamless local development.

---

## 📁 Project Structure

```
RUThere-/
├── scraper.py                     # Python standalone scraper CLI & module
├── app/
│   ├── layout.tsx                 # Root HTML layout
│   ├── page.tsx                   # Interactive Testing Dashboard (Fuse.js search)
│   ├── globals.css                # Rutgers-themed dark styling
│   └── api/
│       ├── scrape/route.ts        # POST/GET scrape trigger & snapshot poller
│       ├── cron/
│       │   └── trigger-scrape/    # Phase 1: Bi-Daily cron trigger endpoint
│       ├── webhooks/
│       │   └── brightdata/        # Phase 2: Secure webhook delivery handler
│       ├── clubs/route.ts         # Club directory management
│       └── events/route.ts        # Extracted events search & listing
├── lib/
│   ├── brightdata.ts              # Bright Data API client (scrape, trigger, poll)
│   ├── db.ts                      # Storage layer (Neon Postgres / local JSON fallback)
│   ├── eventExtractor.ts          # Caption parser adhering to example.json
│   └── types.ts                   # TypeScript interfaces
├── data/
│   └── sample_snapshot.json       # Fixture data for offline testing
├── .env                           # Local environment secrets
├── .env.example                   # Environment configuration guide
├── ARCHITECTURE.md                # System architecture documentation
└── example.json                   # Target JSON schema for event extraction
```

---

## 🛠️ Quick Start

### 1. Setup Environment

Create or edit your `.env` file:

```env
BRIGHTDATA_API_KEY=your-api-key-here
BRIGHTDATA_DATASET_ID=gd_l1vikfch901nx3by4
BRIGHTDATA_WEBHOOK_SECRET=test_secret_token_123

# Optional: Neon Serverless PostgreSQL connection string
# DATABASE_URL=postgresql://user:password@ep-...neon.tech/neondb?sslmode=require
```

### 2. Run the Python Scraper

Activate the virtual environment and run `scraper.py`:

```bash
# Using virtual environment
source .venv/bin/activate

# 1. Scrape specific Instagram URLs (live API query + automatic polling)
python3 scraper.py https://www.instagram.com/rutgersu

# 2. Scrape multiple URLs
python3 scraper.py https://www.instagram.com/rutgersu https://www.instagram.com/rutgers.usg

# 3. Instant test with local snapshot fixture
python3 scraper.py --fixture data/sample_snapshot.json
```

Output is saved to `scraped_results.json`.

---

### 3. Run the Next.js Web Application & Testbed

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📡 API Endpoints

### `POST /api/scrape`
Takes an array of Instagram profile URLs and queries Bright Data.
- **Request Body:**
  ```json
  {
    "urls": [
      "https://www.instagram.com/rutgersu",
      "https://www.instagram.com/rutgers.usg"
    ],
    "asyncOnly": false
  }
  ```
- **Responses:**
  - `200 OK`: Job completed synchronously. Returns extracted clubs and events.
  - `202 Accepted`: Job running asynchronously. Returns `snapshot_id`.

### `GET /api/scrape?snapshot_id=...`
Polls progress of a Bright Data snapshot. If status is `"ready"`, downloads the data, processes records, and returns extracted events.

### `POST /api/webhooks/brightdata?secret=test_secret_token_123`
Phase 2 Webhook endpoint. Ingests raw Bright Data records, parses post captions for upcoming events, and saves records.

### `GET /api/cron/trigger-scrape`
Phase 1 Vercel Cron endpoint. Batches club URLs in groups of 20, dispatches async jobs to Bright Data with the webhook callback, and immediately returns 200 OK.

### `GET /api/events?q=...`
Lists all extracted events, with optional fuzzy query filtering.

### `GET /api/clubs`
Lists all registered Rutgers clubs with follower and post statistics.

---

## 📊 Extracted Event Schema

Extracted according to `example.json`:

```json
{
  "is_event": true,
  "title": "Join us for our first Fall GBM!",
  "date": "Wednesday, Oct 24",
  "time": "8:00 PM - 9:30 PM",
  "location": "Busch Student Center",
  "important_links": [
    "link in bio"
  ]
}
```