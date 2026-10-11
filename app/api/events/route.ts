import { NextRequest, NextResponse } from "next/server";
import { getEvents } from "../../../lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.toLowerCase();
    const club = searchParams.get("club")?.toLowerCase();

    let events = await getEvents();

    if (club) {
      events = events.filter((e) => e.club_handle.toLowerCase() === club);
    }

    if (query) {
      events = events.filter(
        (e) =>
          e.title.toLowerCase().includes(query) ||
          e.location.toLowerCase().includes(query) ||
          (e.description && e.description.toLowerCase().includes(query)) ||
          e.club_name.toLowerCase().includes(query)
      );
    }

    return NextResponse.json({ events, count: events.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
