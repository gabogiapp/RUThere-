const { Pool } = require("pg");
require("dotenv").config();

async function setup() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not found in .env");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log("Connecting to Neon PostgreSQL...");
    
    // 1. Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clubs (
          id SERIAL PRIMARY KEY,
          handle VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          category VARCHAR(100),
          url TEXT,
          biography TEXT,
          followers INTEGER,
          following INTEGER,
          posts_count INTEGER,
          last_scraped_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          club_id INTEGER REFERENCES clubs(id) ON DELETE CASCADE,
          instagram_post_id VARCHAR(255) UNIQUE NOT NULL,
          post_url TEXT NOT NULL,
          title VARCHAR(255) NOT NULL,
          event_time TIMESTAMP WITH TIME ZONE,
          location VARCHAR(255),
          campus VARCHAR(100),
          category VARCHAR(100),
          image_url TEXT,
          video_url TEXT,
          flyer_details TEXT,
          extraction_source VARCHAR(50),
          description TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Add columns if existing table didn't have them
      ALTER TABLE clubs ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE clubs ADD COLUMN IF NOT EXISTS interests TEXT[];
      ALTER TABLE events ADD COLUMN IF NOT EXISTS campus VARCHAR(100);
      ALTER TABLE events ADD COLUMN IF NOT EXISTS category VARCHAR(100);
      ALTER TABLE events ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS video_url TEXT;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS flyer_details TEXT;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS extraction_source VARCHAR(50);

      CREATE INDEX IF NOT EXISTS idx_events_time ON events(event_time);
      CREATE INDEX IF NOT EXISTS idx_events_club_id ON events(club_id);
      CREATE INDEX IF NOT EXISTS idx_clubs_interests ON clubs USING GIN(interests);
    `);
    console.log("✓ Tables and indexes created successfully.");

    // 2. Seed clubs
    const clubsResult = await pool.query(`
      INSERT INTO clubs (handle, name, category, url) VALUES
        ('rutgersu', 'Rutgers University', 'General', 'https://www.instagram.com/rutgersu'),
        ('rutgers.usg', 'Rutgers University Student Assembly', 'Social & Student Life', 'https://www.instagram.com/rutgers.usg'),
        ('ru_rudo', 'Rutgers University Programming Association', 'Social & Student Life', 'https://www.instagram.com/ru_rudo'),
        ('rutgersesports', 'Rutgers Esports', 'Sports & Recreation', 'https://www.instagram.com/rutgersesports'),
        ('rutgers_ieee', 'Rutgers IEEE Student Branch', 'Engineering', 'https://www.instagram.com/rutgers_ieee'),
        ('rutgersusacs', 'Rutgers USACS', 'Tech & Coding', 'https://www.instagram.com/rutgersusacs'),
        ('hackruofficial', 'HackRU Organizing Team', 'Tech & Coding', 'https://www.instagram.com/hackruofficial')
      ON CONFLICT (handle) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, url = EXCLUDED.url
      RETURNING id, handle, name;
    `);
    console.log(`✓ Seeded ${clubsResult.rows.length} Rutgers clubs.`);

    // Map club handle to ID
    const clubMap = {};
    for (const row of clubsResult.rows) {
      clubMap[row.handle] = row.id;
    }

    // 3. Seed initial events
    await pool.query(`
      INSERT INTO events (club_id, instagram_post_id, post_url, title, event_time, location, description) VALUES
        (
          ${clubMap['rutgersusacs']},
          'post_usacs_001',
          'https://www.instagram.com/p/DBaBcDeF0',
          'Intro to Full-Stack Web Development Workshop',
          '2026-10-12 19:00:00-04',
          'CoRE Building Room 101, Busch Campus',
          'Kickstart your modern web dev journey with React, Tailwind, and Node.js. Pizza and drinks provided! No prior coding experience required.'
        ),
        (
          ${clubMap['hackruofficial']},
          'post_hackru_001',
          'https://www.instagram.com/p/DBaBcDeF1',
          'HackRU 2027 Organizer Call & Brainstorming',
          '2026-10-13 20:00:00-04',
          'Busch Student Center, Center Hall',
          'Help organize New Jersey''s premier 24-hour hackathon. Roles open in Logistics, Dev Team, Sponsorship, and Design.'
        ),
        (
          ${clubMap['rutgers.usg']},
          'post_usg_001',
          'https://www.instagram.com/p/DBaBcDeF2',
          'Student Assembly Fall Kickoff General Body Meeting',
          '2026-10-15 19:30:00-04',
          'Student Activities Center (SAC) MPR, College Ave',
          'First GBM of the year! Learn about legislative advocacy, campus improvements, and elections for open senator seats. Free pizza provided.'
        ),
        (
          ${clubMap['ru_rudo']},
          'post_rupa_001',
          'https://www.instagram.com/p/DBaBcDeF3',
          'Outdoor Fall Spooky Movie Night & Trivia',
          '2026-10-16 20:00:00-04',
          'Morrell Street Yard, College Ave Campus',
          'Join RUPA for an outdoor screening under the stars. Free hot apple cider, gourmet popcorn, and prizes for trivia winners!'
        ),
        (
          ${clubMap['rutgers_ieee']},
          'post_ieee_001',
          'https://www.instagram.com/p/DBaBcDeF4',
          'Microcontroller & PCB Design Hands-on Lab',
          '2026-10-14 18:30:00-04',
          'Engineering Building Room D-110, Busch Campus',
          'Hands-on intro to schematic layout in KiCad and flashing firmware to ESP32 microcontrollers. Hardware kits provided.'
        )
      ON CONFLICT (instagram_post_id) DO NOTHING;
    `);
    console.log("✓ Seeded sample events successfully into Neon.");

    const res = await pool.query("SELECT COUNT(*) FROM clubs");
    const evRes = await pool.query("SELECT COUNT(*) FROM events");
    console.log(`Current Neon status: ${res.rows[0].count} clubs, ${evRes.rows[0].count} events.`);

  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setup();
