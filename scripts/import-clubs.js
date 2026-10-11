#!/usr/bin/env node

/**
 * Bulk Club Importer & Interest Tagger
 *
 * Imports clubs from a JSON, CSV, or plain text file into Neon PostgreSQL.
 * Automatically generates two-tier taxonomy tags (interests + related_interests)
 * and assigns club categories via Gemini AI (with heuristic fallback).
 *
 * Usage:
 *   node scripts/import-clubs.js <file_path> [--concurrency=5] [--scrape]
 *
 * Supported file formats:
 *   - Plain text (.txt): One handle per line (e.g. @rutgers_usacs or rutgers_usacs)
 *   - JSON (.json): Array of strings (["handle1", "handle2"]) or array of objects:
 *     [{"handle": "rutgers_ai", "name": "Rutgers AI", "category": "Tech & Coding"}]
 *   - CSV (.csv): Headers like `handle,name,category`
 */

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

// Auto-derive human readable club name from handle
function formatClubNameFromHandle(handle) {
  const clean = handle.replace(/^@/, "").replace(/^(rutgers|ru)_?/i, "Rutgers ").trim();
  return clean
    .split(/[_\-\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// Heuristic fallback for category and interest classification
function inferHeuristics(name, handle) {
  const text = `${name} ${handle}`.toLowerCase();
  const primary = new Set();
  const related = new Set();
  let category = "Social & Student Life";

  if (text.includes("ai") || text.includes("artificial intelligence")) {
    category = "Tech & Coding";
    ["artificial intelligence", "machine learning", "deep learning"].forEach((t) => primary.add(t));
    ["computer science", "data science", "robotics"].forEach((t) => related.add(t));
  } else if (text.includes("cs") || text.includes("code") || text.includes("comp") || text.includes("hack") || text.includes("tech")) {
    category = "Tech & Coding";
    ["coding", "computer science", "software engineering"].forEach((t) => primary.add(t));
    ["hackathons", "artificial intelligence", "web dev", "tech"].forEach((t) => related.add(t));
  } else if (text.includes("sport") || text.includes("rec") || text.includes("climb") || text.includes("game") || text.includes("esport") || text.includes("gym")) {
    category = "Sports & Recreation";
    ["athletics", "recreation", "fitness"].forEach((t) => primary.add(t));
    ["wellness", "student life", "community"].forEach((t) => related.add(t));
  } else if (text.includes("dance") || text.includes("art") || text.includes("music") || text.includes("theatre") || text.includes("photo")) {
    category = "Arts & Culture";
    ["arts", "creativity", "culture"].forEach((t) => primary.add(t));
    ["campus life", "performance", "student events"].forEach((t) => related.add(t));
  } else if (text.includes("biz") || text.includes("business") || text.includes("finance") || text.includes("consult") || text.includes("invest")) {
    category = "Academic & Professional";
    ["business", "networking", "career development"].forEach((t) => primary.add(t));
    ["finance", "consulting", "professional development"].forEach((t) => related.add(t));
  } else {
    ["student life", "community", "campus events"].forEach((t) => primary.add(t));
    ["networking", "rutgers", "activities"].forEach((t) => related.add(t));
  }

  return { category, primary: Array.from(primary), related: Array.from(related) };
}

// Call Gemini API for high-precision taxonomy classification
async function tagClubWithGemini(club, apiKey) {
  if (!apiKey) {
    return inferHeuristics(club.name, club.handle);
  }

  const prompt = `You are an expert taxonomy tagger for Rutgers University student clubs.
Given this club, assign its category and generate two tiers of search interest tags:
Category MUST be one of:
- "Academic & Professional"
- "Tech & Coding"
- "Arts & Culture"
- "Sports & Recreation"
- "Social & Student Life"
- "Cultural & Identity"
- "Community Service"

Tiers:
1. "primary": 4 to 8 core specific interests and direct activities of the club.
2. "related": 4 to 8 broader academic fields, parent domains, or sub-disciplines related to this club.

Club Name: ${club.name}
Handle: @${club.handle}

Respond ONLY with a valid JSON object in this exact shape:
{
  "category": "Tech & Coding",
  "primary": ["topic 1", "topic 2"],
  "related": ["related topic 1", "related topic 2"]
}
No markdown backticks.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
        }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleanJson = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      if (parsed && Array.isArray(parsed.primary) && Array.isArray(parsed.related)) {
        return {
          category: parsed.category || "Social & Student Life",
          primary: parsed.primary.map((s) => String(s).toLowerCase().trim()).filter(Boolean),
          related: parsed.related.map((s) => String(s).toLowerCase().trim()).filter(Boolean),
        };
      }
    }
  } catch (err) {
    // Fallback to heuristic
  }

  return inferHeuristics(club.name, club.handle);
}

// Parse input file (txt, json, csv)
function parseInputFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8").trim();
  const ext = path.extname(filePath).toLowerCase();

  const clubs = [];

  if (ext === ".json") {
    const data = JSON.parse(content);
    for (const item of data) {
      if (typeof item === "string") {
        const cleanHandle = item.replace(/^@/, "").trim().toLowerCase();
        clubs.push({ handle: cleanHandle, name: formatClubNameFromHandle(cleanHandle) });
      } else if (typeof item === "object" && item.handle) {
        const cleanHandle = item.handle.replace(/^@/, "").trim().toLowerCase();
        clubs.push({
          handle: cleanHandle,
          name: item.name || formatClubNameFromHandle(cleanHandle),
          category: item.category,
        });
      }
    }
  } else if (ext === ".csv") {
    const lines = content.split(/\r?\n/).filter(Boolean);
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const handleIdx = headers.findIndex((h) => h === "handle" || h === "instagram");
    const nameIdx = headers.findIndex((h) => h === "name" || h === "club");
    const catIdx = headers.findIndex((h) => h === "category");

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",").map((p) => p.trim());
      const rawHandle = parts[handleIdx >= 0 ? handleIdx : 0];
      if (!rawHandle) continue;
      const cleanHandle = rawHandle.replace(/^@/, "").replace(/https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/+$/, "").trim().toLowerCase();
      const name = nameIdx >= 0 && parts[nameIdx] ? parts[nameIdx] : formatClubNameFromHandle(cleanHandle);
      const category = catIdx >= 0 ? parts[catIdx] : undefined;
      clubs.push({ handle: cleanHandle, name, category });
    }
  } else {
    // Plain text: one handle per line
    const lines = content.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const cleanHandle = line.replace(/^@/, "").replace(/https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/+$/, "").trim().toLowerCase();
      if (!cleanHandle) continue;
      clubs.push({ handle: cleanHandle, name: formatClubNameFromHandle(cleanHandle) });
    }
  }

  // Deduplicate by handle
  const seen = new Set();
  return clubs.filter((c) => {
    if (seen.has(c.handle)) return false;
    seen.add(c.handle);
    return true;
  });
}

// Concurrency pool helper
async function mapConcurrent(items, concurrency, fn) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await fn(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!filePath) {
    console.log(`
Usage:
  node scripts/import-clubs.js <file_path> [--concurrency=10] [--scrape]

Examples:
  node scripts/import-clubs.js handles.txt
  node scripts/import-clubs.js clubs.json --concurrency=10
  node scripts/import-clubs.js clubs.csv --scrape
`);
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const concurrencyArg = args.find((a) => a.startsWith("--concurrency="));
  const concurrency = concurrencyArg ? parseInt(concurrencyArg.split("=")[1], 10) : 10;
  const shouldScrape = args.includes("--scrape");

  const clubs = parseInputFile(resolvedPath);
  console.log(`\n========================================================`);
  console.log(`  Importing ${clubs.length} Clubs into Neon PostgreSQL  `);
  console.log(`  Concurrency: ${concurrency} parallel requests         `);
  console.log(`========================================================\n`);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ DATABASE_URL is missing in .env");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("⚠️  GEMINI_API_KEY not found in .env. Using fast heuristic interest tagger.\n");
  } else {
    console.log("🤖 Classifying club categories and two-tier interests using Gemini AI...\n");
  }

  const startTime = Date.now();
  let completed = 0;

  // Process and tag clubs concurrently
  const taggedClubs = await mapConcurrent(clubs, concurrency, async (club, idx) => {
    const taxonomy = await tagClubWithGemini(club, apiKey);
    completed++;
    const progress = Math.round((completed / clubs.length) * 100);
    process.stdout.write(`   [${completed}/${clubs.length}] (${progress}%) Tagged @${club.handle} -> [${taxonomy.primary.slice(0, 3).join(", ")}]\r`);
    return {
      ...club,
      category: club.category || taxonomy.category,
      interests: taxonomy.primary,
      related_interests: taxonomy.related,
      url: `https://www.instagram.com/${club.handle}`,
    };
  });

  console.log(`\n\n💾 Upserting ${taggedClubs.length} clubs into Neon PostgreSQL...`);

  // Batch insert into database
  const client = await pool.connect();
  let inserted = 0;
  try {
    await client.query("BEGIN");
    for (const c of taggedClubs) {
      await client.query(
        `INSERT INTO clubs (handle, name, category, url, interests, related_interests)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (handle) DO UPDATE SET
           name = EXCLUDED.name,
           category = COALESCE(clubs.category, EXCLUDED.category),
           url = EXCLUDED.url,
           interests = COALESCE(EXCLUDED.interests, clubs.interests),
           related_interests = COALESCE(EXCLUDED.related_interests, clubs.related_interests);`,
        [c.handle, c.name, c.category, c.url, c.interests, c.related_interests]
      );
      inserted++;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Database insertion failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Done! Successfully imported & tagged ${inserted} clubs in ${durationSec}s!`);

  if (shouldScrape) {
    console.log(`\n🚀 Triggering Bright Data scrape for all ${inserted} clubs via cron trigger API...`);
    try {
      const res = await fetch("http://localhost:3000/api/cron/trigger-scrape", { method: "POST" });
      const data = await res.json();
      console.log(`   Response: ${data.message || JSON.stringify(data)}`);
    } catch (e) {
      console.warn("   Could not trigger cron scraper:", e.message);
    }
  }

  console.log("========================================================\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
