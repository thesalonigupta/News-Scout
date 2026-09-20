/**
 * main.gs
 *
 * The orchestrator. This is the ONLY function a time-based trigger should
 * call (runNewsScout). Same shape as the Literature Scout's main.gs:
 *
 *   1. Fetch candidates from every enabled outlet (config.gs)
 *   2. Dedupe against the Sheet + within this batch (dedupe.gs)
 *   3. Filter to relevant articles only (relevanceFilter.gs)
 *   4. Write surviving articles to the Sheet (writeToSheet.gs)
 *   5. Post surviving articles to Slack (postToSlack.gs) — no-op unless
 *      SLACK.enabled is true
 *   6. Log the run's outcome to the Run Log tab
 */

/**
 * Entry point. Set a time-based trigger (Apps Script editor > Triggers >
 * Add Trigger > choose this function) to run automatically — daily is
 * recommended given the 2-day LOOKBACK_DAYS in config.gs.
 */
function runNewsScout() {
  const runStartedAt = new Date();

  const candidates = fetchAllOutlets(); // fetchRss.gs; per-outlet errors handled internally

  const newArticles = filterToNewArticles(candidates);
  const relevantNewArticles = filterToRelevantArticles(newArticles);

  appendArticlesToDigest(relevantNewArticles);

  const slackErrors = postArticlesToSlack(relevantNewArticles);

  logRun({
    startedAt: runStartedAt,
    finishedAt: new Date(),
    candidatesFound: candidates.length,
    newAfterDedupe: newArticles.length,
    relevantAfterFilter: relevantNewArticles.length,
    errors: slackErrors,
  });
}

const RUN_LOG_HEADERS = [
  'Run Started',
  'Duration',
  'Candidates Found',
  'New After Dedupe',
  'Relevant After Filter',
  'Errors',
];

/**
 * Appends one row to the Run Log tab summarizing a run.
 * @param {{startedAt: Date, finishedAt: Date, candidatesFound: number,
 *          newAfterDedupe: number, relevantAfterFilter: number,
 *          errors: string[]}} summary
 */
function logRun(summary) {
  const sheet = getRunLogSheet();
  const tz = Session.getScriptTimeZone();

  const row = [
    Utilities.formatDate(summary.startedAt, tz, 'yyyy-MM-dd HH:mm:ss'),
    Math.round((summary.finishedAt - summary.startedAt) / 1000) + 's',
    summary.candidatesFound,
    summary.newAfterDedupe,
    summary.relevantAfterFilter,
    summary.errors.length > 0 ? summary.errors.join(' | ') : '',
  ];

  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

function getRunLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_TABS.runLog);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_TABS.runLog);
    sheet.getRange(1, 1, 1, RUN_LOG_HEADERS.length).setValues([RUN_LOG_HEADERS]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Convenience function for manual testing: runs every enabled outlet's
 * fetch and logs a per-outlet candidate count (or error) to View > Logs,
 * WITHOUT writing to the Sheet or posting to Slack.
 *
 * RUN THIS FIRST, before ever running runNewsScout for real — several
 * feedUrls in OUTLETS (config.gs) were assembled from documented
 * conventions but not individually load-tested. This is how you find out
 * which ones need fixing.
 */
function testFetchAllOutletsWithoutWriting() {
  OUTLETS.forEach(function(outlet) {
    if (!outlet.enabled) {
      Logger.log('%s: skipped (disabled)', outlet.name);
      return;
    }
    try {
      const articles = fetchOutletFeed(outlet);
      Logger.log('%s: %s candidates', outlet.name, articles.length);
    } catch (err) {
      Logger.log('%s: ERROR — %s', outlet.name, err);
    }
  });
}

/**
 * Audits the relevance filter against every candidate currently in the
 * lookback window, WITHOUT writing to the Sheet, posting to Slack, or
 * running dedupe (so already-logged articles show up here too — dedupe
 * status is irrelevant to whether the FILTER made the right call).
 *
 * Logs one line per candidate:
 *   [KEPT] <topics> — <outlet>: <title>
 *   [dropped: no topic match] — <outlet>: <title>
 *   [dropped: only ambiguous match on "X", no corroborating topic] — <outlet>: <title>
 *
 * The point is to make false negatives visible, not just false
 * positives. NEWS_TOPICS is an OR-match cast-a-wide-net list (see
 * config.gs), so a genuine miss usually means either the article used
 * phrasing that isn't in NEWS_TOPICS at all, or it only hit an
 * AMBIGUOUS_TOPICS term with nothing else to corroborate it. Scan the
 * "dropped" lines for anything a human reader would consider relevant
 * to your field; if you find one, that's a real signal to add a term to
 * NEWS_TOPICS — same "only add after observing it in a real run" rule
 * config.gs already uses for AMBIGUOUS_TOPICS, just pointed the other way.
 */
function testRelevanceFilterAudit() {
  const candidates = fetchAllOutlets();
  let keptCount = 0;

  candidates.forEach(function(article) {
    const result = checkRelevance(article);

    if (result.isRelevant) {
      keptCount++;
      Logger.log('[KEPT] %s — %s: %s', result.matchedTopics.join(', '), article.outlet, article.title);
      return;
    }

    if (result.matchedTopics.length === 0) {
      Logger.log('[dropped: no topic match] — %s: %s', article.outlet, article.title);
    } else {
      Logger.log(
        '[dropped: only ambiguous match on "%s", no corroborating topic] — %s: %s',
        result.matchedTopics.join('", "'), article.outlet, article.title
      );
    }
  });

  Logger.log('--- Audit complete: %s of %s candidates kept ---', keptCount, candidates.length);
}
