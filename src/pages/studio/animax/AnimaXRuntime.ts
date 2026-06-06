import { AnimaXViewElement, type AnimaXFontConfig } from '@animax-js/animax';
import { AnimaXTextraModuleUrl } from '@animax-js/animax-textra';
import { AnimaXVideoModuleUrl } from '@animax-js/animax-video';

const RUNTIME_RESOURCE_CACHE_DB = 'animax-runtime-resources';
const RUNTIME_RESOURCE_CACHE_STORE = 'resources';
const ANIMAX_DEFAULT_FONT_FAMILY = 'Noto Sans SC';
const ANIMAX_FONT_CONFIG: AnimaXFontConfig = {
  defaultFamily: ANIMAX_DEFAULT_FONT_FAMILY,
  fonts: [
    {
      family: ANIMAX_DEFAULT_FONT_FAMILY,
      url: 'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
    },
  ],
};

type RuntimeElement = {
  configureFonts?: (config: AnimaXFontConfig) => Promise<boolean>;
  loadVideoModule?: (url?: string) => Promise<boolean>;
  loadTextraModule?: (url?: string) => Promise<boolean>;
};

export interface AnimaXRuntimeStatus {
  ready: boolean;
  fontLoaded: boolean;
  textraModuleLoaded: boolean;
  videoModuleLoaded: boolean;
  textraModuleSupported: boolean;
  videoModuleSupported: boolean;
  fontCount: number;
  textraModuleBytes: number;
  videoModuleBytes: number;
  textraModuleFromCache: boolean;
  videoModuleFromCache: boolean;
  elapsedMs: number;
  warnings: string[];
}

interface AnimaXRuntimeInitOptions {
  onLog?: (line: string) => void;
}

interface CachedRuntimeResource {
  key: string;
  bytes: ArrayBuffer;
  byteLength: number;
  updatedAt: number;
}

let runtimeInitializationPromise: Promise<AnimaXRuntimeStatus> | null = null;
const runtimeLogSubscribers = new Set<NonNullable<AnimaXRuntimeInitOptions['onLog']>>();

function getVideoModuleUrl() {
  const configuredUrl = (
    window as typeof window & {
      __ANIMAX_VIDEO_MODULE_URL__?: string;
    }
  ).__ANIMAX_VIDEO_MODULE_URL__;

  return configuredUrl || AnimaXVideoModuleUrl;
}

function getTextraModuleUrl() {
  const configuredUrl = (
    window as typeof window & {
      __ANIMAX_TEXTRA_MODULE_URL__?: string;
    }
  ).__ANIMAX_TEXTRA_MODULE_URL__;

  return configuredUrl || AnimaXTextraModuleUrl;
}

const getNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const formatMs = (value: number) => `${Math.round(value)}ms`;

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
};

const emitLog = (onLog: AnimaXRuntimeInitOptions['onLog'], line: string) => {
  if (onLog) runtimeLogSubscribers.add(onLog);
  runtimeLogSubscribers.forEach((listener) => listener(line));
  if (line.startsWith('[错误]')) {
    console.error('[animax-runtime]', line);
    return;
  }
  if (line.startsWith('[警告]')) {
    console.warn('[animax-runtime]', line);
    return;
  }
  console.info('[animax-runtime]', line);
};

const openRuntimeResourceCache = async () => {
  if (typeof indexedDB === 'undefined') return null;

  return new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(RUNTIME_RESOURCE_CACHE_DB, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RUNTIME_RESOURCE_CACHE_STORE)) {
        db.createObjectStore(RUNTIME_RESOURCE_CACHE_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
};

const getCachedResourceBytes = async (key: string) => {
  const db = await openRuntimeResourceCache();
  if (!db) return null;

  return new Promise<Uint8Array | null>((resolve) => {
    const transaction = db.transaction(RUNTIME_RESOURCE_CACHE_STORE, 'readonly');
    const request = transaction.objectStore(RUNTIME_RESOURCE_CACHE_STORE).get(key);

    request.onsuccess = () => {
      const cached = request.result as CachedRuntimeResource | undefined;
      if (!cached?.bytes || cached.byteLength <= 0) {
        resolve(null);
        return;
      }

      resolve(new Uint8Array(cached.bytes.slice(0)));
    };
    request.onerror = () => resolve(null);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
    transaction.onabort = () => db.close();
  });
};

const setCachedResourceBytes = async (key: string, bytes: Uint8Array) => {
  const db = await openRuntimeResourceCache();
  if (!db) return false;

  return new Promise<boolean>((resolve) => {
    const transaction = db.transaction(RUNTIME_RESOURCE_CACHE_STORE, 'readwrite');
    const store = transaction.objectStore(RUNTIME_RESOURCE_CACHE_STORE);
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const record: CachedRuntimeResource = {
      key,
      bytes: buffer,
      byteLength: bytes.byteLength,
      updatedAt: Date.now(),
    };

    store.put(record);
    transaction.oncomplete = () => {
      db.close();
      resolve(true);
    };
    transaction.onerror = () => {
      db.close();
      resolve(false);
    };
    transaction.onabort = () => {
      db.close();
      resolve(false);
    };
  });
};

const loadRuntimeResourceBytes = async (
  url: string,
  label: string,
  onLog: AnimaXRuntimeInitOptions['onLog'],
) => {
  const startedAt = getNow();
  const cacheKey = `${label}:${url}`;

  emitLog(onLog, `[信息] 运行时初始化：检查 ${label} 本地缓存`);
  const cachedBytes = await getCachedResourceBytes(cacheKey);
  if (cachedBytes && cachedBytes.byteLength > 0) {
    emitLog(
      onLog,
      `[信息] 运行时初始化：${label} 命中本地缓存，${formatBytes(
        cachedBytes.byteLength,
      )}，${formatMs(getNow() - startedAt)}`,
    );
    return { bytes: cachedBytes, fromCache: true };
  }

  emitLog(onLog, `[信息] 运行时初始化：${label} 本地缓存未命中，开始下载`);
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`${label} 预加载失败：HTTP ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength <= 0) {
    throw new Error(`${label} 预加载失败：资源为空`);
  }

  emitLog(
    onLog,
    `[信息] 运行时初始化：${label} 下载完成，${formatBytes(bytes.byteLength)}，${formatMs(
      getNow() - startedAt,
    )}`,
  );

  const cacheStartedAt = getNow();
  const cached = await setCachedResourceBytes(cacheKey, bytes);
  emitLog(
    onLog,
    cached
      ? `[信息] 运行时初始化：${label} 已写入本地缓存，${formatMs(getNow() - cacheStartedAt)}`
      : `[警告] 运行时初始化：${label} 本地缓存写入失败，后续可能仍需重新下载`,
  );

  return { bytes, fromCache: false };
};

const configureRuntimeFonts = async (
  configureFonts: NonNullable<RuntimeElement['configureFonts']>,
  onLog: AnimaXRuntimeInitOptions['onLog'],
) => {
  const startedAt = getNow();
  emitLog(onLog, `[信息] 运行时初始化：注册 ${ANIMAX_FONT_CONFIG.fonts.length} 组字体`);
  const loaded = await configureFonts(ANIMAX_FONT_CONFIG);
  emitLog(
    onLog,
    loaded
      ? `[信息] 运行时初始化：字体注册完成，${formatMs(getNow() - startedAt)}`
      : '[警告] 运行时初始化：字体注册失败',
  );
  return loaded;
};

const loadRuntimeWasmModule = async (
  url: string,
  label: string,
  loadModule: (url: string) => Promise<boolean>,
  onLog: AnimaXRuntimeInitOptions['onLog'],
) => {
  const resource = await loadRuntimeResourceBytes(url, label, onLog);
  const startedAt = getNow();
  emitLog(onLog, `[信息] 运行时初始化：注册 ${label} 到 AnimaX`);
  const loaded = await loadModule(url);
  emitLog(
    onLog,
    loaded
      ? `[信息] 运行时初始化：${label} 注册完成，${formatMs(getNow() - startedAt)}`
      : `[警告] 运行时初始化：${label} 注册失败`,
  );
  return {
    loaded,
    bytes: resource.bytes.byteLength,
    fromCache: resource.fromCache,
  };
};

export function ensureAnimaXRuntimeInitialized(options: AnimaXRuntimeInitOptions = {}) {
  if (options.onLog) runtimeLogSubscribers.add(options.onLog);

  if (!runtimeInitializationPromise) {
    runtimeInitializationPromise = (async () => {
      const startedAt = getNow();
      const runtimeElement = AnimaXViewElement as unknown as RuntimeElement;
      const warnings: string[] = [];
      let fontLoaded = false;
      let textraModuleLoaded = false;
      let videoModuleLoaded = false;
      let textraModuleSupported = false;
      let videoModuleSupported = false;
      let fontCount = 0;
      let textraModuleBytes = 0;
      let videoModuleBytes = 0;
      let textraModuleFromCache = false;
      let videoModuleFromCache = false;
      const videoModuleUrl = getVideoModuleUrl();
      const textraModuleUrl = getTextraModuleUrl();

      emitLog(
        options.onLog,
        '[信息] 运行时初始化：并行准备字体、Textra 与视频模块，完成前不挂载播放器',
      );

      const fontSupported = typeof runtimeElement.configureFonts === 'function';
      if (!fontSupported) {
        warnings.push('当前 AnimaX 运行时未暴露 configureFonts');
        emitLog(options.onLog, `[警告] 运行时初始化：${warnings[warnings.length - 1]}`);
      }

      textraModuleSupported = typeof runtimeElement.loadTextraModule === 'function';
      if (!textraModuleSupported) {
        warnings.push('当前 AnimaX 运行时未暴露 loadTextraModule');
        emitLog(options.onLog, `[警告] 运行时初始化：${warnings[warnings.length - 1]}`);
      }

      videoModuleSupported = typeof runtimeElement.loadVideoModule === 'function';
      if (!videoModuleSupported) {
        warnings.push('当前 AnimaX 运行时未暴露 loadVideoModule');
        emitLog(options.onLog, `[警告] 运行时初始化：${warnings[warnings.length - 1]}`);
      }

      const [fontResult, textraModuleResult, videoModuleResult] = await Promise.all([
        fontSupported && runtimeElement.configureFonts
          ? configureRuntimeFonts(runtimeElement.configureFonts.bind(runtimeElement), options.onLog)
          : Promise.resolve(false),
        textraModuleSupported && runtimeElement.loadTextraModule
          ? loadRuntimeWasmModule(
              textraModuleUrl,
              'Textra WASM 模块',
              runtimeElement.loadTextraModule.bind(runtimeElement),
              options.onLog,
            )
          : Promise.resolve<Awaited<ReturnType<typeof loadRuntimeWasmModule>> | null>(null),
        videoModuleSupported && runtimeElement.loadVideoModule
          ? loadRuntimeWasmModule(
              videoModuleUrl,
              '视频 WASM 模块',
              runtimeElement.loadVideoModule.bind(runtimeElement),
              options.onLog,
            )
          : Promise.resolve<Awaited<ReturnType<typeof loadRuntimeWasmModule>> | null>(null),
      ]);

      fontLoaded = fontResult;
      fontCount = fontLoaded ? ANIMAX_FONT_CONFIG.fonts.length : 0;
      textraModuleLoaded = Boolean(textraModuleResult?.loaded);
      textraModuleBytes = textraModuleResult?.bytes ?? 0;
      textraModuleFromCache = textraModuleResult?.fromCache ?? false;
      videoModuleLoaded = Boolean(videoModuleResult?.loaded);
      videoModuleBytes = videoModuleResult?.bytes ?? 0;
      videoModuleFromCache = videoModuleResult?.fromCache ?? false;

      if (!fontLoaded) warnings.push('字体加载失败');
      if (!textraModuleLoaded) warnings.push('Textra 模块加载失败');
      if (!videoModuleLoaded) warnings.push('视频模块加载失败');

      const ready = fontLoaded && textraModuleLoaded && videoModuleLoaded;
      const elapsedMs = getNow() - startedAt;
      emitLog(
        options.onLog,
        ready
          ? `[信息] 运行时初始化：全部完成，${formatMs(elapsedMs)}`
          : `[错误] 运行时初始化：未就绪，${warnings.join('；') || '未知错误'}`,
      );

      return {
        ready,
        fontLoaded,
        textraModuleLoaded,
        videoModuleLoaded,
        textraModuleSupported,
        videoModuleSupported,
        fontCount,
        textraModuleBytes,
        videoModuleBytes,
        textraModuleFromCache,
        videoModuleFromCache,
        elapsedMs,
        warnings,
      };
    })().catch((error) => {
      runtimeInitializationPromise = null;
      throw error;
    });
  }

  return runtimeInitializationPromise;
}
