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
         category = EXCLUDED.category,
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
      category: row.category || "Social & Student Life",
      image_url: row.image_url,
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

    const posts = rec.posts || [];
    // Include posts with captions or flyer images
    const postsWithContent = posts.filter((p) => (p.caption && p.caption.trim()) || p.image_url);
    const targetPosts = postsWithContent.slice(0, 8);

    if (targetPosts.length > 0) {
      const batchInput = targetPosts.map((p, idx) => {
        const rawId = String(p.id || p.url || `post_${idx}`);
        const postUrl =
          p.url ||
          (p.id && !p.id.startsWith("http")
            ? `https://www.instagram.com/p/${p.id}`
            : `https://www.instagram.com/${handle}`);
        return {
          post_id: rawId,
          caption: p.caption || "",
          image_url: p.image_url,
          post_url: postUrl,
          club_name: club.name,
          club_handle: `@${handle}`,
          club_category: club.category,
        };
      });

      // Extract events via Gemini Multimodal Vision API adhering to example.json
      const geminiResults = await extractEventsBatchWithGemini(batchInput);

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
            flyer_details: extracted.flyer_details || "",
            is_event: true,
            event_time: post.datetime || new Date().toISOString(),
            created_at: new Date().toISOString(),
            extraction_source: extracted.extraction_source,
          };

          await upsertEvent(newEvent);
          newEvents.push(newEvent);
        }
      }
    }
  }

  return { clubsUpdated, eventsExtracted: newEvents.length, events: newEvents };
}
