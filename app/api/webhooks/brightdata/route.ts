import { NextRequest, NextResponse } from "next/server";
import { processAndStoreBrightData } from "../../../../lib/db";
import { BrightDataProfileRecord } from "../../../../lib/types";
import { BrightDataClient } from "../../../../lib/brightdata";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const secretQuery = searchParams.get("secret");
    const authHeader = req.headers.get("authorization");

    const expectedSecret = process.env.BRIGHTDATA_WEBHOOK_SECRET || "test_secret_token_123";

    // Validate security secret if configured
    const isAuthorized =
      !expectedSecret ||
      secretQuery === expectedSecret ||
      (authHeader && authHeader.replace(/^Bearer\s+/i, "") === expectedSecret);

    if (!isAuthorized) {
      console.warn("[/api/webhooks/brightdata] Unauthorized webhook delivery attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json();
    console.log("[/api/webhooks/brightdata] Webhook received payload:", Array.isArray(payload) ? `${payload.length} items` : typeof payload);

    let records: BrightDataProfileRecord[] = [];
    if (Array.isArray(payload)) {
      records = payload;
    } else if (payload && (payload.snapshot_id || payload.id)) {
      const snapId = payload.snapshot_id || payload.id;
      console.log(`[/api/webhooks/brightdata] Snapshot notification received: ${snapId}. Fetching snapshot data...`);
      const client = new BrightDataClient();
      records = await client.downloadSnapshot(snapId);
    } else if (payload && (payload.account || payload.url)) {
      records = [payload];
    }

    const result = await processAndStoreBrightData(records);

    console.log(`[/api/webhooks/brightdata] Ingestion success: ${result.clubsUpdated} clubs updated, ${result.eventsExtracted} events extracted.`);

    return NextResponse.json({
      success: true,
      message: "Webhook processed successfully",
      clubs_updated: result.clubsUpdated,
      events_extracted: result.eventsExtracted,
    });
  } catch (error: any) {
    console.error("[/api/webhooks/brightdata] Error processing webhook:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
