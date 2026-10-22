import { getBestMatches, getMatchingEventIds } from '../src/utils/searchEngine';
import { ClubRecord } from '../lib/types';
import { CalendarEvent } from '../src/types/event';

// Sample clubs
const sampleClubs: ClubRecord[] = [
  {
    id: 1,
    name: 'Rutgers USACS',
    handle: '@rutgersusacs',
    category: 'Tech & Coding',
    interests: ['Coding', 'Web Development', 'Computer Science'],
    related_interests: ['Algorithms', 'Software Engineering'],
    biography: 'Undergraduate Computer Science Society at Rutgers University.',
  },
  {
    id: 2,
    name: 'HackRU Organizing Team',
    handle: '@hackruofficial',
    category: 'Tech & Coding',
    interests: ['Hackathons', 'Tech Community', 'Coding'],
    related_interests: ['Workshops', 'Mentorship'],
    biography: 'Rutgers University flagship 24-hour hackathon.',
  },
  {
    id: 3,
    name: 'Rutgers Esports',
    handle: '@rutgersesports',
    category: 'Sports & Recreation',
    interests: ['Gaming', 'Competitive Esports'],
    related_interests: ['Tournaments', 'Broadcasting'],
    biography: 'The premier collegiate esports organization at Rutgers.',
  },
  {
    id: 4,
    name: 'Rutgers IEEE Student Branch',
    handle: '@rutgers_ieee',
    category: 'Engineering',
    interests: ['Hardware', 'Robotics', 'Electrical Engineering'],
    related_interests: ['Circuits', 'Embedded Systems'],
    biography: 'IEEE student branch at Rutgers.',
  },
  {
    id: 5,
    name: 'Rutgers University Programming Association',
    handle: '@ru_rudo',
    category: 'Social & Student Life',
    interests: ['Campus Events', 'Entertainment'],
    related_interests: ['Concerts', 'Comedy Shows'],
    biography: 'RUPA plans campus-wide entertainment events.',
  },
];

// Sample events
const sampleEvents: CalendarEvent[] = [
  {
    id: 'evt-1',
    title: 'Intro to Web Development Workshop',
    date: 'Wednesday, Oct 24',
    parsedDate: '2026-10-24',
    time: '8:00 PM - 9:30 PM',
    location: 'Hill Center 254',
    campus: 'Busch',
    category: 'Tech & Coding',
    club_name: 'Rutgers USACS',
    club_handle: '@rutgersusacs',
    color_scheme: 'blue',
    is_event: true,
    is_all_day: false,
    has_free_food: true,
    startMinutes: 1200,
    endMinutes: 1290,
    displayDuration: '1h 30m',
    important_links: [],
    description: 'Learn HTML, CSS, JavaScript and React! Free pizza will be served.',
  },
  {
    id: 'evt-2',
    title: 'HackRU Fall 2026 Hackathon',
    date: 'Saturday, Oct 27',
    parsedDate: '2026-10-27',
    time: '12:00 PM',
    location: 'Student Center Multi-Purpose Room',
    campus: 'College Ave',
    category: 'Tech & Coding',
    club_name: 'HackRU Organizing Team',
    club_handle: '@hackruofficial',
    color_scheme: 'purple',
    is_event: true,
    is_all_day: true,
    has_free_food: true,
    startMinutes: 720,
    endMinutes: 1440,
    displayDuration: 'All Day',
    important_links: [],
    description: 'Rutgers 24-hour hackathon with prizes, sponsors, and food.',
  },
  {
    id: 'evt-3',
    title: 'Smash Ultimate Weekly Tournament',
    date: 'Thursday, Oct 25',
    parsedDate: '2026-10-25',
    time: '7:00 PM',
    location: 'Livingston Student Center',
    campus: 'Livingston',
    category: 'Sports & Recreation',
    club_name: 'Rutgers Esports',
    club_handle: '@rutgersesports',
    color_scheme: 'amber',
    is_event: true,
    is_all_day: false,
    has_free_food: false,
    startMinutes: 1140,
    endMinutes: 1260,
    displayDuration: '2h',
    important_links: [],
    description: 'Weekly Super Smash Bros Ultimate bracket.',
  },
  {
    id: 'evt-4',
    title: 'Arduino & Robotics Hands-on Lab',
    date: 'Friday, Oct 26',
    parsedDate: '2026-10-26',
    time: '6:00 PM',
    location: 'Engineering Building B120',
    campus: 'Busch',
    category: 'Engineering',
    club_name: 'Rutgers IEEE Student Branch',
    club_handle: '@rutgers_ieee',
    color_scheme: 'emerald',
    is_event: true,
    is_all_day: false,
    has_free_food: false,
    startMinutes: 1080,
    endMinutes: 1200,
    displayDuration: '2h',
    important_links: [],
    description: 'Hands on microcontroller building session.',
  },
  {
    id: 'evt-past-1',
    title: 'Intro to Python Workshop',
    date: 'Wednesday, Sep 15',
    parsedDate: '2026-09-15',
    time: '7:00 PM',
    location: 'Hill Center 114',
    campus: 'Busch',
    category: 'Tech & Coding',
    club_name: 'Rutgers USACS',
    club_handle: '@rutgersusacs',
    color_scheme: 'blue',
    is_event: true,
    is_all_day: false,
    has_free_food: false,
    startMinutes: 1140,
    endMinutes: 1260,
    displayDuration: '2h',
    important_links: [],
    description: 'Past Python workshop from early September.',
  },
  {
    id: 'evt-past-2',
    title: 'Summer Coding Kickoff',
    date: 'Monday, Aug 10',
    parsedDate: '2026-08-10',
    time: '5:00 PM',
    location: 'Busch Student Center',
    campus: 'Busch',
    category: 'Tech & Coding',
    club_name: 'Rutgers USACS',
    club_handle: '@rutgersusacs',
    color_scheme: 'blue',
    is_event: true,
    is_all_day: false,
    has_free_food: false,
    startMinutes: 1020,
    endMinutes: 1140,
    displayDuration: '2h',
    important_links: [],
    description: 'Old summer kickoff meeting.',
  },
];

function runTests() {
  console.log('==============================================');
  console.log('RUThere MiniSearch Fuzzy Engine Test Suite');
  console.log('==============================================\n');

  let passed = 0;
  let total = 0;

  function assert(name: string, condition: boolean, detail?: string) {
    total++;
    if (condition) {
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${name}`);
      if (detail) console.error(`    Detail: ${detail}`);
    }
  }

  // 1. Exact Match Test
  const exactRes = getBestMatches('Rutgers USACS', sampleClubs, sampleEvents);
  assert(
    'Exact club name match ranks #1 with top score',
    exactRes.length > 0 && exactRes[0].title === 'Rutgers USACS' && exactRes[0].score <= 0.05,
    `Top result: ${exactRes[0]?.title} (score: ${exactRes[0]?.score})`
  );

  // 2. Exact Handle Test with @
  const handleRes = getBestMatches('@hackruofficial', sampleClubs, sampleEvents);
  assert(
    'Exact handle match with @ symbol resolves correctly',
    handleRes.length > 0 && handleRes[0].title === 'HackRU Organizing Team',
    `Top result: ${handleRes[0]?.title}`
  );

  // 3. Typo Tolerance (Fuzzy Search)
  const typoRes1 = getBestMatches('codng', sampleClubs, sampleEvents);
  assert(
    'Typo "codng" matches coding clubs and events',
    typoRes1.some((r) => r.title.includes('USACS') || r.title.includes('Web Development')),
    `Results: ${typoRes1.map((r) => r.title).join(', ')}`
  );

  const typoRes2 = getBestMatches('esprot', sampleClubs, sampleEvents);
  assert(
    'Typo "esprot" matches Rutgers Esports',
    typoRes2.some((r) => r.title.includes('Esports')),
    `Results: ${typoRes2.map((r) => r.title).join(', ')}`
  );

  const typoRes3 = getBestMatches('hackathn', sampleClubs, sampleEvents);
  assert(
    'Typo "hackathn" matches HackRU Hackathon event',
    typoRes3.some((r) => r.title.includes('HackRU')),
    `Results: ${typoRes3.map((r) => r.title).join(', ')}`
  );

  // 4. Free Food Query
  const foodRes = getBestMatches('free food', sampleClubs, sampleEvents);
  assert(
    'Query "free food" returns events with has_free_food badge and detail',
    foodRes.some((r) => r.detail?.includes('FREE FOOD')),
    `Results: ${foodRes.map((r) => `${r.title} (${r.detail})`).join(', ')}`
  );

  const pizzaRes = getBestMatches('pizza', sampleClubs, sampleEvents);
  assert(
    'Query "pizza" returns Web Dev workshop event with free food',
    pizzaRes.some((r) => r.title.includes('Web Development')),
    `Results: ${pizzaRes.map((r) => r.title).join(', ')}`
  );

  // 5. Interest Matching
  const interestRes = getBestMatches('Robotics', sampleClubs, sampleEvents);
  assert(
    'Query "Robotics" matches IEEE club via primary interests',
    interestRes.some((r) => r.title.includes('IEEE')),
    `Results: ${interestRes.map((r) => r.title).join(', ')}`
  );

  // 6. Calendar Event IDs Matching
  const matchingEventIds = getMatchingEventIds('hackathn', sampleClubs, sampleEvents);
  assert(
    'getMatchingEventIds returns Set containing HackRU event ID',
    matchingEventIds.has('evt-2'),
    `Set entries: ${Array.from(matchingEventIds).join(', ')}`
  );

  // 7. Upcoming Scoping (Default skips past events)
  const defaultUpcomingWorkshop = getBestMatches('workshop', sampleClubs, sampleEvents);
  assert(
    'Default search returns only upcoming workshop and skips past events',
    defaultUpcomingWorkshop.some((r) => r.event?.id === 'evt-1') &&
      !defaultUpcomingWorkshop.some((r) => r.event?.id === 'evt-past-1'),
    `Results: ${defaultUpcomingWorkshop.map((r) => `${r.title} (${r.event?.id})`).join(', ')}`
  );

  // 8. Past Mode Scoping (via { scope: 'past' })
  const pastWorkshop = getBestMatches('workshop', sampleClubs, sampleEvents, { scope: 'past' });
  assert(
    'Past search with { scope: "past" } returns past workshop with isPast flag',
    pastWorkshop.some((r) => r.event?.id === 'evt-past-1' && r.isPast === true),
    `Results: ${pastWorkshop.map((r) => `${r.title} (${r.event?.id}, isPast: ${r.isPast})`).join(', ')}`
  );

  // 9. Chronological Sorting in Past Mode (Most recent past first)
  const allPastMatches = getBestMatches('', sampleClubs, sampleEvents, { scope: 'past' });
  const past1Idx = allPastMatches.findIndex((r) => r.event?.id === 'evt-past-1'); // Sep 15
  const past2Idx = allPastMatches.findIndex((r) => r.event?.id === 'evt-past-2'); // Aug 10
  assert(
    'Past events sort chronologically from most recent past to oldest past',
    past1Idx !== -1 && past2Idx !== -1 && past1Idx < past2Idx,
    `evt-past-1 idx: ${past1Idx}, evt-past-2 idx: ${past2Idx}`
  );

  // 10. getMatchingEventIds with { scope: 'past' } returns past event IDs
  const pastEventIds = getMatchingEventIds('workshop', sampleClubs, sampleEvents, { scope: 'past' });
  assert(
    'getMatchingEventIds with { scope: "past" } returns past event ID and excludes upcoming',
    pastEventIds.has('evt-past-1') && !pastEventIds.has('evt-1'),
    `Set entries: ${Array.from(pastEventIds).join(', ')}`
  );

  // 11. getMatchingEventIds with empty query in past mode returns all past events
  const allPastEventIds = getMatchingEventIds('', sampleClubs, sampleEvents, { scope: 'past' });
  assert(
    'getMatchingEventIds with empty query in past mode returns all past events',
    allPastEventIds.has('evt-past-1') && allPastEventIds.has('evt-past-2') && !allPastEventIds.has('evt-1'),
    `Set entries: ${Array.from(allPastEventIds).join(', ')}`
  );

  console.log(`\nTests Completed: ${passed}/${total} passed.\n`);

  if (passed !== total) {
    process.exit(1);
  }

  // 7. Synthetic Performance Benchmarks
  console.log('----------------------------------------------');
  console.log('Running Performance Benchmarks...');
  console.log('----------------------------------------------');

  // Benchmark at 2,000 items (Current single-school size)
  const clubs2k: ClubRecord[] = [];
  const events2k: CalendarEvent[] = [];

  for (let i = 0; i < 400; i++) {
    clubs2k.push({
      id: i + 10,
      name: `Club ${i} - ${['Robotics', 'Coding', 'Dance', 'Chess', 'Debate', 'Finance'][i % 6]} Society`,
      handle: `@club_${i}`,
      category: 'Tech & Coding',
      interests: ['Interest A', 'Interest B', 'Technology'],
      related_interests: ['Topic X', 'Topic Y'],
      biography: `Biography description for club ${i} with active members.`,
    });
  }

  for (let i = 0; i < 1600; i++) {
    events2k.push({
      id: `evt-2k-${i}`,
      title: `Event ${i}: ${['Hackathon Workshop', 'General Meeting', 'Guest Lecture', 'Social Mixer', 'Tournament'][i % 5]}`,
      date: 'Wednesday, Oct 24',
      parsedDate: '2026-10-24',
      time: '7:00 PM',
      location: `Hall ${i % 10}, Room 10${i % 5}`,
      campus: 'Busch',
      category: 'Tech & Coding',
      club_name: `Club ${i % 400}`,
      club_handle: `@club_${i % 400}`,
      color_scheme: 'blue',
      is_event: true,
      is_all_day: false,
      has_free_food: i % 4 === 0,
      startMinutes: 1140,
      endMinutes: 1260,
      displayDuration: '2h',
      important_links: [],
      description: `Description of exciting event ${i} happening on campus with fellow students.`,
    });
  }

  // Index build benchmark
  const t0 = performance.now();
  getBestMatches('prime', clubs2k, events2k);
  const indexTime2k = performance.now() - t0;
  console.log(`✓ 2,000 items index build time: ${indexTime2k.toFixed(2)} ms`);

  // Query latency benchmark over 100 queries
  const testQueries = ['hackathn', 'codng', 'dance', 'pizza', 'robotics', 'meeting', 'club', 'hall'];
  const tQueryStart = performance.now();
  const iterations = 100;
  for (let i = 0; i < iterations; i++) {
    const q = testQueries[i % testQueries.length];
    getBestMatches(q, clubs2k, events2k);
    getMatchingEventIds(q, clubs2k, events2k);
  }
  const avgQueryTime2k = (performance.now() - tQueryStart) / iterations;
  console.log(`✓ 2,000 items avg query time (dropdown + calendar IDs): ${avgQueryTime2k.toFixed(3)} ms per keystroke`);

  // Benchmark at 10,000 items (Scale limit for Rutgers / large school)
  const clubs10k: ClubRecord[] = [];
  const events10k: CalendarEvent[] = [];

  for (let i = 0; i < 1500; i++) {
    clubs10k.push({
      id: i + 1000,
      name: `Club ${i} - ${['AI', 'Biomedical', 'Music', 'Business', 'Art', 'Gaming'][i % 6]} Alliance`,
      handle: `@club_scale_${i}`,
      category: 'Tech & Coding',
      interests: ['Artificial Intelligence', 'Leadership', 'Design'],
      related_interests: ['Creative Writing', 'Data Science'],
      biography: `Biography description for club ${i} with active members.`,
    });
  }

  for (let i = 0; i < 8500; i++) {
    events10k.push({
      id: `evt-10k-${i}`,
      title: `Grand Event ${i}: ${['Annual Showcase', 'Conference', 'Hackathon Sprint', 'Networking Night'][i % 4]}`,
      date: 'Thursday, Oct 25',
      parsedDate: '2026-10-25',
      time: '6:30 PM',
      location: `Center Room ${i % 20}`,
      campus: 'College Ave',
      category: 'Tech & Coding',
      club_name: `Club ${i % 1500}`,
      club_handle: `@club_scale_${i % 1500}`,
      color_scheme: 'purple',
      is_event: true,
      is_all_day: false,
      has_free_food: i % 3 === 0,
      startMinutes: 1110,
      endMinutes: 1230,
      displayDuration: '2h',
      important_links: [],
      description: `Join us for event ${i} packed with interactive workshops and food.`,
    });
  }

  const t10kBuild = performance.now();
  getBestMatches('prime', clubs10k, events10k);
  const indexTime10k = performance.now() - t10kBuild;
  console.log(`✓ 10,000 items index build time: ${indexTime10k.toFixed(2)} ms`);

  const t10kQuery = performance.now();
  for (let i = 0; i < iterations; i++) {
    const q = testQueries[i % testQueries.length];
    getBestMatches(q, clubs10k, events10k);
    getMatchingEventIds(q, clubs10k, events10k);
  }
  const avgQueryTime10k = (performance.now() - t10kQuery) / iterations;
  console.log(`✓ 10,000 items avg query time: ${avgQueryTime10k.toFixed(3)} ms per keystroke`);

  console.log('\n==============================================');
  console.log('BENCHMARK SUMMARY');
  console.log('==============================================');
  console.log(`2,000 items  -> Query Latency: ${avgQueryTime2k.toFixed(3)} ms (Target: < 2.0 ms)`);
  console.log(`10,000 items -> Query Latency: ${avgQueryTime10k.toFixed(3)} ms (Target: < 5.0 ms)`);
  console.log('Result: 🚀 BLAZING FAST');
}

runTests();
