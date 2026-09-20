/**
 * writeToSheet.gs
 *
 * Owns the Digest sheet's column schema and all writes to it. Same
 * pattern as the Literature Scout: dedupe.gs reads DIGEST_COLUMNS too, so
 * reordering columns only requires editing this file.
 *
 * SHEET SETUP (one-time, manual): run setupDigestSheet() from the Apps
 * Script editor before the first real run — creates the Digest tab with
 * headers if it doesn't already exist.
 */

const DIGEST_COLUMNS = {
  dateAdded: 1,
  title: 2,
  snippet: 3,
  outlet: 4,
  tier: 5,
  publishedDate: 6,
  link: 7,
  matchedTopics: 8,
  paywalled: 9,
  titleHash: 10,
};

const DIGEST_HEADERS = [
  'Date Added',
  'Title',
  'Snippet',
  'Outlet',
  'Tier',
  'Published Date',
  'Link',
  'Matched Topics',
  'Paywalled',
  'Title Hash',
];

const SNIPPET_MAX_CHARS = 400;

/**
 * Gets the Digest sheet, creating it if it doesn't exist.
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getDigestSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_TABS.digest);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_TABS.digest);
    writeDigestHeaders(sheet);
  }

  return sheet;
}

/**
 * Writes (or overwrites) the header row. Safe to call multiple times.
 * @param {GoogleAppsScript.Spreadsheet.Sheet=} sheet
 */
function writeDigestHeaders(sheet) {
  const targetSheet = sheet || getDigestSheet();
  targetSheet.getRange(1, 1, 1, DIGEST_HEADERS.length).setValues([DIGEST_HEADERS]);
  targetSheet.setFrozenRows(1);
}

/**
 * Appends one row per article to the Digest sheet. Expects articles that
 * have ALREADY passed dedupe.gs and relevanceFilter.gs.
 *
 * @param {NormalizedArticle[]} articles - Each must have `matchedTopics`
 *        attached (see relevanceFilter.gs).
 */
function appendArticlesToDigest(articles) {
  if (articles.length === 0) return;

  const sheet = getDigestSheet();
  const now = new Date();
  const dateAdded = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const rows = articles.map(function(article) {
    const row = new Array(DIGEST_HEADERS.length);

    row[DIGEST_COLUMNS.dateAdded - 1] = dateAdded;
    row[DIGEST_COLUMNS.title - 1] = article.title;
    row[DIGEST_COLUMNS.snippet - 1] = truncateSnippet(article.snippet);
    row[DIGEST_COLUMNS.outlet - 1] = article.outlet;
    row[DIGEST_COLUMNS.tier - 1] = article.tier;
    row[DIGEST_COLUMNS.publishedDate - 1] = article.publishedDate;
    row[DIGEST_COLUMNS.link - 1] = article.link;
    row[DIGEST_COLUMNS.matchedTopics - 1] = (article.matchedTopics || []).join(', ');
    row[DIGEST_COLUMNS.paywalled - 1] = article.isPaywalled ? 'Yes' : 'No';
    row[DIGEST_COLUMNS.titleHash - 1] = article.titleHash;

    return row;
  });

  sheet
    .getRange(sheet.getLastRow() + 1, 1, rows.length, DIGEST_HEADERS.length)
    .setValues(rows);
}

/**
 * Truncates a snippet to SNIPPET_MAX_CHARS on a word boundary.
 * @param {string} snippet
 * @return {string}
 */
function truncateSnippet(snippet) {
  const text = snippet || '';
  if (text.length <= SNIPPET_MAX_CHARS) return text;

  const cut = text.slice(0, SNIPPET_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;

  return trimmed + '…';
}

/**
 * One-time setup helper — run manually before the first real run.
 */
function setupDigestSheet() {
  const sheet = getDigestSheet();
  writeDigestHeaders(sheet);
  Logger.log('Digest sheet "%s" is ready with %s columns.', SHEET_TABS.digest, DIGEST_HEADERS.length);
}