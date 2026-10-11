const { Pool } = require("pg");
require("dotenv").config();

async function migrateInterests() {
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

    // 1. Add related_interests column if not exists
    await pool.query(`
      ALTER TABLE clubs ADD COLUMN IF NOT EXISTS related_interests TEXT[];
      CREATE INDEX IF NOT EXISTS idx_clubs_related_interests ON clubs USING GIN(related_interests);
    `);
    console.log("✓ Added related_interests column and GIN index.");

    // 2. Upsert Rutgers Artificial Intelligence Club
    const aiClubRes = await pool.query(`
      INSERT INTO clubs (handle, name, category, url, followers, biography, interests, related_interests)
      VALUES (
        'rutgers_ai',
        'Rutgers Artificial Intelligence Club',
        'Tech & Coding',
        'https://www.instagram.com/rutgers_ai',
        1850,
        'Rutgers premier student community for Machine Learning, Deep Learning, and Artificial Intelligence research and applications.',
        ARRAY['artificial intelligence', 'ai', 'machine learning', 'deep learning', 'neural networks', 'llms', 'computer vision'],
        ARRAY['computer science', 'coding', 'python', 'software engineering', 'robotics', 'data science']
      )
      ON CONFLICT (handle) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        biography = EXCLUDED.biography,
        interests = EXCLUDED.interests,
        related_interests = EXCLUDED.related_interests
      RETURNING id, handle, name;
    `);
    console.log("✓ Upserted Rutgers Artificial Intelligence Club:", aiClubRes.rows[0].name);

    const aiClubId = aiClubRes.rows[0].id;

    // 3. Add sample AI event
    await pool.query(`
      INSERT INTO events (club_id, instagram_post_id, post_url, title, event_time, location, campus, category, description)
      VALUES (
        ${aiClubId},
        'post_ai_pytorch_001',
        'https://www.instagram.com/p/DBaBcDeF_ai',
        'Hands-on PyTorch & Deep Learning Workshop',
        '2026-10-22 19:00:00-04',
        'CoRE Building Room 101, Busch Campus',
        'Busch',
        'Tech & Coding',
        'Learn neural network fundamentals and train transformer models using PyTorch on GPU accelerators. Pizza and drinks provided!'
      )
      ON CONFLICT (instagram_post_id) DO UPDATE SET
        title = EXCLUDED.title,
        event_time = EXCLUDED.event_time,
        location = EXCLUDED.location,
        description = EXCLUDED.description;
    `);
    console.log("✓ Seeded sample AI workshop event.");

    // 4. Update two-tier taxonomy for existing clubs
    const clubTaxonomy = [
      {
        handle: 'rutgers_usacs',
        interests: [
          'computer science',
          'software engineering',
          'coding',
          'programming',
          'algorithms',
          'web dev',
          'python',
          'hackathons',
          'interview prep',
          'faang',
        ],
        related_interests: [
          'artificial intelligence',
          'ai',
          'machine learning',
          'cybersecurity',
          'data science',
          'cloud',
          'tech careers',
          'robotics',
        ],
      },
      {
        handle: 'rutgersesports',
        interests: [
          'gaming',
          'video games',
          'esports',
          'competitive gaming',
          'tournaments',
          'smash bros',
          'valorant',
          'league of legends',
          'lan party',
        ],
        related_interests: [
          'discord',
          'pc gaming',
          'console gaming',
          'entertainment',
          'social',
          'recreation',
        ],
      },
      {
        handle: 'rurockclimbing',
        interests: [
          'rock climbing',
          'bouldering',
          'climbing',
          'belay',
          'climbing wall',
        ],
        related_interests: [
          'outdoors',
          'fitness',
          'athletics',
          'adventure',
          'recreation',
          'gym',
          'exercise',
        ],
      },
      {
        handle: 'rutgersrec',
        interests: [
          'fitness',
          'gym',
          'intramural sports',
          'aquatics',
          'swimming',
          'workouts',
        ],
        related_interests: [
          'athletics',
          'health',
          'wellness',
          'outdoor recreation',
          'sports',
        ],
      },
      {
        handle: 'rutgersu',
        interests: [
          'campus events',
          'traditions',
          'student life',
          'university news',
          'academics',
        ],
        related_interests: [
          'rutgers community',
          'campus pride',
          'scarlet knights',
        ],
      },
    ];

    for (const c of clubTaxonomy) {
      await pool.query(
        "UPDATE clubs SET interests = $1, related_interests = $2 WHERE handle = $3",
        [c.interests, c.related_interests, c.handle]
      );
    }
    console.log("✓ Updated two-tier taxonomy on existing clubs.");

    const res = await pool.query(`
      SELECT handle, name, array_length(interests, 1) as primary_count, array_length(related_interests, 1) as related_count
      FROM clubs ORDER BY id ASC
    `);
    console.log("\nDatabase Clubs Status:");
    console.table(res.rows);

  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrateInterests();
