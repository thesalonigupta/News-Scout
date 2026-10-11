# News Scout — Setup Guide

Step-by-step, assuming no prior Apps Script experience. Budget about 30 minutes for Parts 1–2. Slack (Part 3) is optional and can be added later.

---

## Part 1 — One-Time Setup

**Step 1: Get the files**
You should have 8 files ending in `.gs`, plus `appsscript.json`. The `.gs` files are: `config`, `fetchRss`, `normalize`, `dedupe`, `relevanceFilter`, `writeToSheet`, `postToSlack`, `main`.

**Step 2: Create a new Google Sheet**
Go to sheets.google.com and create a blank spreadsheet. Name it something recognizable, such as "News Scout."

**Step 3: Open the Apps Script editor**
In your Sheet, go to **Extensions → Apps Script**. This opens a project bound to that Sheet, which is what lets the script write to it without any authentication setup.

**Step 4: Add the script files**
Apps Script starts with one empty file called `Code.gs`. Rename it to `config` (double-click the filename), delete its placeholder text, paste in the contents of `config.gs`, and save (Cmd/Ctrl+S). Repeat for each remaining `.gs` file: click the `+` next to "Files" in the sidebar, choose Script, name it to match the filename without the `.gs` extension, and paste in its contents. Order does not matter.

**Step 5: Add the manifest**
Click the gear icon (Project Settings) in the left sidebar and tick **Show "appsscript.json" manifest file in editor**. Return to the editor, open the `appsscript.json` that now appears, and replace its contents with the `appsscript.json` from this repo.

---

## Part 2 — Configure and First Run

**Step 6: Set your topics**
Open `config.gs`. The topic lists and anchor patterns ship as epidemiology placeholders — replace all of them.

- `CORE_TOPICS` — terms of art that count on their own. Test: could a lifestyle writer use this phrase without meaning your field? If yes, it belongs in a context list instead.
- `BROAD_CONTEXT_TOPICS` — real terms that are also ordinary English. They count only if the article also mentions a `PRIMARY_ANCHORS` or `SECONDARY_ANCHORS` pattern.
- `NARROW_CONTEXT_TOPICS` — precise in your field, common elsewhere. They need a `PRIMARY_ANCHORS` mention. Leave this short at first; you will add to it from real runs.
- `WEAK_TOPICS` — terms that count only in a headline, or alongside a stronger match. Leave this short at first too.
- `PRIMARY_ANCHORS` / `SECONDARY_ANCHORS` — regexes for "this article mentions my field's main subject". If your field has just one natural anchor list, leave `SECONDARY_ANCHORS` empty.

Do not try to get this right on paper. Get it roughly right, then fix it from the audit output in Step 10.

**Step 7: Add your outlets**
Still in `config.gs`, find `OUTLETS`. Tier 1 is empty — add the newsletters and beat publications that cover your subject, using the commented shape just above the list. Most Substack publications expose a feed at `<publication>.substack.com/feed`.

Open each feed URL in a browser first and confirm you get XML rather than a 404 or an HTML page. A dead feed fails quietly at run time.

Then prune the tier-2 defaults down to the general-interest desks you would actually read.

**Step 8: Set the lookback window**
`LOOKBACK_DAYS` should be comfortably longer than the gap between runs, so a failed or skipped run does not leave a hole. Daily trigger → 2. Weekly trigger → 8 or 9, not 7.

**Step 9: Create the Digest sheet**
In the function dropdown at the top of the editor, select `setupDigestSheet` and click Run (▷). The first time you run anything, Google will ask you to authorize the script — choose your account, click "Advanced," then "Go to [project name] (unsafe)," then "Allow." This warning is normal for any script you write yourself. After it runs, check your Sheet: a Digest tab should exist with column headers.

**Step 10: Dry run and audit**
Select `testFetchAllOutletsWithoutWriting` and run it. Open **Execution log** (View → Logs) to see what each feed returned. Any outlet reporting 0 items every time is a broken feed — check the URL.

Then run `testRelevanceFilterAudit`. This prints kept AND dropped articles with a reason for each. Read the dropped list carefully: it is the only way to catch articles that should have matched and didn't, which usually means a phrasing your topic lists don't cover yet.

Adjust `config.gs` and repeat. Two or three rounds here saves a lot of noise later.

**Step 11: First real run**
Select `runNewsScout` and run it. Check the Digest tab for new rows and the Run Log tab for the summary, including the Errors column.

**Step 12: Set the schedule**
In the left sidebar click the clock icon (Triggers) → **Add Trigger**. Function: `runNewsScout`. Event source: Time-driven. Pick a day timer or week timer to match the `LOOKBACK_DAYS` you set in Step 8.

---

## Part 3 — Slack (Optional)

**Step 13: Create the webhook**
In Slack: **api.slack.com/apps → Create New App → From Scratch**. Name it, pick your workspace, open **Incoming Webhooks**, switch it on, then **Add New Webhook to Workspace** and choose the destination channel.

**Step 14: Store the webhook URL**
Copy the webhook URL. In the Apps Script editor: **Project Settings (gear) → Script Properties → Add script property**, name it `SLACK_WEBHOOK_URL`, paste the URL as the value.

Store it here rather than in `config.gs`. A webhook URL is a credential — anyone holding it can post to that channel — and anything in `config.gs` ends up in version control.

**Step 15: Test, then enable**
Run `postTestMessageToSlack` and confirm a message arrives. Only then set `enabled: true` in the `SLACK` block in `config.gs`.

`maxIndividualPosts` controls when the Scout switches from one message per article to a single summary, so a heavy news day does not flood the channel.

---

## Troubleshooting

**Authorization screen looks alarming.** Expected for any self-written script. Advanced → Go to [project] (unsafe) → Allow.

**An outlet returns nothing, ever.** The feed URL is wrong or retired. Open it in a browser — you should see XML.

**Nothing new on a re-run.** Expected. Dedupe checks link and title hash against what is already in the Digest.

**Too much noise.** Run `testRelevanceFilterAudit` and look at what is being kept and why. Usually one term is responsible; move it down a tier (or into `WEAK_TOPICS`) rather than deleting it.

**Missing things you expected.** Same audit, dropped list. Usually the article used phrasing absent from your topic lists, or hit a context term with no anchor mention to support it (the audit's dropped lines say which).

**Slack silent but the Sheet updated.** Check `enabled` is true, run `postTestMessageToSlack` to isolate whether it is the webhook or the run, and check the Run Log's Errors column.
