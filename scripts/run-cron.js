#!/usr/bin/env node

/**
 * Bulk Scraper & Cron Job Runner
 *
 * Triggers the scrape cron job across clubs, monitors cloud progress with Bright Data,
 * downloads snapshot results, and feeds them into the local/production ingestion webhook.
 *
 * Ensures:
 * - Up to 10 posts per account for initial backfill / new clubs
 * - Gemini Multimodal Vision flyer & caption extraction
 * - Free Food detection (has_free_food)
 * - Two-tier interest taxonomy & category classification
 * - PostgreSQL persistence & last_scraped_at timestamp updates
 *
 * Usage:
 *   node scripts/run-cron.js [--max-posts=10] [--limit=5] [--handle=rutgers_ai]
 *   node scripts/run-cron.js --snapshot=<snapshot_id>
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config();

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

async function sendToWebhook(records, maxPosts = 10) {
  const webhookUrl = `${BASE_URL}/api/webhooks/brightdata?secret=${encodeURIComponent(SECRET)}&max_posts=${maxPosts}`;
  console.log(`\n📤 Ingesting ${records.length} club record(s) into webhook (${maxPosts} posts max)...`);
  console.log(`🤖 Running Gemini Multimodal Vision + Free Food detection...`);

  const startTime = Date.now();
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(records),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Webhook failed HTTP ${res.status}: ${errText}`);
  }

  const result = await res.json();
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ Ingestion Complete in ${duration}s!`);
  console.log(`   Clubs updated: ${result.clubs_updated}`);
  console.log(`   Events extracted: ${result.events_extracted}\n`);
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const maxPostsArg = args.find((a) => a.startsWith("--max-posts="));
  const maxPosts = maxPostsArg ? parseInt(maxPostsArg.split("=")[1], 10) : 10;

  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? limitArg.split("=")[1] : undefined;

  const handleArg = args.find((a) => a.startsWith("--handle="));
  const handle = handleArg ? handleArg.split("=")[1].replace(/^@/, "") : undefined;

  const snapshotArg = args.find((a) => a.startsWith("--snapshot="));
  const directSnapshotId = snapshotArg ? snapshotArg.split("=")[1] : undefined;

  console.log("\n========================================================");
  console.log("     RUThere Cron Scrape & Event Ingestion Pipeline     ");
  console.log(`     Max Posts Per Account: ${maxPosts}                `);
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
      await sendToWebhook(records, maxPosts);
    } else {
      console.error("❌ Snapshot response was not an array of records:", records);
    }
    return;
  }

  // Case B: Trigger the cron scrape via /api/cron/trigger-scrape
  let triggerUrl = `${BASE_URL}/api/cron/trigger-scrape?max_posts=${maxPosts}`;
  if (limit) triggerUrl += `&limit=${limit}`;
  if (handle) triggerUrl += `&handle=${encodeURIComponent(handle)}`;

  console.log(`🚀 Triggering scrape cron job: ${triggerUrl}...`);
  const triggerRes = await fetch(triggerUrl);
  if (!triggerRes.ok) {
    const errText = await triggerRes.text();
    throw new Error(`Trigger failed HTTP ${triggerRes.status}: ${errText}`);
  }

  const triggerData = await triggerRes.json();
  console.log(`✅ ${triggerData.message}`);
  const snapshotIds = triggerData.snapshot_ids || [];

  if (snapshotIds.length === 0) {
    console.log("No batches were dispatched.");
    return;
  }

  console.log(`\n⏳ Polling ${snapshotIds.length} Bright Data snapshot(s) until ready...`);

  for (let i = 0; i < snapshotIds.length; i++) {
    const snapId = snapshotIds[i];
    console.log(`\n--- Monitoring Batch [${i + 1}/${snapshotIds.length}]: ${snapId} ---`);

    let isReady = false;
    let attempts = 0;
    while (!isReady && attempts < 40) {
      await sleep(5000);
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
    }

    if (isReady) {
      const records = await downloadSnapshot(snapId);
      await sendToWebhook(records, maxPosts);
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
