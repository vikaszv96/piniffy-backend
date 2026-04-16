import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import mongoose from 'mongoose';
import * as cheerio from 'cheerio';
import { WebsitePage } from '../models/websitePage.model.js';
import { ImagesGallery } from '../models/imagesGallery.model.js';
import { resolveOwnerKey } from '../utils/ownerKey.util.js';
import { isMongoConnected } from '../db/mongoose.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

const MAX_PAGE_URLS = 10_000;
const MAX_SITEMAP_FILES = 50;
const FETCH_TIMEOUT_MS = 25_000;

function assertDb() {
  if (!isMongoConnected()) {
    const err = new Error('Database not available. Set MONGODB_URI.');
    err.statusCode = 503;
    throw err;
  }
}

function normalizeLoc(loc) {
  if (loc == null) return null;
  if (typeof loc === 'string') return loc.trim();
  if (typeof loc === 'object' && loc['#text'] != null) {
    return String(loc['#text']).trim();
  }
  return String(loc).trim();
}

function collectUrlsFromUrlset(doc) {
  const urls = [];
  const urlset = doc?.urlset;
  if (!urlset) return urls;
  const urlNode = urlset.url;
  const list = Array.isArray(urlNode) ? urlNode : urlNode != null ? [urlNode] : [];
  for (const item of list) {
    const loc = normalizeLoc(item?.loc);
    if (loc) urls.push(loc);
  }
  return urls;
}

function collectChildSitemapsFromIndex(doc) {
  const locs = [];
  const idx = doc?.sitemapindex;
  if (!idx) return locs;
  const sm = idx.sitemap;
  const list = Array.isArray(sm) ? sm : sm != null ? [sm] : [];
  for (const item of list) {
    const loc = normalizeLoc(item?.loc);
    if (loc) locs.push(loc);
  }
  return locs;
}

function normalizePageUrl(urlString) {
  try {
    const u = new URL(urlString);
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

function titleFromUrl(urlString) {
  try {
    const { pathname } = new URL(urlString);
    const segments = pathname.split('/').filter(Boolean);
    const last = segments.pop() || pathname || urlString;
    return decodeURIComponent(last)
      .replace(/[-_]+/g, ' ')
      .replace(/\.(html?|php|aspx?)$/i, '')
      .slice(0, 240);
  } catch {
    return urlString.slice(0, 240);
  }
}

async function fetchXml(url) {
  const { data } = await axios.get(url, {
    responseType: 'text',
    timeout: FETCH_TIMEOUT_MS,
    maxContentLength: 50 * 1024 * 1024,
    headers: {
      Accept: 'application/xml,text/xml,*/*',
      'User-Agent': 'PiniffySitemapBot/1.0',
    },
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return typeof data === 'string' ? data : String(data);
}

/**
 * Resolves a sitemap URL (or index) into unique page URLs on the same host.
 */
export async function collectPageUrlsFromSitemap(sitemapUrl) {
  let root;
  try {
    root = new URL(sitemapUrl);
  } catch {
    const err = new Error('Invalid sitemap URL');
    err.statusCode = 400;
    throw err;
  }

  const allowedHost = root.hostname;
  const pageUrls = new Set();
  const queue = [root.href];
  const seenSitemaps = new Set();

  while (queue.length > 0 && pageUrls.size < MAX_PAGE_URLS && seenSitemaps.size < MAX_SITEMAP_FILES) {
    const next = queue.shift();
    if (!next || seenSitemaps.has(next)) continue;
    seenSitemaps.add(next);

    let xml;
    try {
      xml = await fetchXml(next);
    } catch (e) {
      const err = new Error(`Failed to fetch sitemap: ${next} — ${e.message}`);
      err.statusCode = 502;
      throw err;
    }

    let doc;
    try {
      doc = xmlParser.parse(xml);
    } catch (e) {
      const err = new Error(`Invalid XML at ${next}`);
      err.statusCode = 502;
      throw err;
    }

    const nested = collectChildSitemapsFromIndex(doc);
    if (nested.length > 0) {
      for (const sm of nested) {
        try {
          if (new URL(sm).hostname === allowedHost) {
            queue.push(normalizePageUrl(sm) || sm);
          }
        } catch {
          // skip bad loc
        }
      }
      continue;
    }

    const locs = collectUrlsFromUrlset(doc);
    for (const loc of locs) {
      const normalized = normalizePageUrl(loc);
      if (!normalized) continue;
      try {
        if (new URL(normalized).hostname !== allowedHost) continue;
      } catch {
        continue;
      }
      pageUrls.add(normalized);
      if (pageUrls.size >= MAX_PAGE_URLS) break;
    }
  }

  return { pageUrls: [...pageUrls], allowedHost };
}

function toApiPage(doc) {
  return {
    id: String(doc._id),
    title: doc.title || titleFromUrl(doc.url),
    url: doc.url,
    selected: !!doc.selected,
    status: doc.pinUsage === 'used' ? 'used' : 'new',
    importStatus: doc.status,
    sourceSitemapUrl: doc.sourceSitemapUrl,
    imageGallery: [],
    workflowJson: doc.workflowJson ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function normalizeImgUrl(baseUrl, raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith('data:')) return null;
  try {
    return new URL(s, baseUrl).href;
  } catch {
    return null;
  }
}

function extractUrlsFromSrcset(srcset) {
  if (!srcset) return [];
  const parts = String(srcset)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts
    .map((p) => p.split(/\s+/)[0]?.trim())
    .filter(Boolean);
}

function extractBestUrlFromSrcset(srcset) {
  if (!srcset) return null;
  const parts = String(srcset)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  let best = null;
  let bestW = -1;
  for (const part of parts) {
    const [u, descriptor] = part.split(/\s+/);
    const url = (u || '').trim();
    if (!url) continue;
    const d = (descriptor || '').trim().toLowerCase();
    const m = d.match(/^(\d+)w$/);
    if (m) {
      const w = Number(m[1]);
      if (Number.isFinite(w) && w > bestW) {
        bestW = w;
        best = url;
      }
    } else if (!best) {
      // fallback: take first valid if no width descriptors exist
      best = url;
    }
  }
  return best;
}

function extractUrlsFromStyle(styleValue) {
  if (!styleValue) return [];
  const style = String(styleValue);
  // background-image: url("...")  OR  background: url(...) ...
  const urls = [];
  const re = /url\(([^)]+)\)/gi;
  let m;
  while ((m = re.exec(style))) {
    const raw = (m[1] || '').trim().replace(/^['"]|['"]$/g, '');
    if (raw) urls.push(raw);
  }
  return urls;
}

function looksLikeImageUrl(url) {
  if (!url) return false;
  const u = String(url).toLowerCase();
  if (u.startsWith('data:')) return false;
  // Classic extensions
  if (/\.(png|jpe?g|webp|gif|avif|bmp|tiff?)(\?|#|$)/i.test(u)) return true;
  // Common CDN patterns that omit extensions but provide format params
  if (/[?&](fm|format)=((jpe?g|png|webp|gif|avif))(\b|&)/i.test(u)) return true;
  // WordPress uploads often include extensions, but keep as a strong hint anyway
  if (u.includes('/wp-content/uploads/')) return true;
  // As a fallback, accept obvious image delivery endpoints
  if (u.includes('/image') || u.includes('/images')) return true;
  // CDNs often use "images." subdomain and omit extensions (Squarespace etc.)
  if (u.includes('://images.') || u.startsWith('//images.')) return true;
  if (u.includes('squarespace-cdn.com/content/')) return true;
  return false;
}

function looksLikeUiOrLogo({ url, alt, className, idName }) {
  const u = (url || '').toLowerCase();
  const a = (alt || '').toLowerCase();
  const c = (className || '').toLowerCase();
  const i = (idName || '').toLowerCase();

  const hay = `${u} ${a} ${c} ${i}`;
  // common UI assets
  if (hay.includes('logo')) return true;
  if (hay.includes('favicon')) return true;
  if (hay.includes('sprite')) return true;
  if (hay.includes('icon')) return true;
  if (hay.includes('avatar')) return true;
  if (hay.includes('placeholder')) return true;

  // tracking pixels / tiny gifs
  if (u.endsWith('.gif') && (hay.includes('pixel') || hay.includes('tracking'))) return true;

  return false;
}

function isInChrome($, el) {
  // header/nav/footer + common wrappers
  const chromeSelectors = [
    'header',
    'nav',
    'footer',
    '#header',
    '#footer',
    '#nav',
    '.header',
    '.footer',
    '.nav',
    '.navbar',
    '.site-header',
    '.site-footer',
    '.menu',
  ].join(',');
  return $(el).closest(chromeSelectors).length > 0;
}

function urlKeyForDedup(rawUrl) {
  try {
    const u = new URL(rawUrl);
    // Deduplicate Squarespace format variants (format=100w/2500w etc.)
    if (u.searchParams.has('format')) {
      u.searchParams.delete('format');
      // Preserve other params if any (rare)
      u.search = u.searchParams.toString() ? `?${u.searchParams.toString()}` : '';
    }
    // Deduplicate common "responsive image" filename variants.
    // Examples:
    // - WordPress: photo-150x150.jpg vs photo.jpg
    // - Various CDNs: image-840-80.jpg vs image.jpg
    u.pathname = u.pathname.replace(
      /-(\d{2,5})x(\d{2,5})(?=\.(?:png|jpe?g|webp|gif|avif|bmp|tiff?)$)/i,
      ''
    );
    u.pathname = u.pathname.replace(
      /-(\d{2,5})-(\d{2,5})(?=\.(?:png|jpe?g|webp|gif|avif|bmp|tiff?)$)/i,
      ''
    );
    u.hash = '';
    return u.toString();
  } catch {
    return rawUrl;
  }
}

function imageVariantScore(url) {
  // Prefer "original" URLs with no obvious size suffix.
  // Otherwise prefer larger WxH if present (WordPress -150x150, etc.).
  try {
    const u = new URL(url);
    const p = u.pathname || '';
    const m1 = p.match(/-(\d{2,5})x(\d{2,5})(?=\.(?:png|jpe?g|webp|gif|avif|bmp|tiff?)$)/i);
    if (m1) {
      const w = Number(m1[1]);
      const h = Number(m1[2]);
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return w * h;
      return 0;
    }
    const m2 = p.match(/-(\d{2,5})-(\d{2,5})(?=\.(?:png|jpe?g|webp|gif|avif|bmp|tiff?)$)/i);
    if (m2) {
      const w = Number(m2[1]);
      const h = Number(m2[2]);
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return w * h;
      return 0;
    }
    return Number.MAX_SAFE_INTEGER;
  } catch {
    return 0;
  }
}

function pickBetterImageUrl(a, b) {
  if (!a) return b;
  if (!b) return a;
  const sa = imageVariantScore(a);
  const sb = imageVariantScore(b);
  if (sa !== sb) return sb > sa ? b : a;
  // Tie-breaker: keep the longer URL (often includes richer path/params)
  return String(b).length > String(a).length ? b : a;
}

function dedupeImageUrlsKeepBest(urls) {
  const out = [];
  const byKey = new Map(); // key -> bestUrl
  for (const raw of Array.isArray(urls) ? urls : []) {
    if (typeof raw !== 'string') continue;
    const s = raw.trim();
    if (!s) continue;
    const key = urlKeyForDedup(s);
    const prev = byKey.get(key);
    byKey.set(key, pickBetterImageUrl(prev, s));
  }
  for (const v of byKey.values()) out.push(v);
  return out;
}

function extractImagesFromHtml(targetUrl, html) {
  const $ = cheerio.load(html);

  // Map dedup key -> chosen URL
  const foundBest = new Map();

  // Meta og:image
  const og = $('meta[property="og:image"]').attr('content');
  const ogUrl = normalizeImgUrl(targetUrl, og);
  if (ogUrl && looksLikeImageUrl(ogUrl) && !looksLikeUiOrLogo({ url: ogUrl })) {
    const k = urlKeyForDedup(ogUrl);
    foundBest.set(k, pickBetterImageUrl(foundBest.get(k), ogUrl));
  }

  // Collect <img> candidates (incl. lazy + srcset)
  $('img').each((_, el) => {
    if (isInChrome($, el)) return;

    const src = $(el).attr('src');
    const dataSrc = $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('data-original');
    const srcset = $(el).attr('srcset') || $(el).attr('data-srcset');
    const srcsetBest = extractBestUrlFromSrcset(srcset);
    const alt = $(el).attr('alt') || '';
    const className = $(el).attr('class') || '';
    const idName = $(el).attr('id') || '';

    const rawCandidates = [dataSrc, src, srcsetBest].filter(Boolean);

    for (const raw of rawCandidates) {
      const normalized = normalizeImgUrl(targetUrl, raw);
      if (!normalized) continue;
      if (!looksLikeImageUrl(normalized)) continue;
      if (looksLikeUiOrLogo({ url: normalized, alt, className, idName })) continue;
      const k = urlKeyForDedup(normalized);
      foundBest.set(k, pickBetterImageUrl(foundBest.get(k), normalized));
    }
  });

  // Collect <picture><source srcset=...>
  $('picture source').each((_, el) => {
    if (isInChrome($, el)) return;
    const srcset = $(el).attr('srcset');
    const best = extractBestUrlFromSrcset(srcset);
    const normalized = normalizeImgUrl(targetUrl, best);
    if (!normalized) return;
    if (!looksLikeImageUrl(normalized)) return;
    const k = urlKeyForDedup(normalized);
    foundBest.set(k, pickBetterImageUrl(foundBest.get(k), normalized));
  });

  // Collect inline CSS background images on likely content nodes
  $('[style]').each((_, el) => {
    if (isInChrome($, el)) return;
    const style = $(el).attr('style');
    const className = $(el).attr('class') || '';
    const idName = $(el).attr('id') || '';
    const rawUrls = extractUrlsFromStyle(style);
    for (const raw of rawUrls) {
      const normalized = normalizeImgUrl(targetUrl, raw);
      if (!normalized) continue;
      if (!looksLikeImageUrl(normalized)) continue;
      if (looksLikeUiOrLogo({ url: normalized, alt: '', className, idName })) continue;
      const k = urlKeyForDedup(normalized);
      foundBest.set(k, pickBetterImageUrl(foundBest.get(k), normalized));
    }
  });

  return [...foundBest.values()].slice(0, 60);
}

async function fetchHtml(url) {
  const { data } = await axios.get(url, {
    responseType: 'text',
    timeout: FETCH_TIMEOUT_MS,
    maxContentLength: 25 * 1024 * 1024,
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': 'PiniffyPageBot/1.0',
    },
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return typeof data === 'string' ? data : String(data);
}

export async function fetchPageImages(req, res, next) {
  try {
    assertDb();
    const ownerKey = await resolveOwnerKey(req);
    const { url, pageId } = req.body || {};
    if ((!url || typeof url !== 'string') && (!pageId || typeof pageId !== 'string')) {
      return res.status(400).json({ error: 'url or pageId is required' });
    }

    let pageDoc = null;
    if (pageId && mongoose.isValidObjectId(pageId)) {
      pageDoc = await WebsitePage.findOne({ _id: pageId, ownerKey });
    }
    if (!pageDoc && url) {
      pageDoc = await WebsitePage.findOne({ ownerKey, url: url.trim() });
    }
    if (!pageDoc) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Fast path: serve cached gallery (from imagesGallery collection) if present
    const cached = await ImagesGallery.findOne({ ownerKey, pageId: pageDoc._id }).lean();
    if (cached?.images?.length) {
      if (!pageDoc.imagesGalleryId) {
        pageDoc.imagesGalleryId = cached._id;
        await pageDoc.save();
      }
      const deduped = dedupeImageUrlsKeepBest(cached.images);
      // Self-heal cache if it contained duplicates/variants.
      if (deduped.length !== cached.images.length) {
        await ImagesGallery.updateOne(
          { _id: cached._id, ownerKey },
          { $set: { images: deduped, fetchedAt: new Date() } }
        );
      }
      return res.json({ page: toApiPage(pageDoc.toObject()), images: deduped });
    }

    const targetUrl = pageDoc.url;
    const html = await fetchHtml(targetUrl);
    const images = dedupeImageUrlsKeepBest(extractImagesFromHtml(targetUrl, html));

    const galleryDoc = await ImagesGallery.findOneAndUpdate(
      { ownerKey, pageId: pageDoc._id },
      { $set: { url: pageDoc.url, images, fetchedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    pageDoc.imagesGalleryId = galleryDoc._id;
    await pageDoc.save();

    return res.json({ page: toApiPage(pageDoc.toObject()), images });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return next(err);
  }
}

export async function importFromSitemap(req, res, next) {
  try {
    assertDb();
    const ownerKey = await resolveOwnerKey(req);
    const { sitemapUrl } = req.body || {};
    if (!sitemapUrl || typeof sitemapUrl !== 'string') {
      return res.status(400).json({ error: 'sitemapUrl is required' });
    }

    const { pageUrls } = await collectPageUrlsFromSitemap(sitemapUrl.trim());

    if (pageUrls.length === 0) {
      return res.json({ importedCount: 0, pages: [] });
    }

    const bulkOps = pageUrls.map((url) => ({
      updateOne: {
        filter: { ownerKey, url },
        update: {
          $set: {
            title: titleFromUrl(url),
            sourceSitemapUrl: sitemapUrl.trim(),
            status: 'discovered',
          },
          $setOnInsert: {
            ownerKey,
            url,
            selected: false,
            pinUsage: 'new',
          },
        },
        upsert: true,
      },
    }));

    await WebsitePage.bulkWrite(bulkOps, { ordered: false });

    const docs = await WebsitePage.find({ ownerKey, url: { $in: pageUrls } })
      .sort({ url: 1 })
      .lean();

    // Prefetch images in the background-ish manner (still in this request),
    // with a conservative concurrency limit to avoid long tail timeouts.
    const CONCURRENCY = 5;
    const queue = docs.map((d) => ({ _id: d._id, url: d.url }));
    let cursor = 0;
    async function worker() {
      while (cursor < queue.length) {
        const idx = cursor++;
        const item = queue[idx];
        if (!item) continue;
        const already = await ImagesGallery.findOne({ ownerKey, pageId: item._id }, { _id: 1 }).lean();
        if (already) continue;
        try {
          const html = await fetchHtml(item.url);
          const images = dedupeImageUrlsKeepBest(extractImagesFromHtml(item.url, html));
          const galleryDoc = await ImagesGallery.create({
            ownerKey,
            pageId: item._id,
            url: item.url,
            images,
            fetchedAt: new Date(),
          });
          await WebsitePage.updateOne(
            { _id: item._id, ownerKey },
            { $set: { imagesGalleryId: galleryDoc._id } }
          );
        } catch {
          // If image fetch fails for a page, keep existing behavior (images will be scraped on demand later).
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()));

    return res.json({
      importedCount: pageUrls.length,
      pages: docs.map(toApiPage),
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return next(err);
  }
}

export async function listPages(req, res, next) {
  try {
    assertDb();
    const ownerKey = await resolveOwnerKey(req);
    const docs = await WebsitePage.find({ ownerKey }).sort({ updatedAt: -1 }).lean();
    return res.json({ pages: docs.map(toApiPage) });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return next(err);
  }
}

export async function updatePage(req, res, next) {
  try {
    assertDb();
    const ownerKey = await resolveOwnerKey(req);
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid page id' });
    }

    const patch = req.body || {};
    const allowed = {};
    let galleryImages = null;
    if (typeof patch.selected === 'boolean') allowed.selected = patch.selected;
    if (typeof patch.title === 'string') allowed.title = patch.title.slice(0, 500);
    if (patch.importStatus === 'discovered' || patch.importStatus === 'saved' || patch.importStatus === 'archived') {
      allowed.status = patch.importStatus;
    }
    if (patch.pinUsage === 'new' || patch.pinUsage === 'used') {
      allowed.pinUsage = patch.pinUsage;
    }
    /** Accept UI alias */
    if (patch.status === 'new' || patch.status === 'used') {
      allowed.pinUsage = patch.status === 'used' ? 'used' : 'new';
    }

    if (Array.isArray(patch.imageGallery)) {
      galleryImages = patch.imageGallery
        .map((x) => (typeof x === 'string' ? x : ''))
        .filter(Boolean)
        .slice(0, 200);
      galleryImages = dedupeImageUrlsKeepBest(galleryImages).slice(0, 60);
    }
    if (patch.workflowJson != null && typeof patch.workflowJson === 'object') {
      allowed.workflowJson = patch.workflowJson;
    }

    if (Object.keys(allowed).length === 0 && !galleryImages) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const doc = await WebsitePage.findOne({ _id: id, ownerKey });

    if (!doc) {
      return res.status(404).json({ error: 'Page not found' });
    }

    if (Object.keys(allowed).length > 0) {
      doc.set(allowed);
    }

    if (galleryImages) {
      const galleryDoc = await ImagesGallery.findOneAndUpdate(
        { ownerKey, pageId: doc._id },
        { $set: { url: doc.url, images: galleryImages, fetchedAt: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      doc.imagesGalleryId = galleryDoc._id;
    }

    await doc.save();
    return res.json({ page: toApiPage(doc.toObject()) });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return next(err);
  }
}

export async function deletePage(req, res, next) {
  try {
    assertDb();
    const ownerKey = await resolveOwnerKey(req);
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid page id' });
    }

    const result = await WebsitePage.deleteOne({ _id: id, ownerKey });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }
    await ImagesGallery.deleteOne({ ownerKey, pageId: id }).catch(() => {});
    return res.json({ deleted: true });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return next(err);
  }
}
