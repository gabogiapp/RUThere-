import { NextRequest, NextResponse } from "next/server";
import { getClubs, upsertClub, processAndStoreBrightData } from "../../../lib/db";
import { BrightDataClient } from "../../../lib/brightdata";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filterHandle = searchParams.get("handle")?.toLowerCase().replace(/^@/, "");

    const clubs = await getClubs();
    if (filterHandle) {
      const match = clubs.find((c) => c.handle.toLowerCase() === filterHandle);
      return NextResponse.json({ club: match || null });
    }

    return NextResponse.json({ clubs, count: clubs.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let handle = "";
    let name = "";
    let category = "General";
    let url = "";
    let scrape = false;

    // 1. Read query parameters (e.g. /api/clubs?handle=rutgers_ieee&scrape=true)
    const { searchParams } = new URL(req.url);
    if (searchParams.get("handle")) {
      handle = searchParams.get("handle") || "";
      name = searchParams.get("name") || "";
      category = searchParams.get("category") || "General";
      url = searchParams.get("url") || "";
      scrape = searchParams.get("scrape") === "true";
    }

    // 2. Read JSON body if present
    try {
      const body = await req.json();
      if (body.handle) handle = body.handle;
      if (body.name) name = body.name;
      if (body.category) category = body.category;
      if (body.url) url = body.url;
      if (body.scrape !== undefined) scrape = Boolean(body.scrape);
    } catch (_) {
      // Body may be empty if using query params
    }

    if (!handle) {
      return NextResponse.json(
        {
          error: "Handle is required.",
          example_usage: {
            method: "POST",
            url: "/api/clubs",
            body: {
              handle: "rutgers_ieee",
              name: "Rutgers IEEE",
              category: "Engineering & Tech",
              scrape: false,
            },
            query_param_alternative: "/api/clubs?handle=rutgers_ieee&name=Rutgers+IEEE",
          },
        },
        { status: 400 }
      );
    }

    const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();
    const clubUrl = url || `https://www.instagram.com/${cleanHandle}`;

    // Mode A: Synchronous scrape & add (queries Bright Data + Gemini immediately)
    if (scrape) {
      console.log(`[/api/clubs] Sync scrape requested for @${cleanHandle}...`);
      const client = new BrightDataClient();
      const scrapeRes = await client.scrape([clubUrl]);

      if (scrapeRes.status === "complete" && scrapeRes.records && scrapeRes.records.length > 0) {
        const processed = await processAndStoreBrightData(scrapeRes.records);
        const clubs = await getClubs();
        const updatedClub = clubs.find((c) => c.handle.toLowerCase() === cleanHandle);

        return NextResponse.json({
          success: true,
          mode: "sync_scrape",
          message: `Scraped and saved @${cleanHandle} with ${processed.eventsExtracted} events extracted via Gemini.`,
          club: updatedClub,
          events_extracted: processed.eventsExtracted,
        });
      } else {
        // If Bright Data responded 202 Accepted, save club basic record and notify
        const club = await upsertClub({
          handle: cleanHandle,
          name: name || cleanHandle,
          category,
          url: clubUrl,
        });
        return NextResponse.json({
          success: true,
          mode: "async_job_started",
          message: `Club @${cleanHandle} saved. Scraping snapshot running in background.`,
          club,
          snapshot_id: scrapeRes.snapshot_id,
        });
      }
    }

    // Mode B: Fast manual sync add
    const club = await upsertClub({
      handle: cleanHandle,
      name: name || cleanHandle,
      category,
      url: clubUrl,
    });

    return NextResponse.json({
      success: true,
      mode: "sync_manual",
      message: `Club @${cleanHandle} added successfully.`,
      club,
    });
  } catch (error: any) {
    console.error("[/api/clubs POST] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
