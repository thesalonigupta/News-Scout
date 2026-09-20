# News Scout

A Google Apps Script tool that monitors RSS feeds from news outlets, newsletters and policy publications for articles matching your research topics, logs relevant results to a Google Sheet, and optionally posts them to a Slack channel. It runs entirely inside Google's infrastructure — no installations, servers, or paid subscriptions, and no API keys at all.

It is the news-side companion to [Literature Scout](https://github.com/thesalonigupta/Literature-Scout), which does the same job for academic sources. The two share a pipeline shape (fetch → normalize → dedupe → filter → write → post) and can write to separate tabs of the same Sheet, but neither depends on the other.

---

## Why this is not just Literature Scout pointed at RSS

An academic search API only ever returns academic papers, so a loose topic list mostly costs you noise. An RSS feed returns **everything the outlet published** — recipes, gift guides, sports, obituaries. A single ambiguous keyword against a general-interest feed produces a Digest you stop reading within a week.

So the filtering works differently in three ways:

**Topics are tiered by confidence, not treated as one flat list.** `HIGH_CONFIDENCE_TOPICS` are terms of art — if a general outlet prints one, the article is almost certainly about your field. `LOW_CONFIDENCE_TOPICS` are real terms that are also ordinary English. `LIFESTYLE_ONLY_TOPICS` are terms that a consumer desk uses in a sense unrelated to your work; matching one alone counts *against* relevance.

**Outlets are tiered too.** A tier-1 outlet covers your beat and little else, so it has already done most of the filtering — a low-confidence topic match is enough. A tier-2 general-interest outlet has to clear a higher bar. `FILTER_CONFIG` sets that bar per tier.

**The lookback window is short and overlapping.** News has no stable identifier like a DOI, so dedupe leans on URL and a title hash, and `LOOKBACK_DAYS` is deliberately longer than the gap between runs so a skipped run does not leave a permanent hole.

---

## Quick Start

1. Create a new Google Sheet, open **Extensions → Apps Script**, and paste each `.gs` file into its own script file.
2. Add `appsscript.json` via Project Settings → Show manifest file.
3. Edit `config.gs`: replace the placeholder topic lists with your own vocabulary, and add the outlets that cover your beat under Tier 1.
4. Run `setupDigestSheet`, then `testFetchAllOutletsWithoutWriting` to see what the feeds return before anything gets written.

Slack is optional and off by default. Everything else is covered in `SETUP_GUIDE.md`.

---

## What you have to write yourself

Two things, and no template can supply either:

**Your topic vocabulary.** The lists in `config.gs` ship as placeholders from epidemiology — the same worked example Literature Scout uses — purely to show the shape of a tiered list. Start from vocabulary your field has already settled on (a glossary, a review paper's keyword section, your own notes), in the exact phrasing your community uses, rather than terms you guess at.

**Your tier-1 outlets.** Tier 1 ships empty on purpose. The newsletters and beat publications covering your subject are the part of this file nobody else can write for you, and they are usually where the signal is. Most Substack publications expose a feed at `<publication>.substack.com/feed`.

The tier-2 list ships with general science, technology and policy desks as working defaults so the first run does something. Prune them rather than keeping all of them.

---

## Tuning the filter

Run `testFetchAllOutletsWithoutWriting` and `testRelevanceFilterAudit` before trusting the Digest. The audit prints both kept and dropped articles with the reason for each, which is the only way to see false *negatives* — the articles that should have matched and didn't.

Two patterns show up within the first few runs:

**A term keeps dragging in an unrelated beat.** Usually the term means something precise in your field and something ordinary elsewhere. Do not delete it — you would lose the real matches too. Move it to `AMBIGUOUS_TOPICS`, where it only counts if another topic corroborates it.

**A feed keeps emitting non-articles** — link roundups, podcast stubs, job boards. Add a title pattern to `OUTLET_SKIP_PATTERNS`.

Everything rejected is gone with no record, so change one setting at a time and compare the Run Log's "Relevant After Filter" count before and after.

---

## A note on feeds

Publishers move and retire RSS feeds constantly, and a dead feed fails quietly — the run continues, and the only trace is a line in the Run Log's Errors column. Open any feed URL in a browser and confirm it returns XML before adding it, and check the Errors column if an outlet goes silent for a while.

Paywalled outlets are marked with `isPaywalled: true`. This does not change fetching, since RSS metadata is public either way; it just marks the row so you know before clicking.

---

## Files

`config.gs` (the only file you must edit) · `fetchRss.gs` (feed fetching and RSS/Atom parsing) · `normalize.gs` · `dedupe.gs` · `relevanceFilter.gs` · `writeToSheet.gs` · `postToSlack.gs` · `main.gs` (entry point and Run Log) · `appsscript.json`

---

## License

MIT — see `LICENSE`.
