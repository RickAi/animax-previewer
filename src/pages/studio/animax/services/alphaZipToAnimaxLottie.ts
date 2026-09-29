import JSZip from 'jszip';

const DEFAULT_LOTTIE_VERSION = '4.8.0';
const DEFAULT_FRAME_RATE = 60;
const DEFAULT_JSON_FILE_NAME = 'data.json';
const DEFAULT_LAYER_NAME = 'Optional';
const DEFAULT_VIDEO_ID = 'video_0';

interface AlphaVideoConfig {
  f?: number;
  w?: number;
  h?: number;
  path?: string;
  rgbFrame?: number[];
  aFrame?: number[];
  x?: number;
  y?: number;
  ax?: number;
  ay?: number;
  aw?: number;
  ah?: number;
}

interface AlphaZipConfigMap {
  [sceneName: string]: AlphaVideoConfig;
}

export interface AlphaZipCompressionInfo {
  algorithms: string[];
  supported: boolean;
}

export interface AlphaZipBundleInfo {
  sceneName: string;
  width: number;
  height: number;
  totalFrames: number;
  sourceVideoPath: string;
  rgbFrame: [number, number, number, number];
  alphaFrame: [number, number, number, number];
  compression: AlphaZipCompressionInfo;
}

export interface AlphaZipConversionResult {
  files: Array<{ relPath: string; file: File }>;
  jsonText: string;
  info: AlphaZipBundleInfo;
}

function normalizeRelPath(path: string) {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function getZipCompressionAlgorithm(method: number) {
  if (method === 0) return 'store';
  if (method === 8) return 'deflate';
  if (method === 12) return 'bzip2';
  if (method === 14) return 'lzma';
  if (method === 93) return 'zstd';
  return `method-${method}`;
}

async function inspectZipCompression(file: File): Promise<AlphaZipCompressionInfo> {
  const data = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocdOffset = -1;
  for (let offset = data.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) {
    return { algorithms: ['unknown'], supported: false };
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let offset = view.getUint32(eocdOffset + 16, true);
  const algorithms = new Set<string>();
  for (let index = 0; index < entryCount && offset + 46 <= data.byteLength; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    algorithms.add(getZipCompressionAlgorithm(method));
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  const algorithmList = Array.from(algorithms).sort();
  return {
    algorithms: algorithmList.length > 0 ? algorithmList : ['unknown'],
    supported:
      algorithmList.length > 0 &&
      algorithmList.every((item) => item === 'deflate' || item === 'store'),
  };
}

function getFileStem(fileName: string) {
  return fileName.replace(/\.zip$/i, '').trim() || 'alpha_video';
}

function toFrameTuple(value: number[], fallback: [number, number, number, number]) {
  if (value.length >= 4 && value.every((item) => Number.isFinite(item))) {
    return [Number(value[0]), Number(value[1]), Number(value[2]), Number(value[3])] as [
      number,
      number,
      number,
      number,
    ];
  }
  return fallback;
}

function pickScene(config: AlphaZipConfigMap) {
  if (config.portrait && typeof config.portrait === 'object') {
    return ['portrait', config.portrait] as const;
  }
  const firstEntry = Object.entries(config).find(([, value]) => value && typeof value === 'object');
  return firstEntry ? ([firstEntry[0], firstEntry[1]] as const) : null;
}

function findZipFile(zip: JSZip, rawPath: string) {
  const normalized = normalizeRelPath(rawPath);
  const baseName = normalized.split('/').pop() ?? normalized;
  const candidates = [normalized, baseName].filter(Boolean);
  for (const candidate of candidates) {
    const entry = zip.file(candidate);
    if (entry) return entry;
  }
  const lowerCandidates = new Set(candidates.map((item) => item.toLowerCase()));
  return Object.values(zip.files).find((entry) => {
    if (entry.dir) return false;
    const relPath = normalizeRelPath(entry.name);
    return (
      lowerCandidates.has(relPath.toLowerCase()) ||
      lowerCandidates.has(relPath.split('/').pop() ?? '')
    );
  });
}

async function parseAlphaZipInfo(zip: JSZip, compression: AlphaZipCompressionInfo) {
  const configEntry = findZipFile(zip, 'config.json');
  if (!configEntry) return null;

  let parsedConfig: AlphaZipConfigMap;
  try {
    parsedConfig = JSON.parse(await configEntry.async('text')) as AlphaZipConfigMap;
  } catch {
    return null;
  }

  const pickedScene = pickScene(parsedConfig);
  if (!pickedScene) return null;

  const [sceneName, scene] = pickedScene;
  const width = Number(scene?.w);
  const height = Number(scene?.h);
  const totalFrames = Number(scene?.f);
  const sourceVideoPath = typeof scene?.path === 'string' ? scene.path.trim() : '';
  if (!Number.isFinite(width) || width <= 0) return null;
  if (!Number.isFinite(height) || height <= 0) return null;
  if (!Number.isFinite(totalFrames) || totalFrames <= 0) return null;
  if (!sourceVideoPath) return null;

  const rgbFrame = toFrameTuple(scene.rgbFrame ?? [], [width, 0, width, height]);
  const alphaFrame = toFrameTuple(scene.aFrame ?? [], [0, 0, width, height]);
  const videoEntry = findZipFile(zip, sourceVideoPath);
  if (!videoEntry) return null;

  return {
    info: {
      sceneName,
      width,
      height,
      totalFrames,
      sourceVideoPath,
      rgbFrame,
      alphaFrame,
      compression,
    } satisfies AlphaZipBundleInfo,
    videoEntry,
  };
}

export async function inspectAlphaZipBundle(file: File) {
  const compression = await inspectZipCompression(file);
  const zip = await JSZip.loadAsync(file);
  const parsed = await parseAlphaZipInfo(zip, compression);
  return parsed?.info ?? null;
}

export async function convertAlphaZipToAnimaxLottie(
  file: File,
): Promise<AlphaZipConversionResult | null> {
  const compression = await inspectZipCompression(file);
  const zip = await JSZip.loadAsync(file);
  const parsed = await parseAlphaZipInfo(zip, compression);
  if (!parsed) return null;

  const { info, videoEntry } = parsed;
  const videoBlob = await videoEntry.async('blob');
  const videoExtension =
    normalizeRelPath(info.sourceVideoPath)
      .match(/\.[a-zA-Z0-9]+$/)?.[0]
      ?.toLowerCase() || '.mp4';
  const videoFileName = `${DEFAULT_VIDEO_ID}${videoExtension}`;
  const animationName = getFileStem(file.name);

  const lottieJson = {
    v: DEFAULT_LOTTIE_VERSION,
    fr: DEFAULT_FRAME_RATE,
    ip: 0,
    op: info.totalFrames,
    w: info.width,
    h: info.height,
    nm: animationName,
    ddd: 0,
    assets: [],
    videos: [
      {
        id: DEFAULT_VIDEO_ID,
        x: info.rgbFrame[0],
        y: info.rgbFrame[1],
        w: info.width,
        h: info.height,
        ax: info.alphaFrame[0],
        ay: info.alphaFrame[1],
        aw: info.alphaFrame[2],
        ah: info.alphaFrame[3],
        u: 'videos/',
        p: videoFileName,
        sz: videoBlob.size,
      },
    ],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 1009,
        nm: DEFAULT_LAYER_NAME,
        refId: DEFAULT_VIDEO_ID,
        sr: 1,
        ks: {},
        ao: 0,
        ip: 0,
        op: info.totalFrames,
        st: 0,
        bm: 0,
      },
    ],
    markers: [],
    props: {},
  };

  const jsonText = `${JSON.stringify(lottieJson, null, 2)}\n`;
  return {
    files: [
      {
        relPath: DEFAULT_JSON_FILE_NAME,
        file: new File([jsonText], DEFAULT_JSON_FILE_NAME, { type: 'application/json' }),
      },
      {
        relPath: `videos/${videoFileName}`,
        file: new File([videoBlob], videoFileName, {
          type: videoBlob.type || 'video/mp4',
        }),
      },
    ],
    jsonText,
    info,
  };
}
