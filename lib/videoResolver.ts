import fs from "fs";
import path from "path";

const BRIGHTDATA_POSTS_DATASET_ID = "gd_lk5ns7kz21pck8jpis";

/**
 * Extracts a clean Instagram post or reel URL from any string/link
 */
export function extractCleanInstagramPostUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([^/?#&]+)/i);
  if (match && match[1]) {
    return `https://www.instagram.com/p/${match[1]}/`;
  }
  return null;
}

/**
 * Extracts direct MP4 link from Bright Data response item
 */
function extractMp4FromRecord(record: any): string | null {
  if (!record) return null;

  // 1. Direct videos array or string
  if (record.videos) {
    if (Array.isArray(record.videos) && record.videos.length > 0) {
      for (const v of record.videos) {
        if (typeof v === "string" && v.startsWith("http")) return v;
      }
    } else if (typeof record.videos === "string") {
      try {
        const parsed = JSON.parse(record.videos.replace(/'/g, '"'));
        if (Array.isArray(parsed) && parsed[0]) return parsed[0];
      } catch {}
      const m = record.videos.match(/https?:[^\s'"\\]+\.mp4[^\s'"\\]*/i);
      if (m) return m[0];
    }
  }

  // 2. videos_duration
  if (record.videos_duration) {
    if (Array.isArray(record.videos_duration) && record.videos_duration.length > 0) {
      const first = record.videos_duration[0];
      if (first && first.url) return first.url;
    } else if (typeof record.videos_duration === "string") {
      const m = record.videos_duration.match(/https?:[^\s'"\\]+\.mp4[^\s'"\\]*/i);
      if (m) return m[0];
    }
  }

  // 3. Fallback direct video_url / video_play_url
  if (record.video_url && typeof record.video_url === "string" && record.video_url.startsWith("http")) {
    return record.video_url;
  }
  if (record.video_play_url && typeof record.video_play_url === "string" && record.video_play_url.startsWith("http")) {
    return record.video_play_url;
  }

  return null;
}

/**
 * Resolves a single Instagram post URL to a direct .mp4 video stream using Bright Data Post Scraper
 */
export async function resolveInstagramVideoUrl(postUrl: string): Promise<string | null> {
  const cleanUrl = extractCleanInstagramPostUrl(postUrl);
  if (!cleanUrl) return null;

  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) {
    console.warn("[videoResolver] BRIGHTDATA_API_KEY is not set. Cannot resolve Instagram video.");
    return null;
  }

  try {
    console.log(`[videoResolver] Initiating video resolution for ${cleanUrl}...`);
    // Step 1: Trigger Bright Data Post Scraper job
    const triggerRes = await fetch(
      `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${BRIGHTDATA_POSTS_DATASET_ID}&include_errors=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([{ url: cleanUrl }]),
      }
    );

    if (!triggerRes.ok) {
      const errText = await triggerRes.text();
      console.warn(`[videoResolver] Bright Data trigger failed (HTTP ${triggerRes.status}): ${errText}`);
      return null;
    }

    const triggerData = await triggerRes.json();
    const snapshotId = triggerData.snapshot_id;
    if (!snapshotId) {
      console.warn("[videoResolver] No snapshot_id returned from Bright Data.");
      return null;
    }

    // Step 2: Poll progress until ready (up to 75 seconds)
    const maxPolls = 25;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const progRes = await fetch(
        `https://api.brightdata.com/datasets/v3/progress/${snapshotId}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );

      if (!progRes.ok) continue;
      const progData = await progRes.json();
      console.log(`[videoResolver] Poll ${i + 1}/${maxPolls} for ${snapshotId}: ${progData.status}`);

      if (progData.status === "ready") {
        // Step 3: Fetch snapshot data
        const snapRes = await fetch(
          `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
          }
        );

        if (!snapRes.ok) return null;
        const records = await snapRes.json();
        if (Array.isArray(records) && records.length > 0) {
          const mp4 = extractMp4FromRecord(records[0]);
          if (mp4) {
            console.log(`[videoResolver] Successfully resolved MP4 for ${cleanUrl}: ${mp4.slice(0, 80)}...`);
            return mp4;
          }
        }
        break;
      } else if (progData.status === "failed") {
        console.warn(`[videoResolver] Job failed for snapshot ${snapshotId}`);
        break;
      }
    }
  } catch (error) {
    console.error(`[videoResolver] Error resolving video for ${cleanUrl}:`, error);
  }

  return null;
}

/**
 * Resolves multiple Instagram post URLs in batch using a single Bright Data job
 */
export async function resolveBatchInstagramVideoUrls(
  postUrls: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const validUrls = Array.from(
    new Set(postUrls.map(extractCleanInstagramPostUrl).filter((u): u is string => Boolean(u)))
  );

  if (validUrls.length === 0) return result;

  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) return result;

  try {
    const triggerRes = await fetch(
      `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${BRIGHTDATA_POSTS_DATASET_ID}&include_errors=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validUrls.map((u) => ({ url: u }))),
      }
    );

    if (!triggerRes.ok) return result;
    const triggerData = await triggerRes.json();
    const snapshotId = triggerData.snapshot_id;
    if (!snapshotId) return result;

    const maxPolls = 20;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const progRes = await fetch(
        `https://api.brightdata.com/datasets/v3/progress/${snapshotId}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );

      if (!progRes.ok) continue;
      const progData = await progRes.json();

      if (progData.status === "ready") {
        const snapRes = await fetch(
          `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
          }
        );

        if (!snapRes.ok) break;
        const records = await snapRes.json();
        if (Array.isArray(records)) {
          for (const rec of records) {
            const url = extractCleanInstagramPostUrl(rec.url || rec.input?.url || "");
            const mp4 = extractMp4FromRecord(rec);
            if (url && mp4) {
              result.set(url, mp4);
            }
          }
        }
        break;
      } else if (progData.status === "failed") {
        break;
      }
    }
  } catch (error) {
    console.error("[videoResolver] Batch resolution error:", error);
  }

  return result;
}
