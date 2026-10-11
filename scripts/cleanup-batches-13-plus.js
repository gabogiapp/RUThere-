const { Pool } = require("pg");
require("dotenv").config();

const API_KEY = process.env.BRIGHTDATA_API_KEY;
const datasetId = process.env.BRIGHTDATA_DATASET_ID;
const databaseUrl = process.env.DATABASE_URL;

async function main() {
  if (!API_KEY || !datasetId || !databaseUrl) {
    console.error("Missing required environment variables (BRIGHTDATA_API_KEY, BRIGHTDATA_DATASET_ID, DATABASE_URL)");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log("========================================================");
    console.log("   RUThere Batch Cleanup: Pruning Batches 13+ Events    ");
    console.log("========================================================\n");

    console.log("🔍 Fetching snapshot list from Bright Data...");
    const res = await fetch(`https://api.brightdata.com/datasets/v3/snapshots?dataset_id=${datasetId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    const latestTime = new Date(data[0].created).getTime();
    const runSnapshots = data.filter((s) => {
      const t = new Date(s.created).getTime();
      return Math.abs(latestTime - t) < 3 * 60 * 1000;
    });
    const allBatches = runSnapshots.reverse();
    console.log(`   Found ${allBatches.length} total batch snapshots.`);

    const batches13Plus = allBatches.slice(12); // index 12 = Batch 13
    console.log(`   Isolating Batches 13 to ${allBatches.length} (${batches13Plus.length} snapshots)...`);

    const handles13Plus = new Set();
    for (let i = 0; i < batches13Plus.length; i++) {
      const snap = batches13Plus[i];
      const snapRes = await fetch(`https://api.brightdata.com/datasets/v3/snapshot/${snap.id}?format=json`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const snapData = await snapRes.json();
      if (!Array.isArray(snapData)) continue;
      for (const rec of snapData) {
        const h = (rec.account || rec.user_posted || "").replace(/^@/, "").toLowerCase();
        if (h) handles13Plus.add(h);
      }
    }

    const handlesArray = Array.from(handles13Plus);
    console.log(`   Identified ${handlesArray.length} unique club handles in Batches 13+.\n`);

    // Find corresponding clubs in Neon Postgres
    const { rows: clubs } = await pool.query(
      `SELECT id, handle, name, last_scraped_at FROM clubs WHERE lower(handle) = ANY($1);`,
      [handlesArray]
    );
    console.log(`📊 Found ${clubs.length} matching club records in Neon database.`);

    const clubIds = clubs.map((c) => c.id);
    if (clubIds.length === 0) {
      console.log("No clubs found to prune. Exiting.");
      return;
    }

    // Count events currently belonging to these clubs
    const { rows: eventsBefore } = await pool.query(
      `SELECT count(*)::int as count FROM events WHERE club_id = ANY($1);`,
      [clubIds]
    );
    console.log(`🗑️  Events scheduled for deletion: ${eventsBefore[0].count}`);

    // Delete events
    const deleteResult = await pool.query(
      `DELETE FROM events WHERE club_id = ANY($1);`,
      [clubIds]
    );
    console.log(`✅ Successfully deleted ${deleteResult.rowCount} events from Batches 13+.`);

    // Reset last_scraped_at to NULL so they can be freshly scraped in the future
    const updateResult = await pool.query(
      `UPDATE clubs SET last_scraped_at = NULL WHERE id = ANY($1);`,
      [clubIds]
    );
    console.log(`🔄 Reset last_scraped_at to NULL for ${updateResult.rowCount} clubs.`);

    // Summary of remaining database state
    const { rows: remainingEvents } = await pool.query(`SELECT count(*)::int as count FROM events;`);
    const { rows: totalClubs } = await pool.query(`SELECT count(*)::int as count FROM clubs;`);
    const { rows: scrapedClubs } = await pool.query(
      `SELECT count(*)::int as count FROM clubs WHERE last_scraped_at IS NOT NULL;`
    );

    console.log("\n========================================================");
    console.log("                  CLEANUP SUMMARY                      ");
    console.log("========================================================");
    console.log(`Total Clubs in System:         ${totalClubs[0].count}`);
    console.log(`Active Scraped Clubs (Batches 1-12): ${scrapedClubs[0].count}`);
    console.log(`Unscraped Clubs (Batches 13+):       ${totalClubs[0].count - scrapedClubs[0].count}`);
    console.log(`Clean Events Remaining in DB:  ${remainingEvents[0].count}`);
    console.log("========================================================\n");
  } catch (err) {
    console.error("❌ Cleanup failed:", err);
  } finally {
    await pool.end();
  }
}

main();
