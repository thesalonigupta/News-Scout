/**
 * config.gs
 *
 * The only file you must edit. Everything here is either a list of terms
 * describing what you want to read about, or a list of feeds to read.
 *
 * The topic lists ship as PLACEHOLDERS drawn from epidemiology, the same
 * worked example used by the companion Literature Scout template. They are
 * there to show the shape of a real list — tiered by how much trust a term
 * deserves on its own — not because they are the right terms for you.
 * Replace them with your field's vocabulary before the first real run.
 *
 * Where news differs from literature: an academic search API only returns
 * academic papers, so a loose topic list mostly costs you noise. An RSS feed
 * returns everything the outlet published, including recipes, gift guides and
 * sports. So this file splits topics into tiers, and relevanceFilter.gs
 * applies a different bar depending on which tier a term came from. The
 * rules are the same three-tier design the Literature Scout uses.
 */

// ---------------------------------------------------------------------------
// 1. NEWS TOPICS — THREE TIERS
// ---------------------------------------------------------------------------
// An article counts if it matches:
//   (a) a CORE_TOPICS term on its own, or
//   (b) a BROAD_CONTEXT_TOPICS term plus a mention of a PRIMARY or SECONDARY
//       anchor, or
//   (c) a NARROW_CONTEXT_TOPICS term plus a mention of a PRIMARY anchor.
// Text checked = headline + the feed's short summary, never full article text.
//
// Plain strings match case-insensitively; spaces also match hyphens, and a
// trailing plural "s" is allowed. Use {label, pattern} for anything custom.
//
// Tune from real runs, not on paper: run testRelevanceFilterAudit (main.gs)
// and add or move a term only after you have seen a real miss or a real
// false positive. Moving a term down a tier is almost always better than
// deleting it, which loses the real matches too.

// (a) CORE_TOPICS — terms of art. If any outlet prints one, the article is
// almost certainly about your field, so these count on their own. A good
// test: could a lifestyle writer use this phrase without meaning your field?
// If yes, it belongs in a context tier instead.
const CORE_TOPICS = [
  'basic reproduction number',
  'herd immunity threshold',
  'serial interval',
  'case fatality rate',
  'contact tracing',
  'wastewater surveillance',
  'antigenic drift',
  'vaccine effectiveness',
  'attack rate',
  'seroprevalence',
  // Custom regex example: {label, pattern} for anything a plain string
  // can't express (alternate endings, exclusions, word-boundary tricks).
  { label: 'epidemiology', pattern: /\bepidemiolog(y|ist|ists|ical)\b/i },
];

// (b) BROAD_CONTEXT_TOPICS — real terms in your field that are also ordinary
// English. They count only if the article ALSO mentions something from
// PRIMARY_ANCHORS or SECONDARY_ANCHORS below, which is what stops "outbreak
// of violence" or "public health insurance premiums" from carrying a story.
const BROAD_CONTEXT_TOPICS = [
  'outbreak',
  'epidemic',
  'pandemic',
  'pandemic preparedness',
  'public health',
  'quarantine',
  'vaccination rates',
  'surveillance',
];

// (c) NARROW_CONTEXT_TOPICS — terms with a precise meaning in your field and
// a common, unrelated meaning elsewhere. They count only if the article also
// mentions something from PRIMARY_ANCHORS (the stricter of the two anchor
// lists). Add a term here the first time you see it drag in an article from
// an unrelated beat.
const NARROW_CONTEXT_TOPICS = [
  'transmission',   // also: car transmissions, data transmission
  'carrier',        // also: airlines, phone carriers, aircraft carriers
  'exposure',       // also: photography, finance, publicity
  'incidence',      // also: general statistical usage
  'immunity',
  'variant',
  'strain',
];

// Terms (from any tier) that count only if they appear in the HEADLINE, or
// the article also matches another, non-weak term. Use this for words that
// show up in passing in lots of coverage but only carry a story when they
// are its subject. Entries must match a term's string (or a {label, pattern}
// term's label) exactly.
const WEAK_TOPICS = [
  'outbreak',
  'epidemic',
  'immunity',
  'variant',
  'strain',
];

// What counts as mentioning your field's PRIMARY subject. Used by tiers (b)
// and (c). Regexes, so you control case-sensitivity: use a case-sensitive
// pattern for abbreviations that would otherwise match inside other words.
const PRIMARY_ANCHORS = [
  /\b(virus(es)?|viral|pathogens?|bacteri(a|um|al)|infectious|infections?|infected)\b/i,
  /\b(influenza|flu|COVID(-19)?|SARS-CoV-2|measles|polio|tuberculosis|mpox|cholera|dengue|malaria|Ebola|H5N1)\b/i,
  /\b(disease|diseases|vaccines?|vaccinated|vaccination)\b/i,
];

// What counts as mentioning a SECONDARY subject: weaker evidence than a
// PRIMARY anchor, but enough to support a BROAD_CONTEXT_TOPICS term. If your
// field has only one natural anchor list, leave this empty ([]) and tier (b)
// will simply use PRIMARY_ANCHORS.
const SECONDARY_ANCHORS = [
  /\b(patients?|hospitali[sz]ations?|clinics?|clinicians?)\b/i,
  /\b(livestock|poultry|cattle|swine|zoonotic)\b/i,
];

// Short words shown after a context-tier match in the Digest's matched-topics
// column, e.g. "outbreak (+disease)". Purely cosmetic.
const ANCHOR_LABELS = {
  primary: 'disease',
  secondary: 'population',
};

// Phrases blanked out before matching because they contain a topic word
// without being about the topic — typically an outlet's own name, which
// appears in its headlines and summaries. Example: if "Outbreak Today" were
// a feed you read, add /\bOutbreak Today\b/gi so its name stops matching
// "outbreak".
const NON_TOPIC_PHRASES = [];

// Rewrites applied to headline and summary text BEFORE matching, so spelling
// quirks in one outlet's house style match your terms. Entries are
// {pattern, replacement}. Example: the New York Times writes "A.I.", which
// would never match the term "ai"; this maps it to "AI":
//   { pattern: /\bA\.I\.(?=\s|$|[^\w])/g, replacement: 'AI' },
const TEXT_NORMALIZATIONS = [];

// ---------------------------------------------------------------------------
// 2. OUTLET-SPECIFIC EXCLUSION PATTERNS
// ---------------------------------------------------------------------------
//
// Regexes matched against an article's TITLE. Use these for recurring
// non-article items a feed emits — newsletters, link roundups, podcast
// episode stubs, job boards. Ships empty; populate from what you observe
// in a real run, not in advance.
//
// Shape: { outlet: 'Exact Outlet Name', pattern: /^Sponsored:/i },
const OUTLET_SKIP_PATTERNS = [];

// ---------------------------------------------------------------------------
// 3. FILTER CONFIGURATION
// ---------------------------------------------------------------------------
//
// There are no switches here any more. Earlier versions had a FILTER_CONFIG
// block, HIGH_/LOW_CONFIDENCE_TOPICS, LIFESTYLE_ONLY_TOPICS and
// AMBIGUOUS_TOPICS, with outlet tier changing how strict the filter was.
// The three tiers in section 1 replace all of them. Outlet tier (section 4)
// is still recorded on each Digest row but no longer affects relevance.

// ---------------------------------------------------------------------------
// 4. OUTLETS
// ---------------------------------------------------------------------------
//
// tier 1 = covers your beat and little else. tier 2 = general-interest, where
// your subject is one of many things covered. The tier is recorded on each
// Digest row but does not change what counts as relevant, so use tier 1 for
// outlets you would read most of, and tier 2 for the rest.
//
// isPaywalled does not change fetching — RSS metadata is public either way.
// It only marks the row in the Sheet so you know before clicking.
//
// Before adding a feed, open the URL in a browser and confirm it returns XML.
// Publishers move and retire feeds constantly; a dead feed fails silently
// except for a line in the Run Log's Errors column.
const OUTLETS = [

  // =========================================================================
  // TIER 1: BEAT-SPECIFIC OUTLETS — ADD YOUR OWN
  // =========================================================================
  //
  // Ships empty on purpose: the outlets covering your beat are the part of
  // this file nobody else can write for you. Newsletters are often the best
  // sources here — most Substack publications expose a feed at
  // <publication>.substack.com/feed.
  //
  // Shape:
  //   { name: 'Some Beat Newsletter', tier: 1, feedUrl: 'https://example.substack.com/feed', isPaywalled: false, enabled: true },

  // =========================================================================
  // TIER 2: GENERAL-INTEREST & POLICY OUTLETS
  // =========================================================================
  //
  // These are field-neutral science, technology and policy desks, included as
  // working defaults so the Scout does something useful on its first run.
  // Prune the ones irrelevant to you rather than keeping all of them.
  { name: 'Vox (Technology)', tier: 2, feedUrl: 'https://www.vox.com/rss/technology/index.xml', isPaywalled: false, enabled: true },
  { name: 'Aeon', tier: 2, feedUrl: 'https://aeon.co/feed.rss', isPaywalled: false, enabled: true },
  { name: 'Wired', tier: 2, feedUrl: 'https://www.wired.com/feed/rss', isPaywalled: true, enabled: true },
  { name: 'MIT Technology Review', tier: 2, feedUrl: 'https://www.technologyreview.com/feed/', isPaywalled: true, enabled: true },
  { name: 'Ars Technica', tier: 2, feedUrl: 'https://arstechnica.com/feed/', isPaywalled: false, enabled: true },
  { name: 'Tech Policy Press', tier: 2, feedUrl: 'https://techpolicy.press/rss/feed.xml', isPaywalled: false, enabled: true },
  { name: 'The Guardian (Science)', tier: 2, feedUrl: 'https://www.theguardian.com/science/rss', isPaywalled: false, enabled: true },
  { name: 'Undark', tier: 2, feedUrl: 'https://undark.org/feed/', isPaywalled: false, enabled: true },
  { name: 'New York Times (Science)', tier: 2, feedUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml', isPaywalled: true, enabled: true },
];

// ---------------------------------------------------------------------------
// 5. SHEET TAB NAMES
// ---------------------------------------------------------------------------
const SHEET_TABS = {
  digest: 'Digest',     // main output: one row per relevant new article
  runLog: 'Run Log',    // one row per script execution, for debugging
};

// ---------------------------------------------------------------------------
// 6. LOOKBACK WINDOW
// ---------------------------------------------------------------------------
//
// How many days back to consider an article "new". Keep this comfortably
// LONGER than the gap between runs, so a run that fails or is skipped does
// not leave a permanent hole. Daily trigger: 2 is a sensible default.
// Weekly trigger: use 8 or 9, not 7.
const LOOKBACK_DAYS = 2;

/**
 * Returns the cutoff date (ISO 'YYYY-MM-DD') for "new enough to include
 * this run". Every fetch file should use this rather than computing its
 * own cutoff.
 * @return {string}
 */
function getLookbackCutoffDate() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  return Utilities.formatDate(cutoff, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// ---------------------------------------------------------------------------
// 7. SLACK SETTINGS
// ---------------------------------------------------------------------------
//
// The webhook URL is NOT stored here. It lives in Script Properties under
// SLACK_WEBHOOK_URL — a webhook is a credential, and anything in this file
// ends up in version control. See postToSlack.gs for the setup steps.
const SLACK = {

  // Leave false until you have posted a test message successfully.
  enabled: false,

  // Above this many articles in one run, post a single summary message
  // instead of one message per article, so a heavy news day does not
  // flood the channel.
  maxIndividualPosts: 8,
};
