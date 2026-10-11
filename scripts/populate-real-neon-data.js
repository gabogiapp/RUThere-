const { Pool } = require("pg");
require("dotenv").config();

async function populateRealData() {
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

    // 1. Wipe mock/sample data
    await pool.query("DELETE FROM events;");
    await pool.query("DELETE FROM clubs;");
    console.log("✓ Cleared all mock/sample data from Neon.");

    // 2. Insert real scraped Rutgers clubs from Bright Data Instagram dataset
    const clubsSql = `
      INSERT INTO clubs (handle, name, category, url, followers, biography, interests) VALUES
        ('rutgers_usacs', 'Undergraduate Student Alliance of Computer Scientists (USACS)', 'Tech & Coding', 'https://www.instagram.com/rutgers_usacs', 2590, 'Official undergraduate computer science student organization at Rutgers University New Brunswick.', ARRAY['coding', 'computer science', 'software engineering', 'tech', 'web dev', 'hackathons', 'mock interviews', 'python', 'algorithms', 'faang', 'programming', 'internships']),
        ('rutgersesports', 'Rutgers Esports', 'Sports & Recreation', 'https://www.instagram.com/rutgersesports', 3110, 'Official competitive gaming and esports student association at Rutgers University.', ARRAY['gaming', 'video games', 'esports', 'competitive gaming', 'tournaments', 'smash bros', 'valorant', 'league of legends', 'lan party', 'discord', 'casual gaming', 'pc gaming']),
        ('rutgersu', 'Rutgers University', 'General', 'https://www.instagram.com/rutgersu', 155729, 'The State University of New Jersey #Rutgers - Official Institutional Profile.', ARRAY['campus events', 'traditions', 'student life', 'university news', 'academics', 'scarlet knights']),
        ('rutgersrec', 'Rutgers Recreation', 'Sports & Recreation', 'https://www.instagram.com/rutgersrec', 8400, 'Rutgers University Recreation: fitness, intramural sports, outdoor recreation, and aquatic centers across all campuses.', ARRAY['fitness', 'gym', 'intramural sports', 'recreation', 'aquatics', 'swimming', 'wellness', 'workouts', 'outdoor recreation'])
      RETURNING id, handle, name;
    `;
    const clubRows = await pool.query(clubsSql);
    console.log(`✓ Inserted ${clubRows.rows.length} real clubs into Neon.`);

    const clubMap = {};
    for (const c of clubRows.rows) {
      clubMap[c.handle] = c.id;
    }

    // 3. Insert real extracted events from actual Instagram posts
    const eventsSql = `
      INSERT INTO events (club_id, instagram_post_id, post_url, title, event_time, location, description) VALUES
        (
          ${clubMap['rutgersesports']},
          'post_DeKoYmmPFb_',
          'https://www.instagram.com/p/DeKoYmmPFb_',
          'Scarlet Knightmare: Halloween Spooky Gaming Festival',
          '2026-10-24 12:00:00-04',
          'Busch Student Center, Center Hall',
          'Scarlet Knightmare, our yearly Halloween event, is coming to the Busch Student Center! Win prizes, participate in spooky video game tournaments, meet new friends, and get free merchandise. All coming October 24th, 2026, 12PM-11PM.'
        ),
        (
          ${clubMap['rutgersesports']},
          'post_DeQGVUcx136',
          'https://www.instagram.com/p/DeQGVUcx136',
          'Scarlet Knightmare Event Staff & Volunteer Call',
          '2026-10-18 16:00:00-04',
          'Busch Student Center, Busch Campus',
          'Wanna get to know what its like to work with Rutgers E-Sports? We need volunteers for our Scarlet Knightmare event! As many hours as you want, and you can take part in festivities too. Sign up via link in bio.'
        ),
        (
          ${clubMap['rutgersesports']},
          'post_DeK4NlZRZkM',
          'https://www.instagram.com/p/DeK4NlZRZkM',
          'Scarlet Knightmare Artist Alley Showcase & Submissions',
          '2026-10-20 17:00:00-04',
          'Busch Student Center, Center Hall',
          'Ready to showcase your art for everyone at Scarlet Knightmare to see? Our Artist Alley applications are open now! Link to the application is in our bio. Spots fill up fast.'
        ),
        (
          ${clubMap['rutgers_usacs']},
          'post_DeKJ5ELxIO4',
          'https://www.instagram.com/p/DeKJ5ELxIO4',
          'Fall Mock Interviews with Microsoft, Mastercard & JPMorgan',
          '2026-10-15 19:00:00-04',
          'Busch Student Center Room 174',
          'Ready to put your technical skills to the test? Join us on Thursday, 10/15 at 7pm in BSC 174 for our Fall Mock Interview event. Interview with alumni and industry professionals from Microsoft, Mastercard, AT&T, Bloomberg, and JPMorgan Chase. Practice your technical & behavioral skills.'
        ),
        (
          ${clubMap['rutgers_usacs']},
          'post_DeNQJ9kKbax',
          'https://www.instagram.com/p/DeNQJ9kKbax',
          'October USACS Town Hall, E-Board Meet & Figma Ambassador Session',
          '2026-10-13 19:00:00-04',
          'CoRE Building Room 101, Busch Campus',
          'Join us for our October USACS Town Hall! Learn about USACS Intern applications, hear directly from past interns, meet the Figma Campus Ambassadors (and snag exclusive merch), and network with the USACS E-Board over free pizza.'
        ),
        (
          ${clubMap['rutgers_usacs']},
          'post_DeAFphdKgo0',
          'https://www.instagram.com/p/DeAFphdKgo0',
          'HackRU Deployment Pipeline & Web Dev Workshop',
          '2026-10-14 18:30:00-04',
          'Busch Student Center Room 122A',
          'HackRU is right around the corner! Join us on Tuesday at 6:30pm in BSC 122A for our HackRU Prep Workshop, where we walk through the full deployment pipeline so you can focus on building at HackRU instead of scrambling to deploy at the last minute. Bring your laptop!'
        ),
        (
          ${clubMap['rutgers_usacs']},
          'post_Dd61mXVxKFc',
          'https://www.instagram.com/p/Dd61mXVxKFc',
          'Technical Recruiting & Career Pathways with Vanguard',
          '2026-10-16 18:00:00-04',
          'Busch Student Center Multipurpose Room',
          'Join USACS for an evening with Vanguard in which representatives share tips to getting hired! Learn about internships and career opportunities, recruiting and application process, and receive guidance on resume building and technical interviews. Concludes with interactive Q&A.'
        ),
        (
          ${clubMap['rutgers_usacs']},
          'post_DeIrrtoDKui',
          'https://www.instagram.com/p/DeIrrtoDKui',
          'JPMorgan Chase Headquarters Exclusive Office Tour (NYC)',
          '2026-11-03 10:00:00-05',
          'JPMorgan Chase HQ, New York City',
          'Join USACS for an exclusive JPMorgan office tour! Get a firsthand look inside JPMorgan headquarters, explore the workspace, and learn more about financial engineering and software development culture.'
        ),
        (
          ${clubMap['rutgersu']},
          'post_DeSBk2-twyR',
          'https://www.instagram.com/p/DeSBk2-twyR',
          'NJ Innovation Hub Grand Opening at The HELIX',
          '2026-10-21 14:00:00-04',
          'The HELIX, College Ave Campus',
          'Official Grand Opening of the NJ Innovation Hub Powered by Portal Innovations at The HELIX. Rutgers students have an extraordinary front-row seat to the state booming life sciences ecosystem, biotech ventures, and mentorship opportunities.'
        )
      RETURNING id, title;
    `;

    const eventRows = await pool.query(eventsSql);
    console.log(`✓ Inserted ${eventRows.rows.length} real events into Neon.`);

    const countClubs = await pool.query("SELECT COUNT(*) FROM clubs");
    const countEvents = await pool.query("SELECT COUNT(*) FROM events");
    console.log(`\n🎉 Neon database updated with real scraped data:`);
    console.log(`   - Clubs: ${countClubs.rows[0].count}`);
    console.log(`   - Events: ${countEvents.rows[0].count}`);

  } catch (err) {
    console.error("Failed to populate real data in Neon:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

populateRealData();
