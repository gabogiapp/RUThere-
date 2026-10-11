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
        c.category as club_category,
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
      category: row.club_category || "General",
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
  const db = getPool();

  for (const rec of records) {
    const handle = rec.account || (rec.url ? rec.url.split("/").filter(Boolean).pop() : "");
    if (!handle) continue;

    const savedClub = await upsertClub({
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

        // Expanded event detection heuristic
        const isEvent = /event|meeting|gbm|workshop|hackathon|join us|when:|where:|conference|competition|panel|session|showcase|expo|fest/i.test(
          post.caption
        );

        if (isEvent) {
          const title = post.caption.split("\n")[0].trim().slice(0, 100) || `${savedClub.name} Event`;
          const postId =
            post.id ||
            (post.url ? post.url.split("/p/")[1]?.replace(/\//g, "") : null) ||
            `post_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const postUrl = post.url || `https://www.instagram.com/p/${postId}`;

          // Location extraction heuristic
          let location = "Rutgers Campus";
          const locMatch = post.caption.match(/(?:at|in|location:?)\s+([A-Z0-9][A-Za-z0-9\s,.-]{3,40})/i);
          if (locMatch && locMatch[1]) {
            location = locMatch[1].trim().split("\n")[0];
          }

          // Date / time
          let eventTimeStr: string | null = null;
          if (post.datetime) {
            try {
              eventTimeStr = new Date(post.datetime).toISOString();
            } catch {
              eventTimeStr = null;
            }
          }

          if (db && savedClub && savedClub.id) {
            try {
              await db.query(
                `INSERT INTO events (club_id, instagram_post_id, post_url, title, event_time, location, description)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (instagram_post_id) DO UPDATE SET
                   club_id = EXCLUDED.club_id,
                   post_url = EXCLUDED.post_url,
                   title = EXCLUDED.title,
                   event_time = COALESCE(EXCLUDED.event_time, events.event_time),
                   location = COALESCE(EXCLUDED.location, events.location),
                   description = EXCLUDED.description`,
                [
                  savedClub.id,
                  postId,
                  postUrl,
                  title,
                  eventTimeStr,
                  location,
                  post.caption,
                ]
              );
              eventsExtracted++;
            } catch (err) {
              console.warn(`Failed to insert event for post ${postId} into Neon:`, err);
            }
          } else {
            fallbackEvents.push({
              id: postId,
              club_handle: `@${handle}`,
              club_name: savedClub.name || handle,
              instagram_post_id: postId,
              post_url: postUrl,
              title,
              location,
              description: post.caption,
              important_links: [postUrl],
              is_event: true,
              event_time: eventTimeStr || undefined,
            });
            eventsExtracted++;
          }
        }
      }
    }
  }

  return { clubsUpdated, eventsExtracted };
}

