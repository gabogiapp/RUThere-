import { NextRequest, NextResponse } from "next/server";
import { getClubs } from "../../../../lib/db";
import { BrightDataClient } from "../../../../lib/brightdata";

export async function GET(req: NextRequest) {
  return handleCronTrigger(req);
}

export async function POST(req: NextRequest) {
  return handleCronTrigger(req);
}

async function handleCronTrigger(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const handleParam = searchParams.get("handles") || searchParams.get("handle");
    const targetHandles = handleParam
      ? Array.from(
          new Set(
            handleParam
              .split(",")
              .map((h) => h.replace(/^@/, "").trim().toLowerCase())
              .filter(Boolean)
          )
        )
      : [];
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    let clubs = await getClubs();

    // If specific handle(s) requested, filter or synthesize clubs for them
    if (targetHandles.length > 0) {
      const handleSet = new Set(targetHandles);
      const matchedClubs = clubs.filter((c) => handleSet.has(c.handle.toLowerCase()));
      const matchedHandleSet = new Set(matchedClubs.map((c) => c.handle.toLowerCase()));

      // If any requested handles are not yet in DB, allow triggering directly with their Instagram URLs
      const syntheticClubs = targetHandles
        .filter((h) => !matchedHandleSet.has(h))
        .map((h) => ({
          handle: h,
          name: h,
          url: `https://www.instagram.com/${h}`,
        }));

      clubs = [...matchedClubs, ...syntheticClubs];
    } else if (limit && limit > 0) {
      clubs = clubs.slice(0, limit);
    }

    const clubUrls = clubs
      .map((c) => c.url || `https://www.instagram.com/${c.handle}`)
      .filter(Boolean);

    if (clubUrls.length === 0) {
      return NextResponse.json({
        message: "No clubs found to trigger",
        dispatched_batches: 0,
      });
    }

    const client = new BrightDataClient();
    const batchSize = parseInt(process.env.SCRAPE_BATCH_SIZE || "20", 10);
    const batches = BrightDataClient.chunkArray(clubUrls, batchSize);

    const maxPostsParam = searchParams.get("max_posts");
    const allPostsParam = searchParams.get("all_posts");
    const forceParam = searchParams.get("force");

    const host = req.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const secret = process.env.BRIGHTDATA_WEBHOOK_SECRET || "test_secret_token_123";
    let webhookUrl = `${protocol}://${host}/api/webhooks/brightdata?secret=${encodeURIComponent(secret)}`;
    if (allPostsParam === "true" || allPostsParam === "1") {
      webhookUrl += "&all_posts=true";
    } else if (maxPostsParam) {
      webhookUrl += `&max_posts=${encodeURIComponent(maxPostsParam)}`;
    }
    if (forceParam === "true" || forceParam === "1") {
      webhookUrl += "&force=true";
    }

    const snapshotIds: string[] = [];

    // Trigger each batch asynchronously
    for (const batch of batches) {
      const { snapshot_id } = await client.trigger(batch, webhookUrl);
      snapshotIds.push(snapshot_id);
    }

    // Return 200 immediately to avoid serverless function timeouts
    return NextResponse.json({
      success: true,
      message: `Triggered ${snapshotIds.length} batch(es) for ${clubUrls.length} clubs`,
      webhook_configured: webhookUrl,
      snapshot_ids: snapshotIds,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[/api/cron/trigger-scrape] Cron dispatch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to trigger cron scrape" },
      { status: 500 }
    );
  }
}
