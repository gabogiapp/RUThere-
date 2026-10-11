import { NextRequest, NextResponse } from "next/server";
import { getClubs, upsertClub } from "../../../lib/db";

export async function GET() {
  try {
    const clubs = await getClubs();
    return NextResponse.json({ clubs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { handle, name, category, url } = body;

    if (!handle) {
      return NextResponse.json({ error: "Handle is required" }, { status: 400 });
    }

    const cleanHandle = handle.replace(/^@/, "").trim();
    const club = await upsertClub({
      handle: cleanHandle,
      name: name || cleanHandle,
      category: category || "General",
      url: url || `https://www.instagram.com/${cleanHandle}`,
    });

    return NextResponse.json({ success: true, club });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
