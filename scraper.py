#!/usr/bin/env python3
"""
Rutgers Club Instagram Scraper & Event Extractor using Bright Data Datasets API.
Takes an array of Instagram URLs and queries the Bright Data scraper.
Extracts club profile details and event announcements according to example.json schema.
"""

import os
import sys
import json
import time
import re
from typing import List, Dict, Any, Optional
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

BRIGHTDATA_API_KEY = os.getenv("BRIGHTDATA_API_KEY", "").strip()
BRIGHTDATA_DATASET_ID = os.getenv("BRIGHTDATA_DATASET_ID", "gd_l1vikfch901nx3by4").strip()
BRIGHTDATA_BASE_URL = "https://api.brightdata.com/datasets/v3"

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = "gemini-3.5-flash-lite"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


class InstagramBrightDataScraper:
    def __init__(
        self,
        api_key: Optional[str] = None,
        dataset_id: Optional[str] = None,
        gemini_api_key: Optional[str] = None,
    ):
        self.api_key = api_key or BRIGHTDATA_API_KEY
        self.dataset_id = dataset_id or BRIGHTDATA_DATASET_ID
        self.gemini_api_key = gemini_api_key or GEMINI_API_KEY
        if not self.api_key:
            raise ValueError(
                "BRIGHTDATA_API_KEY not found. Please set it in your .env file or pass it to InstagramBrightDataScraper(api_key=...)"
            )

    @property
    def headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def scrape(
        self,
        urls: List[str],
        poll: bool = True,
        poll_interval: int = 5,
        max_poll_time: int = 300,
    ) -> List[Dict[str, Any]]:
        """
        Takes an array of Instagram URLs and queries the Bright Data scraper.
        If the endpoint returns 200, returns the records immediately.
        If it returns 202, polls progress until ready, then downloads the snapshot.
        """
        if not urls:
            return []

        payload = [{"url": u.strip()} for u in urls if u.strip()]
        print(f"[*] Submitting {len(payload)} Instagram URLs to Bright Data (dataset_id: {self.dataset_id})...")

        scrape_url = f"{BRIGHTDATA_BASE_URL}/scrape"
        params = {"dataset_id": self.dataset_id, "format": "json"}

        try:
            response = requests.post(
                scrape_url,
                params=params,
                headers=self.headers,
                json=payload,
                timeout=90,
            )
        except requests.exceptions.RequestException as e:
            print(f"[!] Scrape request error: {e}")
            raise

        if response.status_code == 200:
            print("[+] Scraper completed synchronously (HTTP 200).")
            return response.json()

        elif response.status_code == 202:
            data = response.json()
            snapshot_id = data.get("snapshot_id")
            print(f"[+] Scrape job initiated asynchronously (HTTP 202). Snapshot ID: {snapshot_id}")

            if not poll or not snapshot_id:
                return [{"snapshot_id": snapshot_id, "status": "running"}]

            return self.poll_snapshot(
                snapshot_id, poll_interval=poll_interval, max_poll_time=max_poll_time
            )
        else:
            print(f"[!] Bright Data error ({response.status_code}): {response.text}")
            response.raise_for_status()
            return []

    def trigger_async(self, urls: List[str], endpoint_webhook: Optional[str] = None) -> str:
        """
        Triggers an asynchronous scrape job via /datasets/v3/trigger endpoint.
        Optionally configures webhook delivery per ARCHITECTURE.md.
        Returns the snapshot_id.
        """
        payload = [{"url": u.strip()} for u in urls if u.strip()]
        trigger_url = f"{BRIGHTDATA_BASE_URL}/trigger"
        params = {"dataset_id": self.dataset_id, "format": "json"}
        if endpoint_webhook:
            params["endpoint"] = endpoint_webhook

        res = requests.post(
            trigger_url,
            params=params,
            headers=self.headers,
            json=payload,
            timeout=30,
        )
        res.raise_for_status()
        data = res.json()
        snapshot_id = data.get("snapshot_id", "")
        print(f"[+] Triggered async snapshot: {snapshot_id}")
        return snapshot_id

    def check_progress(self, snapshot_id: str) -> Dict[str, Any]:
        """Checks progress for a given snapshot ID."""
        url = f"{BRIGHTDATA_BASE_URL}/progress/{snapshot_id}"
        res = requests.get(url, headers=self.headers, timeout=20)
        res.raise_for_status()
        return res.json()

    def download_snapshot(self, snapshot_id: str) -> List[Dict[str, Any]]:
        """Downloads complete JSON records for a ready snapshot."""
        url = f"{BRIGHTDATA_BASE_URL}/snapshot/{snapshot_id}"
        params = {"format": "json"}
        res = requests.get(url, params=params, headers=self.headers, timeout=60)
        res.raise_for_status()
        return res.json()

    def poll_snapshot(
        self, snapshot_id: str, poll_interval: int = 5, max_poll_time: int = 300
    ) -> List[Dict[str, Any]]:
        """Polls progress until snapshot is ready, then downloads the dataset."""
        start_time = time.time()
        print(f"[*] Polling snapshot {snapshot_id} (timeout: {max_poll_time}s)...")

        while time.time() - start_time < max_poll_time:
            progress = self.check_progress(snapshot_id)
            status = progress.get("status")
            print(f"    - Snapshot status: {status} (elapsed: {int(time.time() - start_time)}s)")

            if status == "ready":
                print("[+] Snapshot is ready! Downloading records...")
                records = self.download_snapshot(snapshot_id)
                print(f"[+] Successfully retrieved {len(records)} records.")
                return records
            elif status == "failed":
                raise RuntimeError(f"Bright Data scrape job failed for snapshot {snapshot_id}: {progress}")

            time.sleep(poll_interval)

        raise TimeoutError(f"Exceeded max poll time of {max_poll_time}s for snapshot {snapshot_id}")

    @staticmethod
    def extract_events_from_post(caption: str) -> Dict[str, Any]:
        """
        Parses caption text into event schema specified in example.json:
        {
          "is_event": bool,
          "title": str,
          "date": str,
          "time": str,
          "location": str,
          "important_links": list[str]
        }
        """
        if not caption:
            return {
                "is_event": False,
                "title": "",
                "date": "",
                "time": "",
                "location": "",
                "important_links": [],
            }

        text = caption.strip()
        lower = text.lower()

        # Keywords indicating an upcoming club event / meeting
        event_keywords = [
            "gbm", "general body meeting", "meeting", "workshop", "event", "info session",
            "hackathon", "social", "mixer", "tournament", "practice", "game day",
            "join us", "come out", "register", "doors open", "when:", "where:", "date:", "time:"
        ]

        is_event = any(k in lower for k in event_keywords)

        # Extract links/mentions
        links = re.findall(r"(https?://\S+|link in bio|link in description|forms\.gle/\S+)", text, re.IGNORECASE)

        # Extract date patterns (e.g. Wednesday, Oct 24 or 10/24 or Tomorrow)
        date_pattern = r"(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?|\b\d{1,2}/\d{1,2}(?:/\d{2,4})?"
        date_match = re.search(date_pattern, text, re.IGNORECASE)
        date_str = date_match.group(0) if date_match else "TBD"

        # Extract time patterns (e.g. 8:00 PM - 9:30 PM, 7pm, 6:30 PM)
        time_pattern = r"\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*(?:-|to|–)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)"
        time_match = re.search(time_pattern, text, re.IGNORECASE)
        time_str = time_match.group(0) if time_match else "TBD"

        # Extract location keywords (e.g. Busch Student Center, SERC, College Ave, Room 174)
        location_keywords = [
            "busch student center", "bsc", "college ave student center", "casc",
            "livingston student center", "lsc", "douglass student center", "dsc",
            "serc", "tillett", "scott hall", "rutgers student center", "academic building",
            r"room \d+", "zoom", "discord"
        ]
        loc_str = "Rutgers Campus"
        for loc in location_keywords:
            loc_m = re.search(rf"\b{loc}\b", text, re.IGNORECASE)
            if loc_m:
                loc_str = loc_m.group(0).title()
                break

        # Generate title from first line or sentence
        first_line = text.split("\n")[0].strip()
        title = first_line[:80] if first_line else "Club Announcement"

        return {
            "is_event": is_event,
            "title": title,
            "date": date_str,
            "time": time_str,
            "location": loc_str,
            "important_links": list(set(links)),
        }

    def extract_with_gemini_batch(self, posts: List[Dict[str, str]]) -> Dict[str, Dict[str, Any]]:
        """
        Sends an array of Instagram post captions to Google Gemini API
        requesting a response matching example.json schema.
        """
        if not self.gemini_api_key or not posts:
            return {}

        endpoint = f"{GEMINI_BASE_URL}/models/{GEMINI_MODEL}:generateContent?key={self.gemini_api_key}"

        batch_schema = {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "post_id": {"type": "string"},
                    "is_event": {
                        "type": "boolean",
                        "description": "True if the post announces an upcoming event, false otherwise.",
                    },
                    "title": {"type": "string"},
                    "date": {"type": "string", "description": "Day and date (e.g. 'Wednesday, Oct 24')."},
                    "time": {"type": "string", "description": "Start time or time window (e.g. '8:00 PM - 9:30 PM')."},
                    "location": {"type": "string", "description": "Building, room, or virtual platform."},
                    "important_links": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Any form links, registration URLs, or mentions like 'link in bio'.",
                    },
                },
                "required": ["post_id", "is_event", "title", "date", "time", "location"],
            },
        }

        prompt = (
            "You are an event extraction engine for Rutgers University club Instagram posts.\n"
            "For each post provided in the JSON array below, extract event details strictly adhering to the schema mirroring example.json.\n"
            "If the post does not announce an upcoming event or meeting, set is_event to false.\n\n"
            f"Input posts:\n{json.dumps(posts, indent=2)}"
        )

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": batch_schema,
            },
        }

        try:
            res = requests.post(endpoint, json=payload, timeout=30)
            if res.status_code == 200:
                data = res.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                results_array = json.loads(text)
                return {item["post_id"]: item for item in results_array if "post_id" in item}
            else:
                print(f"[!] Gemini API error ({res.status_code}): {res.text}")
        except Exception as e:
            print(f"[!] Failed to call Gemini API: {e}")

        return {}

    def process_records(self, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Takes raw Bright Data records, queries Gemini API for each club's posts,
        and extracts event schema mirroring example.json.
        """
        clubs = []
        all_events = []

        for rec in records:
            club_handle = rec.get("account") or rec.get("profile_name") or "unknown"
            club_data = {
                "handle": club_handle,
                "name": rec.get("full_name") or rec.get("profile_name") or club_handle,
                "biography": rec.get("biography", ""),
                "followers": rec.get("followers", 0),
                "following": rec.get("following", 0),
                "posts_count": rec.get("posts_count", 0),
                "url": rec.get("url") or f"https://www.instagram.com/{club_handle}",
                "is_verified": rec.get("is_verified", False),
                "profile_image_link": rec.get("profile_image_link", ""),
            }
            clubs.append(club_data)

            posts = rec.get("posts") or []
            posts_with_captions = [p for p in posts if p.get("caption") and p.get("caption").strip()]

            gemini_results = {}
            if self.gemini_api_key and posts_with_captions:
                print(f"[*] Querying Gemini API for {len(posts_with_captions)} posts from @{club_handle}...")
                batch_payload = [
                    {"post_id": str(p.get("id") or p.get("url")), "caption": p.get("caption", "")}
                    for p in posts_with_captions
                ]
                gemini_results = self.extract_with_gemini_batch(batch_payload)

            for post in posts_with_captions:
                post_id = str(post.get("id") or post.get("url"))
                caption = post.get("caption", "")

                # Use Gemini extraction if available, otherwise heuristic fallback
                if post_id in gemini_results:
                    event_meta = gemini_results[post_id]
                    source = "gemini"
                else:
                    event_meta = self.extract_events_from_post(caption)
                    source = "heuristic"

                if event_meta.get("is_event"):
                    event_record = {
                        "club_handle": club_handle,
                        "club_name": club_data["name"],
                        "instagram_post_id": post_id,
                        "post_url": post.get("url", ""),
                        "title": event_meta.get("title", ""),
                        "date": event_meta.get("date", ""),
                        "time": event_meta.get("time", ""),
                        "location": event_meta.get("location", ""),
                        "important_links": event_meta.get("important_links", []),
                        "caption": caption,
                        "datetime": post.get("datetime", ""),
                        "image_url": post.get("image_url", ""),
                        "extraction_source": source,
                    }
                    all_events.append(event_record)

        return {"clubs": clubs, "events": all_events}


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="RUThere - Bright Data Instagram Scraper & Rutgers Club Event Extractor"
    )
    parser.add_argument(
        "urls",
        nargs="*",
        default=["https://www.instagram.com/rutgersu"],
        help="One or more Instagram profile URLs to scrape",
    )
    parser.add_argument(
        "--no-poll",
        action="store_true",
        help="Do not poll for asynchronous snapshot results",
    )
    parser.add_argument(
        "--fixture",
        type=str,
        default=None,
        help="Path to local JSON fixture snapshot for instant offline testing",
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default="scraped_results.json",
        help="Output JSON file path (default: scraped_results.json)",
    )

    args = parser.parse_args()

    print("=" * 60)
    print(" RUThere - Bright Data Instagram Scraper Test Program ")
    print("=" * 60)

    scraper = InstagramBrightDataScraper()

    if args.fixture:
        print(f"[*] Loading fixture snapshot from: {args.fixture}")
        with open(args.fixture, "r") as f:
            raw_results = json.load(f)
    else:
        print(f"Target URLs: {args.urls}")
        raw_results = scraper.scrape(args.urls, poll=not args.no_poll)

    print("\n" + "=" * 60)
    print(" Scrape Results Summary ")
    print("=" * 60)

    processed = scraper.process_records(raw_results)

    print(f"\n[+] Scraped Clubs: {len(processed['clubs'])}")
    for club in processed["clubs"]:
        print(f"  • @{club['handle']} ({club['name']}) - {club['followers']:,} followers, {club['posts_count']} posts")

    print(f"\n[+] Extracted Events: {len(processed['events'])}")
    for i, ev in enumerate(processed["events"][:10], 1):
        print(f"  {i}. {ev['title']}")
        print(f"     Club: @{ev['club_handle']} | Date: {ev['date']} | Time: {ev['time']} | Location: {ev['location']}")
        print(f"     URL: {ev['post_url']}")

    with open(args.output, "w") as f:
        json.dump(
            {"raw_count": len(raw_results), "processed": processed, "raw": raw_results},
            f,
            indent=2,
        )
    print(f"\n[+] Saved full output to {args.output}")


if __name__ == "__main__":
    main()
