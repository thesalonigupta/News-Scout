/**
 * relevanceFilter.gs (News Scout)
 *
 * Cheap, no-LLM relevance check using the three-tier rules configured in
 * config.gs (section 1) — the same design as the Literature Scout. An
 * article counts if it matches:
 *
 *   (a) a CORE_TOPICS term on its own, or
 *   (b) a BROAD_CONTEXT_TOPICS term plus a mention of a PRIMARY or
 *       SECONDARY anchor, or
 *   (c) a NARROW_CONTEXT_TOPICS term plus a mention of a PRIMARY anchor,
 *
 * where terms in WEAK_TOPICS count only if they appear in the TITLE or the
 * article also matches another, non-weak term. Text checked = title +
 * snippet (the feed's dek/summary — never full article text).
 *
 * Outlet tier is still recorded on each row but does not affect relevance.
 * The only per-outlet control is OUTLET_SKIP_PATTERNS (config.gs section 2).
 *
 * Runs AFTER dedupe.gs. Patterns are compiled once per execution.
 */

let COMPILED_TOPIC_TIERS_ = null;

/**
 * Filters candidate articles down to relevant ones, attaching
 * matchedTopics to each survivor for the Sheet and Slack.
 * This is the function main.gs calls.
 *
 * @param {NormalizedArticle[]} articles
 * @return {NormalizedArticle[]}
 */
function filterToRelevantArticles(articles) {
  const relevant = [];
  articles.forEach(function(article) {
    const result = checkRelevance(article);
    if (result.isRelevant) {
      article.matchedTopics = result.matchedTopics;
      relevant.push(article);
    }
  });
  return relevant;
}

/**
 * Checks a single article against your topic lists.
 *
 * @param {NormalizedArticle} article
 * @return {{isRelevant: boolean, matchedTopics: string[], reason: string}}
 *         matchedTopics lists the terms that made the article count (for
 *         context-tier matches, with the anchor that satisfied them).
 *         reason explains a drop, for testRelevanceFilterAudit.
 */
function checkRelevance(article) {
  if (isSkippedByOutletPattern(article)) {
    return { isRelevant: false, matchedTopics: [], reason: 'outlet skip pattern' };
  }
  return evaluateRelevanceText(
    stripNonTopicPhrases(article.title),
    stripNonTopicPhrases(article.snippet)
  );
}

/**
 * Prepares text for matching: applies TEXT_NORMALIZATIONS, then blanks out
 * NON_TOPIC_PHRASES (both in config.gs).
 */
function stripNonTopicPhrases(text) {
  let str = String(text || '');
  TEXT_NORMALIZATIONS.forEach(function(rule) {
    str = str.replace(rule.pattern, rule.replacement);
  });
  NON_TOPIC_PHRASES.forEach(function(re) { str = str.replace(re, ' '); });
  return str;
}

/**
 * The topic rules on plain text, independent of the article shape.
 * @param {string} title
 * @param {string} snippet
 * @return {{isRelevant: boolean, matchedTopics: string[], reason: string}}
 */
function evaluateRelevanceText(title, snippet) {
  const tiers = getCompiledTopicTiers();
  const titleText = String(title || '');
  const fullText = titleText + ' \n ' + String(snippet || '');

  const mentionsPrimary = tiers.primaryAnchors.some(function(re) { return re.test(fullText); });
  const mentionsSecondary = tiers.secondaryAnchors.some(function(re) { return re.test(fullText); });

  // Each candidate: {label, inTitle, weak}
  const hits = [];
  // Terms that matched but lacked the required anchor — reported on drops.
  const unanchored = [];

  function collect(list, anchorOk, anchorLabel) {
    list.forEach(function(term) {
      if (!term.re.test(fullText)) return;
      if (!anchorOk) {
        unanchored.push(term.label);
        return;
      }
      hits.push({
        label: anchorLabel ? term.label + ' (+' + anchorLabel + ')' : term.label,
        inTitle: term.re.test(titleText),
        weak: tiers.weak.has(term.label),
      });
    });
  }

  collect(tiers.core, true, '');
  collect(
    tiers.broadContext,
    mentionsPrimary || mentionsSecondary,
    mentionsPrimary ? ANCHOR_LABELS.primary : ANCHOR_LABELS.secondary
  );
  collect(tiers.narrowContext, mentionsPrimary, ANCHOR_LABELS.primary);

  const hasStrongHit = hits.some(function(h) { return !h.weak; });
  const counted = hits.filter(function(h) {
    return !h.weak || h.inTitle || hasStrongHit;
  });

  if (counted.length > 0) {
    return {
      isRelevant: true,
      matchedTopics: counted.map(function(h) { return h.label; }),
      reason: '',
    };
  }

  let reason = 'no topic match';
  if (hits.length > 0) {
    reason = 'only weak term(s) outside the title: ' + hits.map(function(h) { return h.label; }).join(', ');
  } else if (unanchored.length > 0) {
    reason = 'context term(s) without a required anchor mention: ' + unanchored.join(', ');
  }
  return { isRelevant: false, matchedTopics: [], reason: reason };
}

/**
 * True if the article's title matches an entry in OUTLET_SKIP_PATTERNS
 * (config.gs section 2), e.g. a recurring sponsored-post format.
 * Entries look like: { outlet: 'Outlet Name', pattern: /regex/i }
 */
function isSkippedByOutletPattern(article) {
  return OUTLET_SKIP_PATTERNS.some(function(entry) {
    return entry.outlet === article.outlet && entry.pattern.test(String(article.title || ''));
  });
}

/**
 * Compiles the three topic lists into regexes, once per execution.
 * A list entry is either a plain string (case-insensitive, spaces match
 * spaces or hyphens, optional plural "s") or {label, pattern} for terms
 * that need a custom regex.
 */
function getCompiledTopicTiers() {
  if (COMPILED_TOPIC_TIERS_) return COMPILED_TOPIC_TIERS_;

  function compile(list) {
    return list.map(function(entry) {
      if (typeof entry === 'string') {
        const body = entry
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/[\s-]+/g, '[\\s-]+');
        return { label: entry, re: new RegExp('\\b' + body + 's?\\b', 'i') };
      }
      return { label: entry.label, re: entry.pattern };
    });
  }

  COMPILED_TOPIC_TIERS_ = {
    core: compile(CORE_TOPICS),
    broadContext: compile(BROAD_CONTEXT_TOPICS),
    narrowContext: compile(NARROW_CONTEXT_TOPICS),
    weak: new Set(WEAK_TOPICS),
    primaryAnchors: PRIMARY_ANCHORS,
    secondaryAnchors: SECONDARY_ANCHORS,
  };
  return COMPILED_TOPIC_TIERS_;
}
