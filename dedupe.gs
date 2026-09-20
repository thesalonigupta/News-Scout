/**
 * dedupe.gs
 *
 * Decides whether a NormalizedArticle (normalize.gs) has already been
 * logged, checking TWO identifier columns in the Digest sheet, in order
 * of trust:
 *
 *   1. Link         (most trustworthy — canonical URL, rarely reused)
 *   2. Title hash    (fallback — exact-match only, catches the case where
 *                     the same article was somehow fetched via a
 *                     different URL, e.g. a tracking-param variant that
 *                     sanitizeLink didn't fully normalize)
 *
 * This is deliberately narrower than the Literature Scout's three-tier
 * check (DOI / arXiv ID / title hash) — there's no equivalent of a DOI
 * here, and no cross-outlet "same story, different outlet" clustering
 * either (see relevanceFilter.gs's header and the project's setup notes
 * for why: two outlets covering the same story intentionally produce two
 * rows, same as the Literature Scout treats two sources surfacing the
 * same paper). This only catches a single outlet's SAME article showing
 * up again across runs.
 *
 * Same in-memory-Set design as the Literature Scout's dedupe.gs: load
 * every existing identifier once per run, then check candidates against
 * the in-memory Sets rather than searching the Sheet per-candidate.
 */

/**
 * Loads every existing identifier from the Digest sheet into Sets.
 * Call once per run, then pass the result to isDuplicate() for every
 * candidate article.
 *
 * @return {{links: Set<string>, titleHashes: Set<string>}}
 */
function loadExistingIdentifiers() {
  const sheet = getDigestSheet();
  const lastRow = sheet.getLastRow();

  const existing = {
    links: new Set(),
    titleHashes: new Set(),
  };

  if (lastRow < 2) {
    return existing;
  }

  const columns = DIGEST_COLUMNS; // defined in writeToSheet.gs
  const numRows = lastRow - 1;

  const links = sheet.getRange(2, columns.link, numRows, 1).getValues();
  const titleHashes = sheet.getRange(2, columns.titleHash, numRows, 1).getValues();

  for (let i = 0; i < numRows; i++) {
    const link = String(links[i][0] || '').trim();
    const titleHash = String(titleHashes[i][0] || '').trim();

    if (link) existing.links.add(link);
    if (titleHash) existing.titleHashes.add(titleHash);
  }

  return existing;
}

/**
 * Checks whether a NormalizedArticle matches anything already logged.
 *
 * @param {NormalizedArticle} article
 * @param {{links: Set, titleHashes: Set}} existing - From
 *        loadExistingIdentifiers().
 * @return {{isDupe: boolean, matchedOn: string|null}}
 */
function isDuplicate(article, existing) {
  if (article.link && existing.links.has(article.link)) {
    return { isDupe: true, matchedOn: 'link' };
  }

  if (article.titleHash && existing.titleHashes.has(article.titleHash)) {
    return { isDupe: true, matchedOn: 'titleHash' };
  }

  return { isDupe: false, matchedOn: null };
}

/**
 * Filters a list of NormalizedArticles down to only the genuinely new
 * ones, AND prevents duplicates WITHIN the same batch (e.g. the same
 * article somehow appearing twice in one outlet's feed in a single run).
 * This is the function main.gs should call.
 *
 * @param {NormalizedArticle[]} candidates
 * @return {NormalizedArticle[]}
 */
function filterToNewArticles(candidates) {
  const existing = loadExistingIdentifiers();
  const seenInThisBatch = {
    links: new Set(),
    titleHashes: new Set(),
  };

  const newArticles = [];

  candidates.forEach(function(article) {
    if (isDuplicate(article, existing).isDupe) return;
    if (isDuplicate(article, seenInThisBatch).isDupe) return;

    if (article.link) seenInThisBatch.links.add(article.link);
    if (article.titleHash) seenInThisBatch.titleHashes.add(article.titleHash);

    newArticles.push(article);
  });

  return newArticles;
}