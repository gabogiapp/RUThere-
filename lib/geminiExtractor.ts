import fs from "fs";
import path from "path";
import { ExtractedEventSchema } from "./types";
import { extractEventDetails as fallbackExtractor } from "./eventExtractor";

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface PostExtractionInput {
  post_id: string;
  caption: string;
  image_url?: string;
  video_url?: string;
  post_url?: string;
  club_name?: string;
  club_handle?: string;
  club_category?: string;
}

/**
 * Load example.json schema
 */
export function getExampleSchema() {
  try {
    const schemaPath = path.join(process.cwd(), "example.json");
    if (fs.existsSync(schemaPath)) {
      return JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    }
  } catch (e) {
    console.warn("[GeminiExtractor] Could not read example.json directly, using fallback schema", e);
  }

  return {
    type: "object",
    properties: {
      is_event: {
        type: "boolean",
        description: "True if the post announces an upcoming event, false otherwise.",
      },
      title: { type: "string", description: "Title of event" },
      date: { type: "string", description: "Day and date (e.g. 'Wednesday, Oct 24')." },
      time: { type: "string", description: "Start time or time window (e.g. '8:00 PM - 9:30 PM')." },
      location: { type: "string", description: "Building, room, or specific venue." },
      campus: {
        type: "string",
        enum: ["Busch", "College Ave", "Livingston", "Cook/Doug", "Virtual / Online"],
      },
      category: {
        type: "string",
        enum: [
          "Tech & Coding",
          "Engineering",
          "Academic & Professional",
          "Cultural & Identity",
          "Social & Student Life",
          "Arts & Media",
          "Sports & Recreation",
          "Community & Service",
        ],
      },
      important_links: {
        type: "array",
        items: { type: "string" },
      },
      post_url: { type: "string" },
      image_url: { type: "string" },
      video_url: { type: "string" },
      flyer_details: {
        type: "string",
        description: "Key information visible directly on the flyer graphic (speakers, food, room, sponsors, instructions).",
      },
      has_free_food: {
        type: "boolean",
        description: "True if free food, pizza, snacks, refreshments, boba, dinner, lunch, or drinks are provided or advertised for this event (look at caption text or flyer graphic image). False otherwise.",
      },
    },
    required: ["is_event", "title", "date", "time", "location", "campus", "category"],
  };
}

/**
 * Fetch image buffer from URL with a timeout and convert to base64 inlineData
 */
async function fetchImageBufferAndMime(
  imageUrl?: string
): Promise<{ data: string; mimeType: string } | null> {
  if (!imageUrl || !imageUrl.trim().startsWith("http")) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);

    const res = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[GeminiExtractor] Image fetch HTTP ${res.status} from ${imageUrl.slice(0, 80)}...`);
      return null;
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const mimeType = contentType.split(";")[0].trim();
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Skip excessively large images (> 12MB)
    if (buffer.length === 0 || buffer.length > 12 * 1024 * 1024) {
      return null;
    }

    return {
      data: buffer.toString("base64"),
      mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg",
    };
  } catch (err: any) {
    console.warn(`[GeminiExtractor] Could not download image (${err.message || err}), continuing with text caption.`);
    return null;
  }
}

/**
 * Build rich prompt context with Rutgers specific taxonomy
 */
function buildExtractionPrompt(input: {
  caption: string;
  clubName?: string;
  clubHandle?: string;
  clubCategory?: string;
  postUrl?: string;
  hasImage?: boolean;
}): string {
  return `You are a high-precision multimodal event extraction engine for Rutgers University student clubs.
Analyze the provided Instagram post flyer image (if attached) AND post caption text to extract event details.
Strictly adhere to the JSON schema mirroring example.json.

Club Information:
- Club Name: ${input.clubName || "Rutgers University Club"}
- Club Handle: ${input.clubHandle || "@rutgersclubs"}
${input.clubCategory ? `- Club Category Hint: ${input.clubCategory}` : ""}
${input.postUrl ? `- Origin Post URL: ${input.postUrl}` : ""}

Post Caption:
"""
${input.caption || "(No caption text - rely on flyer image graphic)"}
"""

Rutgers Campus Classification Rules:
- "Busch": Busch Student Center (BSC), SERC, ARC, Allison Road Classrooms, CoRE, Engineering Building, Life Sciences, Physics Lecture Hall, Werblin Rec Center, Hill Center, Sonny Werblin.
- "College Ave": College Avenue Student Center (CASC), Student Activities Center (SAC), Scott Hall, Academic Building, Vorhees Hall, The Yard, College Ave Gym (CAG), Murray Hall, Alexander Library, Morrell Street.
- "Livingston": Livingston Student Center (LSC), Tillett Hall, Beck Hall, Livingston Plaza, RAC / Jersey Mike's Arena, Carr Library, Rutgers Business School (RBS), The Shed, Shed, the shed.
- "Cook/Doug": Douglass Student Center (DSC), Cook Student Center, Loree, Passion Puddle, Red Oak Lane, Kathleen W. Ludwig Center, Trayes Hall, Cook Farm, Hickman Hall.
- "Virtual / Online": Zoom, Discord, Google Meet, Microsoft Teams, Twitch, YouTube livestream, online webinars.
If the location does not explicitly mention a campus, infer from the building or club affiliation. If completely ambiguous, choose "College Ave".

Event Category Classification Rules:
- "Tech & Coding": Computer science, software development, web development, algorithms, AI, machine learning, USACS, ACM, Blueprint, hackathons, robotics coding.
- "Engineering": IEEE, Rutgers Formula Racing, Society of Women Engineers (SWE), rocketry, mechanical/electrical/civil/biomedical engineering, hardware.
- "Academic & Professional": Rutgers Student Assembly (USG), student government, pre-med (AED), ALPFA, business, finance, pre-law, consulting, career workshops, research conferences, debate.
- "Cultural & Identity": Asian Student Council, cultural heritage clubs, affinity groups, cultural galas, diversity organizations.
- "Social & Student Life": RUPA (Rutgers University Programming Association), outdoor movie nights, trivia nights, social mixers, kickoffs, tailgates, game nights, general student body socials.
- "Arts & Media": Creative writing, Salsa / dance clubs, Rutgers Film Society, photography, visual arts, music, theater.
- "Sports & Recreation": Calisthenics Club, Club Tennis, Running Club, fitness workouts, wrestling, intramural sports, tournaments, sets & reps competitions.
- "Community & Service": Environmental involvement, volunteering, charity, fundraisers, food drives, community cleanups.

Flyer Image Instructions:
${input.hasImage
      ? "Look carefully at the attached flyer image. Read all text printed on the flyer (headline, date, time, room number, free food, guest speakers, QR codes/links). Populate 'flyer_details' with all valuable supplementary details visible in the graphic."
      : "No image available; extract strictly from caption text. Leave 'flyer_details' empty or summarize caption perks."
    }

Free Food Detection:
- Carefully inspect both the caption text AND the attached flyer image graphic (or video).
- If the post or flyer mentions or promises free food, pizza, snacks, refreshments, boba, drinks, dinner, lunch, catered food, treats, or "food provided", and you are confident free food/refreshments are available, set "has_free_food": true.
- If no free food or refreshments are offered, set "has_free_food": false.

If the post is NOT announcing an upcoming event, meeting, or activity, set "is_event": false.`;
}

/**
 * Single post extraction using Gemini Multimodal API
 */
export async function extractEventWithGemini(
  caption: string,
  options?: {
    imageUrl?: string;
    videoUrl?: string;
    postUrl?: string;
    clubName?: string;
    clubHandle?: string;
    clubCategory?: string;
    apiKey?: string;
  }
): Promise<ExtractedEventSchema & { extraction_source: "gemini" | "heuristic" }> {
  const key = options?.apiKey || process.env.GEMINI_API_KEY;
  const clubInfo = {
    name: options?.clubName,
    handle: options?.clubHandle,
    category: options?.clubCategory,
  };

  // If no caption and no image, return empty non-event
  if ((!caption || !caption.trim()) && !options?.imageUrl && !options?.videoUrl) {
    const fb = fallbackExtractor("", clubInfo);
    return { ...fb, post_url: options?.postUrl, image_url: options?.imageUrl, video_url: options?.videoUrl, extraction_source: "heuristic" };
  }

  if (!key) {
    console.warn("[GeminiExtractor] No GEMINI_API_KEY found, using heuristic parser.");
    const fb = fallbackExtractor(caption, clubInfo);
    return {
      ...fb,
      post_url: options?.postUrl,
      image_url: options?.imageUrl,
      video_url: options?.videoUrl,
      extraction_source: "heuristic",
    };
  }

  const endpoint = `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const exampleSchema = getExampleSchema();

  // Fetch flyer image if present
  const imageData = options?.imageUrl ? await fetchImageBufferAndMime(options.imageUrl) : null;

  const promptText = buildExtractionPrompt({
    caption,
    clubName: options?.clubName,
    clubHandle: options?.clubHandle,
    clubCategory: options?.clubCategory,
    postUrl: options?.postUrl,
    hasImage: Boolean(imageData),
  });

  const parts: any[] = [{ text: promptText }];
  if (imageData) {
    parts.push({
      inlineData: {
        mimeType: imageData.mimeType,
        data: imageData.data,
      },
    });
  }

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: exampleSchema,
    },
  };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[GeminiExtractor] Gemini API error (${res.status}): ${errText}`);
      const fb = fallbackExtractor(caption, clubInfo);
      return {
        ...fb,
        post_url: options?.postUrl,
        image_url: options?.imageUrl,
        extraction_source: "heuristic",
      };
    }

    const data = await res.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      const fb = fallbackExtractor(caption, clubInfo);
      return {
        ...fb,
        post_url: options?.postUrl,
        image_url: options?.imageUrl,
        video_url: options?.videoUrl,
        extraction_source: "heuristic",
      };
    }

    const parsed = JSON.parse(candidateText) as ExtractedEventSchema;
    return {
      is_event: Boolean(parsed.is_event),
      title: parsed.title || "",
      date: parsed.date || "",
      time: parsed.time || "",
      location: parsed.location || "",
      campus: parsed.campus || "College Ave",
      category: parsed.category || options?.clubCategory || "Social & Student Life",
      important_links: Array.isArray(parsed.important_links)
        ? parsed.important_links
        : options?.postUrl
          ? [options.postUrl]
          : [],
      post_url: options?.postUrl || parsed.post_url,
      image_url: options?.imageUrl || parsed.image_url,
      video_url: options?.videoUrl || parsed.video_url,
      flyer_details: parsed.flyer_details || "",
      extraction_source: "gemini",
    };
  } catch (error) {
    console.error("[GeminiExtractor] Error calling Gemini API:", error);
    const fb = fallbackExtractor(caption, clubInfo);
    return {
      ...fb,
      post_url: options?.postUrl,
      image_url: options?.imageUrl,
      video_url: options?.videoUrl,
      extraction_source: "heuristic",
    };
  }
}

/**
 * Concurrent Batch Extraction:
 * Processes posts concurrently in chunks of 3 for fast execution,
 * passing each post's caption and flyer image to Gemini Multimodal Vision.
 */
export async function extractEventsBatchWithGemini(
  posts: PostExtractionInput[],
  apiKey?: string
): Promise<Map<string, ExtractedEventSchema & { extraction_source: "gemini" | "heuristic" }>> {
  const resultMap = new Map<string, ExtractedEventSchema & { extraction_source: "gemini" | "heuristic" }>();
  const key = apiKey || process.env.GEMINI_API_KEY;

  if (!posts || posts.length === 0) {
    return resultMap;
  }

  // If no Gemini API key, use fallback extractor for all
  if (!key) {
    console.warn("[GeminiExtractor] No GEMINI_API_KEY found, using fallback heuristic extractor.");
    for (const post of posts) {
      const fb = fallbackExtractor(post.caption, {
        name: post.club_name,
        handle: post.club_handle,
        category: post.club_category,
      });
      resultMap.set(post.post_id, {
        ...fb,
        post_url: post.post_url,
        image_url: post.image_url,
        video_url: post.video_url,
        extraction_source: "heuristic",
      });
    }
    return resultMap;
  }

  // Process posts with a concurrency limit of 3
  const CONCURRENCY = 3;
  for (let i = 0; i < posts.length; i += CONCURRENCY) {
    const chunk = posts.slice(i, i + CONCURRENCY);
    const promises = chunk.map(async (post) => {
      try {
        const result = await extractEventWithGemini(post.caption, {
          imageUrl: post.image_url,
          videoUrl: post.video_url,
          postUrl: post.post_url,
          clubName: post.club_name,
          clubHandle: post.club_handle,
          clubCategory: post.club_category,
          apiKey: key,
        });
        resultMap.set(post.post_id, result);
      } catch (err) {
        console.warn(`[GeminiExtractor] Extraction failed for post ${post.post_id}, using heuristic:`, err);
        const fb = fallbackExtractor(post.caption, {
          name: post.club_name,
          handle: post.club_handle,
          category: post.club_category,
        });
        resultMap.set(post.post_id, {
          ...fb,
          post_url: post.post_url,
          image_url: post.image_url,
          video_url: post.video_url,
          extraction_source: "heuristic",
        });
      }
    });

    await Promise.all(promises);
  }

  return resultMap;
}

export interface ClubTaxonomyResult {
  primary: string[];
  related: string[];
}

/**
 * Extract or infer two-tier search interest tags (primary focus vs related topics) for a club
 */
export async function extractClubInterestsWithGemini(club: {
  name: string;
  handle: string;
  biography?: string;
  category?: string;
  captions?: string[];
}): Promise<ClubTaxonomyResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return inferInterestsHeuristically(club);
  }
  try {
    const prompt = `You are an expert taxonomy tagger for Rutgers University student clubs.
Generate two tiers of interests for this club:
1. "primary": 4 to 8 core specific interests and direct activities of the club.
2. "related": 4 to 8 broader academic fields, parent domains, or sub-disciplines related to this club (e.g. for an AI club, related includes "computer science", "data science"; for a CS club, related includes "artificial intelligence", "cybersecurity").

Club Name: ${club.name}
Handle: @${club.handle}
Category: ${club.category || "General"}
Bio: ${club.biography || ""}
Recent activity: ${(club.captions || []).slice(0, 3).join(" ")}

Respond ONLY with a valid JSON object in this exact shape:
{
  "primary": ["specific topic 1", "specific topic 2"],
  "related": ["related topic 1", "related topic 2"]
}
No markdown backticks.`;

    const res = await fetch(`${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 350 },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleanJson = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      if (parsed && Array.isArray(parsed.primary) && Array.isArray(parsed.related)) {
        return {
          primary: parsed.primary.map((s: string) => String(s).toLowerCase().trim()).filter(Boolean),
          related: parsed.related.map((s: string) => String(s).toLowerCase().trim()).filter(Boolean),
        };
      }
    }
  } catch (err) {
    console.warn("[GeminiExtractor] Could not extract interests with Gemini, using fallback:", err);
  }
  return inferInterestsHeuristically(club);
}

export function inferInterestsHeuristically(club: {
  name: string;
  handle: string;
  biography?: string;
  category?: string;
}): ClubTaxonomyResult {
  const text = `${club.name} ${club.handle} ${club.category || ""} ${club.biography || ""}`.toLowerCase();
  const primary = new Set<string>();
  const related = new Set<string>();

  if (club.category) {
    primary.add(club.category.toLowerCase());
  }

  const keywordMap: Record<string, { pri: string[]; rel: string[] }> = {
    tech: { pri: ["tech", "coding", "software engineering"], rel: ["computer science", "artificial intelligence", "cybersecurity"] },
    code: { pri: ["coding", "programming", "software engineering"], rel: ["computer science", "web dev", "algorithms"] },
    hack: { pri: ["hackathons", "coding"], rel: ["software engineering", "tech careers"] },
    ai: { pri: ["artificial intelligence", "machine learning", "deep learning"], rel: ["computer science", "data science", "robotics"] },
    game: { pri: ["gaming", "video games", "esports"], rel: ["discord", "entertainment", "recreation"] },
    climb: { pri: ["rock climbing", "bouldering", "climbing"], rel: ["outdoors", "fitness", "athletics"] },
    rec: { pri: ["fitness", "recreation", "gym"], rel: ["sports", "wellness", "athletics"] },
    sport: { pri: ["sports", "athletics"], rel: ["fitness", "recreation"] },
    business: { pri: ["business", "networking"], rel: ["finance", "consulting"] },
  };

  for (const [kw, def] of Object.entries(keywordMap)) {
    if (text.includes(kw)) {
      def.pri.forEach((s) => primary.add(s));
      def.rel.forEach((s) => related.add(s));
    }
  }

  return {
    primary: Array.from(primary),
    related: Array.from(related),
  };
}

