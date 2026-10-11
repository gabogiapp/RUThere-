import { NextRequest, NextResponse } from "next/server";
import { resolveInstagramVideoUrl } from "@/lib/videoResolver";
import { getEvents, updateEventVideo } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const eventId = searchParams.get("eventId");

    if (!url) {
      return NextResponse.json(
        { success: false, error: "Missing 'url' query parameter" },
        { status: 400 }
      );
    }

    // 1. Check if event is already resolved with an MP4 in database
    const events = await getEvents();
    const cleanId = url.match(/instagram\.com\/(?:p|reel|tv)\/([^/?#&]+)/i)?.[1];
    const existing = events.find(
      (e) =>
        (eventId && (e.id === eventId || e.instagram_post_id === eventId)) ||
        (cleanId && (e.post_url?.includes(cleanId) || e.instagram_post_id?.includes(cleanId)))
    );

    if (
      existing &&
      existing.video_url &&
      (existing.video_url.includes(".mp4") || existing.video_url.includes("cdninstagram.com"))
    ) {
      return NextResponse.json({
        success: true,
        video_url: existing.video_url,
        cached: true,
      });
    }

    // 2. Resolve direct video stream URL
    const videoUrl = await resolveInstagramVideoUrl(url);

    if (!videoUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not resolve direct video stream from Instagram.",
        },
        { status: 404 }
      );
    }

    // 3. Cache video URL into database
    if (eventId) {
      await updateEventVideo(eventId, videoUrl);
    }

    return NextResponse.json({
      success: true,
      video_url: videoUrl,
      cached: false,
    });
  } catch (error: any) {
    console.error("[api/video] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process video resolution" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { url, eventId } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: "Missing 'url' in body" },
        { status: 400 }
      );
    }

    const events = await getEvents();
    const cleanId = url.match(/instagram\.com\/(?:p|reel|tv)\/([^/?#&]+)/i)?.[1];
    const existing = events.find(
      (e) =>
        (eventId && (e.id === eventId || e.instagram_post_id === eventId)) ||
        (cleanId && (e.post_url?.includes(cleanId) || e.instagram_post_id?.includes(cleanId)))
    );

    if (
      existing &&
      existing.video_url &&
      (existing.video_url.includes(".mp4") || existing.video_url.includes("cdninstagram.com"))
    ) {
      return NextResponse.json({
        success: true,
        video_url: existing.video_url,
        cached: true,
      });
    }

    const videoUrl = await resolveInstagramVideoUrl(url);

    if (!videoUrl) {
      return NextResponse.json(
        { success: false, error: "Could not resolve direct video stream." },
        { status: 404 }
      );
    }

    if (eventId) {
      await updateEventVideo(eventId, videoUrl);
    }

    return NextResponse.json({
      success: true,
      video_url: videoUrl,
      cached: false,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to resolve video" },
      { status: 500 }
    );
  }
}
