/**
 * normalize.gs
 *
 * Every outlet's RSS/Atom feed returns slightly different field names and
 * date formats. This file defines the ONE common shape every fetch
 * function must produce, so dedupe.gs / relevanceFilter.gs / writeToSheet.gs
 * never need to know or care which outlet an article came from.
 */

/**
 * The common article shape. fetchRss.gs must produce an array of objects
 * matching this shape.
 *
 * @typedef {Object} NormalizedArticle
 * @property {string} title          - Headline, whitespace-collapsed.
 * @property {string} snippet        - Dek / summary / first paragraph —
 *                                      whatever the feed provides. This is
 *                                      the ONLY body text this tool ever
 *                                      stores; see fetchRss.gs for why
 *                                      that's a deliberate choice re: paywalls.
 * @property {string} link           - Canonical article URL.
 * @property {string} outlet         - Outlet display name (from OUTLETS
 *                                      in config.gs).
 * @property {number} tier           - 1 or 2, from OUTLETS in config.gs.
 * @property {string} publishedDate  - ISO 8601 date string (YYYY-MM-DD).
 * @property {boolean} isPaywalled   - From OUTLETS config — this is a
 *                                      per-outlet setting, not detected
 *                                      per-article.
 * @property {string} titleHash      - Computed automatically by
 *                                      makeNormalizedArticle(); do not set
 *                                      this yourself.
 */

/**
 * Builds a NormalizedArticle object and computes its titleHash. ALWAYS
 * use this constructor in fetchRss.gs rather than building the object
 * literal by hand.
 *
 * @param {Object} fields - All NormalizedArticle fields except titleHash.
 * @return {NormalizedArticle}
 */
function makeNormalizedArticle(fields) {
  const title = (fields.title || '').trim();

  if (!title) {
    throw new Error(
      'makeNormalizedArticle: title is required but was empty. ' +
      'Outlet: ' + (fields.outlet || 'unknown')
    );
  }

  return {
    title: collapseWhitespace(title),
    snippet: collapseWhitespace(fields.snippet || ''),
    link: sanitizeLink(fields.link || ''),
    outlet: fields.outlet || 'unknown',
    tier: fields.tier || 2,
    publishedDate: fields.publishedDate || '',
    isPaywalled: !!fields.isPaywalled,
    titleHash: computeTitleHash(title),
  };
}

/**
 * Trims stray characters that occasionally show up around a URL in feed
 * data (tracking params with trailing junk, angle brackets, etc.) — same
 * narrow defensive trim as the Literature Scout's normalize.gs.
 * @param {string} raw
 * @return {string}
 */
function sanitizeLink(raw) {
  return String(raw || '')
    .trim()
    .replace(/^[<\s]+/, '')
    .replace(/[>\s]+$/, '');
}

/**
 * Collapses whitespace (including newlines) into single spaces and trims.
 * @param {string} text
 * @return {string}
 */
function collapseWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/**
 * Computes a stable hash of a normalized title — the dedupe fallback when
 * two articles about the SAME story have different canonical links (e.g.
 * a wire-service piece syndicated with a different URL). Same approach as
 * the Literature Scout's computeTitleHash: lowercase, strip punctuation,
 * collapse whitespace, then hash — exact-match only, not fuzzy.
 *
 * @param {string} title
 * @return {string} Hex-encoded hash string.
 */
function computeTitleHash(title) {
  const normalized = String(title)
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const rawHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    normalized,
    Utilities.Charset.UTF_8
  );

  return rawHash
    .map(function(byte) {
      const hex = (byte & 0xff).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    })
    .join('');
}