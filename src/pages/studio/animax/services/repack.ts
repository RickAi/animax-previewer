import JSZip from 'jszip';
import type { ResourceEdit } from '../toolTypes';

interface RepackOptions {
  jsonText: string;
  sourceUrl: string;
  resourceEdits?: Record<string, ResourceEdit>;
}

interface DownloadBundleOptions {
  sourceUrl: string;
  currentAnimation?: RepackOptions;
}

type PickedDirectorySaveResult = 'directory' | 'fallback' | 'cancelled';

interface PickedDirectoryWritable {
  write: (blob: Blob) => Promise<void>;
  close: () => Promise<void>;
}

interface PickedDirectoryFileHandle {
  createWritable: () => Promise<PickedDirectoryWritable>;
}

interface PickedDirectoryHandle {
  getFileHandle: (
    fileName: string,
    options?: { create?: boolean },
  ) => Promise<PickedDirectoryFileHandle>;
}

interface DirectoryDownloadDependencies {
  showDirectoryPicker?: () => Promise<PickedDirectoryHandle>;
}

export interface RepackResult {
  blob: Blob;
  fileName: string;
  jsonFileName: string;
  downloadedImages: number;
  skippedBase64Images: number;
  downloadedVideos: number;
  skippedBase64Videos: number;
  downloadedFonts: number;
  warnings: string[];
}

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/apng': '.apng',
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
  'font/otf': '.otf',
  'font/sfnt': '.ttf',
  'font/ttf': '.ttf',
  'font/woff': '.woff',
  'font/woff2': '.woff2',
  'application/font-woff': '.woff',
  'application/font-woff2': '.woff2',
  'application/vnd.ms-fontobject': '.eot',
  'application/x-font-otf': '.otf',
  'application/x-font-ttf': '.ttf',
  'application/x-font-woff': '.woff',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/x-m4v': '.m4v',
  'video/x-msvideo': '.avi',
};

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function isBase64Resource(value: string) {
  return /^data:/i.test(value.trim());
}

function getSourcePrefix(sourceUrl: string) {
  const trimmed = sourceUrl.trim();
  if (!isHttpUrl(trimmed)) return '';
  const index = trimmed.lastIndexOf('/');
  return index >= 0 ? trimmed.slice(0, index + 1) : `${trimmed}/`;
}

function stripUrlDecorators(value: string) {
  return value.split('#')[0].split('?')[0];
}

function sanitizeFileStem(value: string, fallback: string) {
  const normalized = value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function getExtensionFromPath(value: string) {
  try {
    const pathname = new URL(value).pathname;
    const ext = pathname.match(/\.([a-zA-Z0-9]{1,8})$/)?.[0];
    if (ext) return ext.toLowerCase();
  } catch {
    const path = stripUrlDecorators(value);
    const ext = path.match(/\.([a-zA-Z0-9]{1,8})$/)?.[0];
    if (ext) return ext.toLowerCase();
  }
  return '';
}

function getExtensionFromContentType(contentType: string | null) {
  if (!contentType) return '';
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  return CONTENT_TYPE_EXTENSIONS[normalized] ?? '';
}

function getImageExtension(url: string, contentType: string | null, originalPath: string) {
  return (
    getExtensionFromContentType(contentType) ||
    getExtensionFromPath(url) ||
    getExtensionFromPath(originalPath) ||
    '.png'
  );
}

function getVideoExtension(url: string, contentType: string | null, originalPath: string) {
  return (
    getExtensionFromContentType(contentType) ||
    getExtensionFromPath(url) ||
    getExtensionFromPath(originalPath) ||
    '.mp4'
  );
}

function getFontExtension(url: string, contentType: string | null, originalPath: string) {
  return (
    getExtensionFromContentType(contentType) ||
    getExtensionFromPath(url) ||
    getExtensionFromPath(originalPath) ||
    '.ttf'
  );
}

function resolveResourceUrl(sourceUrl: string, path: string) {
  const trimmed = path.trim();
  if (!trimmed) return '';
  if (isHttpUrl(trimmed) || trimmed.startsWith('blob:')) return trimmed;

  const prefix = getSourcePrefix(sourceUrl);
  if (!prefix) return '';
  return `${prefix}${trimmed.replace(/^\/+/, '')}`;
}

function resolveLottieAssetUrl(sourceUrl: string, u: string, p: string) {
  const trimmedPath = p.trim();
  if (!trimmedPath || isBase64Resource(trimmedPath)) return '';
  if (isHttpUrl(trimmedPath) || trimmedPath.startsWith('blob:')) return trimmedPath;

  const joined = `${u || ''}${p || ''}`.trim();
  if (!joined || isBase64Resource(joined)) return '';
  if (isHttpUrl(joined) || joined.startsWith('blob:')) return joined;
  return resolveResourceUrl(sourceUrl, joined);
}

function getJsonFileName(sourceUrl: string, animationName?: string) {
  const normalizedAnimationName = sanitizeFileStem(animationName || '', '');
  const nameFromJson = normalizedAnimationName.replace(/\.(lottie\.json|json)$/i, '').trim();
  if (nameFromJson) return `${nameFromJson}.json`;

  try {
    const url = new URL(sourceUrl);
    const baseName = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
    if (/\.(lottie\.json|json)$/i.test(baseName))
      return sanitizeFileStem(baseName, 'animation.json');
  } catch {
    // fall through
  }
  return 'animation.json';
}

function getZipFileName(jsonFileName: string) {
  return `${jsonFileName.replace(/\.(lottie\.json|json)$/i, '') || 'animation'}_repack.zip`;
}

function getResourceEdit(
  resourceEdits: Record<string, ResourceEdit> | undefined,
  kind: ResourceEdit['kind'],
  id: string,
) {
  return resourceEdits?.[`${kind}:${id}`];
}

function normalizePackPath(value: string, fallbackDir: string, fileName: string) {
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized) return normalized;
  return `${fallbackDir.replace(/\/?$/, '/')}${fileName}`;
}

function splitPackPath(packPath: string) {
  const normalized = packPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const index = normalized.lastIndexOf('/');
  if (index < 0) return { dir: '', fileName: normalized };
  return {
    dir: `${normalized.slice(0, index + 1)}`,
    fileName: normalized.slice(index + 1),
  };
}

async function fetchResourceBlob(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return {
    blob: await response.blob(),
    contentType: response.headers.get('content-type'),
  };
}

async function fetchJsonText(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export async function createAnimaXDownloadBundle(
  options: DownloadBundleOptions,
): Promise<RepackResult> {
  const sourceUrl = options.sourceUrl.trim();
  if (!sourceUrl) throw new Error('请输入 Lottie 链接');

  const currentAnimation = options.currentAnimation;
  if (currentAnimation?.sourceUrl.trim() === sourceUrl && currentAnimation.jsonText.trim()) {
    return createAnimaXRepack({ ...currentAnimation, sourceUrl });
  }

  const jsonText = await fetchJsonText(sourceUrl);
  return createAnimaXRepack({
    jsonText,
    sourceUrl,
  });
}

export async function createAnimaXRepack(options: RepackOptions): Promise<RepackResult> {
  const parsed = JSON.parse(options.jsonText) as any;
  const repackedJson = JSON.parse(JSON.stringify(parsed)) as any;
  const animationName = typeof parsed?.nm === 'string' ? parsed.nm : '';
  const zip = new JSZip();
  const warnings: string[] = [];

  let downloadedImages = 0;
  let skippedBase64Images = 0;
  let downloadedVideos = 0;
  let skippedBase64Videos = 0;
  let downloadedFonts = 0;

  if (Array.isArray(repackedJson.assets)) {
    for (const asset of repackedJson.assets) {
      if (!asset || typeof asset !== 'object' || Array.isArray(asset.layers)) continue;

      const id = typeof asset.id === 'string' ? asset.id : '';
      const p = typeof asset.p === 'string' ? asset.p : '';
      const u = typeof asset.u === 'string' ? asset.u : '';
      if (!id || !p) continue;

      const edit = getResourceEdit(options.resourceEdits, 'image', id);
      if (edit?.file) {
        const packPath = normalizePackPath(edit.packPath ?? '', 'images', edit.fileName);
        const { dir, fileName } = splitPackPath(packPath);
        zip.file(packPath, await edit.file.arrayBuffer());
        asset.u = dir;
        asset.p = fileName;
        asset.e = 0;
        downloadedImages += 1;
        continue;
      }

      if (isBase64Resource(p) || isBase64Resource(`${u}${p}`)) {
        skippedBase64Images += 1;
        continue;
      }

      const imageUrl = resolveLottieAssetUrl(options.sourceUrl, u, p);
      if (!imageUrl) {
        warnings.push(`跳过图片 ${id}：无法从 u="${u}" p="${p}" 解析链接`);
        continue;
      }

      try {
        const { blob, contentType } = await fetchResourceBlob(imageUrl);
        const extension = getImageExtension(imageUrl, contentType, p);
        const imageFileName = `${sanitizeFileStem(id, 'image')}${extension}`;
        zip.file(`images/${imageFileName}`, await blob.arrayBuffer());
        asset.u = 'images/';
        asset.p = imageFileName;
        asset.e = 0;
        downloadedImages += 1;
      } catch (err) {
        warnings.push(`下载图片 ${id} 失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (Array.isArray(repackedJson.videos)) {
    for (const video of repackedJson.videos) {
      if (!video || typeof video !== 'object') continue;

      const id = typeof video.id === 'string' ? video.id : '';
      const p = typeof video.p === 'string' ? video.p : '';
      const u = typeof video.u === 'string' ? video.u : '';
      if (!id || !p) continue;

      const edit = getResourceEdit(options.resourceEdits, 'video', id);
      if (edit?.file) {
        const packPath = normalizePackPath(edit.packPath ?? '', 'videos', edit.fileName);
        const { dir, fileName } = splitPackPath(packPath);
        zip.file(packPath, await edit.file.arrayBuffer());
        video.u = dir;
        video.p = fileName;
        video.e = 0;
        video.sz = edit.file.size;
        downloadedVideos += 1;
        continue;
      }

      if (isBase64Resource(p) || isBase64Resource(`${u}${p}`)) {
        skippedBase64Videos += 1;
        continue;
      }

      const videoUrl = resolveLottieAssetUrl(options.sourceUrl, u, p);
      if (!videoUrl) {
        warnings.push(`跳过视频 ${id}：无法从 u="${u}" p="${p}" 解析链接`);
        continue;
      }

      try {
        const { blob, contentType } = await fetchResourceBlob(videoUrl);
        const extension = getVideoExtension(videoUrl, contentType, p);
        const videoFileName = `${sanitizeFileStem(id, 'video')}${extension}`;
        zip.file(`videos/${videoFileName}`, await blob.arrayBuffer());
        video.u = 'videos/';
        video.p = videoFileName;
        downloadedVideos += 1;
      } catch (err) {
        warnings.push(`下载视频 ${id} 失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (Array.isArray(repackedJson.fonts?.list)) {
    for (const font of repackedJson.fonts.list) {
      if (!font || typeof font !== 'object') continue;

      const fPath = typeof font.fPath === 'string' ? font.fPath : '';
      if (!fPath || isBase64Resource(fPath)) continue;
      if (Number(font.origin) === 3) continue;

      const fontUrl = resolveResourceUrl(options.sourceUrl, fPath);
      const fontName =
        typeof font.fName === 'string'
          ? font.fName
          : typeof font.fFamily === 'string'
            ? font.fFamily
            : 'font';
      if (!fontUrl) {
        warnings.push(`跳过字体 ${fontName}：无法从 fPath="${fPath}" 解析链接`);
        continue;
      }

      try {
        const { blob, contentType } = await fetchResourceBlob(fontUrl);
        const extension = getFontExtension(fontUrl, contentType, fPath);
        const fontFileName = `${sanitizeFileStem(fontName, 'font')}${extension}`;
        zip.file(`fonts/${fontFileName}`, await blob.arrayBuffer());
        font.fPath = `fonts/${fontFileName}`;
        downloadedFonts += 1;
      } catch (err) {
        warnings.push(
          `下载字体 ${fontName} 失败：${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  const jsonFileName = getJsonFileName(options.sourceUrl, animationName);
  zip.file(jsonFileName, JSON.stringify(repackedJson));
  const blob = await zip.generateAsync({ type: 'blob' });

  return {
    blob,
    fileName: getZipFileName(jsonFileName),
    jsonFileName,
    downloadedImages,
    skippedBase64Images,
    downloadedVideos,
    skippedBase64Videos,
    downloadedFonts,
    warnings,
  };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export async function saveBlobToPickedDirectory(
  blob: Blob,
  fileName: string,
  dependencies: DirectoryDownloadDependencies = window as unknown as DirectoryDownloadDependencies,
): Promise<PickedDirectorySaveResult> {
  if (!dependencies.showDirectoryPicker) {
    downloadBlob(blob, fileName);
    return 'fallback';
  }

  try {
    const directory = await dependencies.showDirectoryPicker();
    const fileHandle = await directory.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return 'directory';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}
