export interface AnimaXCdnHistoryItem {
  url: string;
  fileName: string;
  createdAt?: number;
}

const HISTORY_KEY = 'animax_cdn_url_history';
const HISTORY_META_KEY = 'animax_cdn_url_history_meta';
const MAX_HISTORY_ITEMS = 100;
const SHARE_FALLBACK_ORIGIN = 'http://localhost:5173';
const SHARE_ROUTE = '';
const MIN_REASONABLE_TIMESTAMP = new Date('2020-01-01T00:00:00.000Z').getTime();
const MAX_REASONABLE_TIMESTAMP = new Date('2100-01-01T00:00:00.000Z').getTime();

interface CreateAnimaXShareUrlOptions {
  layout?: 'card';
}

export type AnimaXShareTextKind = 'preview' | 'card';

export function createAnimaXShareUrl(src: string, options: CreateAnimaXShareUrlOptions = {}) {
  const origin = typeof window === 'undefined' ? SHARE_FALLBACK_ORIGIN : window.location.origin;
  const url = new URL(import.meta.env.BASE_URL, origin);
  url.searchParams.set('src', src.trim());
  if (options.layout) {
    url.searchParams.set('layout', options.layout);
  }
  url.hash = SHARE_ROUTE;
  return url.toString();
}

export function createAnimaXShareText(src: string, kind: AnimaXShareTextKind) {
  const isCard = kind === 'card';
  const url = createAnimaXShareUrl(src, isCard ? { layout: 'card' } : {});
  return {
    url,
    text: url,
  };
}

export function getAnimaXCdnFileName(url: string) {
  const fallback = 'animation.json';
  try {
    const { pathname } = new URL(url);
    const fileName = decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '');
    return fileName || fallback;
  } catch {
    const cleanPath = url.split('#')[0].split('?')[0];
    return cleanPath.split('/').filter(Boolean).pop() || fallback;
  }
}

const normalizeTimestamp = (value: unknown) => {
  const timestamp = Number(value);
  if (
    Number.isFinite(timestamp) &&
    timestamp >= MIN_REASONABLE_TIMESTAMP &&
    timestamp <= MAX_REASONABLE_TIMESTAMP
  ) {
    return timestamp;
  }
  return undefined;
};

const readHistoryMeta = () => {
  try {
    const raw = localStorage.getItem(HISTORY_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([url, value]) => {
          const createdAt =
            typeof value === 'object' && value !== null && !Array.isArray(value)
              ? normalizeTimestamp((value as { createdAt?: unknown }).createdAt)
              : normalizeTimestamp(value);
          return createdAt ? [url, createdAt] : null;
        })
        .filter((entry): entry is [string, number] => Boolean(entry)),
    );
  } catch {
    return {};
  }
};

const writeHistoryMeta = (items: AnimaXCdnHistoryItem[]) => {
  const previousMeta = readHistoryMeta();
  const nextMeta = Object.fromEntries(
    items
      .map((item) => {
        const createdAt =
          normalizeTimestamp(item.createdAt) ??
          normalizeTimestamp(previousMeta[item.url]) ??
          inferCreatedAtFromUrl(item.url);
        return createdAt ? [item.url, createdAt] : null;
      })
      .filter((entry): entry is [string, number] => Boolean(entry)),
  );

  try {
    localStorage.setItem(HISTORY_META_KEY, JSON.stringify(nextMeta));
  } catch {
    // Ignore metadata persistence failures; the URL list remains the source of truth.
  }
};

const inferCreatedAtFromUrl = (url: string) => {
  const decoded = (() => {
    try {
      return decodeURIComponent(url);
    } catch {
      return url;
    }
  })();
  const matches = Array.from(decoded.matchAll(/\d{13}/g));
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const timestamp = normalizeTimestamp(matches[index][0]);
    if (timestamp) return timestamp;
  }
  return undefined;
};

const normalizeHistoryItem = (
  value: unknown,
  meta: Record<string, number>,
): AnimaXCdnHistoryItem | null => {
  if (typeof value === 'string') {
    const url = value.trim();
    if (!url) return null;
    return {
      url,
      fileName: getAnimaXCdnFileName(url),
      createdAt: normalizeTimestamp(meta[url]) ?? inferCreatedAtFromUrl(url),
    };
  }

  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<AnimaXCdnHistoryItem>;
  const url = typeof item.url === 'string' ? item.url.trim() : '';
  if (!url) return null;

  return {
    url,
    fileName:
      typeof item.fileName === 'string' && item.fileName.trim()
        ? item.fileName.trim()
        : getAnimaXCdnFileName(url),
    createdAt:
      normalizeTimestamp(item.createdAt) ??
      normalizeTimestamp(meta[url]) ??
      inferCreatedAtFromUrl(url),
  };
};

export function readAnimaXCdnHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const meta = readHistoryMeta();

    return parsed
      .map((item) => normalizeHistoryItem(item, meta))
      .filter((item): item is AnimaXCdnHistoryItem => Boolean(item))
      .slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

export function writeAnimaXCdnHistory(items: AnimaXCdnHistoryItem[]) {
  const meta = readHistoryMeta();
  const normalized = items
    .map((item) => normalizeHistoryItem(item, meta))
    .filter((item): item is AnimaXCdnHistoryItem => Boolean(item))
    .slice(0, MAX_HISTORY_ITEMS);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(normalized.map((item) => item.url)));
  } catch {
    // Ignore persistence failures so upload/copy flows can still complete.
  }
  writeHistoryMeta(normalized);
  return normalized;
}

export function addAnimaXCdnHistoryUrl(url: string, options: { fileName?: string } = {}) {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) return readAnimaXCdnHistory();

  const nextItem: AnimaXCdnHistoryItem = {
    url: normalizedUrl,
    fileName: options.fileName?.trim() || getAnimaXCdnFileName(normalizedUrl),
    createdAt: Date.now(),
  };
  const previous = readAnimaXCdnHistory().filter((item) => item.url !== normalizedUrl);
  return writeAnimaXCdnHistory([nextItem, ...previous]);
}

export function removeAnimaXCdnHistoryUrl(url: string) {
  return writeAnimaXCdnHistory(readAnimaXCdnHistory().filter((item) => item.url !== url));
}

export async function copyPlainTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand('copy')) {
      throw new Error('execCommand copy returned false');
    }
  } finally {
    document.body.removeChild(textarea);
  }
}
