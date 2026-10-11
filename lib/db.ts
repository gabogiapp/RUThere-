import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { ClubRecord, EventRecord, BrightDataProfileRecord } from "./types";
import { extractEventsBatchWithGemini } from "./geminiExtractor";

let pool: Pool | null = null;

function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "database.json");

interface LocalStore {
  clubs: ClubRecord[];
  events: EventRecord[];
}

function loadLocalStore(): LocalStore {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(content);
    } catch (e) {
      console.warn("Could not read .data/database.json, initializing empty store:", e);
    }
  }

  const initial: LocalStore = {
    clubs: [
      { id: "1", handle: "rutgersu", name: "Rutgers University", category: "General", url: "https://www.instagram.com/rutgersu" },
      { id: "2", handle: "rutgers.usg", name: "Rutgers University Student Assembly", category: "Student Government", url: "https://www.instagram.com/rutgers.usg" },
      { id: "3", handle: "ru_rudo", name: "Rutgers RUPA", category: "Student Life & Events", url: "https://www.instagram.com/ru_rudo" },
    ],
    events: [],
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), "utf-8");
  return initial;
}

function saveLocalStore(store: LocalStore) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export async function getClubs(): Promise<ClubRecord[]> {
  const db = getPool();
  if (!db) {
    const store = loadLocalStore();
    return store.clubs;
  }

  try {
    const res = await db.query(
      "SELECT id, handle, name, category, url, biography, followers, following, posts_count FROM clubs ORDER BY name ASC"
    );
    return res.rows;
  } catch (err) {
    console.warn("Failed to query clubs from Postgres, using local store:", err);
    const store = loadLocalStore();
    return store.clubs;
  }
}

export async function upsertClub(club: Partial<ClubRecord>): Promise<ClubRecord> {
  const db = getPool();
  const cleanHandle = (club.handle || "").replace(/^@/, "").trim().toLowerCase();
  const record: ClubRecord = {
    handle: cleanHandle,
    name: club.name || cleanHandle,
    category: club.category || "General",
    url: club.url || `https://www.instagram.com/${cleanHandle}`,
    biography: club.biography,
    followers: club.followers,
    following: club.following,
    posts_count: club.posts_count,
  };

  if (!db) {
    const store = loadLocalStore();
    const existingIndex = store.clubs.findIndex((c) => c.handle.toLowerCase() === cleanHandle);
    if (existingIndex >= 0) {
      store.clubs[existingIndex] = { ...store.clubs[existingIndex], ...record };
      saveLocalStore(store);
      return store.clubs[existingIndex];
    }
    record.id = String(store.clubs.length + 1);
    store.clubs.push(record);
    saveLocalStore(store);
    return record;
  }

  try {
    const res = await db.query(
      `INSERT INTO clubs (handle, name, category, url, biography, followers, following, posts_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (handle) DO UPDATE SET
         name = EXCLUDED.name,
         category = COALESCE(clubs.category, EXCLUDED.category),
         url = EXCLUDED.url,
         biography = COALESCE(EXCLUDED.biography, clubs.biography),
         followers = COALESCE(EXCLUDED.followers, clubs.followers),
         following = COALESCE(EXCLUDED.following, clubs.following),
         posts_count = COALESCE(EXCLUDED.posts_count, clubs.posts_count)
       RETURNING *`,
      [
        record.handle,
        record.name,
        record.category,
        record.url,
        record.biography || null,
        record.followers || null,
        record.following || null,
        record.posts_count || null,
      ]
    );
    return res.rows[0];
  } catch (err) {
    console.warn("Failed to upsert club into Postgres, using local store:", err);
    const store = loadLocalStore();
    const existingIndex = store.clubs.findIndex((c) => c.handle.toLowerCase() === cleanHandle);
    if (existingIndex >= 0) {
      store.clubs[existingIndex] = { ...store.clubs[existingIndex], ...record };
      saveLocalStore(store);
      return store.clubs[existingIndex];
    }
    record.id = String(store.clubs.length + 1);
    store.clubs.push(record);
    saveLocalStore(store);
    return record;
  }
}

export async function getEvents(): Promise<EventRecord[]> {
  const db = getPool();
  if (!db) {
    const store = loadLocalStore();
    return store.events;
  }

  try {
    const res = await db.query(`
      SELECT 
        e.id,
        e.club_id,
        c.handle as club_handle,
        c.name as club_name,
        c.category as club_category,
        e.instagram_post_id,
        e.post_url,
        e.title,
        e.event_time,
        e.location,
        e.campus,
        e.category,
        e.image_url,
        e.flyer_details,
        e.description,
        e.created_at
      FROM events e
      LEFT JOIN clubs c ON e.club_id = c.id
      ORDER BY e.event_time ASC
    `);

    return res.rows.map((row) => ({
      id: row.id,
      club_id: row.club_id,
      club_handle: row.club_handle ? `@${row.club_handle}` : "@rutgersclubs",
      club_name: row.club_name || "Rutgers Club",
      instagram_post_id: row.instagram_post_id,
      post_url: row.post_url || (row.instagram_post_id ? `https://www.instagram.com/p/${row.instagram_post_id}` : "https://www.instagram.com/rutgersu"),
      title: row.title,
      date: row.event_time ? new Date(row.event_time).toLocaleDateString() : "",
      time: row.event_time ? new Date(row.event_time).toLocaleTimeString() : "",
      location: row.location || "Rutgers University",
      campus: row.campus || "College Ave",
      category: row.category || row.club_category || "Social & Student Life",
      image_url: row.image_url,
      video_url: row.video_url,
      flyer_details: row.flyer_details,
      description: row.description || "",
      important_links: row.post_url ? [row.post_url] : [],
      is_event: true,
      event_time: row.event_time,
    }));
  } catch (err) {
    console.warn("Failed to query events from Postgres, returning local store:", err);
    const store = loadLocalStore();
    return store.events;
  }
}

export async function upsertEvent(event: EventRecord): Promise<EventRecord> {
  const store = loadLocalStore();
  const existingIdx = store.events.findIndex(
    (e) => (event.instagram_post_id && e.instagram_post_id === event.instagram_post_id) || e.id === event.id
  );
  if (existingIdx >= 0) {
    store.events[existingIdx] = { ...store.events[existingIdx], ...event };
  } else {
    store.events.unshift(event);
  }
  saveLocalStore(store);
  return event;
}

export async function processAndStoreBrightData(
  records: BrightDataProfileRecord[]
): Promise<{ clubsUpdated: number; eventsExtracted: number; events: EventRecord[] }> {
  let clubsUpdated = 0;
  const newEvents: EventRecord[] = [];
  const db = getPool();

  for (const rec of records) {
    const handle = rec.account || (rec.url ? rec.url.split("/").filter(Boolean).pop() : "");
    if (!handle) continue;

    const club = await upsertClub({
      handle,
      name: rec.full_name || handle,
      biography: rec.biography,
      followers: rec.followers,
      following: rec.following,
      posts_count: rec.posts_count,
      url: rec.url || `https://www.instagram.com/${handle}`,
    });
    clubsUpdated++;

    // Update last_scraped_at timestamp for this club
    if (db && club && club.id) {
      try {
        await db.query("UPDATE clubs SET last_scraped_at = NOW() WHERE id = $1", [club.id]);
      } catch (e) {
        console.warn(`Could not update last_scraped_at for club ${handle}:`, e);
      }
    }

    const posts = rec.posts || [];
    // Include posts with captions, flyer images, or videos
    const postsWithContent = posts.filter(
      (p) => (p.caption && p.caption.trim()) || p.image_url || p.video_url || p.video_play_url
    );

    // Pipeline Optimization 1: Configurable Recency Gate (Default: 21 days)
    const maxPostAgeDays = parseInt(process.env.MAX_POST_AGE_DAYS || "21", 10);
    const nowMs = Date.now();
    const maxAgeMs = maxPostAgeDays * 24 * 60 * 60 * 1000;

    const freshPosts = postsWithContent.filter((p) => {
      if (!p.datetime) return true; // keep if unknown date
      const postTime = new Date(p.datetime).getTime();
      if (isNaN(postTime)) return true;
      return nowMs - postTime <= maxAgeMs;
    });

    // Pipeline Optimization 2: Top N Posts Limit (Default: Top 3 posts per handle)
    const maxPostsPerClub = parseInt(process.env.MAX_POSTS_PER_CLUB || "3", 10);
    const targetPosts = freshPosts.slice(0, maxPostsPerClub);

    if (targetPosts.length > 0) {
      // Pipeline Optimization 3: Pre-Check Existing Posts in Neon to Avoid Redundant AI/Gemini Calls
      let alreadySavedPostIds = new Set<string>();
      if (db && club && club.id) {
        try {
          const postIdsToCheck = targetPosts.map((p, idx) => String(p.id || p.url || `post_${idx}`));
          const existingRes = await db.query(
            "SELECT instagram_post_id FROM events WHERE instagram_post_id = ANY($1)",
            [postIdsToCheck]
          );
          alreadySavedPostIds = new Set(existingRes.rows.map((r: any) => r.instagram_post_id));
        } catch (err) {
          console.warn("Could not pre-check existing posts in DB:", err);
        }
      }

      // Filter down to only posts that actually require Gemini AI extraction
      const postsNeedingExtraction = targetPosts.filter((p, idx) => {
        const rawId = String(p.id || p.url || `post_${idx}`);
        return !alreadySavedPostIds.has(rawId);
      });

      let geminiResults = new Map<string, any>();
      if (postsNeedingExtraction.length > 0) {
        console.log(
          `[/api/webhooks/brightdata] Extracting ${postsNeedingExtraction.length} new post(s) for ${handle} via Gemini Vision...`
        );
        const batchInput = postsNeedingExtraction.map((p, idx) => {
          const rawId = String(p.id || p.url || `post_${idx}`);
          const postUrl =
            p.url ||
            (p.id && !p.id.startsWith("http")
              ? `https://www.instagram.com/p/${p.id}`
              : `https://www.instagram.com/${handle}`);
          const videoUrl = p.video_url || p.video_play_url || undefined;
          return {
            post_id: rawId,
            caption: p.caption || "",
            image_url: p.image_url,
            video_url: videoUrl,
            post_url: postUrl,
            club_name: club.name,
            club_handle: `@${handle}`,
            club_category: club.category,
          };
        });

        geminiResults = await extractEventsBatchWithGemini(batchInput);
      } else {
        console.log(`[/api/webhooks/brightdata] All top ${targetPosts.length} posts for ${handle} are already in DB; skipping AI calls.`);
      }

      for (let idx = 0; idx < targetPosts.length; idx++) {
        const post = targetPosts[idx];
        const postId = String(post.id || post.url || `post_${idx}`);
        const extracted = geminiResults.get(postId);

        if (extracted && extracted.is_event) {
          const postUrl =
            post.url ||
            (post.id && !post.id.startsWith("http")
              ? `https://www.instagram.com/p/${post.id}`
              : `https://www.instagram.com/${handle}`);

          // Ensure post_url is in important_links
          const combinedLinks = Array.from(
            new Set([...(extracted.important_links || []), postUrl].filter(Boolean))
          );

          let eventTimeStr = post.datetime || new Date().toISOString();
          try {
            eventTimeStr = new Date(eventTimeStr).toISOString();
          } catch {
            eventTimeStr = new Date().toISOString();
          }

          const videoUrl = post.video_url || post.video_play_url || extracted.video_url;

          const newEvent: EventRecord = {
            id: post.id || `post_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            club_id: club.id,
            club_handle: `@${handle}`,
            club_name: club.name,
            instagram_post_id: postId,
            post_url: postUrl,
            title: extracted.title,
            date: extracted.date,
            time: extracted.time,
            location: extracted.location,
            campus: extracted.campus || "College Ave",
            category: extracted.category || club.category || "Social & Student Life",
            description: post.caption,
            important_links: combinedLinks,
            image_url: post.image_url || extracted.image_url,
            video_url: videoUrl,
            flyer_details: extracted.flyer_details || "",
            is_event: true,
            event_time: eventTimeStr,
            created_at: new Date().toISOString(),
            extraction_source: extracted.extraction_source,
          };

          // If connected to Neon Postgres, persist complete multimodal attributes
          if (db && club && club.id) {
            try {
              await db.query(
                `INSERT INTO events (
                  club_id, instagram_post_id, post_url, title, event_time, location,
                  description, campus, category, image_url, video_url, flyer_details, extraction_source
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT (instagram_post_id) DO UPDATE SET
                  club_id = EXCLUDED.club_id,
                  post_url = EXCLUDED.post_url,
                  title = EXCLUDED.title,
                  event_time = COALESCE(EXCLUDED.event_time, events.event_time),
                  location = COALESCE(EXCLUDED.location, events.location),
                  description = EXCLUDED.description,
                  campus = COALESCE(EXCLUDED.campus, events.campus),
                  category = COALESCE(EXCLUDED.category, events.category),
                  image_url = COALESCE(EXCLUDED.image_url, events.image_url),
                  video_url = COALESCE(EXCLUDED.video_url, events.video_url),
                  flyer_details = COALESCE(EXCLUDED.flyer_details, events.flyer_details),
                  extraction_source = COALESCE(EXCLUDED.extraction_source, events.extraction_source)`,
                [
                  club.id,
                  postId,
                  postUrl,
                  extracted.title,
                  eventTimeStr,
                  extracted.location,
                  post.caption || "",
                  extracted.campus || "College Ave",
                  extracted.category || club.category || "Social & Student Life",
                  post.image_url || extracted.image_url || null,
                  videoUrl || null,
                  extracted.flyer_details || null,
                  extracted.extraction_source || "gemini_multimodal",
                ]
              );
            } catch (err) {
              console.warn(`Failed to insert event for post ${postId} into Neon:`, err);
            }
          }

          await upsertEvent(newEvent);
          newEvents.push(newEvent);
        }
      }
    }
  }

  return { clubsUpdated, eventsExtracted: newEvents.length, events: newEvents };
}
