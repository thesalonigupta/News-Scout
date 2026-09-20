/**
 * relevanceFilter.gs (UPDATED VERSION)
 *
 * NEW: Three-tier confidence system with outlet-tier awareness.
 *
 * Topics are split into:
 *   HIGH_CONFIDENCE — rigorous research/policy terms, safe to match alone
 *   LOW_CONFIDENCE — appear in both research AND lifestyle, need corroboration
 *   LIFESTYLE_ONLY — consumer/product terms, need HIGH_CONFIDENCE pairing
 *
 * Outlet-tier aware:
 *   Tier 1 (beat-specific) outlets get lenient matching on LOW_CONFIDENCE terms
 *   Tier 2 (general-interest) outlets require HIGH_CONFIDENCE or multiple matches
 *
 * BACKWARD COMPATIBLE: checkRelevance() still works (wraps new scoreArticleRelevance)
 * DEBUGGING HELPER: testRelevanceFilterAuditWithScores() shows scoring details
 */

/**
 * Main scoring engine. Evaluates article relevance and returns detailed results.
 *
 * @param {NormalizedArticle} article - Article to score
 * @return {{
 *   score: number,              // 0-100 confidence
 *   isRelevant: boolean,        // Keep or drop decision
 *   matchedTopics: string[],    // Which topics matched (HIGH + LOW only)
 *   reasoning: string           // Explanation for debugging
 * }}
 */
function scoreArticleRelevance(article) {
  const haystack = (article.title + ' ' + article.snippet).toLowerCase();
  const outlet = article.outlet;
  const tier = article.tier;

  // =========================================================================
  // STEP 1: Check outlet-specific skip patterns
  // =========================================================================
  for (let i = 0; i < OUTLET_SKIP_PATTERNS.length; i++) {
    const skipRule = OUTLET_SKIP_PATTERNS[i];
    if (skipRule.outlet === outlet && skipRule.pattern.test(haystack)) {
      return {
        score: 0,
        isRelevant: false,
        matchedTopics: [],
        reasoning: 'Outlet skip pattern matched: ' + skipRule.pattern.toString(),
      };
    }
  }

  // =========================================================================
  // STEP 2: Scan for all matched topics, categorized by confidence level
  // =========================================================================
  const matchedHigh = [];
  const matchedLow = [];
  const matchedLifestyle = [];

  HIGH_CONFIDENCE_TOPICS.forEach(function(topic) {
    if (haystack.indexOf(topic.toLowerCase()) !== -1) {
      matchedHigh.push(topic);
    }
  });

  LOW_CONFIDENCE_TOPICS.forEach(function(topic) {
    if (haystack.indexOf(topic.toLowerCase()) !== -1) {
      matchedLow.push(topic);
    }
  });

  LIFESTYLE_ONLY_TOPICS.forEach(function(topic) {
    if (haystack.indexOf(topic.toLowerCase()) !== -1) {
      matchedLifestyle.push(topic);
    }
  });

  // =========================================================================
  // STEP 3: Compute confidence score based on match distribution
  // =========================================================================
  let score = 0;
  let reasoning = '';

  if (matchedHigh.length > 0) {
    // HIGH_CONFIDENCE matches are the gold standard
    score = 100 - (matchedHigh.length > 1 ? 0 : 5);
    reasoning = matchedHigh.length + ' high-confidence match(es)';
  } else if (matchedLow.length > 1) {
    // 2+ LOW_CONFIDENCE matches = reasonable confidence
    score = 80;
    reasoning = matchedLow.length + ' low-confidence matches';
  } else if (matchedLow.length === 1) {
    // Single LOW_CONFIDENCE match: depends on outlet tier
    if (tier === 1 && FILTER_CONFIG.tier1MinimumConfidence === 'low') {
      // Tier 1 outlets (beat-specific) are trusted on weak signals
      score = 70;
      reasoning = '1 low-confidence match (Tier 1 outlet, trusted)';
    } else if (tier === 2 && FILTER_CONFIG.tier2MinimumConfidence === 'low') {
      // Tier 2 outlets (general-interest) on low confidence = weak signal
      score = 60;
      reasoning = '1 low-confidence match (Tier 2 outlet, requires corroboration)';
    } else {
      // Tier 2 outlet with tier2MinimumConfidence='high' (default)
      // Single LOW_CONFIDENCE match alone is insufficient
      score = 45;
      reasoning = '1 low-confidence match (Tier 2 outlet, requires HIGH_CONFIDENCE corroboration)';
    }
  }

  // =========================================================================
  // STEP 4: PENALTY: Lifestyle-only false positive without corroboration
  // =========================================================================
  // If the article matched ONLY lifestyle terms (no HIGH_CONFIDENCE terms),
  // apply a major penalty. This catches "Friend AI pendant" product reviews,
  // wellness/lifestyle pieces on AI companions, etc.
  if (matchedLifestyle.length > 0 && matchedHigh.length === 0) {
    score = Math.max(0, score - 50);
    if (reasoning) reasoning += ' | ';
    reasoning += 'Lifestyle-only topic(s): ' + matchedLifestyle.join(', ');
  }

  // =========================================================================
  // STEP 5: Final decision based on score and configuration
  // =========================================================================
  let isRelevant = false;

  // Decision logic:
  // - HIGH_CONFIDENCE match with no lifestyle-only false positive = include
  // - Score >= 70 = include
  // - Anything else = drop
  if (FILTER_CONFIG.trustHighConfidence && matchedHigh.length > 0 && matchedLifestyle.length === 0) {
    isRelevant = true;
  } else if (score >= 70) {
    isRelevant = true;
  }

  // =========================================================================
  // STEP 6: Return detailed results
  // =========================================================================
  // Combine HIGH + LOW matched topics for display (don't expose lifestyle matches)
  const allMatched = matchedHigh.concat(matchedLow);

  return {
    score: Math.round(score),
    isRelevant: isRelevant,
    matchedTopics: allMatched,
    reasoning: reasoning || 'No topic matches',
  };
}

/**
 * BACKWARD COMPATIBLE WRAPPER
 *
 * Existing code calling checkRelevance() continues to work unchanged.
 * This function just delegates to scoreArticleRelevance() and returns
 * the same shape it always did.
 *
 * @param {NormalizedArticle} article
 * @return {{isRelevant: boolean, matchedTopics: string[]}}
 */
function checkRelevance(article) {
  const result = scoreArticleRelevance(article);
  return {
    isRelevant: result.isRelevant,
    matchedTopics: result.matchedTopics,
  };
}

/**
 * Filters a list of NormalizedArticles down to only the relevant ones.
 * Attaches matchedTopics to each surviving article for display in the
 * Digest sheet and Slack posts.
 *
 * ALSO ATTACHES (NEW):
 *   - article.relevanceScore: numeric score (0-100)
 *   - article.relevanceReasoning: explanation of why it was kept/dropped
 *
 * These extras are useful for debugging and future enhancements (e.g.,
 * sorting by confidence, showing reasoning in extended Digest views).
 *
 * @param {NormalizedArticle[]} articles
 * @return {NormalizedArticle[]} - Filtered list with matchedTopics attached
 */
function filterToRelevantArticles(articles) {
  const relevant = [];

  articles.forEach(function(article) {
    const result = scoreArticleRelevance(article);
    if (result.isRelevant) {
      article.matchedTopics = result.matchedTopics;
      article.relevanceScore = result.score;        // NEW
      article.relevanceReasoning = result.reasoning; // NEW
      relevant.push(article);
    }
  });

  return relevant;
}

// ===========================================================================
// DEBUGGING & AUDITING
// ===========================================================================

/**
 * Enhanced audit function showing scores and reasoning for every candidate.
 * Run this to understand why articles are being kept or dropped.
 *
 * Usage:
 *   Function dropdown → testRelevanceFilterAuditWithScores → Run
 *   View → Logs to see results
 *
 * Output format:
 *   [KEPT] score=95 | topics — outlet (Tier N): title
 *   [score=45 | DROPPED] reasoning — outlet (Tier N): title
 */
function testRelevanceFilterAuditWithScores() {
  const candidates = fetchAllOutlets();
  let keptCount = 0;
  const scores = [];

  Logger.log('--- Relevance Filter Audit (Confidence Tiers) ---');

  candidates.forEach(function(article) {
    const result = scoreArticleRelevance(article);
    scores.push(result.score);

    if (result.isRelevant) {
      keptCount++;
      Logger.log(
        '[KEPT] score=%d | %s — %s (Tier %d): %s',
        result.score,
        result.matchedTopics.join(', '),
        article.outlet,
        article.tier,
        article.title
      );
    } else if (result.matchedTopics.length > 0) {
      // Show dropped articles that DID match something (to help debug)
      Logger.log(
        '[score=%d | DROPPED] %s — %s (Tier %d): %s',
        result.score,
        result.reasoning,
        article.outlet,
        article.tier,
        article.title
      );
    }
    // Skip logging articles with 0 matches (too much noise)
  });

  // Calculate statistics
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce(function(a, b) { return a + b; }) / scores.length)
    : 0;

  Logger.log('--- Audit Summary ---');
  Logger.log('Candidates: %d', candidates.length);
  Logger.log('Kept: %d', keptCount);
  Logger.log('Dropped: %d', candidates.length - keptCount);
  Logger.log('Average score: %d', avgScore);
  Logger.log('Min score (kept): %d', scores.length > 0 ? Math.min.apply(null, scores.filter(function(s) { return s >= 70; })) : 'N/A');
  Logger.log('Max score (dropped): %d', scores.length > 0 ? Math.max.apply(null, scores.filter(function(s) { return s < 70; })) : 'N/A');
}

/*
 * NOTE: a backward-compatibility alias named testRelevanceFilterAudit()
 * used to live here, delegating to testRelevanceFilterAuditWithScores().
 * It has been removed because main.gs defines a function of that name too,
 * and Apps Script puts every file in one shared global scope — whichever
 * loaded last silently won, so running "testRelevanceFilterAudit" from the
 * editor gave you one of two different audits depending on file order.
 *
 * Use testRelevanceFilterAuditWithScores() for the scored audit, or
 * testRelevanceFilterAudit() in main.gs for the kept/dropped audit.
 */

// ===========================================================================
// HELPER FUNCTION: Is a match "unambiguous"?
// ===========================================================================
// This function is from the original relevanceFilter.gs. It's kept for
// reference but is NOT used by the new scoreArticleRelevance() system.
// The new system handles ambiguity via the three-tier (HIGH/LOW/LIFESTYLE)
// confidence classification instead of post-hoc checking.
//
// Kept here in case external code depends on it, but the main filtering
// now happens in scoreArticleRelevance() itself.

/**
 * A matched topic counts on its own UNLESS it's in AMBIGUOUS_TOPICS, in
 * which case it only counts if at least one OTHER matched topic is
 * present alongside it.
 *
 * NOTE: This is the OLD logic, kept for backward compatibility. The new
 * system doesn't use this — it relies on the HIGH/LOW/LIFESTYLE tier
 * classification in scoreArticleRelevance() instead.
 *
 * @param {string} topic
 * @param {string[]} allMatchedTopics
 * @return {boolean}
 */
function isUnambiguousMatch(topic, allMatchedTopics) {
  if (AMBIGUOUS_TOPICS.indexOf(topic) === -1) {
    return true;
  }
  return allMatchedTopics.some(function(other) {
    return other !== topic;
  });
}
