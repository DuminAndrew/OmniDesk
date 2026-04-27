const https = require('https');
const http = require('http');
const { URL } = require('url');
const { getDb } = require('../db/database');
const logger = require('../utils/logger');

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function cacheGet(url) {
  const row = getDb().prepare('SELECT * FROM link_previews WHERE url = ?').get(url);
  if (!row) return null;
  if (Date.now() - row.fetched_at > TTL_MS) return null;
  return {
    url: row.url, title: row.title, description: row.description,
    image: row.image, siteName: row.site_name
  };
}

function cacheSet(preview) {
  getDb().prepare(`
    INSERT INTO link_previews(url, title, description, image, site_name, fetched_at)
    VALUES (@url, @title, @description, @image, @site_name, @now)
    ON CONFLICT(url) DO UPDATE SET
      title=@title, description=@description, image=@image, site_name=@site_name, fetched_at=@now
  `).run({
    url: preview.url, title: preview.title || null, description: preview.description || null,
    image: preview.image || null, site_name: preview.siteName || null,
    now: Date.now()
  });
}

function fetchHtml(url, redirectsLeft = 4) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (err) { return reject(err); }
    const lib = parsed.protocol === 'http:' ? http : https;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru,en;q=0.9'
      },
      timeout: 8000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        const next = new URL(res.headers.location, url).href;
        res.resume();
        return resolve(fetchHtml(next, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const ct = String(res.headers['content-type'] || '');
      if (!/text\/html|application\/xhtml/i.test(ct)) {
        res.resume();
        return reject(new Error('Not HTML: ' + ct));
      }
      let body = '';
      let bytes = 0;
      const MAX = 256 * 1024; // 256 KB header is plenty for OG tags
      res.on('data', (chunk) => {
        if (bytes >= MAX) { res.destroy(); return; }
        bytes += chunk.length;
        body += chunk.toString('utf8');
      });
      res.on('end', () => resolve(body));
      res.on('close', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}

function decodeEntities(s) {
  if (!s) return s;
  return String(s)
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function extractMeta(html, url) {
  const get = (re) => {
    const m = html.match(re);
    return m ? decodeEntities(m[1].trim()) : null;
  };
  // Open Graph
  const ogTitle = get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
              ||  get(/<meta[^>]+name=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const ogDesc  = get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
              ||  get(/<meta[^>]+name=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const ogImage = get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
              ||  get(/<meta[^>]+name=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  const ogSite  = get(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
  // Twitter cards
  const twTitle = get(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i);
  const twDesc  = get(/<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i);
  const twImage = get(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  // Plain
  const title   = ogTitle || twTitle || get(/<title[^>]*>([^<]+)<\/title>/i);
  const desc    = ogDesc  || twDesc  || get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  let image     = ogImage || twImage;
  if (image && !/^https?:\/\//i.test(image)) {
    try { image = new URL(image, url).href; } catch (_) { image = null; }
  }
  let host = '';
  try { host = new URL(url).host.replace(/^www\./, ''); } catch (_) {}
  return {
    url,
    title: title ? title.slice(0, 200) : (host || url),
    description: desc ? desc.slice(0, 400) : null,
    image: image || null,
    siteName: ogSite || host || null
  };
}

async function getPreview(url) {
  if (!/^https?:\/\//i.test(url)) return null;
  const cached = cacheGet(url);
  if (cached) return cached;
  try {
    const html = await fetchHtml(url);
    const preview = extractMeta(html, url);
    cacheSet(preview);
    return preview;
  } catch (err) {
    logger.warn('linkPreview failed', url, err.message);
    return null;
  }
}

module.exports = { getPreview };
