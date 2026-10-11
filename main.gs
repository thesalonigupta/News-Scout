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

  const candidates = timedStep_('1. fetch outlets', function() {
    return fetchAllOutlets(); // fetchRss.gs; per-outlet errors handled internally
  });
  const newArticles = timedStep_('2. dedupe', function() {
    return filterToNewArticles(candidates);
  });
  const relevantNewArticles = timedStep_('3. relevance filter', function() {
    return filterToRelevantArticles(newArticles);
  });
  timedStep_('4. write to sheet', function() {
    appendArticlesToDigest(relevantNewArticles);
    return relevantNewArticles;
  });
  const slackErrors = timedStep_('5. post to Slack', function() {
    return postArticlesToSlack(relevantNewArticles);
  });

  timedStep_('6. log run', function() {
    logRun({
      startedAt: runStartedAt,
      finishedAt: new Date(),
      candidatesFound: candidates.length,
      newAfterDedupe: newArticles.length,
      relevantAfterFilter: relevantNewArticles.length,
      errors: slackErrors,
    });
  });
}

/**
 * Logs a line before and after each step (added 2026-10-11) so a timed-out
 * run's execution log shows which step it was stuck in: the last "START"
 * line with no matching "done" line.
 */
function timedStep_(label, fn) {
  console.log('START ' + label);
  const started = Date.now();
  const result = fn();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const count = Array.isArray(result) ? ' (' + result.length + ' items)' : '';
  console.log('done  ' + label + ' in ' + seconds + 's' + count);
  return result;
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
 *   [KEPT] <matched terms> — <outlet>: <title>
 *   [dropped: <reason>] — <outlet>: <title>
 *
 * Reasons (from relevanceFilter.gs): "no topic match", "context term(s)
 * without a required anchor mention: ...", "only weak term(s) outside the
 * title: ...", "outlet skip pattern". Scan the dropped lines for anything
 * a human reader of your field would consider relevant; if you find one,
 * add a term to the right tier in config.gs — only after observing a real
 * miss.
 */
function testRelevanceFilterAudit() {
  const candidates = fetchAllOutlets();
  let keptCount = 0;

  candidates.forEach(function(article) {
    const result = checkRelevance(article);

    if (result.isRelevant) {
      keptCount++;
      Logger.log('[KEPT] %s — %s: %s', result.matchedTopics.join(', '), article.outlet, article.title);
    } else {
      Logger.log('[dropped: %s] — %s: %s', result.reason, article.outlet, article.title);
    }
  });

  Logger.log('--- Audit complete: %s of %s candidates kept ---', keptCount, candidates.length);
}
