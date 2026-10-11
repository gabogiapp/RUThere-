#!/usr/bin/env node

/**
 * Bulk Scraper & Cron Job Runner
 *
 * Triggers the scrape cron job across clubs, monitors cloud progress with Bright Data,
 * downloads snapshot results, and feeds them into the local/production ingestion webhook.
 *
 * Ensures:
 * - Up to 10 posts per account for initial backfill / new clubs
 * - Gemini Multimodal Vision flyer & caption extraction with rotating key pool
 * - Free Food detection (has_free_food)
 * - Two-tier interest taxonomy & category classification
 * - PostgreSQL persistence & last_scraped_at timestamp updates
 * - Sub-chunked webhook ingestion (5 clubs at a time) to prevent HTTP timeouts
 * - Resume capability (--resume-from=10) to continue from interrupted runs without re-scraping
 *
 * Usage:
 *   node scripts/run-cron.js [--max-posts=10] [--limit=5]
 *   node scripts/run-cron.js --handles=ru_calisthenics,rutgers_usacs,rutgers_ieee [--max-posts=10]
 *   node scripts/run-cron.js --resume-from=10 [--max-posts=10] [--force]
 *   node scripts/run-cron.js --snapshot=<snapshot_id>
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Prevent Node.js undici client from timing out on long-running AI extraction requests
try {
  const { Agent, setGlobalDispatcher } = require("undici");
  setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0, connectTimeout: 120000 }));
} catch (e) {
  // Ignore if undici isn't present
}

const API_KEY = process.env.BRIGHTDATA_API_KEY;
const SECRET = process.env.BRIGHTDATA_WEBHOOK_SECRET || "test_secret_token_123";
const BASE_URL = "http://localhost:3000";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkProgress(snapshotId) {
  const res = await fetch(`https://api.brightdata.com/datasets/v3/progress/${snapshotId}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return await res.json();
}

async function downloadSnapshot(snapshotId) {
  const res = await fetch(`https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return await res.json();
}

/**
 * Fetch recently created snapshots from Bright Data for this dataset (ordered chronologically)
 */
async function getRecentSnapshots() {
  const datasetId = process.env.BRIGHTDATA_DATASET_ID || "gd_l1vikfch901nx3by4";
  const res = await fetch(`https://api.brightdata.com/datasets/v3/snapshots?dataset_id=${datasetId}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return [];
  const latestTime = new Date(data[0].created).getTime();
  // Group all snapshots that were dispatched as part of the latest batch run (within 3 minutes of the latest snapshot)
  const runSnapshots = data.filter((s) => {
    const t = new Date(s.created).getTime();
    return Math.abs(latestTime - t) < 3 * 60 * 1000;
  });
  // Sort chronologically (oldest first -> batch 1 to batch N)
  return runSnapshots.reverse().map((s) => s.id || s.snapshot_id);
}

/**
 * Ingests clubs into the Next.js webhook in sub-chunks of 5 clubs to prevent timeouts and provide live progress
 */
async function sendToWebhook(records, maxPosts = 10, force = false) {
  let webhookUrl = `${BASE_URL}/api/webhooks/brightdata?secret=${encodeURIComponent(SECRET)}&max_posts=${maxPosts}`;
  if (force) webhookUrl += "&force=true";
  console.log(`\n📤 Ingesting ${records.length} club record(s) into webhook (${maxPosts} posts max${force ? ", force refresh" : ""})...`);
  console.log(`🤖 Running Gemini Multimodal Vision + Free Food detection...`);

  const CHUNK_SIZE = 5;
  let totalClubs = 0;
  let totalEvents = 0;
  const startTime = Date.now();

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const chunkLabel = `[Clubs ${i + 1}-${Math.min(i + CHUNK_SIZE, records.length)} of ${records.length}]`;
    const handles = chunk.map((c) => c.account || c.name || "club").join(", ");
    process.stdout.write(`   ${chunkLabel} (${handles})... `);
    const chunkStart = Date.now();

    let attempts = 0;
    let success = false;
    while (!success && attempts < 3) {
      try {
        attempts++;
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chunk),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Webhook failed HTTP ${res.status}: ${errText}`);
        }

        const result = await res.json();
        const chunkDuration = ((Date.now() - chunkStart) / 1000).toFixed(1);
        console.log(`Done (${chunkDuration}s) -> +${result.events_extracted} event(s)`);
        totalClubs += (result.clubs_updated || 0);
        totalEvents += (result.events_extracted || 0);
        success = true;
      } catch (err) {
        if (attempts >= 3) {
          console.error(`\n   ❌ Failed sub-chunk after 3 attempts: ${err.message}`);
          throw err;
        }
        console.warn(`\n   ⚠️ Retrying sub-chunk (${err.message})...`);
        await sleep(3000);
      }
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ Batch Ingestion Complete in ${duration}s!`);
  console.log(`   Total clubs updated: ${totalClubs}`);
  console.log(`   Total events extracted: ${totalEvents}\n`);
  return { clubs_updated: totalClubs, events_extracted: totalEvents };
}

async function main() {
  const args = process.argv.slice(2);
  const maxPostsArg = args.find((a) => a.startsWith("--max-posts="));
  const maxPosts = maxPostsArg ? parseInt(maxPostsArg.split("=")[1], 10) : 10;

  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? limitArg.split("=")[1] : undefined;

  const handleValues = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--handle=") || a.startsWith("--handles=")) {
      handleValues.push(a.split("=")[1]);
    } else if (a === "--handle" || a === "--handles") {
      if (args[i + 1] && !args[i + 1].startsWith("--")) {
        handleValues.push(args[i + 1]);
        i++;
      }
    }
  }

  const handles = Array.from(
    new Set(
      handleValues
        .flatMap((val) => val.split(","))
        .map((h) => h.replace(/^@/, "").trim().toLowerCase())
        .filter(Boolean)
    )
  );

  const snapshotArg = args.find((a) => a.startsWith("--snapshot="));
  const directSnapshotId = snapshotArg ? snapshotArg.split("=")[1] : undefined;

  const resumeArg = args.find((a) => a.startsWith("--resume-from=") || a.startsWith("--resume="));
  const resumeFromBatch = resumeArg ? parseInt(resumeArg.split("=")[1], 10) : undefined;

  const force = args.includes("--force");

  console.log("\n========================================================");
  console.log("     RUThere Cron Scrape & Event Ingestion Pipeline     ");
  console.log(`     Max Posts Per Account: ${maxPosts}                `);
  if (handles.length > 0) {
    console.log(`     Target Clubs (${handles.length}): ${handles.map((h) => `@${h}`).join(", ")}`);
  }
  if (limit) console.log(`     Club Limit: ${limit}`);
  if (resumeFromBatch) console.log(`     Resume From Batch: ${resumeFromBatch}                 `);
  if (force) console.log("     Force Refresh: YES (re-evaluating all posts)       ");
  console.log("========================================================\n");

  if (!API_KEY) {
    console.error("❌ BRIGHTDATA_API_KEY is missing in .env");
    process.exit(1);
  }

  // Case A: Directly download and process an existing snapshot
  if (directSnapshotId) {
    console.log(`⏳ Checking status of snapshot: ${directSnapshotId}...`);
    let isReady = false;
    let attempts = 0;
    while (!isReady && attempts < 40) {
      const prog = await checkProgress(directSnapshotId);
      const elapsed = Math.round((prog.running_time || attempts * 5000) / 1000);
      process.stdout.write(`   Status: ${prog.status} (elapsed: ${elapsed}s)\r`);
      if (prog.status === "ready") {
        isReady = true;
        console.log(`\n   ✓ Snapshot ${directSnapshotId} is READY! (${elapsed}s)`);
        break;
      } else if (prog.status === "failed") {
        console.log(`\n   ❌ Snapshot ${directSnapshotId} marked as failed.`);
        return;
      }
      await sleep(5000);
      attempts++;
    }

    console.log(`📥 Downloading snapshot: ${directSnapshotId}...`);
    const records = await downloadSnapshot(directSnapshotId);
    if (Array.isArray(records)) {
      await sendToWebhook(records, maxPosts, force);
    } else {
      console.error("❌ Snapshot response was not an array of records:", records);
    }
    return;
  }

  // Case B: Resuming from an existing batch using already completed snapshots
  let snapshotIds = [];
  let startIndex = 0;

  if (resumeFromBatch && resumeFromBatch > 1) {
    console.log(`🔍 Fetching existing snapshots to resume from Batch ${resumeFromBatch}...`);
    const allRecent = await getRecentSnapshots();
    if (allRecent.length === 0) {
      console.error("❌ No recent snapshots found on Bright Data to resume from.");
      process.exit(1);
    }
    console.log(`   Found ${allRecent.length} recent snapshot(s) on Bright Data.`);
    snapshotIds = allRecent;
    startIndex = resumeFromBatch - 1; // 0-indexed
    console.log(`   Skipping Batches 1 to ${resumeFromBatch - 1}. Processing Batches ${resumeFromBatch} to ${snapshotIds.length}.\n`);
  } else {
    // Case C: Trigger a new scrape across clubs via /api/cron/trigger-scrape
    let triggerUrl = `${BASE_URL}/api/cron/trigger-scrape?max_posts=${maxPosts}`;
    if (limit) triggerUrl += `&limit=${limit}`;
    if (handles.length > 0) triggerUrl += `&handles=${encodeURIComponent(handles.join(","))}`;
    if (force) triggerUrl += `&force=true`;

    console.log(`🚀 Triggering scrape cron job: ${triggerUrl}...`);
    const triggerRes = await fetch(triggerUrl);
    if (!triggerRes.ok) {
      const errText = await triggerRes.text();
      throw new Error(`Trigger failed HTTP ${triggerRes.status}: ${errText}`);
    }

    const triggerData = await triggerRes.json();
    console.log(`✅ ${triggerData.message}`);
    snapshotIds = triggerData.snapshot_ids || [];
  }

  if (snapshotIds.length === 0 || startIndex >= snapshotIds.length) {
    console.log("No batches to process.");
    return;
  }

  console.log(`\n⏳ Processing ${snapshotIds.length - startIndex} batch(es) (from Batch ${startIndex + 1} of ${snapshotIds.length})...`);

  for (let i = startIndex; i < snapshotIds.length; i++) {
    const snapId = snapshotIds[i];
    console.log(`\n--- Monitoring Batch [${i + 1}/${snapshotIds.length}]: ${snapId} ---`);

    let isReady = false;
    let attempts = 0;
    while (!isReady && attempts < 40) {
      attempts++;
      try {
        const prog = await checkProgress(snapId);
        const elapsed = Math.round((prog.running_time || attempts * 5000) / 1000);
        process.stdout.write(`   Status: ${prog.status} (elapsed: ${elapsed}s)\r`);

        if (prog.status === "ready") {
          isReady = true;
          console.log(`\n   ✓ Snapshot ${snapId} is READY! (${elapsed}s)`);
          break;
        } else if (prog.status === "failed") {
          console.log(`\n   ❌ Snapshot ${snapId} marked as failed.`);
          break;
        }
      } catch (err) {
        console.warn(`\n   Polling warning: ${err.message}`);
      }
      await sleep(5000);
    }

    if (isReady) {
      const records = await downloadSnapshot(snapId);
      await sendToWebhook(records, maxPosts, force);
    }
  }

  console.log("========================================================");
  console.log("🎉 All batches processed and saved to Neon PostgreSQL!");
  console.log("========================================================\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
