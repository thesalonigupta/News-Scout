/**
 * postToSlack.gs
 *
 * Posts newly-added, relevant articles to Slack via an Incoming Webhook,
 * right after they're written to the Digest sheet — same "Slack and the
 * Sheet are two views of the same data" principle as the Literature Scout.
 *
 * SETUP (one-time): identical steps to the Literature Scout's
 * postToSlack.gs — create a Slack app, enable Incoming Webhooks, copy the
 * URL into Script Properties as SLACK_WEBHOOK_URL, then set
 * SLACK.enabled = true in config.gs.
 */

function postArticlesToSlack(articles) {
  const errors = [];

  if (!SLACK.enabled) return errors;
  if (articles.length === 0) return errors;

  const webhookUrl = getSlackWebhookUrl();
  if (!webhookUrl) {
    errors.push(
      'Slack posting is enabled (SLACK.enabled = true in config.gs) but ' +
      'no SLACK_WEBHOOK_URL is set in Script Properties.'
    );
    return errors;
  }

  if (articles.length > SLACK.maxIndividualPosts) {
    try {
      postSlackMessage(webhookUrl, buildDigestSummaryBlocks(articles));
    } catch (err) {
      errors.push('Slack digest-summary post failed: ' + err);
    }
    return errors;
  }

  articles.forEach(function(article) {
    try {
      postSlackMessage(webhookUrl, buildArticleBlocks(article));
    } catch (err) {
      const message = 'Slack post failed for "' + article.title + '": ' + err;
      Logger.log('postArticlesToSlack: %s', message);
      errors.push(message);
    }
  });

  return errors;
}

/**
 * Manual test helper — posts one fake article to confirm setup without
 * running the full pipeline.
 */
function postTestMessageToSlack() {
  const webhookUrl = getSlackWebhookUrl();
  if (!webhookUrl) {
    Logger.log('No SLACK_WEBHOOK_URL found in Script Properties.');
    return;
  }

  const testArticle = makeNormalizedArticle({
    title: 'News Scout Slack Test',
    snippet: 'This is a test message confirming the Slack webhook is configured correctly.',
    link: SpreadsheetApp.getActiveSpreadsheet().getUrl(),
    outlet: 'test',
    tier: 1,
    publishedDate: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    isPaywalled: false,
  });
  testArticle.matchedTopics = ['test message — ignore'];

  try {
    postSlackMessage(webhookUrl, buildArticleBlocks(testArticle));
    Logger.log('Test message sent — check the Slack channel.');
  } catch (err) {
    Logger.log('Test message failed: %s', err);
  }
}

function getSlackWebhookUrl() {
  const url = PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK_URL');
  return url ? url.trim() : null;
}

function postSlackMessage(webhookUrl, blocks) {
  const response = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ blocks: blocks }),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('Slack returned HTTP ' + code + ': ' + response.getContentText());
  }
}

/**
 * Builds Block Kit blocks for a single article: title (linked), outlet +
 * date + paywall flag, matched topics, and the snippet.
 * @param {NormalizedArticle} article
 * @return {Object[]}
 */
function buildArticleBlocks(article) {
  const paywallTag = article.isPaywalled ? ' · 🔒 paywalled' : '';
  const metaLine = [article.outlet, article.publishedDate].filter(Boolean).join(' · ') + paywallTag;

  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*<' + article.link + '|' + slackEscapeLinkText(article.title) + '>*' },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: slackEscape(metaLine) }],
    },
  ];

  if (article.matchedTopics && article.matchedTopics.length > 0) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '*Matched:* ' + slackEscape(article.matchedTopics.join(', ')) }],
    });
  }

  if (article.snippet) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: slackEscape(truncateSnippetForSlack(article.snippet)) },
    });
  }

  blocks.push({ type: 'divider' });

  return blocks;
}

function truncateSnippetForSlack(snippet, maxLength) {
  const limit = maxLength || 400;
  const text = String(snippet || '').trim();
  if (text.length <= limit) return text;
  return text.slice(0, limit).trim() + '…';
}

/**
 * Summary message used when a run produces more new articles than
 * SLACK.maxIndividualPosts.
 * @param {NormalizedArticle[]} articles
 * @return {Object[]}
 */
function buildDigestSummaryBlocks(articles) {
  const sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl();

  const MAX_LISTED = 20;
  const listedArticles = articles.slice(0, MAX_LISTED);
  const remainingCount = articles.length - listedArticles.length;

  let listText = listedArticles.map(function(article) {
    return '• <' + article.link + '|' + slackEscapeLinkText(article.title) + '> (' + article.outlet + ')';
  }).join('\n');

  if (remainingCount > 0) {
    listText += '\n_...and ' + remainingCount + ' more — see the Digest sheet for the full list._';
  }

  const SLACK_BLOCK_TEXT_LIMIT = 2900;
  if (listText.length > SLACK_BLOCK_TEXT_LIMIT) {
    listText = listText.slice(0, SLACK_BLOCK_TEXT_LIMIT).trim() + '…';
  }

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*' + articles.length + ' new articles* matched your news topics today — ' +
          'here\'s one summary instead of ' + articles.length + ' separate messages. ' +
          'Full details are in the <' + sheetUrl + '|Digest sheet>.',
      },
    },
    { type: 'section', text: { type: 'mrkdwn', text: listText } },
  ];
}

function slackEscapeLinkText(text) {
  return slackEscape(text).replace(/\|/g, '❘');
}

function slackEscape(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
