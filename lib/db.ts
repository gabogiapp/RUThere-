import { Pool } from "pg";
import { ClubRecord, EventRecord, BrightDataProfileRecord } from "./types";

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

// In-memory fallback if no database is connected
let fallbackClubs: ClubRecord[] = [];
let fallbackEvents: EventRecord[] = [];

export async function getClubs(): Promise<ClubRecord[]> {
  const db = getPool();
  if (!db) {
    return fallbackClubs;
  }

  try {
    const res = await db.query(
      "SELECT id, handle, name, category, url, biography, followers, following, posts_count FROM clubs ORDER BY name ASC"
    );
    return res.rows;
  } catch (err) {
    console.warn("Failed to query clubs from Postgres, using fallback:", err);
    return fallbackClubs;
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
    const existingIndex = fallbackClubs.findIndex((c) => c.handle.toLowerCase() === cleanHandle);
    if (existingIndex >= 0) {
      fallbackClubs[existingIndex] = { ...fallbackClubs[existingIndex], ...record };
      return fallbackClubs[existingIndex];
    }
    fallbackClubs.push(record);
    return record;
  }

  try {
    const res = await db.query(
      `INSERT INTO clubs (handle, name, category, url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (handle) DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         url = EXCLUDED.url
       RETURNING *`,
      [record.handle, record.name, record.category, record.url]
    );
    return res.rows[0];
  } catch (err) {
    console.warn("Failed to upsert club into Postgres, using fallback:", err);
    fallbackClubs.push(record);
    return record;
  }
}

export async function getEvents(): Promise<EventRecord[]> {
  const db = getPool();
  if (!db) {
    return fallbackEvents;
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
      post_url: row.post_url,
      title: row.title,
      date: row.event_time ? new Date(row.event_time).toLocaleDateString() : "",
      time: row.event_time ? new Date(row.event_time).toLocaleTimeString() : "",
      location: row.location || "Rutgers University",
      description: row.description || "",
      important_links: row.post_url ? [row.post_url] : [],
      is_event: true,
      event_time: row.event_time,
    }));
  } catch (err) {
    console.warn("Failed to query events from Postgres, returning fallback:", err);
    return fallbackEvents;
  }
}

export async function processAndStoreBrightData(
  records: BrightDataProfileRecord[]
): Promise<{ clubsUpdated: number; eventsExtracted: number }> {
  let clubsUpdated = 0;
  let eventsExtracted = 0;

  for (const rec of records) {
    const handle = rec.account || (rec.url ? rec.url.split("/").filter(Boolean).pop() : "");
    if (!handle) continue;

    await upsertClub({
      handle,
      name: rec.full_name || handle,
      biography: rec.biography,
      followers: rec.followers,
      following: rec.following,
      posts_count: rec.posts_count,
      url: rec.url || `https://www.instagram.com/${handle}`,
    });
    clubsUpdated++;

    if (rec.posts && Array.isArray(rec.posts)) {
      for (const post of rec.posts) {
        if (!post.caption) continue;
        // Simple extraction heuristic
        const isEvent = /event|meeting|gbm|workshop|hackathon|join us|when:|where:/i.test(post.caption);
        if (isEvent) {
          const title = post.caption.split("\n")[0].slice(0, 80) || "Club Event";
          const newEvent: EventRecord = {
            id: post.id || `post_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            club_handle: `@${handle}`,
            club_name: rec.full_name || handle,
            instagram_post_id: post.id,
            post_url: post.url || `https://www.instagram.com/p/${post.id}`,
            title,
            location: "Rutgers Campus",
            description: post.caption,
            important_links: post.url ? [post.url] : [],
            is_event: true,
          };
          fallbackEvents.push(newEvent);
          eventsExtracted++;
        }
      }
    }
  }

  return { clubsUpdated, eventsExtracted };
}
