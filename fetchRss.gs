/**
 * fetchRss.gs
 *
 * Single generic fetcher used for every outlet in OUTLETS (config.gs).
 * Every news outlet here speaks the same RSS 2.0 (or Atom) dialect, so one
 * parser covers all of them; only the feed URL and metadata (tier,
 * isPaywalled) differ, and those live in config.gs.
 *
 * CONCURRENCY (changed 2026-08-03): outlets are now fetched CONCURRENTLY via
 * UrlFetchApp.fetchAll() instead of one at a time. A run's wall-clock was
 * dominated by network WAITING, not work — and sequential fetching made a
 * run take the SUM of every feed's response time, so one slow/hanging feed
 * stalled the whole run and slow feeds stacked (this is what produced the
 * 400s+ / 1000s+ spikes in the Run Log). fetchAll fires every request at
 * once and waits for them in parallel, so total time is ≈ the single
 * SLOWEST feed rather than the sum. This is safe here — unlike the
 * Literature Scout's ~70-request-per-source API loops — precisely because
 * each outlet is a DIFFERENT domain hit ONCE, so firing them together
 * doesn't hammer any one server and there's no rate limit to trip.
 *
 * What fetchAll does NOT do: make a genuinely slow feed fast. If a feed
 * hangs near the fetch timeout, the batch still waits for it — but only for
 * THAT one feed's wait, no longer for it PLUS every other feed. To remove
 * even that, disable a chronically slow feed (enabled: false in OUTLETS);
 * fetchAll caps the blast radius, disabling removes it. Run
 * testFetchAllOutletsWithoutWriting (main.gs) AT THE SCHEDULED RUN TIME to
 * find which feed(s) are slow, since feeds are often healthy off-peak.
 *
 * DELIBERATE SCOPE LIMIT — title/snippet only, never full text:
 * RSS feeds only ever include the headline plus a short dek/summary, which
 * is exactly the scope this tool was built for. Full article text is never
 * requested. This isn't a paywall workaround — it's simply never fetching
 * or storing more than the feed itself publishes.
 */

/**
 * Fetches and normalizes new articles from every enabled outlet, fetching
 * all feeds CONCURRENTLY. One outlet failing (bad URL, network error,
 * non-200) doesn't stop the others — every request is sent with
 * muteHttpExceptions so a failure comes back as an inspectable response
 * instead of throwing and taking the whole batch down.
 *
 * @return {NormalizedArticle[]}
 */
function fetchAllOutlets() {
  const enabledOutlets = OUTLETS.filter(function(outlet) {
    return outlet.enabled;
  });

  if (enabledOutlets.length === 0) {
    return [];
  }

  // Build one request object per enabled outlet. muteHttpExceptions on
  // EVERY request is what preserves per-outlet isolation under fetchAll: a
  // 404 / 500 / connection error comes back as a normal HTTPResponse we can
  // inspect and skip, rather than throwing and aborting the whole batch.
  const requests = enabledOutlets.map(function(outlet) {
    return {
      url: outlet.feedUrl,
      muteHttpExceptions: true,
      followRedirects: true,
    };
  });

  let responses;
  try {
    // THE KEY CHANGE: all feeds fetched at once. Wall-clock for this call
    // is ≈ the slowest single feed, not the sum of all of them.
    responses = UrlFetchApp.fetchAll(requests);
  } catch (err) {
    // Batch-level failure is rare (muteHttpExceptions handles the common
    // per-feed cases), but if the whole call throws we log and return
    // nothing rather than letting it escape into runNewsScout — the Run Log
    // will simply show 0 candidates for the day.
    Logger.log('fetchAllOutlets: fetchAll batch failed: %s', err);
    return [];
  }

  const allArticles = [];

  // fetchAll returns responses in the SAME ORDER as the requests, so
  // responses[i] corresponds to enabledOutlets[i].
  enabledOutlets.forEach(function(outlet, i) {
    const articles = processOutletResponse(outlet, responses[i]);
    allArticles.push.apply(allArticles, articles);
  });

  return allArticles;
}

/**
 * Fetches a SINGLE outlet's feed sequentially and returns its normalized
 * articles. Production (fetchAllOutlets) does NOT use this — it fetches
 * everything concurrently — but the per-outlet test helpers in main.gs do,
 * because timing or inspecting one feed at a time requires fetching it on
 * its own. Shares all parsing/filtering with the concurrent path via
 * processOutletResponse, so the two paths can never drift apart.
 *
 * @param {Object} outlet - One entry from OUTLETS (config.gs).
 * @return {NormalizedArticle[]}
 */
function fetchOutletFeed(outlet) {
  const response = UrlFetchApp.fetch(outlet.feedUrl, {
    muteHttpExceptions: true,
    followRedirects: true,
  });
  return processOutletResponse(outlet, response);
}

/**
 * Turns one outlet's already-fetched HTTPResponse into normalized articles:
 * checks the status code, parses the feed, filters to the lookback window,
 * and normalizes each surviving entry. Everything is wrapped so a bad
 * response or a parse error on ONE feed logs and returns [] rather than
 * throwing — this is the per-outlet isolation that used to live in
 * safelyFetchOutlet, now shared by both the concurrent and single-feed
 * paths.
 *
 * @param {Object} outlet - One entry from OUTLETS.
 * @param {GoogleAppsScript.URL_Fetch.HTTPResponse} response - From fetchAll
 *        (concurrent path) or fetch (single-feed path).
 * @return {NormalizedArticle[]}
 */
function processOutletResponse(outlet, response) {
  try {
    if (!response) {
      Logger.log('processOutletResponse: no response for "%s" (%s)', outlet.name, outlet.feedUrl);
      return [];
    }

    const code = response.getResponseCode();
    if (code !== 200) {
      Logger.log(
        'processOutletResponse: non-200 response (%s) for "%s" (%s)',
        code, outlet.name, outlet.feedUrl
      );
      return [];
    }

    const entries = parseFeed(response.getContentText());
    const cutoff = getLookbackCutoffDate();

    return entries
      .filter(function(entry) {
        // No date parsed at all -> keep it rather than silently drop it; an
        // undated article is still worth a human glance.
        return !entry.publishedDate || entry.publishedDate >= cutoff;
      })
      .map(function(entry) {
        try {
          return makeNormalizedArticle({
            title: entry.title,
            snippet: entry.snippet,
            link: entry.link,
            outlet: outlet.name,
            tier: outlet.tier,
            publishedDate: entry.publishedDate,
            isPaywalled: outlet.isPaywalled,
          });
        } catch (err) {
          Logger.log('processOutletResponse: skipping entry from "%s": %s', outlet.name, err);
          return null;
        }
      })
      .filter(function(article) { return article !== null; });
  } catch (err) {
    // Per-outlet isolation: a parse error on one feed doesn't stop the rest.
    Logger.log('processOutletResponse: "%s" failed: %s', outlet.name, err);
    return [];
  }
}

/**
 * Parses a feed as either RSS 2.0 or Atom, auto-detected by the root
 * element's local name — <rss> means RSS 2.0's <channel><item> shape
 * (WordPress, Substack, NYT, Guardian, all confirmed so far), <feed> means
 * Atom's <entry> shape (confirmed for Vox — Vox Media's platform emits
 * Atom, not RSS, despite the "index.xml" filename suggesting otherwise).
 * Unrecognized root elements return [] rather than throwing, so one
 * unexpected feed format doesn't kill the whole run — it'll show as 0
 * candidates with no error in testFetchAllOutletsWithoutWriting, same as
 * before this fix existed, but now only for GENUINELY unhandled formats
 * rather than for every Atom feed.
 *
 * @param {string} xmlText
 * @return {Array<{title: string, snippet: string, link: string, publishedDate: string}>}
 */
function parseFeed(xmlText) {
  const document = XmlService.parse(xmlText);
  const root = document.getRootElement();

  if (root.getName() === 'rss') {
    return parseRss2Feed(root);
  }
  if (root.getName() === 'feed') {
    return parseAtomFeed(root);
  }

  Logger.log('parseFeed: unrecognized root element "%s" — expected <rss> or <feed>', root.getName());
  return [];
}

/**
 * Parses an RSS 2.0 <channel><item> feed.
 * @param {GoogleAppsScript.XML_Service.Element} root
 * @return {Array<Object>}
 */
function parseRss2Feed(root) {
  const channel = root.getChild('channel');
  if (!channel) return [];

  const items = channel.getChildren('item');
  const contentNs = XmlService.getNamespace('content', 'http://purl.org/rss/1.0/modules/content/');

  return items.map(function(item) {
    const title = getChildTextNoNs(item, 'title');
    const link = getChildTextNoNs(item, 'link');
    const pubDate = getChildTextNoNs(item, 'pubDate');

    // Most feeds (WordPress, Substack, NYT, Guardian) populate plain
    // <description>. Some custom feed generators (confirmed: Tech Policy
    // Press's Next.js/Sanity setup) leave <description> empty and put the
    // summary in the RSS content module's <content:encoded> instead — fall
    // back to that rather than silently shipping a blank snippet.
    const description = getChildTextNoNs(item, 'description');
    const contentEncoded = description ? '' : getChildTextWithNs(item, 'encoded', contentNs);

    return {
      title: title,
      snippet: stripHtmlTags(description || contentEncoded),
      link: link,
      publishedDate: parseRfc822DateToIso(pubDate),
    };
  });
}

/**
 * Parses an Atom <feed><entry> feed. Atom uses a default namespace
 * (http://www.w3.org/2005/Atom), so — unlike RSS 2.0, which has no default
 * namespace — child lookups need the namespace-aware getChild(name, ns)
 * form, same as fetchArxiv.gs uses for arXiv's Atom responses.
 *
 * @param {GoogleAppsScript.XML_Service.Element} root
 * @return {Array<Object>}
 */
function parseAtomFeed(root) {
  const atomNs = XmlService.getNamespace('http://www.w3.org/2005/Atom');
  const entries = root.getChildren('entry', atomNs);

  return entries.map(function(entry) {
    const title = getChildTextWithNs(entry, 'title', atomNs);

    // Atom articles can have several <link> elements; prefer rel="alternate"
    // (the human-readable page), falling back to <id> which is often the
    // canonical URL too.
    const linkElements = entry.getChildren('link', atomNs);
    let link = getChildTextWithNs(entry, 'id', atomNs); // fallback
    for (let i = 0; i < linkElements.length; i++) {
      const rel = linkElements[i].getAttribute('rel');
      if (!rel || rel.getValue() === 'alternate') {
        const href = linkElements[i].getAttribute('href');
        if (href) { link = href.getValue(); break; }
      }
    }

    // Prefer <summary> (short) over <content> (often the full article,
    // sometimes truncated) for a snippet-length field.
    const summary = getChildTextWithNs(entry, 'summary', atomNs);
    const content = summary ? '' : getChildTextWithNs(entry, 'content', atomNs);

    const published = getChildTextWithNs(entry, 'published', atomNs)
      || getChildTextWithNs(entry, 'updated', atomNs);

    return {
      title: title,
      snippet: stripHtmlTags(summary || content),
      link: link,
      publishedDate: published ? published.slice(0, 10) : '',
    };
  });
}

/**
 * Safely gets a namespaced child element's text, returning '' if missing.
 * @param {GoogleAppsScript.XML_Service.Element} parent
 * @param {string} childName
 * @param {GoogleAppsScript.XML_Service.Namespace} ns
 * @return {string}
 */
function getChildTextWithNs(parent, childName, ns) {
  const child = parent.getChild(childName, ns);
  return child ? child.getText().trim() : '';
}

/**
 * Safely gets a child element's text with no namespace, returning an empty
 * string if the child is missing.
 * @param {GoogleAppsScript.XML_Service.Element} parent
 * @param {string} childName
 * @return {string}
 */
function getChildTextNoNs(parent, childName) {
  const child = parent.getChild(childName);
  return child ? child.getText().trim() : '';
}

/**
 * RSS <description> fields are usually HTML — strip tags for a clean
 * plain-text snippet, same approach as the Literature Scout's stripXmlTags
 * for Crossref's JATS-wrapped abstracts.
 * @param {string} html
 * @return {string}
 */
function stripHtmlTags(html) {
  return String(html || '').replace(/<[^>]*>/g, '').trim();
}

/**
 * Converts an RSS <pubDate> (RFC 822 format, e.g.
 * "Tue, 15 Jul 2026 14:30:00 GMT") to an ISO 'YYYY-MM-DD' string. Returns
 * '' if the date can't be parsed rather than throwing — a malformed date
 * shouldn't drop an otherwise-good article.
 * @param {string} rfc822
 * @return {string}
 */
function parseRfc822DateToIso(rfc822) {
  if (!rfc822) return '';
  const parsed = new Date(rfc822);
  if (isNaN(parsed.getTime())) return '';
  return Utilities.formatDate(parsed, 'UTC', 'yyyy-MM-dd');
}