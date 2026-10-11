import fs from "fs";
import path from "path";
import { ExtractedEventSchema } from "./types";
import { extractEventDetails as fallbackExtractor } from "./eventExtractor";

const GEMINI_MODELS = [
  process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
];
let currentModelIndex = 0;

export function getActiveGeminiModel(): string {
  return GEMINI_MODELS[currentModelIndex] || "gemini-3.1-flash-lite";
}

export function advanceToNextModel(): string | null {
  if (currentModelIndex + 1 < GEMINI_MODELS.length) {
    currentModelIndex++;
    const next = GEMINI_MODELS[currentModelIndex];
    console.warn(`[GeminiExtractor] Daily quota exhausted across all keys for previous model. Switching to fallback model: ${next}`);
    return next;
  }
  return null;
}

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface PoolKeyEntry {
  key: string;
  label: string;
  cooldownUntil: number;
  lastRequestTime: number;
  timestamps: number[];
}

/**
 * Multi-Key Pool with Strict Per-Key Rate Limiting & 429 Isolation.
 * Automatically loads keys from:
 * 1. GEMINI_API_KEYS (comma or newline separated list of keys)
 * 2. GEMINI_API_KEY_1, GEMINI_API_KEY_2, GEMINI_API_KEY_3...
 * 3. GEMINI_API_KEY (single key or comma-separated)
 */
export class GeminiKeyPool {
  private keys: PoolKeyEntry[] = [];
  private currentIndex = 0;

  constructor() {
    this.reloadKeys();
  }

  public reloadKeys(): void {
    const rawKeys: string[] = [];

    if (process.env.GEMINI_API_KEYS) {
      rawKeys.push(...process.env.GEMINI_API_KEYS.split(/[\n,]/).map((k) => k.trim()).filter(Boolean));
    }

    for (let i = 1; i <= 10; i++) {
      const numberedKey = process.env[`GEMINI_API_KEY_${i}`]?.trim();
      if (numberedKey) rawKeys.push(numberedKey);
    }

    if (process.env.GEMINI_API_KEY) {
      rawKeys.push(...process.env.GEMINI_API_KEY.split(/[\n,]/).map((k) => k.trim()).filter(Boolean));
    }

    const unique = Array.from(
      new Set(
        rawKeys
          .filter(Boolean)
          .filter((k) => k !== "[SENSITIVE]" && !k.startsWith("[") && k.length > 10)
      )
    );
    this.keys = unique.map((key, idx) => ({
      key,
      label: `Account Key #${idx + 1} (...${key.slice(-4)})`,
      cooldownUntil: 0,
      lastRequestTime: 0,
      timestamps: [],
    }));
  }

  public get totalKeys(): number {
    if (this.keys.length === 0) this.reloadKeys();
    return this.keys.length;
  }

  public get activeKeyCount(): number {
    if (this.keys.length === 0) this.reloadKeys();
    const now = Date.now();
    return this.keys.filter((k) => k.cooldownUntil <= now).length;
  }

  public resetCooldowns(): void {
    for (const k of this.keys) {
      k.cooldownUntil = 0;
    }
  }

  public get maxRpmPerKey(): number {
    const envVal = parseInt(process.env.GEMINI_RPM || "12", 10);
    return isNaN(envVal) || envVal <= 0 ? 12 : Math.min(envVal, 12);
  }

  public get minSpacingPerKey(): number {
    return Math.ceil(60000 / this.maxRpmPerKey) + 200; // ~5,200ms strictly between requests to the SAME key
  }

  /**
   * Acquires the next available key, strictly guaranteeing that:
   * 1. The key has waited at least minSpacingPerKey (~4.7s) since its last request
   * 2. The key has made fewer than maxRpmPerKey (13) requests in the rolling 60s window
   * 3. The key is not in a cooldown state (from 429 backoff)
   * If no key is immediately ready, safely pauses execution until an active key becomes ready.
   */
  public async acquireKey(): Promise<PoolKeyEntry> {
    if (this.keys.length === 0) {
      this.reloadKeys();
      if (this.keys.length === 0) {
        throw new Error("No valid Gemini API keys configured");
      }
    }

    const minSpacing = this.minSpacingPerKey;
    const maxRpm = this.maxRpmPerKey;

    while (true) {
      const now = Date.now();

      // Evict timestamps older than 60s
      for (const k of this.keys) {
        k.timestamps = k.timestamps.filter((t) => now - t < 60000);
      }

      // Check if any key is ready right now in round-robin order
      for (let i = 0; i < this.keys.length; i++) {
        const idx = (this.currentIndex + i) % this.keys.length;
        const candidate = this.keys[idx];
        if (candidate.cooldownUntil <= now) {
          const timeSinceLast = now - candidate.lastRequestTime;
          const withinRpm = candidate.timestamps.length < maxRpm;
          if (timeSinceLast >= minSpacing && withinRpm) {
            candidate.lastRequestTime = now;
            candidate.timestamps.push(now);
            this.currentIndex = (idx + 1) % this.keys.length;
            return candidate;
          }
        }
      }

      // If no key is immediately ready, calculate the shortest delay until an active key becomes ready
      let minWait = Infinity;
      for (const k of this.keys) {
        if (k.cooldownUntil <= now) {
          const timeSinceLast = now - k.lastRequestTime;
          const waitSpacing = Math.max(0, minSpacing - timeSinceLast);
          let waitWindow = 0;
          if (k.timestamps.length >= maxRpm) {
            const oldest = k.timestamps[0];
            waitWindow = Math.max(0, 60000 - (now - oldest) + 100);
          }
          const waitForKey = Math.max(waitSpacing, waitWindow);
          if (waitForKey < minWait) minWait = waitForKey;
        } else {
          const waitCooldown = Math.max(0, k.cooldownUntil - now);
          if (waitCooldown < minWait) minWait = waitCooldown;
        }
      }

      const sleepTime = Math.max(50, Math.min(minWait, 5000));
      await new Promise((r) => setTimeout(r, sleepTime));
    }
  }

  public markCooldown(keyToCooldown: string, durationMs: number): void {
    const target = Date.now() + durationMs;
    const entry = this.keys.find((k) => k.key === keyToCooldown);
    if (entry) {
      entry.cooldownUntil = Math.max(entry.cooldownUntil, target);
      const remainingActive = this.activeKeyCount;
      console.warn(
        `[GeminiKeyPool] ${entry.label} placed in cooldown for ${(durationMs / 1000).toFixed(1)}s. Active keys remaining: ${remainingActive}/${this.keys.length}`
      );
    }
  }
}

export const keyPool = new GeminiKeyPool();

/**
 * Backward compatibility stub for geminiLimiter
 */
export const geminiLimiter = {
  acquire: () => Promise.resolve(),
  pause: (ms: number) => {},
  get rpm(): number {
    return keyPool.maxRpmPerKey * Math.max(1, keyPool.activeKeyCount);
  },
};

/**
 * Fetch wrapper for Gemini API with per-key rate limiting, attempt timeouts, and exponential backoff
 */
export async function fetchGeminiWithRetry(
  urlOrBase: string,
  options: RequestInit,
  explicitApiKey?: string,
  maxRetries = 4
): Promise<Response> {
  let attempt = 0;

  while (attempt <= maxRetries) {
    // Acquire a key strictly guaranteed to be within safe per-key RPM limits
    const keyInfo = explicitApiKey
      ? { key: explicitApiKey, label: `Explicit Key (...${explicitApiKey.slice(-4)})` }
      : await keyPool.acquireKey();

    const activeKey = keyInfo?.key || process.env.GEMINI_API_KEY || "";

    // Build URL with selected key
    let targetUrl: string;
    if (urlOrBase.includes("key=")) {
      targetUrl = urlOrBase.replace(/key=[^&]+/, `key=${encodeURIComponent(activeKey)}`);
    } else {
      targetUrl = `${urlOrBase}${urlOrBase.includes("?") ? "&" : "?"}key=${encodeURIComponent(activeKey)}`;
    }

    // Create a fresh 35s timeout specifically for this HTTP request attempt
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 35000);

    try {
      const res = await fetch(targetUrl, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutHandle);

      if (res.status === 401 || res.status === 403) {
        console.warn(`[GeminiExtractor] Key ${keyInfo?.label || "active"} is disabled or invalid (HTTP ${res.status}). Quarantining key.`);
        if (activeKey) {
          keyPool.markCooldown(activeKey, 24 * 60 * 60 * 1000); // 24-hour quarantine
        }
        if (keyPool.activeKeyCount > 0) {
          attempt++;
          continue; // immediately retry with next active key in pool
        }
        return res;
      }

      if (res.status === 429 || res.status === 503) {
        attempt++;
        let isDailyQuota = false;
        let retryDelayMs = 0;

        try {
          const errJson = await res.clone().json();
          const errMsg = errJson?.error?.message || "";
          if (errMsg.includes("limit: 500") || errMsg.includes("FreeTier") || errMsg.includes("RESOURCE_EXHAUSTED")) {
            isDailyQuota = true;
          }
          const retryInfo = errJson?.error?.details?.find((d: any) => d?.["@type"]?.includes("RetryInfo"));
          if (retryInfo?.retryDelay) {
            const sec = parseInt(retryInfo.retryDelay, 10);
            if (!isNaN(sec)) {
              retryDelayMs = sec * 1000;
              if (sec > 60) isDailyQuota = true;
            }
          }
        } catch {
          // Response body was not JSON or already consumed
        }

        const backoffMs = isDailyQuota
          ? (retryDelayMs || 12 * 60 * 60 * 1000)
          : Math.min(60000, Math.pow(2, attempt) * 4000 + Math.random() * 2000);

        if (activeKey) {
          keyPool.markCooldown(activeKey, backoffMs);
        }

        if (isDailyQuota) {
          console.warn(
            `[GeminiExtractor] Daily quota (500 RPD) reached on ${keyInfo?.label || "key"}. Quarantined for ${(backoffMs / 3600000).toFixed(1)}h. Active keys remaining: ${keyPool.activeKeyCount}/${keyPool.totalKeys}`
          );
          if (keyPool.activeKeyCount > 0) {
            continue; // immediately retry with next key in pool without waiting
          }

          // If all keys are in daily-quota quarantine, seamlessly advance to fallback model!
          const nextModel = advanceToNextModel();
          if (nextModel) {
            keyPool.resetCooldowns();
            targetUrl = targetUrl.replace(/\/models\/[^:]+:/, `/models/${nextModel}:`);
            attempt = 0;
            continue;
          }
        } else {
          console.warn(
            `[GeminiExtractor] HTTP ${res.status} on ${keyInfo?.label || "key"}. Retrying in ${(backoffMs / 1000).toFixed(1)}s (attempt ${attempt}/${maxRetries})...`
          );
        }

        if (attempt > maxRetries) {
          console.warn(`[GeminiExtractor] Exhausted all ${maxRetries} retries.`);
          return res;
        }

        continue;
      }

      return res;
    } catch (err: any) {
      clearTimeout(timeoutHandle);
      attempt++;
      if (attempt > maxRetries) throw err;
      const backoffMs = Math.pow(2, attempt) * 2000;
      console.warn(`[GeminiExtractor] Network/fetch error (${err.message || err}). Retrying in ${(backoffMs / 1000).toFixed(1)}s...`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  throw new Error(`[GeminiExtractor] Exhausted all ${maxRetries} retries`);
}

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
  const hasKeys = Boolean(options?.apiKey) || keyPool.totalKeys > 0 || Boolean(process.env.GEMINI_API_KEY);
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

  if (!hasKeys) {
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

  const endpoint = `${GEMINI_BASE_URL}/models/${getActiveGeminiModel()}:generateContent`;
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
    const res = await fetchGeminiWithRetry(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      options?.apiKey
    );

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
  const hasKeys = Boolean(apiKey) || keyPool.totalKeys > 0 || Boolean(process.env.GEMINI_API_KEY);

  if (!posts || posts.length === 0) {
    return resultMap;
  }

  // If no Gemini API key, use fallback extractor for all
  if (!hasKeys) {
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

  // Process sequentially so each post acquires a key in strict, orderly turn
  for (const post of posts) {
    try {
      const result = await extractEventWithGemini(post.caption, {
        imageUrl: post.image_url,
        videoUrl: post.video_url,
        postUrl: post.post_url,
        clubName: post.club_name,
        clubHandle: post.club_handle,
        clubCategory: post.club_category,
        apiKey: apiKey, // when apiKey is undefined, each post rotates through the key pool
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
  const hasKeys = keyPool.totalKeys > 0 || Boolean(process.env.GEMINI_API_KEY);
  if (!hasKeys) {
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

    const res = await fetchGeminiWithRetry(`${GEMINI_BASE_URL}/models/${getActiveGeminiModel()}:generateContent`, {
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

