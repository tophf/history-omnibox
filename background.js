const STORAGE_URLS = 'urls';
const STORAGE_TEXT = 'text';

let lastText = null;

chrome.omnibox.onInputStarted.addListener(setDefaultSuggestion);

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  text = text.trim();
  if (text === lastText ||
      lastText === null && await getLastText() === text)
    return;
  lastText = text;
  chrome.storage.local.set({[STORAGE_TEXT]: text});
  chrome.storage.local.remove(STORAGE_URLS);
  setDefaultSuggestion(text);
  if (text) {
    chrome.history.search({
      text,
      maxResults: 16,
      startTime: 0,
    }, items => {
      const results = items.map(makeSuggestion, makeWordDetector(text));
      chrome.storage.local.set({[STORAGE_URLS]: results.map(r => r.content)});
      suggest(results);
    });
  }
});

chrome.omnibox.onInputEntered.addListener(text => {
  chrome.storage.local.get(STORAGE_URLS, data => {
    let urls = data[STORAGE_URLS];
    if (!Array.isArray(urls))
      urls = [];
    const url = urls.includes(text) ? text : makeSearchUrl(text);
    chrome.tabs.update({url});
    chrome.storage.local.remove([STORAGE_URLS, STORAGE_TEXT]);
  });
});

function getLastText() {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_TEXT, data =>
      resolve(data[STORAGE_TEXT]));
  });
}

function setDefaultSuggestion(text) {
  chrome.omnibox.setDefaultSuggestion({
    description: `Open <url>${makeSearchUrl(text)}</url>`,
  });
}

/**
 * @this {RegExp} words
 * @param {chrome.history.HistoryItem} item
 * @return {{description: string, content: string}}
 */
function makeSuggestion(item) {
  const date = new Date(item.lastVisitTime);
  return {
    content: item.url,
    description:
      `${item.visitCount} <dim>visit${item.visitCount > 1 ? 's' : ''}, ` +
      `last: ${makeRelativeDate(item.lastVisitTime)}</dim> ` +
      `<url>${reescapeXML(item.url)}</url> ` +
      applyWordDetector(item.title, this) + ' &#8227; ' +
      date.toDateString() + ' ' + date.toTimeString().split(':', 2).join(':'),
  };
}

function makeSearchUrl(text) {
  const params = text
    ? '/?' + new URLSearchParams({q: text.trim()}).toString()
    : '';
  return `chrome://history${params}`;
}

function makeRelativeDate(date) {
  if (Intl.RelativeTimeFormat) {
    let delta = (date - Date.now()) / 1000;
    for (const [span, unit] of [
      [60, 'second'],
      [60, 'minute'],
      [24, 'hour'],
      [7, 'day'],
      [4, 'week'],
      [12, 'month'],
      [1e99, 'year'],
    ]) {
      if (Math.abs(delta) < span)
        return new Intl.RelativeTimeFormat({style: 'short'}).format(Math.round(delta), unit);
      delta /= span;
    }
  }
  return date.toLocaleString();
}

function makeWordDetector(s) {
  return new RegExp(s.replace(/[^\w]+/gu, '|').replace(/^\||\|$/g, ''), 'giu');
}

function applyWordDetector(s, rx) {
  const premarked = s.replace(rx, '\x01$&\x02');
  const safeXml = reescapeXML(premarked);
  return safeXml
    .replace(/\x01(.*?)\x02/gsu, '<match>$1</match>');
}

function reescapeXML(text) {
  const xml = !text || !/["'<>&]/.test(text)
    ? text || ''
    : text.replace(/&quot;/g, '"')
        .replace(/&apos;/g, '\'')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
  return !xml || !/["'<>&]/.test(xml)
    ? xml || ''
    : xml.replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
