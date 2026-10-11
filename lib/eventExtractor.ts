import { ExtractedEventSchema } from "./types";

/**
 * Event Extractor implementing the schema from example.json
 * Identifies if an Instagram post is an event announcement and parses
 * event title, date, time, location, campus, category, and important links.
 */
export function extractEventDetails(
  caption?: string,
  clubInfo?: { name?: string; handle?: string; category?: string }
): ExtractedEventSchema {
  if (!caption || !caption.trim()) {
    return {
      is_event: false,
      title: "",
      date: "",
      time: "",
      location: "",
      campus: "College Ave",
      category: clubInfo?.category || "Social & Student Life",
      important_links: [],
      flyer_details: "",
      has_free_food: false,
    };
  }

  const text = caption.trim();
  const lower = text.toLowerCase();
  const clubName = (clubInfo?.name || "").toLowerCase();
  const clubHandle = (clubInfo?.handle || "").toLowerCase();
  const fullContext = `${clubName} ${clubHandle} ${lower}`;

  // Keywords indicating Rutgers club events or meetings
  const eventIndicators = [
    "gbm",
    "general body meeting",
    "meeting",
    "workshop",
    "event",
    "info session",
    "hackathon",
    "social",
    "mixer",
    "tournament",
    "competition",
    "practice",
    "game day",
    "join us",
    "come out",
    "register",
    "doors open",
    "when:",
    "where:",
    "date:",
    "time:",
    "tickets",
    "rsvp",
  ];

  const isEvent = eventIndicators.some((word) => lower.includes(word));

  // Extract links or link-in-bio mentions
  const linkRegex = /(https?:\/\/[^\s]+|link in bio|link in description|forms\.gle\/[^\s]+)/gi;
  const linksMatches = text.match(linkRegex) || [];
  const importantLinks = Array.from(new Set(linksMatches.map((l) => l.trim())));

  // Extract Date (e.g. Wednesday, Oct 24 or Oct 24th, or 10/24)
  const dateRegex =
    /(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/i;
  const dateMatch = text.match(dateRegex);
  const date = dateMatch ? dateMatch[0].trim() : "TBD";

  // Extract Time (e.g. 8:00 PM - 9:30 PM, 7pm, 6:30 PM)
  const timeRegex =
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*(?:-|to|–)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)/i;
  const timeMatch = text.match(timeRegex);
  const time = timeMatch ? timeMatch[0].trim() : "TBD";

  // Rutgers campus locations mapping
  let location = "Rutgers Campus";
  let campus = "College Ave";

  if (/\b(busch student center|bsc|serc|arc|allison road|core|physics|werblin)\b/i.test(lower)) {
    campus = "Busch";
    if (/\b(busch student center|bsc)\b/i.test(lower)) location = "Busch Student Center";
    else if (/\bserc\b/i.test(lower)) location = "SERC";
    else if (/\barc\b/i.test(lower)) location = "ARC";
    else location = "Busch Campus";
  } else if (/\b(livingston student center|lsc|tillett|beck|rac|jersey mike|carr)\b/i.test(lower)) {
    campus = "Livingston";
    if (/\b(livingston student center|lsc)\b/i.test(lower)) location = "Livingston Student Center";
    else if (/\btillett\b/i.test(lower)) location = "Tillett Hall";
    else location = "Livingston Campus";
  } else if (/\b(douglass student center|dsc|cook student center|loree|passion puddle|red oak)\b/i.test(lower)) {
    campus = "Cook/Doug";
    if (/\b(douglass student center|dsc)\b/i.test(lower)) location = "Douglass Student Center";
    else location = "Cook/Douglass Campus";
  } else if (/\b(zoom|discord|google meet|teams|virtual|online)\b/i.test(lower)) {
    campus = "Virtual / Online";
    location = /\bdiscord\b/i.test(lower) ? "Discord" : "Zoom / Virtual";
  } else if (/\b(college ave(?:nue)? student center|casc|student activities center|sac|scott hall|academic building|morrell|yard|cag|college avenue gym)\b/i.test(lower)) {
    campus = "College Ave";
    if (/\b(college ave(?:nue)? student center|casc)\b/i.test(lower)) location = "College Ave Student Center";
    else if (/\b(sac|student activities center)\b/i.test(lower)) location = "Student Activities Center (SAC)";
    else if (/\b(cag|college avenue gym)\b/i.test(lower)) location = "College Avenue Gym";
    else if (/\bscott hall\b/i.test(lower)) location = "Scott Hall";
    else if (/\bacademic building\b/i.test(lower)) location = "Academic Building";
    else location = "College Ave Campus";
  }

  // Rutgers club category inference
  let category = "Social & Student Life";
  if (/\b(calisthenics|running|run|workout|fitness|reps|wrestling|gym|tennis|soccer|basketball|sports|tournament)\b/i.test(fullContext)) {
    category = "Sports & Recreation";
  } else if (/\b(coding|programming|hackathon|usacs|acm|software|web dev|python|javascript|developer|algorithms|ai|machine learning|blueprint)\b/i.test(fullContext)) {
    category = "Tech & Coding";
  } else if (/\b(ieee|engineering|formula|racing|swe|robotics|mechanical|electrical|aerospace|circuit)\b/i.test(fullContext)) {
    category = "Engineering";
  } else if (/\b(usg|student assembly|senate|alpfa|business|pre-med|aed|career|resume|internship|consulting|law|finance)\b/i.test(fullContext)) {
    category = "Academic & Professional";
  } else if (/\b(movie|film|writing|creative writing|salsa|dance|music|theater|photography|art)\b/i.test(fullContext)) {
    category = "Arts & Media";
  } else if (/\b(environmental|service|volunteer|cleanup|fundraiser|donation|charity)\b/i.test(fullContext)) {
    category = "Community & Service";
  } else if (/\b(cultural|asian|hispanic|latino|black|heritage|identity|affinity|asc)\b/i.test(fullContext)) {
    category = "Cultural & Identity";
  } else if (/\b(rupa|social|party|trivia|mixer|kickoff|fall kickoff|tailgate|bbq)\b/i.test(fullContext)) {
    category = "Social & Student Life";
  } else if (clubInfo?.category && clubInfo.category !== "General") {
    category = clubInfo.category;
  }

  // Extract Title from first non-empty line
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let title = "Club Event";
  if (lines.length > 0) {
    const first = lines[0].replace(/[#*•_]/g, "").trim();
    title = first.length > 85 ? first.slice(0, 82) + "..." : first;
  }

  // Extract Free Food presence
  const freeFoodIndicators = [
    "free food",
    "free pizza",
    "free snacks",
    "free boba",
    "free drinks",
    "free dinner",
    "free lunch",
    "food provided",
    "pizza provided",
    "refreshments provided",
    "free refreshments",
    "complimentary food",
    "complimentary pizza",
    "complimentary snacks",
    "food will be served",
    "pizza will be served",
    "food will be provided",
    "pizza will be provided",
    "snacks will be provided",
    "snacks provided",
  ];
  const hasFreeFood = freeFoodIndicators.some((kw) => lower.includes(kw));

  return {
    is_event: isEvent,
    title,
    date,
    time,
    location,
    campus,
    category,
    important_links: importantLinks,
    flyer_details: "",
    has_free_food: hasFreeFood,
  };
}
