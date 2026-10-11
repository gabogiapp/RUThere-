#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Determine root directory
const ROOT_DIR = process.cwd();

// Load environment variables
const BRIGHTDATA_API_KEY = process.env.BRIGHTDATA_API_KEY;
const BRIGHTDATA_DATASET_ID = process.env.BRIGHTDATA_DATASET_ID || "gd_l1vikfch901nx3by4";
const BRIGHTDATA_WEBHOOK_SECRET = process.env.BRIGHTDATA_WEBHOOK_SECRET || "test_secret_token_123";

/**
 * Detect local server port (checks 3000 then 3001)
 */
async function detectLocalServerUrl() {
  const candidatePorts = [3000, 3001, 3002];
  for (const port of candidatePorts) {
    try {
      const res = await fetch(`http://localhost:${port}/api/events`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        return `http://localhost:${port}`;
      }
    } catch (_) {}
  }
  return "http://localhost:3000";
}

/**
 * Normalizes input handle or URL into a standard Instagram URL
 */
function normalizeInstagramUrl(input) {
  let clean = input.trim();
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    return clean.replace(/\/+$/, "");
  }
  clean = clean.replace(/^@/, "");
  return `https://www.instagram.com/${clean}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const inputArg = args[0];

  console.log("\n========================================================");
  console.log("       RUThere Instagram Scraper & Gemini Vision CLI    ");
  console.log("========================================================\n");

  const localBaseUrl = await detectLocalServerUrl();
  console.log(`🌐 Target Local App: ${localBaseUrl}`);

  // Test if local server is active
  try {
    const ping = await fetch(`${localBaseUrl}/api/events`, { signal: AbortSignal.timeout(2000) });
    if (!ping.ok) {
      console.warn(`⚠️  Warning: ${localBaseUrl}/api/events returned HTTP ${ping.status}. Is 'npm run dev' running?`);
    }
  } catch (err) {
    console.warn(`⚠️  Warning: Could not connect to local server at ${localBaseUrl}.`);
    console.warn("   Make sure your dev server is running with 'npm run dev' in another terminal.\n");
  }

  // Handle fast sample test mode
  if (inputArg === "--sample" || inputArg === "sample" || inputArg === "--test") {
    console.log("🚀 Running Fast Test Mode using sample posts with flyer graphics...");
    const samplePath = path.join(ROOT_DIR, "data", "sample_club_events.json");
    if (!fs.existsSync(samplePath)) {
      console.error(`❌ Could not find sample fixture at ${samplePath}`);
      process.exit(1);
    }

    const sampleRecords = JSON.parse(fs.readFileSync(samplePath, "utf-8"));
    await sendRecordsToLocalApp(localBaseUrl, sampleRecords);
    return;
  }

  // Handle existing snapshot download mode
  if (inputArg === "--snapshot" && args[1]) {
    const snapshotId = args[1];
    console.log(`📥 Downloading existing Bright Data snapshot: ${snapshotId}...`);
    const records = await downloadSnapshot(snapshotId);
    await sendRecordsToLocalApp(localBaseUrl, records);
    return;
  }

  // Require target handle or url
  if (!inputArg) {
    console.log("Usage:");
    console.log("  npm run scrape <instagram_handle_or_url>");
    console.log("  npm run scrape -- --sample   (Instant test with flyer images)\n");
    console.log("Examples:");
    console.log("  npm run scrape ru_calisthenics");
    console.log("  npm run scrape @rutgers_usacs");
    console.log("  npm run scrape https://www.instagram.com/rutgers_ieee\n");
    process.exit(1);
  }

  if (!BRIGHTDATA_API_KEY) {
    console.error("❌ Error: BRIGHTDATA_API_KEY is not set in .env!");
    process.exit(1);
  }

  const targetUrl = normalizeInstagramUrl(inputArg);
  const handle = targetUrl.split("/").filter(Boolean).pop();
  console.log(`🎯 Target Club: @${handle}`);
  console.log(`🔗 Instagram URL: ${targetUrl}\n`);

  // Step 1: Trigger Bright Data scrape job
  console.log("⏳ [1/3] Sending scrape request to Bright Data API...");
  const triggerEndpoint = `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${BRIGHTDATA_DATASET_ID}&include_errors=true`;

  let snapshotId = "";
  try {
    const triggerRes = await fetch(triggerEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BRIGHTDATA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ url: targetUrl }]),
    });

    if (!triggerRes.ok) {
      const errText = await triggerRes.text();
      throw new Error(`Bright Data Trigger HTTP ${triggerRes.status}: ${errText}`);
    }

    const triggerData = await triggerRes.json();
    snapshotId = triggerData.snapshot_id;
    console.log(`✅ Job initiated! Snapshot ID: ${snapshotId}\n`);
  } catch (err) {
    console.error(`❌ Failed to trigger Bright Data: ${err.message}`);
    process.exit(1);
  }

  // Step 2: Poll progress until ready
  console.log("⏳ [2/3] Waiting for Bright Data cloud scraper to complete...");
  let isReady = false;
  let attempts = 0;
  const maxAttempts = 36; // 36 * 5s = 3 minutes

  while (!isReady && attempts < maxAttempts) {
    await sleep(5000);
    attempts++;

    try {
      const progressRes = await fetch(
        `https://api.brightdata.com/datasets/v3/progress/${snapshotId}`,
        {
          headers: { Authorization: `Bearer ${BRIGHTDATA_API_KEY}` },
        }
      );

      if (!progressRes.ok) {
        console.warn(`   Polling status HTTP ${progressRes.status}...`);
        continue;
      }

      const progressData = await progressRes.json();
      const status = progressData.status;
      const elapsed = Math.round((progressData.running_time || attempts * 5000) / 1000);

      process.stdout.write(`   Polling status: ${status} (elapsed: ${elapsed}s)\r`);

      if (status === "ready") {
        isReady = true;
        console.log(`\n✅ Scrape snapshot is READY! (${elapsed}s total collection time)\n`);
        break;
      } else if (status === "failed") {
        console.log(`\n❌ Scrape job marked as failed in Bright Data cloud.`);
        process.exit(1);
      }
    } catch (pollErr) {
      console.warn(`\n   Polling error: ${pollErr.message}`);
    }
  }

  if (!isReady) {
    console.error("\n❌ Scrape job timed out after 3 minutes.");
    console.log(`   You can re-check later using: node scripts/scrape.js --snapshot ${snapshotId}`);
    process.exit(1);
  }

  // Step 3: Download snapshot records
  console.log("📥 [3/3] Downloading snapshot records from Bright Data...");
  const records = await downloadSnapshot(snapshotId);

  if (!records || records.length === 0) {
    console.warn("⚠️  Bright Data returned 0 profile records for this target (page may be private or handle invalid).");
    return;
  }

  console.log(`✅ Downloaded ${records.length} profile record(s) from Bright Data!\n`);

  // Step 4: Send results to localhost app webhook for Gemini Vision processing
  await sendRecordsToLocalApp(localBaseUrl, records);
}

/**
 * Downloads snapshot JSON from Bright Data
 */
async function downloadSnapshot(snapshotId) {
  const downloadUrl = `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`;
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${BRIGHTDATA_API_KEY}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to download snapshot: HTTP ${res.status}`);
  }

  return await res.json();
}

/**
 * Sends records to local Next.js webhook and prints Gemini Vision results
 */
async function sendRecordsToLocalApp(localBaseUrl, records) {
  const hasAllFlag = process.argv.includes("--all") || process.argv.includes("--all-posts");
  const webhookUrl = `${localBaseUrl}/api/webhooks/brightdata?secret=${BRIGHTDATA_WEBHOOK_SECRET}${hasAllFlag ? "&all_posts=true" : ""}`;
  console.log(`📤 Sending records to local webhook: ${webhookUrl}`);
  console.log("🤖 Running Gemini Multimodal Vision extraction on post captions and flyer graphics...\n");

  const startTime = Date.now();
  let webhookResult;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(records),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Local webhook failed HTTP ${res.status}: ${errText}`);
    }

    webhookResult = await res.json();
  } catch (err) {
    console.error(`❌ Failed to send to local app: ${err.message}`);
    process.exit(1);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ Processing Complete in ${durationSec}s!`);
  console.log(`   Clubs updated: ${webhookResult.clubs_updated}`);
  console.log(`   Events extracted: ${webhookResult.events_extracted}\n`);

  // Query events API to show the newly extracted records
  try {
    const eventsRes = await fetch(`${localBaseUrl}/api/events`);
    if (eventsRes.ok) {
      const eventsData = await eventsRes.json();
      const events = eventsData.events || [];

      console.log("========================================================");
      console.log("       EXTRACTED EVENTS (with Gemini Vision)            ");
      console.log("========================================================");

      const recentEvents = events.slice(0, 3);
      recentEvents.forEach((ev, idx) => {
        console.log(`\n📌 Event [${idx + 1}]: ${ev.title}`);
        console.log(`   Club: ${ev.club_name} (${ev.club_handle})`);
        console.log(`   Campus: ${ev.campus}`);
        console.log(`   Category: ${ev.category}`);
        console.log(`   When: ${ev.date} @ ${ev.time}`);
        console.log(`   Location: ${ev.location}`);
        console.log(`   Origin Post Link: ${ev.post_url}`);
        if (ev.image_url) {
          console.log(`   Flyer Photo URL: ${ev.image_url.slice(0, 65)}...`);
        }
        if (ev.flyer_details) {
          console.log(`   ✨ Extracted Flyer Details: "${ev.flyer_details}"`);
        }
        if (ev.important_links && ev.important_links.length > 0) {
          console.log(`   Links: ${ev.important_links.join(", ")}`);
        }
      });
      console.log("\n========================================================");
      console.log(`🎉 Open your browser at ${localBaseUrl} and click "Live DB" to view!`);
      console.log("========================================================\n");
    }
  } catch (_) {}
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
