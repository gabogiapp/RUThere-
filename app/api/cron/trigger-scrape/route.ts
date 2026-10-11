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
    const clubs = await getClubs();
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
    const batches = BrightDataClient.chunkArray(clubUrls, 20);

    const host = req.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const secret = process.env.BRIGHTDATA_WEBHOOK_SECRET || "test_secret_token_123";
    const webhookUrl = `${protocol}://${host}/api/webhooks/brightdata?secret=${encodeURIComponent(secret)}`;

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
