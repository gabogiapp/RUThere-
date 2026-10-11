import { NextRequest, NextResponse } from "next/server";
import { BrightDataClient } from "../../../lib/brightdata";
import { processAndStoreBrightData, getClubs, getEvents } from "../../../lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { urls, asyncOnly } = body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: "Please provide an array of instagram URLs in 'urls'" },
        { status: 400 }
      );
    }

    const client = new BrightDataClient();

    if (asyncOnly) {
      const { snapshot_id } = await client.trigger(urls);
      return NextResponse.json({
        status: "running",
        snapshot_id,
        message: `Job initiated asynchronously. Snapshot ID: ${snapshot_id}`,
      });
    }

    const result = await client.scrape(urls);

    if (result.status === "complete" && result.records) {
      const processed = await processAndStoreBrightData(result.records);
      const allClubs = await getClubs();
      const allEvents = await getEvents();

      return NextResponse.json({
        status: "complete",
        clubs_updated: processed.clubsUpdated,
        events_extracted: processed.eventsExtracted,
        clubs: allClubs,
        events: allEvents,
        raw_records_count: result.records.length,
      });
    }

    // 202 Accepted case
    return NextResponse.json(
      {
        status: "running",
        snapshot_id: result.snapshot_id,
        message: `Job running. Snapshot ID: ${result.snapshot_id}`,
      },
      { status: 202 }
    );
  } catch (error: any) {
    console.error("[/api/scrape] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to execute scrape" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const snapshot_id = searchParams.get("snapshot_id");

  if (!snapshot_id) {
    return NextResponse.json(
      { error: "Query parameter 'snapshot_id' is required" },
      { status: 400 }
    );
  }

  try {
    const client = new BrightDataClient();
    const progress = await client.checkProgress(snapshot_id);

    if (progress.status === "ready") {
      const records = await client.downloadSnapshot(snapshot_id);
      const processed = await processAndStoreBrightData(records);
      const clubs = await getClubs();
      const events = await getEvents();

      return NextResponse.json({
        status: "ready",
        clubs_updated: processed.clubsUpdated,
        events_extracted: processed.eventsExtracted,
        clubs,
        events,
        raw_records_count: records.length,
      });
    }

    return NextResponse.json({
      status: progress.status,
      snapshot_id,
      progress,
    });
  } catch (error: any) {
    console.error("[/api/scrape GET] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check snapshot" },
      { status: 500 }
    );
  }
}
