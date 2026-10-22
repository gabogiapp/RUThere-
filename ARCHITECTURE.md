# Architecture Document: Rutgers Club Events Aggregator

## 1. System Overview

This system scrapes Instagram posts from a predefined list of Rutgers University club profiles, extracts event details, and displays them in a searchable, calendar-based frontend application. Due to scraping delays, it utilizes an asynchronous webhook architecture.

## 2. Infrastructure & Tech Stack

* **Hosting & Backend Framework:** **Vercel** (Next.js App Router). Handles the frontend rendering, API routes, and CRON scheduling.
* **Database:** **Neon (Serverless PostgreSQL)**. Chosen for its seamless integration with Vercel and zero-cold-start performance.
* **Ingestion Engine:** **Bright Data Social Media Scraper API** (`instagram-posts-collect-by-url`).
* **Frontend Calendar:** **FullCalendar (React)**. Chosen for its robust feature set, timezone handling, and out-of-the-box UI.
* **Frontend Search:** **MiniSearch**. A high-performance, in-memory inverted index and Radix tree search engine with O(1) hash lookups for instant, typo-tolerant event and club filtering.

## 3. Database Schema

The PostgreSQL database (hosted on Neon) relies on two primary tables:

```sql
-- Tracks the Rutgers clubs
CREATE TABLE clubs (
    id SERIAL PRIMARY KEY,
    handle VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100)
);

-- Stores the extracted events
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id INTEGER REFERENCES clubs(id) ON DELETE CASCADE,
    instagram_post_id VARCHAR(255) UNIQUE NOT NULL,
    post_url TEXT NOT NULL,
    title VARCHAR(255) NOT NULL,
    event_time TIMESTAMP WITH TIME ZONE NOT NULL,
    location VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast calendar month queries
CREATE INDEX idx_events_time ON events(event_time);
```

## 4. Bi-Daily Asynchronous Execution Pipeline

Because Bright Data takes 1-3 minutes to scrape, standard serverless functions (which time out after 15-60 seconds) will fail if they wait for the response. The pipeline is split into two asynchronous phases:

**Phase 1: The Trigger**
1. **12:00 AM & 12:00 PM:** Vercel Cron hits a lightweight Next.js API route (`/api/cron/trigger-scrape`).
2. **Dispatch:** The route pulls the target club URLs from the database, batches them, and sends a `POST` request to Bright Data's async trigger endpoint.
3. **Exit:** The trigger request includes a webhook delivery URL (e.g., `https://your-domain.com/api/webhooks/brightdata?secret=YOUR_TOKEN`). The Vercel function immediately returns a 200 OK and shuts down, preventing timeouts.

**Phase 2: The Webhook Delivery & Processing**
4. **Delivery:** 1-3 minutes later, Bright Data finishes scraping and sends an HTTP `POST` request containing the raw JSON array to your Next.js webhook route.
5. **Security Check:** The Next.js route validates the `secret` query parameter to ensure the request is authentically from Bright Data.
6. **Filter & Extract:** The worker iterates through the JSON payload. It skips duplicate `instagram_post_id`s, passes new captions to an LLM parser to extract the schema (`title`, `event_time`, `location`), and prepares the valid records.
7. **Upsert:** Processed events are inserted into the Neon PostgreSQL database.

## 5. Key Optimization Techniques

* **Batching API Requests:** Grouping Rutgers club URLs into chunks of 20 minimizes API overhead and speeds up the Bright Data collection phase.
* **Bi-Daily Scrapes:** Running at midnight and noon captures morning "pop-up" event announcements for the same day.
* **Asynchronous Webhook Routing:** Decoupling the scrape trigger from the data ingestion ensures the Vercel backend never times out while waiting for Bright Data.
* **Webhook Security:** Using an Authorization header or a secret query parameter on the webhook URL prevents malicious actors from injecting fake events into the database.