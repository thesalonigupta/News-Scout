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
 * sports. So this file splits topics by CONFIDENCE rather than treating them
 * as one flat list, and relevanceFilter.gs applies a different bar depending
 * on which tier a term came from and which tier of outlet it appeared in.
 */

// ---------------------------------------------------------------------------
// 1. NEWS TOPICS — CONFIDENCE TIERS
// ---------------------------------------------------------------------------
//
// HIGH_CONFIDENCE_TOPICS: terms of art. If a general-interest outlet prints
// one of these, the article is almost certainly about your field. These are
// the terms that are allowed to carry an article into the Digest on their
// own. A good test: could a lifestyle writer use this phrase without meaning
// your field? If yes, it belongs one tier down.
const HIGH_CONFIDENCE_TOPICS = [
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
];

// LOW_CONFIDENCE_TOPICS: real terms in your field that are also ordinary
// English, or that appear constantly in coverage only loosely related to your
// work. These count, but (depending on FILTER_CONFIG below) may need either a
// beat-specific outlet or a second matched topic to make it through.
const LOW_CONFIDENCE_TOPICS = [
  'outbreak',
  'epidemic',
  'pandemic preparedness',
  'public health',
  'immunity',
  'variant',
  'quarantine',
  'vaccination rates',
];

// LIFESTYLE_ONLY_TOPICS: terms that a consumer or lifestyle desk uses in a
// sense that has nothing to do with your field. Matching one of these alone
// is treated as evidence AGAINST relevance, not for it.
const LIFESTYLE_ONLY_TOPICS = [
  'immune boosting',
  'detox',
  'superfood',
  'wellness',
];

// AMBIGUOUS_TOPICS: terms with a precise meaning in your field and a common,
// unrelated meaning elsewhere. These are still worth tracking, but only count
// when another matched topic corroborates them. Add a term here the first
// time you see it drag in an article from an unrelated beat — moving it here
// is almost always better than deleting it, which loses the real matches too.
const AMBIGUOUS_TOPICS = [
  'transmission',   // also: car transmissions, data transmission
  'carrier',        // also: airlines, phone carriers, aircraft carriers
  'exposure',       // also: photography, finance, publicity
  'incidence',      // also: general statistical usage
];

// The flat list the fetchers and the filter actually match against.
const NEWS_TOPICS = HIGH_CONFIDENCE_TOPICS.concat(LOW_CONFIDENCE_TOPICS);

// ---------------------------------------------------------------------------
// 2. OUTLET-SPECIFIC EXCLUSION PATTERNS
// ---------------------------------------------------------------------------
//
// Regexes matched against an article's TITLE. Use these for recurring
// non-article items a feed emits — newsletters, link roundups, podcast
// episode stubs, job boards. Ships empty; populate from what you observe.
//
// Example:
//   /^(the )?week in review/i,
//   /^jobs? (board|roundup)/i,
const OUTLET_SKIP_PATTERNS = [];

// ---------------------------------------------------------------------------
// 3. FILTER CONFIGURATION
// ---------------------------------------------------------------------------
//
// These five switches decide how strict the filter is. Everything rejected
// is gone with no record, so change one at a time and compare the Run Log's
// "Relevant After Filter" count before and after.
const FILTER_CONFIG = {

  // A HIGH_CONFIDENCE_TOPICS match alone is enough, from any outlet.
  // Turn off only if your high-confidence list is letting noise through,
  // which usually means a term in it belongs one tier down instead.
  trustHighConfidence: true,

  // Require two distinct matched topics rather than one. Off by default:
  // news articles are short, and a single term of art is usually the only
  // signal you get. Turn on if you are drowning.
  requireMultipleMatches: false,

  // Apply a looser bar to tier-1 (beat-specific) outlets, on the reasoning
  // that an outlet covering only your beat has already done the filtering.
  trustTier1Outlets: true,

  // Minimum topic confidence required, per outlet tier. 'low' accepts a
  // LOW_CONFIDENCE_TOPICS match; 'high' demands a HIGH_CONFIDENCE_TOPICS one.
  tier1MinimumConfidence: 'low',
  tier2MinimumConfidence: 'high',
};

// ---------------------------------------------------------------------------
// 4. OUTLETS
// ---------------------------------------------------------------------------
//
// tier 1 = covers your beat and little else. tier 2 = general-interest, where
// your subject is one of many things covered. The tier drives how strict the
// filter is (see FILTER_CONFIG above), so put an outlet in tier 1 only if you
// would read most of what it publishes.
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
