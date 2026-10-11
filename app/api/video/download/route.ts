import { NextRequest, NextResponse } from "next/server";
import { resolveInstagramVideoUrl } from "@/lib/videoResolver";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let targetUrl = searchParams.get("url");
    const rawFilename = searchParams.get("filename") || "event-video.mp4";
    const filename = rawFilename.endsWith(".mp4") ? rawFilename : `${rawFilename}.mp4`;

    if (!targetUrl) {
      return NextResponse.json(
        { error: "Missing 'url' parameter" },
        { status: 400 }
      );
    }

    // Check if URL is already a direct MP4 or in database
    if (!targetUrl.includes(".mp4") && targetUrl.includes("instagram.com")) {
      const { getEvents } = await import("@/lib/db");
      const events = await getEvents();
      const cleanId = targetUrl.match(/instagram\.com\/(?:p|reel|tv)\/([^/?#&]+)/i)?.[1];
      const existing = events.find(
        (e) => cleanId && (e.post_url?.includes(cleanId) || e.instagram_post_id?.includes(cleanId))
      );

      if (
        existing &&
        existing.video_url &&
        (existing.video_url.includes(".mp4") || existing.video_url.includes("cdninstagram.com"))
      ) {
        targetUrl = existing.video_url;
      } else {
        const resolved = await resolveInstagramVideoUrl(targetUrl);
        if (!resolved) {
          return NextResponse.json(
            { error: "Unable to extract video stream from Instagram link" },
            { status: 404 }
          );
        }
        targetUrl = resolved;
      }
    }

    // Stream download from CDN
    const videoRes = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!videoRes.ok || !videoRes.body) {
      return NextResponse.json(
        { error: `Failed to fetch video stream (HTTP ${videoRes.status})` },
        { status: 502 }
      );
    }

    const headers = new Headers();
    headers.set("Content-Type", "video/mp4");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(filename)}"`
    );
    const contentLength = videoRes.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new Response(videoRes.body, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error("[api/video/download] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to download video" },
      { status: 500 }
    );
  }
}
