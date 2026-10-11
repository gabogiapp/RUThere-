#!/usr/bin/env node

/**
 * Bulk Club Importer & Interest Tagger
 *
 * Imports clubs from a JSON, CSV, or text file (e.g. message.txt) into Neon PostgreSQL.
 * Automatically generates two-tier taxonomy tags (interests + related_interests)
 * and assigns club categories using batch Gemini AI (with heuristic fallback).
 *
 * Usage:
 *   node scripts/import-clubs.js <file_path> [--batch-size=20] [--scrape]
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

  if (text.includes("ai") || text.includes("artificial intelligence") || text.includes("machine learning")) {
    category = "Tech & Coding";
    ["artificial intelligence", "machine learning", "deep learning", "neural networks"].forEach((t) => primary.add(t));
    ["computer science", "data science", "robotics", "algorithms"].forEach((t) => related.add(t));
  } else if (text.includes("cs") || text.includes("code") || text.includes("comp") || text.includes("hack") || text.includes("tech") || text.includes("developer") || text.includes("software")) {
    category = "Tech & Coding";
    ["coding", "computer science", "software engineering", "programming"].forEach((t) => primary.add(t));
    ["hackathons", "artificial intelligence", "web dev", "technology"].forEach((t) => related.add(t));
  } else if (text.includes("dance") || text.includes("art") || text.includes("music") || text.includes("theatre") || text.includes("photo") || text.includes("film") || text.includes("choir") || text.includes("band") || text.includes("acappella") || text.includes("radio") || text.includes("creative")) {
    category = "Arts & Culture";
    ["arts", "performance", "creativity", "entertainment"].forEach((t) => primary.add(t));
    ["performing arts", "music", "cultural expression", "campus life"].forEach((t) => related.add(t));
  } else if (text.includes("sport") || text.includes("rec") || text.includes("climb") || text.includes("game") || text.includes("esport") || text.includes("gym") || text.includes("fitness") || text.includes("athletic") || text.includes("martial") || text.includes("ski") || text.includes("valorant") || text.includes("billiards") || text.includes("poker")) {
    category = "Sports & Recreation";
    ["athletics", "recreation", "fitness", "team sports"].forEach((t) => primary.add(t));
    ["wellness", "active living", "student recreation", "community"].forEach((t) => related.add(t));
  } else if (text.includes("biz") || text.includes("business") || text.includes("finance") || text.includes("consult") || text.includes("invest") || text.includes("market") || text.includes("account") || text.includes("venture") || text.includes("actuarial")) {
    category = "Academic & Professional";
    ["business", "networking", "career development", "professional leadership"].forEach((t) => primary.add(t));
    ["finance", "consulting", "economics", "corporate careers"].forEach((t) => related.add(t));
  } else if (text.includes("medic") || text.includes("health") || text.includes("cancer") || text.includes("neuro") || text.includes("bio") || text.includes("chem") || text.includes("clinic") || text.includes("dent") || text.includes("pharm")) {
    category = "Academic & Professional";
    ["pre-health", "medicine", "healthcare", "scientific research"].forEach((t) => primary.add(t));
    ["biology", "public health", "clinical experience", "sciences"].forEach((t) => related.add(t));
  } else if (text.includes("asian") || text.includes("black") || text.includes("latin") || text.includes("arab") || text.includes("indian") || text.includes("korean") || text.includes("chinese") || text.includes("filipino") || text.includes("jewish") || text.includes("muslim") || text.includes("christian") || text.includes("caribbean") || text.includes("african") || text.includes("cultural") || text.includes("fellowship")) {
    category = "Cultural & Identity";
    ["cultural heritage", "diversity", "community building", "identity"].forEach((t) => primary.add(t));
    ["campus community", "traditions", "student alliance", "networking"].forEach((t) => related.add(t));
  } else if (text.includes("service") || text.includes("volunteer") || text.includes("charity") || text.includes("relief") || text.includes("blood") || text.includes("advocacy") || text.includes("amnesty") || text.includes("unicef")) {
    category = "Community Service";
    ["volunteering", "community service", "philanthropy", "social impact"].forEach((t) => primary.add(t));
    ["civic engagement", "humanitarian aid", "nonprofit outreach", "advocacy"].forEach((t) => related.add(t));
  } else {
    ["student life", "community", "campus involvement", "activities"].forEach((t) => primary.add(t));
    ["networking", "rutgers university", "student leadership", "events"].forEach((t) => related.add(t));
  }

  return { category, primary: Array.from(primary), related: Array.from(related) };
}

// Call Gemini API in batches of 15-20 clubs for fast, high-accuracy taxonomy tagging
async function tagClubBatchWithGemini(batch, apiKey) {
  if (!apiKey) {
    return batch.map((c) => ({
      ...c,
      ...inferHeuristics(c.name, c.handle),
    }));
  }

  const prompt = `You are an expert taxonomy tagger for Rutgers University student clubs.
For each club in the list below, assign:
- "category": MUST be one of ["Academic & Professional", "Tech & Coding", "Arts & Culture", "Sports & Recreation", "Social & Student Life", "Cultural & Identity", "Community Service"]
- "primary": array of 4-8 specific interests/activities of the club
- "related": array of 4-8 broader academic fields/parent domains

Input Clubs:
${JSON.stringify(batch.map((c) => ({ handle: c.handle, name: c.name })), null, 2)}

Respond ONLY with a valid JSON array of objects matching the input clubs order:
[
  {
    "handle": "...",
    "category": "...",
    "primary": ["..."],
    "related": ["..."]
  }
]
No markdown formatting or backticks.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleanJson = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsedArray = JSON.parse(cleanJson);

      if (Array.isArray(parsedArray)) {
        const resultMap = new Map();
        for (const item of parsedArray) {
          if (item && item.handle) {
            resultMap.set(item.handle.toLowerCase(), item);
          }
        }

        return batch.map((c) => {
          const match = resultMap.get(c.handle.toLowerCase());
          if (match && Array.isArray(match.primary) && Array.isArray(match.related)) {
            return {
              ...c,
              category: c.category || match.category || "Social & Student Life",
              primary: match.primary.map((s) => String(s).toLowerCase().trim()).filter(Boolean),
              related: match.related.map((s) => String(s).toLowerCase().trim()).filter(Boolean),
            };
          }
          return { ...c, ...inferHeuristics(c.name, c.handle) };
        });
      }
    }
  } catch (err) {
    console.warn(`   [Gemini Batch Warning] Falling back to heuristics for batch: ${err.message}`);
  }

  return batch.map((c) => ({
    ...c,
    ...inferHeuristics(c.name, c.handle),
  }));
}

// Parse input file (handles message.txt format, txt, json, csv)
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
    // Text format: supports lines like "Academic Team @ruacademics" or one handle per line
    const lines = content.split(/\r?\n/).filter(Boolean);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Handle specific known Rutgers anomalies in message.txt
      if (/First Love Rutgers Fellowship/i.test(line)) {
        clubs.push({ name: "First Love Rutgers Fellowship", handle: "firstloverutgers" });
        continue;
      }
      if (/League of Legends/i.test(line) && line.endsWith("@")) {
        clubs.push({ name: "League of Legends", handle: "rutgersleague" });
        continue;
      }
      if (/Legwork for Lungs/i.test(line)) {
        clubs.push({ name: "Legwork for Lungs", handle: "ru_legworkforlungs" });
        continue;
      }
      if (/OrphanSporks/i.test(line)) {
        clubs.push({ name: "OrphanSporks", handle: "rusporks" });
        continue;
      }

      if (line.includes("@")) {
        const parts = line.rsplit ? line.rsplit("@", 1) : [line.substring(0, line.lastIndexOf("@")), line.substring(line.lastIndexOf("@") + 1)];
        const name = parts[0].trim();
        let rawHandle = parts[1].trim().replace(/,/g, ".").replace(/\s+/g, "_").toLowerCase();
        let cleanHandle = rawHandle.replace(/[^a-z0-9._]/g, "");

        if (!cleanHandle) {
          cleanHandle = (name || "club").toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
        }

        clubs.push({
          handle: cleanHandle,
          name: name || formatClubNameFromHandle(cleanHandle),
        });
      } else {
        // Line without @ (e.g. "Magic the Gathering NO INSTAGRAM")
        const cleanName = line.replace(/\s*(NO\s+INSTA(GRAM)?|NO\s+CLUB)\s*$/i, "").trim();
        let slug = cleanName.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
        const handle = slug.startsWith("ru_") || slug.startsWith("rutgers") ? slug : `ru_${slug}`;

        clubs.push({
          handle,
          name: cleanName,
        });
      }
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

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!filePath) {
    console.log(`
Usage:
  node scripts/import-clubs.js <file_path> [--batch-size=20] [--scrape]

Examples:
  node scripts/import-clubs.js message.txt
  node scripts/import-clubs.js message.txt --scrape
`);
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const batchSizeArg = args.find((a) => a.startsWith("--batch-size="));
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split("=")[1], 10) : 20;
  const shouldScrape = args.includes("--scrape");

  const clubs = parseInputFile(resolvedPath);
  console.log(`\n========================================================`);
  console.log(`  Importing ${clubs.length} Clubs into Neon PostgreSQL  `);
  console.log(`  Batch Size: ${batchSize} clubs per Gemini AI request `);
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
    console.log("🤖 Classifying club categories and two-tier interests with Gemini AI in batches...\n");
  }

  const startTime = Date.now();
  const batches = chunkArray(clubs, batchSize);
  const taggedClubs = [];

  let batchCount = 0;
  for (const batch of batches) {
    batchCount++;
    const taggedBatch = await tagClubBatchWithGemini(batch, apiKey);
    for (const c of taggedBatch) {
      taggedClubs.push({
        ...c,
        interests: c.primary,
        related_interests: c.related,
        url: `https://www.instagram.com/${c.handle}`,
      });
    }

    const completed = taggedClubs.length;
    const progress = Math.round((completed / clubs.length) * 100);
    process.stdout.write(`   Batch [${batchCount}/${batches.length}] (${progress}%) Processed ${completed}/${clubs.length} clubs\r`);

    // Pacer: space requests according to GEMINI_RPM (4.3s for 14 RPM free tier, ~100ms for paid tier)
    if (batchCount < batches.length && apiKey) {
      const rpm = parseInt(process.env.GEMINI_RPM || "14", 10);
      const delayMs = rpm > 50 ? 100 : 4300;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

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
