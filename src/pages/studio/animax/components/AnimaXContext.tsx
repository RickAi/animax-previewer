import React, {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AnimaXLayerBoundsSpace,
  AnimaXLayerPropertyType,
  AnimaXResourcePropertyType,
  AnimaXViewElement,
  createAnimaXValueParam,
} from '@animax-js/animax';
import JSZip from 'jszip';
import toast from 'react-hot-toast';
import { LottieParser, type CompositionModel } from '../../../../utils/lottie-parser';
import { ensureAnimaXRuntimeInitialized, type AnimaXRuntimeStatus } from '../AnimaXRuntime';
import { ANIMAX_RANDOM_LOTTIE_URLS, DEFAULT_ANIMAX_LOTTIE_URL } from '../lottieLibrary';
import {
  convertAlphaZipToAnimaxLottie,
  inspectAlphaZipBundle,
  type AlphaZipBundleInfo,
} from '../services/alphaZipToAnimaxLottie';
import { createAnimaXRepack, downloadBlob, type RepackResult } from '../services/repack';
import type {
  AnimaXToolTab,
  AssetRow,
  CreateEditableLayerInput,
  EditableLayerDraftPreview,
  EditableLayerKind,
  JsonPreviewStatus,
  LayerBoundsOverlay,
  LayerTransform,
  LayerRow,
  LayerTransformStaticState,
  PreviewEditableLayerOptions,
  ResourceEdit,
  ResourceKind,
  TextLayerRow,
} from '../toolTypes';
import {
  addJsonEditableLayer,
  collectTextLayers,
  createResourceKey,
  ensureHttpsUrl,
  formatKilobytes,
  formatResourceSourceLabel,
  getDataUrlByteSize,
  getFileExtension,
  readLayerStaticTransform,
  readLayerTransformStaticState,
  resolveResourceUrl,
  safeSegment,
  updateJsonFontStyle,
  updateJsonLayerName,
  updateJsonLayerTransform,
  updateJsonLayerVisibility,
  updateJsonResourcePath,
  updateJsonTextLayerValue,
} from '../toolUtils';

interface AnimaXContextType {
  animRef: React.MutableRefObject<AnimaXViewElement | null>;
  canvasRef: React.MutableRefObject<HTMLDivElement | null>;
  filePickerRef: React.RefObject<HTMLInputElement>;
  uploadFilePickerRef: React.RefObject<HTMLInputElement>;
  replacementPickerRef: React.RefObject<HTMLInputElement>;

  srcInput: string;
  setSrcInput: React.Dispatch<React.SetStateAction<string>>;
  src: string;
  setSrc: React.Dispatch<React.SetStateAction<string>>;
  previewJsonText: string;

  activeTab: AnimaXToolTab;
  setActiveTab: React.Dispatch<React.SetStateAction<AnimaXToolTab>>;
  bindAnimRef: React.RefCallback<AnimaXViewElement>;
  bindCanvasRef: React.RefCallback<HTMLDivElement>;

  speed: number;
  setSpeed: React.Dispatch<React.SetStateAction<number>>;
  loop: boolean;
  setLoop: React.Dispatch<React.SetStateAction<boolean>>;
  isPaused: boolean;
  setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;

  currentFrame: number;
  setCurrentFrame: React.Dispatch<React.SetStateAction<number>>;
  totalFrame: number;
  setTotalFrame: React.Dispatch<React.SetStateAction<number>>;
  stageSize: number;
  setStageSize: React.Dispatch<React.SetStateAction<number>>;

  pushLog: (line: string) => void;

  mappingOpen: boolean;
  setMappingOpen: React.Dispatch<React.SetStateAction<boolean>>;

  durationMs: number | null;
  setDurationMs: React.Dispatch<React.SetStateAction<number | null>>;
  fps: number | null;
  setFps: React.Dispatch<React.SetStateAction<number | null>>;

  jsonEditorText: string;
  jsonPreviewStatus: JsonPreviewStatus;
  jsonSizeBytes: number;
  parsedJson: any;
  composition: CompositionModel | null;
  textLayerRows: TextLayerRow[];
  layerRows: LayerRow[];
  textDrafts: Record<string, string>;
  assetRows: AssetRow[];
  activeLayerBoundsKeys: string[];
  layerBoundsOverlays: LayerBoundsOverlay[];
  selectedLayerKey: string;
  editableLayerPreview: EditableLayerDraftPreview | null;
  layerTransformPreviewOverrides: Record<string, LayerTransform>;

  animaxViewKey: number;
  setAnimaxViewKey: React.Dispatch<React.SetStateAction<number>>;

  dynamicResourceOn: boolean;
  setDynamicResourceOn: React.Dispatch<React.SetStateAction<boolean>>;
  dynamicResourceCode: string;
  setDynamicResourceCode: React.Dispatch<React.SetStateAction<string>>;

  isDraggingFile: boolean;
  setIsDraggingFile: React.Dispatch<React.SetStateAction<boolean>>;
  directoryUploadProgress: DirectoryUploadProgress | null;
  isDirectoryUploading: boolean;
  runtimeReady: boolean;
  runtimeStatus: AnimaXRuntimeStatus | null;
  runtimeError: string | null;

  canConfirm: boolean;
  canApplyDynamicResourceCode: boolean;
  canRepack: boolean;
  isRepacking: boolean;
  canRefreshJsonPreview: boolean;
  canResetJsonEditor: boolean;
  canRandomLottie: boolean;
  isRandomLottieLoading: boolean;
  randomLottieCount: number;
  canShareSrc: boolean;
  pendingAlphaZipInfo: AlphaZipBundleInfo | null;
  pendingAlphaZipName: string;

  handleConfirm: () => void;
  handleJsonEditorTextChange: (value: string) => void;
  handleRefreshJsonPreview: () => void;
  handleResetJsonEditor: () => void;
  handleLoadRandomLottie: () => Promise<void>;
  handleRepack: () => Promise<void>;
  handleCopyShareLink: () => Promise<void>;
  handleTogglePlay: () => void;
  handleProgressChange: (nextFrame: number) => void;
  handleScrubStart: () => void;
  handleScrubEnd: () => void;
  handleDropFile: (file: File) => void;
  handlePickDirectory: (files: File[]) => Promise<void>;
  handlePickFiles: (files: File[]) => Promise<void>;
  handleTextDraftChange: (key: string, value: string) => void;
  handleTextLayerUpdate: (row: TextLayerRow) => void;
  handleToggleLayerBounds: (row: LayerRow) => void;
  handleSelectLayer: (row: LayerRow) => void;
  handlePreviewEditableLayer: (
    input: CreateEditableLayerInput,
    options?: PreviewEditableLayerOptions,
  ) => Promise<boolean>;
  handleCancelEditableLayerPreview: () => void;
  handleCreateEditableLayer: (input: CreateEditableLayerInput) => Promise<void>;
  handleRenameLayer: (row: LayerRow, nextName: string) => void;
  handlePreviewLayerTransform: (row: LayerRow, transform: LayerTransform) => void;
  handleCancelLayerTransformPreview: (row: LayerRow) => void;
  handlePreviewLayerVisibility: (row: LayerRow, visible: boolean) => void;
  handleCancelLayerVisibilityPreview: (row: LayerRow) => void;
  handleApplyLayerEdit: (
    row: LayerRow,
    nextName: string,
    transform: LayerTransform,
    visible: boolean,
  ) => Promise<boolean>;
  handleApplyLayerTransform: (row: LayerRow, transform: LayerTransform) => void;
  handleReplaceResource: (row: AssetRow) => void;
  handleReplaceResourceFromUrl: (row: AssetRow, rawUrl: string) => Promise<void>;
  handleReplaceFontStyle: (row: AssetRow, nextStyle: string) => Promise<void>;
  handleReplacementFile: (file: File) => Promise<void>;
  handleCycleSpeed: () => void;
  handleToggleLoop: () => void;
  handleToggleDynamicResource: () => void;
  handleConfirmAlphaZipConversion: () => void;
  handleCancelAlphaZipConversion: () => void;
}

const AnimaXContext = createContext<AnimaXContextType | null>(null);

type DirectoryUploadPhase = 'scanning' | 'uploading' | 'json' | 'loading' | 'done' | 'error';

interface DirectoryUploadProgress {
  phase: DirectoryUploadPhase;
  title: string;
  detail: string;
  completed: number;
  total: number;
}

interface PendingResourceReplacement {
  kind: ResourceKind;
  id: string;
  url: string;
  fileName: string;
}

interface FontStyleEdit {
  id: string;
  style: string;
}

interface LayerTransformEdit {
  key: string;
  layerName: string;
  transform: LayerTransform;
  visible?: boolean;
}

type LayerTransformPropertyGroup = 'position' | 'anchor' | 'scale' | 'rotation' | 'opacity';

interface UploadPickedDirectoryOptions {
  pendingResourceReplacement?: PendingResourceReplacement;
}

const getResourceKindName = (kind: ResourceKind) => {
  if (kind === 'image') return '图片';
  if (kind === 'video') return '视频';
  return '字体';
};

const getDeclaredResourceSize = (value: any) => {
  const size = Number(value?.sz ?? value?.size);
  return Number.isFinite(size) && size > 0 ? size : undefined;
};

const getResourceSize = (
  edit: ResourceEdit | undefined,
  rawResource: any,
  fallbackPath?: string,
) => {
  if (edit?.file?.size) return edit.file.size;
  return getDeclaredResourceSize(rawResource) ?? getDataUrlByteSize(rawResource?.p ?? fallbackPath);
};

const getResourceEditDetail = (edit: ResourceEdit) => {
  const sourceLabel = formatResourceSourceLabel(edit.url);
  return edit.fileName && edit.fileName !== sourceLabel
    ? `${edit.fileName} / ${sourceLabel}`
    : sourceLabel;
};

const getResourcePathFileName = (path: string, fallback: string) => {
  const trimmed = path.trim();
  if (!trimmed || /^data:/i.test(trimmed)) return fallback;
  try {
    const pathname = new URL(trimmed).pathname;
    const name = decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '');
    if (name) return name;
  } catch {
    // Fall back to parsing a relative path.
  }

  const cleanPath = trimmed.split('#')[0].split('?')[0];
  const name = cleanPath.split('/').filter(Boolean).pop();
  return name || fallback;
};

const getPreviewPixelRatio = () => {
  const ratio = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
};

const layerBoundsColors = [
  '#93c5fd',
  '#a78bfa',
  '#34d399',
  '#f59e0b',
  '#fb7185',
  '#22d3ee',
  '#f472b6',
  '#c4b5fd',
  '#bef264',
  '#fdba74',
  '#67e8f9',
  '#fca5a5',
  '#fde047',
  '#86efac',
];

const getRandomLayerBoundsColor = (overlays: LayerBoundsOverlay[]) => {
  const usedColors = new Set(overlays.map((overlay) => overlay.color).filter(Boolean));
  const availableColors = layerBoundsColors.filter((color) => !usedColors.has(color));
  if (availableColors.length > 0) {
    return availableColors[Math.floor(Math.random() * availableColors.length)];
  }

  for (let index = 0; index < 16; index += 1) {
    const color = `hsl(${Math.floor(Math.random() * 360)}, 92%, 72%)`;
    if (!usedColors.has(color)) return color;
  }

  return layerBoundsColors[Math.floor(Math.random() * layerBoundsColors.length)];
};

const getFontResourceDetail = (font: any, fallbackName: string) => {
  const fPath = typeof font?.fPath === 'string' ? font.fPath.trim() : '';
  if (!fPath) return fallbackName;

  const sourceLabel = formatResourceSourceLabel(fPath);
  const fileName = getResourcePathFileName(fPath, fallbackName);
  return fileName && fileName !== sourceLabel ? `${fileName} / ${sourceLabel}` : sourceLabel;
};

const getFontOriginValue = (font: any) => {
  const origin = Number(font?.origin);
  return Number.isFinite(origin) ? origin : undefined;
};

const getFontOriginFromJsonText = (jsonText: string, fontName: string) => {
  try {
    const parsed = JSON.parse(jsonText) as any;
    const fonts = Array.isArray(parsed?.fonts?.list)
      ? parsed.fonts.list.filter((item: any) => item?.fName === fontName)
      : [];
    if (fonts.length === 0) return undefined;
    if (fonts.some((font: any) => getFontOriginValue(font) === 0)) return 0;
    return getFontOriginValue(fonts[0]);
  } catch {
    return undefined;
  }
};

const getFontOriginLogLabel = (origin: number | undefined) =>
  origin === undefined ? '未声明' : String(origin);

const getEditableLayerKind = (layer: any): EditableLayerKind | undefined => {
  const kind = layer?.__kalEditableKind;
  return kind === 'image' || kind === 'text' || kind === 'solid' ? kind : undefined;
};

const getLayerTypeLabel = (typeCode: number, layer?: any) => {
  if (getEditableLayerKind(layer) === 'solid') return 'Solid';

  switch (typeCode) {
    case 0:
      return '预合成';
    case 1:
      return '纯色';
    case 2:
      return '图片';
    case 3:
      return '空对象';
    case 4:
      return '形状';
    case 5:
      return '文本';
    case 6:
      return '音频';
    case 13:
      return '相机';
    case 1009:
      return '视频';
    default:
      return '未知';
  }
};

const getFrameNumber = (value: any, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const getOptionalNumber = (value: any) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
};

const getTextLayerFontNames = (layer: any) => {
  const fontNames = new Set<string>();
  const keyframes = layer?.t?.d?.k;
  if (!Array.isArray(keyframes)) return [];

  keyframes.forEach((keyframe: any) => {
    const fontName = typeof keyframe?.s?.f === 'string' ? keyframe.s.f.trim() : '';
    if (fontName) fontNames.add(fontName);
  });

  return Array.from(fontNames);
};

const getLayerEffects = (layer: any) => {
  if (!Array.isArray(layer?.ef)) return [];

  return layer.ef.map((effect: any) => {
    const name = typeof effect?.nm === 'string' && effect.nm.trim() ? effect.nm.trim() : 'Effect';
    const matchName =
      typeof effect?.mn === 'string' && effect.mn.trim() ? effect.mn.trim() : undefined;
    const normalized = `${name} ${matchName ?? ''}`.toLocaleLowerCase();

    if (normalized.includes('gaussian blur') || normalized.includes('高斯模糊')) {
      return { kind: 'gaussian-blur' as const, name, matchName };
    }
    if (normalized.includes('drop shadow') || normalized.includes('投影')) {
      return { kind: 'drop-shadow' as const, name, matchName };
    }
    return { kind: 'unsupported' as const, name, matchName };
  });
};

const copyPlainTextToClipboard = async (text: string) => {
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
};

const collectLayerRows = (json: any): LayerRow[] => {
  const rows: LayerRow[] = [];
  let order = 0;

  const collect = (layers: any[], compositionName: string, basePath: Array<string | number>) => {
    let previousMatteLayerIndex: number | undefined;
    layers.forEach((layer, layerIndex) => {
      const path = [...basePath, layerIndex];
      const typeCode = getFrameNumber(layer?.ty, 0);
      const editableKind = getEditableLayerKind(layer);
      const index = getFrameNumber(layer?.ind, layerIndex + 1);
      const name = String(layer?.nm || `layer_${index}`);
      const key = `${compositionName}:${index}`;
      const parentIndex = layer?.parent !== undefined ? getOptionalNumber(layer.parent) : undefined;
      const timeStretch = getFrameNumber(layer?.sr, 1);
      const matteLayerType = layer?.td !== undefined ? getOptionalNumber(layer.td) : undefined;
      const isMatte = typeof matteLayerType === 'number' && matteLayerType > 0;
      const matteType = layer?.tt !== undefined ? getOptionalNumber(layer.tt) : undefined;
      const previousLayer = layerIndex > 0 ? layers[layerIndex - 1] : undefined;
      const previousLayerIndex =
        previousLayer?.ind !== undefined ? getOptionalNumber(previousLayer.ind) : undefined;
      const matteLayerIndex =
        typeof matteType === 'number' && matteType > 0
          ? layer?.tp !== undefined
            ? getOptionalNumber(layer.tp)
            : (previousMatteLayerIndex ?? previousLayerIndex)
          : undefined;
      rows.push({
        key,
        name,
        typeLabel: getLayerTypeLabel(typeCode, layer),
        typeCode,
        path,
        transform: readLayerStaticTransform(layer),
        transformStaticState: readLayerTransformStaticState(layer),
        index,
        order,
        startFrame: getFrameNumber(layer?.ip),
        endFrame: getFrameNumber(layer?.op),
        compositionName,
        editableKind,
        refId: typeof layer?.refId === 'string' && layer.refId ? layer.refId : undefined,
        fontNames: typeCode === 5 ? getTextLayerFontNames(layer) : undefined,
        timeStretch,
        effects: getLayerEffects(layer),
        parentIndex,
        hidden: Boolean(layer?.hd),
        isMatte,
        matteType,
        matteLayerIndex,
        is3d: Boolean(layer?.ddd),
      });
      if (isMatte) {
        previousMatteLayerIndex = index;
      }
      order += 1;
    });
  };

  if (Array.isArray(json?.layers)) {
    collect(json.layers, '主合成', ['layers']);
  }

  if (Array.isArray(json?.assets)) {
    json.assets.forEach((asset: any, assetIndex: number) => {
      if (!Array.isArray(asset?.layers)) return;
      const compositionName = String(asset.nm || asset.id || '预合成');
      collect(asset.layers, compositionName, ['assets', assetIndex, 'layers']);
    });
  }

  return rows;
};

type TextEdit = Pick<TextLayerRow, 'key' | 'name'> & { text: string };

type PendingAlphaZipPrompt = {
  fileName: string;
  info: AlphaZipBundleInfo;
};

type RemoteSourceKind = 'json' | 'zip' | 'unknown';

const INITIAL_JSON_EDITOR_TEXT = '{\n  "v": "5.7.4"\n}\n';
const JSON_AUTO_REFRESH_DELAY_MS = 800;

const getJsonErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const normalizeRelPath = (path: string) =>
  path.replace(/\\/g, '/').split('/').filter(Boolean).join('/');

const getUploadFileName = (fileName: string, fallback = 'resource') => {
  const baseName = normalizeRelPath(fileName).split('/').pop() || fallback;
  const extension = baseName.match(/(\.lottie\.json|\.json|\.[a-zA-Z0-9]{1,8})$/i)?.[0] ?? '';
  const rawStem = extension ? baseName.slice(0, -extension.length) : baseName;
  const stem = safeSegment(rawStem) || fallback;
  return `${stem}${extension.toLowerCase()}`;
};

const getDirName = (path: string) => {
  const normalized = normalizeRelPath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : '';
};

const joinRelPath = (...parts: string[]) => normalizeRelPath(parts.filter(Boolean).join('/'));

const isRemoteOrInlineResource = (value: string) =>
  /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(value.trim());
const isJsonLikePath = (value: string) => /\.(lottie\.json|json)(\?|#|$)/i.test(value.trim());
const isZipLikePath = (value: string) => /\.zip(\?|#|$)/i.test(value.trim());
const getJsonResourceBaseUrl = (value: string) => {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
};

const getJsonAssetPath = (dirName: string, fileName: string) => {
  const trimmedDir = dirName.trim();
  const trimmedFile = fileName.trim();
  if (!trimmedFile) return '';
  if (isRemoteOrInlineResource(trimmedFile) || trimmedFile.startsWith('/')) {
    return trimmedFile;
  }
  return `${trimmedDir}${trimmedFile}`;
};

const preparePreviewJsonText = (jsonText: string, baseUrl: string) => {
  const parsed = JSON.parse(jsonText) as any;
  if (!baseUrl) {
    return { jsonText, rewrittenResourceCount: 0 };
  }

  let rewrittenResourceCount = 0;
  const resolveResource = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isRemoteOrInlineResource(trimmed)) return '';
    try {
      return new URL(trimmed, baseUrl).toString();
    } catch {
      return '';
    }
  };

  if (Array.isArray(parsed?.assets)) {
    parsed.assets.forEach((asset: any) => {
      if (!asset || Array.isArray(asset.layers)) return;
      const p = typeof asset.p === 'string' ? asset.p : '';
      const u = typeof asset.u === 'string' ? asset.u : '';
      const resolved = resolveResource(getJsonAssetPath(u, p));
      if (!resolved) return;
      asset.u = '';
      asset.p = resolved;
      asset.e = 0;
      rewrittenResourceCount += 1;
    });
  }

  if (Array.isArray(parsed?.videos)) {
    parsed.videos.forEach((video: any) => {
      const p = typeof video?.p === 'string' ? video.p : '';
      const u = typeof video?.u === 'string' ? video.u : '';
      const resolved = resolveResource(getJsonAssetPath(u, p));
      if (!resolved) return;
      video.u = '';
      video.p = resolved;
      video.e = 0;
      rewrittenResourceCount += 1;
    });
  }

  if (Array.isArray(parsed?.fonts?.list)) {
    parsed.fonts.list.forEach((font: any) => {
      const fPath = typeof font?.fPath === 'string' ? font.fPath : '';
      const resolved = resolveResource(fPath);
      if (!resolved) return;
      font.fPath = resolved;
      rewrittenResourceCount += 1;
    });
  }

  return {
    jsonText: rewrittenResourceCount > 0 ? `${JSON.stringify(parsed, null, 2)}\n` : jsonText,
    rewrittenResourceCount,
  };
};

const isDirectoryAsset = (path: string) => /(^|\/)(images|videos|fonts)\//i.test(path);
const RESOURCE_URL_VALIDATE_TIMEOUT_MS = 12000;

const collectRelativeResourcePaths = (json: any) => {
  const paths = new Set<string>();
  const addPath = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isRemoteOrInlineResource(trimmed)) return;
    const normalized = normalizeRelPath(trimmed.replace(/^\/+/, ''));
    if (!normalized) return;
    paths.add(normalized);
  };

  if (Array.isArray(json?.assets)) {
    json.assets.forEach((asset: any) => {
      if (!asset || Array.isArray(asset.layers)) return;
      const p = typeof asset.p === 'string' ? asset.p : '';
      const u = typeof asset.u === 'string' ? asset.u : '';
      addPath(`${u}${p}`);
    });
  }

  if (Array.isArray(json?.videos)) {
    json.videos.forEach((video: any) => {
      const p = typeof video?.p === 'string' ? video.p : '';
      const u = typeof video?.u === 'string' ? video.u : '';
      addPath(`${u}${p}`);
    });
  }

  if (Array.isArray(json?.fonts?.list)) {
    json.fonts.list.forEach((font: any) => {
      const fPath = typeof font?.fPath === 'string' ? font.fPath : '';
      addPath(fPath);
    });
  }

  return paths;
};

const attachRelativePath = (file: File, relPath: string) => {
  try {
    Object.defineProperty(file, 'webkitRelativePath', {
      configurable: true,
      value: normalizeRelPath(relPath),
    });
  } catch {
    // Ignore browsers that prevent overriding this non-standard field.
  }
  return file;
};

const createNamedObjectUrl = (blob: Blob, fileName: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const safeName = getUploadFileName(fileName || 'resource');
  return safeName ? `${objectUrl}#${encodeURIComponent(safeName)}` : objectUrl;
};

const revokeNamedObjectUrl = (url: string) => {
  const normalized = url.trim();
  if (!normalized.startsWith('blob:')) return;
  URL.revokeObjectURL(normalized.replace(/[?#].*$/, ''));
};

export const useAnimaX = () => {
  const context = useContext(AnimaXContext);
  if (!context) {
    throw new Error('useAnimaX must be used within an AnimaXProvider');
  }
  return context;
};

export const AnimaXProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const animRef = useRef<AnimaXViewElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const filePickerRef = useRef<HTMLInputElement>(null);
  const uploadFilePickerRef = useRef<HTMLInputElement>(null);
  const replacementPickerRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const replacementTargetRef = useRef<{ kind: ResourceKind; id: string } | null>(null);
  const pendingResourceReplacementRef = useRef<PendingResourceReplacement | null>(null);
  const currentFrameRef = useRef(0);
  const isPausedRef = useRef(false);
  const suppressPlayingSyncUntilRef = useRef(0);
  const suppressRuntimeFrameSyncUntilRef = useRef(0);
  const loopRef = useRef(true);
  const isScrubbingRef = useRef(false);
  const scrubbingWasAnimatingRef = useRef(false);
  const lastScrubFrameRef = useRef(0);
  const totalFrameRef = useRef(1);
  const subscribedUpdateFramesRef = useRef<number[]>([]);
  const resourceEditsRef = useRef<Record<string, ResourceEdit>>({});
  const fontStyleEditsRef = useRef<Record<string, FontStyleEdit>>({});
  const textEditsRef = useRef<Record<string, TextEdit>>({});
  const layerTransformEditsRef = useRef<Record<string, LayerTransformEdit>>({});
  const layerRuntimeNameOverridesRef = useRef<Record<string, string>>({});
  const layerPreviewRuntimeTransformsRef = useRef<Record<string, LayerTransform>>({});
  const layerPreviewRuntimeVisibilityRef = useRef<Record<string, boolean>>({});
  const directoryUploadClearTimerRef = useRef<number | null>(null);
  const alphaZipPromptResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const lastRandomLottieUrlRef = useRef<string | null>(null);
  const layerBoundsRequestIdRef = useRef(0);
  const layerBoundsRequestIdsRef = useRef<Record<string, number>>({});

  const randomLottieUrls = useMemo(
    () =>
      Array.from(
        new Set(ANIMAX_RANDOM_LOTTIE_URLS.map((url) => url.trim()).filter((url) => url.length > 0)),
      ),
    [],
  );
  const randomLottieCount = randomLottieUrls.length;
  const defaultSrc = DEFAULT_ANIMAX_LOTTIE_URL;

  const initialSrc = (() => {
    try {
      const param = new URLSearchParams(window.location.search).get('src')?.trim();
      return param ? param : defaultSrc;
    } catch {
      return defaultSrc;
    }
  })();

  const initialDynamicResourceCode = (() => {
    try {
      return new URLSearchParams(window.location.search).get('dynamic_resource_code') ?? '';
    } catch {
      return '';
    }
  })();

  const initialDynamicResourceOn = true;
  const initialActiveTab: AnimaXToolTab = 'layers';

  const [srcInput, setSrcInput] = useState(initialSrc);
  const [src, setSrc] = useState(initialSrc);
  const [previewJsonText, setPreviewJsonText] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [activeTab, setActiveTab] = useState<AnimaXToolTab>(initialActiveTab);
  const [speed, setSpeed] = useState(1.0);
  const [loop, setLoop] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrame, setTotalFrame] = useState(1);
  const [stageSize, setStageSize] = useState(540);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [jsonEditorText, setJsonEditorText] = useState<string>(INITIAL_JSON_EDITOR_TEXT);
  const [jsonBaselineText, setJsonBaselineText] = useState<string>(INITIAL_JSON_EDITOR_TEXT);
  const [jsonPreviewStatus, setJsonPreviewStatus] = useState<JsonPreviewStatus>({
    tone: 'idle',
    message: 'JSON 已载入',
  });
  const [animaxViewKey, setAnimaxViewKey] = useState(0);
  const [dynamicResourceOn, setDynamicResourceOn] = useState(initialDynamicResourceOn);
  const [dynamicResourceCode, setDynamicResourceCode] = useState(initialDynamicResourceCode);
  const [resourceEdits, setResourceEdits] = useState<Record<string, ResourceEdit>>({});
  const [fontStyleEdits, setFontStyleEdits] = useState<Record<string, FontStyleEdit>>({});
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});
  const [activeLayerBoundsKeys, setActiveLayerBoundsKeys] = useState<string[]>([]);
  const [layerBoundsOverlays, setLayerBoundsOverlays] = useState<LayerBoundsOverlay[]>([]);
  const [selectedLayerKey, setSelectedLayerKey] = useState('');
  const [editableLayerPreview, setEditableLayerPreview] =
    useState<EditableLayerDraftPreview | null>(null);
  const [layerTransformPreviewOverrides, setLayerTransformPreviewOverrides] = useState<
    Record<string, LayerTransform>
  >({});
  const pendingSelectedLayerKeyRef = useRef('');
  const [isRepacking, setIsRepacking] = useState(false);
  const [isRandomLottieLoading, setIsRandomLottieLoading] = useState(false);
  const [directoryUploadProgress, setDirectoryUploadProgress] =
    useState<DirectoryUploadProgress | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<AnimaXRuntimeStatus | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [animElement, setAnimElement] = useState<AnimaXViewElement | null>(null);
  const [canvasElement, setCanvasElement] = useState<HTMLDivElement | null>(null);
  const [pendingAlphaZipPrompt, setPendingAlphaZipPrompt] = useState<PendingAlphaZipPrompt | null>(
    null,
  );

  const jsonEditorTextRef = useRef(jsonEditorText);
  const jsonBaselineTextRef = useRef(jsonBaselineText);
  const jsonResourceBaseUrlRef = useRef(getJsonResourceBaseUrl(initialSrc));
  const jsonPreviewedTextRef = useRef(INITIAL_JSON_EDITOR_TEXT);
  const jsonAutoRefreshTimerRef = useRef<number | null>(null);
  const editableLayerPreviewRef = useRef<{ baseJson: string } | null>(null);
  const dynamicResourceOnRef = useRef(initialDynamicResourceOn);
  const dynamicResourceCodeRef = useRef(dynamicResourceCode);

  useEffect(() => {
    dynamicResourceOnRef.current = dynamicResourceOn;
  }, [dynamicResourceOn]);

  useEffect(() => {
    dynamicResourceCodeRef.current = dynamicResourceCode;
  }, [dynamicResourceCode]);

  useEffect(() => {
    currentFrameRef.current = currentFrame;
  }, [currentFrame]);

  useEffect(() => {
    totalFrameRef.current = totalFrame;
  }, [totalFrame]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  useEffect(() => {
    jsonEditorTextRef.current = jsonEditorText;
  }, [jsonEditorText]);

  useEffect(() => {
    resourceEditsRef.current = resourceEdits;
  }, [resourceEdits]);

  useEffect(() => {
    fontStyleEditsRef.current = fontStyleEdits;
  }, [fontStyleEdits]);

  const canConfirm = useMemo(() => srcInput.trim().length > 0, [srcInput]);
  const canShareSrc = useMemo(() => {
    const shareSrc = src.trim();
    return shareSrc.length > 0 && !/^(blob|data|file):/i.test(shareSrc);
  }, [src]);
  const canApplyDynamicResourceCode = useMemo(
    () => dynamicResourceCode.trim().length > 0,
    [dynamicResourceCode],
  );

  const parsedJson = useMemo(() => {
    try {
      return JSON.parse(jsonEditorText);
    } catch {
      return null;
    }
  }, [jsonEditorText]);

  const jsonSizeBytes = useMemo(
    () => new TextEncoder().encode(jsonEditorText).length,
    [jsonEditorText],
  );

  const composition = useMemo(() => {
    if (!parsedJson) return null;
    try {
      return LottieParser.Parse(parsedJson);
    } catch {
      return null;
    }
  }, [parsedJson]);

  const textLayerRows = useMemo<TextLayerRow[]>(() => collectTextLayers(parsedJson), [parsedJson]);
  const layerRows = useMemo<LayerRow[]>(() => collectLayerRows(parsedJson), [parsedJson]);
  const canRepack = useMemo(() => Boolean(parsedJson) && !isRepacking, [isRepacking, parsedJson]);
  const isDirectoryUploading = Boolean(
    directoryUploadProgress &&
    directoryUploadProgress.phase !== 'done' &&
    directoryUploadProgress.phase !== 'error',
  );
  const canRefreshJsonPreview = jsonEditorText.trim().length > 0 && !isDirectoryUploading;
  const canResetJsonEditor = jsonEditorText !== jsonBaselineText;
  const canRandomLottie = randomLottieCount > 0 && !isRandomLottieLoading && !isDirectoryUploading;

  const markPlaying = () => {
    suppressPlayingSyncUntilRef.current = 0;
    isPausedRef.current = false;
    setIsPaused(false);
  };

  useEffect(() => {
    if (editableLayerPreview && selectedLayerKey === editableLayerPreview.key) {
      pendingSelectedLayerKeyRef.current = '';
      return;
    }
    if (selectedLayerKey && layerRows.some((row) => row.key === selectedLayerKey)) {
      pendingSelectedLayerKeyRef.current = '';
      return;
    }
    const pendingKey = pendingSelectedLayerKeyRef.current;
    if (pendingKey) {
      if (layerRows.some((row) => row.key === pendingKey)) {
        pendingSelectedLayerKeyRef.current = '';
        setSelectedLayerKey(pendingKey);
      }
      return;
    }
    setSelectedLayerKey(layerRows[0]?.key ?? '');
  }, [editableLayerPreview, layerRows, selectedLayerKey]);

  const markPaused = (suppressPlayingSyncMs = 500) => {
    suppressPlayingSyncUntilRef.current = performance.now() + suppressPlayingSyncMs;
    isPausedRef.current = true;
    setIsPaused(true);
  };

  const bindAnimRef = React.useCallback((element: AnimaXViewElement | null) => {
    const previous = animRef.current;
    if (previous === element) return;

    if (previous && !element) {
      try {
        previous.pause();
      } catch {
        // The custom element may already be disconnected while React clears the ref.
      }
      setIsReady(false);
      isScrubbingRef.current = false;
      scrubbingWasAnimatingRef.current = false;
      markPaused(0);
    }

    animRef.current = element;
    setAnimElement(element);
  }, []);

  const bindCanvasRef = React.useCallback((element: HTMLDivElement | null) => {
    canvasRef.current = element;
    setCanvasElement(element);
  }, []);

  const stopForRestartUpdate = (element: AnimaXViewElement) => {
    suppressPlayingSyncUntilRef.current = performance.now() + 3000;
    isScrubbingRef.current = false;
    scrubbingWasAnimatingRef.current = false;
    element.stop();
    element.seek(0);
    currentFrameRef.current = 0;
    setCurrentFrame(0);
    markPaused(3000);
  };

  const playWhenVisible = (
    element: AnimaXViewElement,
    onStarted: () => void,
    onFailed?: () => void,
  ) => {
    let attempts = 0;
    const maxAttempts = 40;
    const startFrame = currentFrameRef.current;

    const attemptPlay = () => {
      if (animRef.current !== element) return;
      attempts += 1;
      element.play();

      window.setTimeout(() => {
        if (animRef.current !== element) return;
        const frameAdvanced = Math.abs(currentFrameRef.current - startFrame) > 0.001;
        if (element.isAnimating() || frameAdvanced || !isPausedRef.current) {
          markPlaying();
          onStarted();
          return;
        }
        if (attempts < maxAttempts) {
          window.requestAnimationFrame(attemptPlay);
          return;
        }
        if (isPausedRef.current) markPaused(0);
        onFailed?.();
      }, 50);
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(attemptPlay);
    });
  };

  const refreshCurrentFrameIfPaused = (element: AnimaXViewElement) => {
    if (animRef.current !== element) return;
    if (!isPausedRef.current || element.isAnimating()) return;
    const total = Math.max(1, totalFrameRef.current);
    const frame = Math.max(0, Math.min(currentFrameRef.current, total - 1));

    suppressPlayingSyncUntilRef.current = performance.now() + 500;
    suppressRuntimeFrameSyncUntilRef.current = performance.now() + 250;
    currentFrameRef.current = frame;
    setCurrentFrame(frame);

    element.seek(frame);
    element.pause();
    markPaused(500);
  };

  const commitResourceEdits = (nextResourceEdits: Record<string, ResourceEdit>) => {
    resourceEditsRef.current = nextResourceEdits;
    setResourceEdits(nextResourceEdits);
  };

  const commitFontStyleEdits = (nextFontStyleEdits: Record<string, FontStyleEdit>) => {
    fontStyleEditsRef.current = nextFontStyleEdits;
    setFontStyleEdits(nextFontStyleEdits);
  };

  const commitTextEdit = (edit: TextEdit) => {
    textEditsRef.current = {
      ...textEditsRef.current,
      [edit.key]: edit,
    };
  };

  const setJsonEditorTextState = (nextJsonText: string, deferred = false) => {
    jsonEditorTextRef.current = nextJsonText;
    if (deferred) {
      startTransition(() => {
        setJsonEditorText(nextJsonText);
      });
      return;
    }

    setJsonEditorText(nextJsonText);
  };

  const commitJsonEditorText = (nextJsonText: string, deferred = false) => {
    setJsonEditorTextState(nextJsonText, deferred);
    jsonBaselineTextRef.current = nextJsonText;
    jsonPreviewedTextRef.current = nextJsonText;
    setJsonBaselineText(nextJsonText);
    setJsonPreviewStatus({
      tone: 'idle',
      message: 'JSON 已同步',
    });
  };

  const handleJsonEditorTextChange = (nextJsonText: string) => {
    setJsonEditorTextState(nextJsonText);
    if (!nextJsonText.trim()) {
      setJsonPreviewStatus({
        tone: 'error',
        message: 'JSON 语法错误：内容为空',
      });
      return;
    }

    try {
      JSON.parse(nextJsonText);
      setJsonPreviewStatus({
        tone: 'pending',
        message:
          nextJsonText === jsonBaselineTextRef.current
            ? '已回到初始 JSON，自动刷新中'
            : 'JSON 语法正确，自动刷新中',
      });
    } catch (error) {
      setJsonPreviewStatus({
        tone: 'error',
        message: `JSON 语法错误：${getJsonErrorMessage(error)}`,
      });
    }
  };

  const clearResourceEdits = () => {
    pendingResourceReplacementRef.current = null;
    commitResourceEdits({});
    commitFontStyleEdits({});
  };

  const clearTextEdits = () => {
    textEditsRef.current = {};
  };

  const clearLayerTransformEdits = () => {
    layerTransformEditsRef.current = {};
    layerRuntimeNameOverridesRef.current = {};
    layerPreviewRuntimeTransformsRef.current = {};
    layerPreviewRuntimeVisibilityRef.current = {};
    editableLayerPreviewRef.current = null;
    setEditableLayerPreview(null);
    setLayerTransformPreviewOverrides({});
  };

  const commitLayerTransformEdit = (edit: LayerTransformEdit) => {
    layerTransformEditsRef.current = {
      ...layerTransformEditsRef.current,
      [edit.key]: edit,
    };
  };

  const clearLayerTransformPreview = (layerKey: string) => {
    delete layerPreviewRuntimeTransformsRef.current[layerKey];
    setLayerTransformPreviewOverrides((prev) => {
      if (!prev[layerKey]) return prev;
      const next = { ...prev };
      delete next[layerKey];
      return next;
    });
  };

  const clearLayerVisibilityPreview = (layerKey: string) => {
    delete layerPreviewRuntimeVisibilityRef.current[layerKey];
  };

  const getLayerRuntimeName = (row: LayerRow) =>
    layerRuntimeNameOverridesRef.current[row.key] ?? row.name;

  const valuesDiffer = (left: number, right: number) => Math.abs(left - right) > 0.0001;

  const getChangedTransformGroups = (
    previous: LayerTransform,
    next: LayerTransform,
    staticState?: LayerTransformStaticState,
  ): LayerTransformPropertyGroup[] => {
    const groups: LayerTransformPropertyGroup[] = [];
    if (
      (!staticState || (staticState.positionX && staticState.positionY)) &&
      (valuesDiffer(previous.positionX, next.positionX) ||
        valuesDiffer(previous.positionY, next.positionY))
    ) {
      groups.push('position');
    }
    if (
      (!staticState || (staticState.anchorX && staticState.anchorY)) &&
      (valuesDiffer(previous.anchorX, next.anchorX) || valuesDiffer(previous.anchorY, next.anchorY))
    ) {
      groups.push('anchor');
    }
    if (
      (!staticState || (staticState.scaleX && staticState.scaleY)) &&
      (valuesDiffer(previous.scaleX, next.scaleX) || valuesDiffer(previous.scaleY, next.scaleY))
    ) {
      groups.push('scale');
    }
    if ((!staticState || staticState.rotation) && valuesDiffer(previous.rotation, next.rotation)) {
      groups.push('rotation');
    }
    if ((!staticState || staticState.opacity) && valuesDiffer(previous.opacity, next.opacity)) {
      groups.push('opacity');
    }
    return groups;
  };

  const applyResourceEdit = (element: AnimaXViewElement, edit: ResourceEdit) => {
    const resourceName = getResourceKindName(edit.kind);
    pushLog(
      `[信息] 开始更新${resourceName}资源：${edit.id} -> ${formatResourceSourceLabel(edit.url)}`,
    );
    if (edit.kind === 'image') {
      element.updateImageById(edit.id, edit.url);
    }
    if (edit.kind === 'video') {
      element.updateVideoById(edit.id, edit.url);
    }
    if (edit.kind === 'font') {
      element.updateFontByName(edit.id, edit.url);
    }
    pushLog(`[信息] 已发起${resourceName}资源更新：${edit.id}`);
  };

  const applyEditedResources = (element: AnimaXViewElement) => {
    const editedResources = Object.values(resourceEditsRef.current).filter((edit) => edit.url);

    editedResources.forEach((edit) => applyResourceEdit(element, edit));

    return editedResources.length;
  };

  const applyFontStyleEdit = (
    element: AnimaXViewElement,
    edit: FontStyleEdit,
  ): Promise<boolean> => {
    const nextStyle = edit.style.trim();
    if (!nextStyle) return Promise.resolve(false);

    pushLog(`[信息] 开始更新字体 Style：${edit.id} -> ${nextStyle}`);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        pushLog(`[警告] 字体 Style 更新超时：${edit.id}`);
        resolve(false);
      }, 1000);

      element.setResourceProperty(
        AnimaXResourcePropertyType.FontStyle,
        edit.id,
        createAnimaXValueParam(nextStyle),
        (success, errorType) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          if (!success) {
            pushLog(`[错误] 字体 Style 更新失败：${edit.id}，errorType=${errorType}`);
          } else {
            pushLog(`[信息] 字体 Style 已更新：${edit.id} -> ${nextStyle}`);
          }
          resolve(Boolean(success));
        },
      );
    });
  };

  const applyEditedFontStyles = async (element: AnimaXViewElement) => {
    const editedFontStyles = Object.values(fontStyleEditsRef.current).filter(
      (edit) => edit.id && edit.style,
    );
    if (editedFontStyles.length === 0) return 0;

    const results = await Promise.all(
      editedFontStyles.map((edit) => applyFontStyleEdit(element, edit)),
    );
    return results.filter(Boolean).length;
  };

  const applyEditedTexts = async (element: AnimaXViewElement) => {
    const editedTexts = Object.values(textEditsRef.current).filter(
      (edit) => edit.name && typeof edit.text === 'string',
    );
    if (editedTexts.length === 0) return 0;

    const results = await Promise.all(
      editedTexts.map(
        (edit) =>
          new Promise<boolean>((resolve) => {
            let settled = false;
            const timer = window.setTimeout(() => {
              if (settled) return;
              settled = true;
              pushLog(`[警告] 恢复历史文本超时：${edit.name}`);
              resolve(false);
            }, 1000);

            element.updateTextByLayerName(edit.name, edit.text, 0, (success, errorType) => {
              if (settled) return;
              settled = true;
              window.clearTimeout(timer);
              if (!success) {
                pushLog(`[错误] 恢复历史文本失败：${edit.name}，errorType=${errorType}`);
              }
              resolve(Boolean(success));
            });
          }),
      ),
    );

    return results.filter(Boolean).length;
  };

  const applyEditedLayerTransforms = async (element: AnimaXViewElement) => {
    const editedTransforms = Object.values(layerTransformEditsRef.current).filter(
      (edit) => edit.layerName && edit.transform,
    );
    if (editedTransforms.length === 0) return 0;

    const results = await Promise.all(
      editedTransforms.map(async (edit) => {
        const appliedTransform = await applyLayerTransformToElement(
          element,
          edit.layerName,
          edit.transform,
          {
            silent: true,
            waitForCallback: true,
          },
        );
        if (edit.visible === undefined) return appliedTransform;
        const appliedVisibility = await applyLayerVisibilityToElement(
          element,
          edit.layerName,
          edit.visible,
          {
            silent: true,
            waitForCallback: true,
          },
        );
        return appliedTransform && appliedVisibility;
      }),
    );
    return results.filter(Boolean).length;
  };

  const assetRows = useMemo<AssetRow[]>(() => {
    if (!composition) return [];

    const rawImageAssets = new Map<string, any>();
    if (Array.isArray(parsedJson?.assets)) {
      parsedJson.assets.forEach((asset: any) => {
        if (asset?.id && asset?.p) rawImageAssets.set(asset.id, asset);
      });
    }

    const rawVideoAssets = new Map<string, any>();
    if (Array.isArray(parsedJson?.videos)) {
      parsedJson.videos.forEach((asset: any) => {
        if (asset?.id) rawVideoAssets.set(asset.id, asset);
      });
    }

    const rawFontAssets = new Map<string, any>();
    if (Array.isArray(parsedJson?.fonts?.list)) {
      parsedJson.fonts.list.forEach((font: any) => {
        if (font?.fName) rawFontAssets.set(font.fName, font);
      });
    }

    const refCounts: Record<string, number> = {};
    const allLayers = [...composition.layers];
    Object.values(composition.precomps).forEach((layers) => allLayers.push(...layers));

    for (const layer of allLayers) {
      if (layer.refId) refCounts[layer.refId] = (refCounts[layer.refId] || 0) + 1;
    }

    const rows: AssetRow[] = [];

    Object.entries(composition.images).forEach(([id, asset]) => {
      const edit = resourceEdits[createResourceKey('image', id)];
      const previewUrl = resolveResourceUrl(src, asset.dirName, asset.fileName, edit);
      const refCount = refCounts[id] || 0;
      const rawAsset = rawImageAssets.get(id);
      const sizeBytes = getResourceSize(edit, rawAsset, asset.fileName);
      const sizeLabel = formatKilobytes(sizeBytes);
      rows.push({
        kind: 'image',
        id,
        name: id,
        detail: `${asset.width}x${asset.height} / ${formatResourceSourceLabel(previewUrl)}`,
        sizeBytes,
        sizeLabel: sizeLabel || undefined,
        refCount,
        status: edit ? 'mapped' : previewUrl ? (refCount > 0 ? 'ok' : 'unused') : 'missing',
        previewUrl,
      });
    });

    Object.entries(composition.videos).forEach(([id, asset]) => {
      const edit = resourceEdits[createResourceKey('video', id)];
      const previewUrl = resolveResourceUrl(src, asset.dirName, asset.fileName, edit);
      const refCount = refCounts[id] || 0;
      const sizeBytes = getResourceSize(edit, rawVideoAssets.get(id), asset.fileName) ?? asset.size;
      const sizeLabel = formatKilobytes(sizeBytes);
      rows.push({
        kind: 'video',
        id,
        name: asset.fileName || id,
        detail: `${asset.w}x${asset.h} / ${formatResourceSourceLabel(
          previewUrl || `${asset.dirName}${asset.fileName}`,
        )}`,
        sizeBytes,
        sizeLabel: sizeLabel || undefined,
        refCount,
        status: edit ? 'mapped' : previewUrl ? (refCount > 0 ? 'ok' : 'unused') : 'missing',
        previewUrl,
      });
    });

    Object.values(composition.fonts).forEach((font) => {
      const edit = resourceEdits[createResourceKey('font', font.name)];
      const rawFont = rawFontAssets.get(font.name);
      const styleEdit = fontStyleEdits[font.name];
      const fontStyle =
        styleEdit?.style ||
        (typeof rawFont?.fStyle === 'string' && rawFont.fStyle.trim()
          ? rawFont.fStyle.trim()
          : '') ||
        font.style;
      const sizeBytes = getResourceSize(edit, rawFont);
      const sizeLabel = formatKilobytes(sizeBytes);
      rows.push({
        kind: 'font',
        id: font.name,
        name: `${font.family} ${fontStyle}`.trim(),
        detail: edit ? getResourceEditDetail(edit) : getFontResourceDetail(rawFont, font.name),
        style: fontStyle,
        origin: getFontOriginValue(rawFont),
        sizeBytes,
        sizeLabel: sizeLabel || undefined,
        refCount: 0,
        status: edit ? 'mapped' : 'ok',
      });
    });

    return rows;
  }, [composition, fontStyleEdits, parsedJson, resourceEdits, src]);

  const pushLog = (line: string) => {
    console.log('[animax]', line);
  };

  const removeLayerBoundsHighlight = (layerKey: string) => {
    delete layerBoundsRequestIdsRef.current[layerKey];
    setActiveLayerBoundsKeys((prev) => prev.filter((key) => key !== layerKey));
    setLayerBoundsOverlays((prev) => prev.filter((overlay) => overlay.layerKey !== layerKey));
  };

  const clearLayerBoundsHighlight = () => {
    layerBoundsRequestIdRef.current += 1;
    layerBoundsRequestIdsRef.current = {};
    setActiveLayerBoundsKeys([]);
    setLayerBoundsOverlays([]);
  };

  const upsertLayerBoundsOverlay = (overlay: Omit<LayerBoundsOverlay, 'color'>) => {
    setLayerBoundsOverlays((prev) => {
      const index = prev.findIndex((item) => item.layerKey === overlay.layerKey);
      const color = index === -1 ? getRandomLayerBoundsColor(prev) : prev[index].color;
      const nextOverlay = { ...overlay, color };
      if (index === -1) return [...prev, nextOverlay];
      const next = [...prev];
      next[index] = nextOverlay;
      return next;
    });
  };

  const requestLayerBounds = (row: LayerRow, options: { activate?: boolean; silent?: boolean }) => {
    if (row.isMatte) {
      if (options.activate) removeLayerBoundsHighlight(row.key);
      if (!options.silent) {
        pushLog(`[警告] Matte 图层不支持定位：${row.name}`);
      }
      return;
    }

    const element = animRef.current;
    const getLayerBounds = element?.getLayerBounds;
    if (typeof getLayerBounds !== 'function') {
      if (!options.silent) {
        pushLog('[错误] 当前 AnimaXView 不支持 getLayerBounds');
        toast.error('当前播放器不支持图层定位');
      }
      return;
    }

    const requestId = layerBoundsRequestIdRef.current + 1;
    layerBoundsRequestIdRef.current = requestId;
    layerBoundsRequestIdsRef.current[row.key] = requestId;
    getLayerBounds.call(
      element,
      row.name,
      AnimaXLayerBoundsSpace.Root,
      (success: boolean, x: number, y: number, width: number, height: number) => {
        if (layerBoundsRequestIdsRef.current[row.key] !== requestId) return;
        if (!success || !Number.isFinite(width) || !Number.isFinite(height)) {
          if (options.activate) removeLayerBoundsHighlight(row.key);
          if (!options.silent) {
            pushLog(`[错误] 获取图层边界失败：${row.name}`);
            toast.error('获取图层边界失败');
          }
          return;
        }

        const density = getPreviewPixelRatio();
        if (!options.silent) {
          pushLog(
            `[信息] 图层边界：${row.name} x=${x.toFixed(2)} y=${y.toFixed(
              2,
            )} w=${width.toFixed(2)} h=${height.toFixed(2)} density=${density.toFixed(2)}`,
          );
        }
        if (options.activate) {
          setActiveLayerBoundsKeys((prev) => (prev.includes(row.key) ? prev : [...prev, row.key]));
        }
        upsertLayerBoundsOverlay({
          layerKey: row.key,
          layerName: row.name,
          x,
          y,
          width,
          height,
          density,
        });
      },
    );
  };

  const handleToggleLayerBounds = (row: LayerRow) => {
    if (activeLayerBoundsKeys.includes(row.key)) {
      removeLayerBoundsHighlight(row.key);
      pushLog(`[信息] 已取消图层定位：${row.name}`);
      return;
    }

    requestLayerBounds(row, { activate: true });
  };

  const handleSelectLayer = (row: LayerRow) => {
    setSelectedLayerKey(row.key);
  };

  const applyLayerTransformToElement = async (
    element: AnimaXViewElement | null,
    layerName: string,
    transform: LayerTransform,
    options: {
      silent?: boolean;
      waitForCallback?: boolean;
      syncFrame?: boolean;
      propertyGroups?: LayerTransformPropertyGroup[];
    } = {},
  ) => {
    if (!element || typeof element.updateLayerProperty !== 'function') return false;
    if (options.propertyGroups && options.propertyGroups.length === 0) return true;
    const propertyGroupSet = options.propertyGroups ? new Set(options.propertyGroups) : null;
    type TransformRuntimeCall = {
      group: LayerTransformPropertyGroup;
      type: AnimaXLayerPropertyType;
      value: { x: number; y: number } | number;
    };
    const allCalls: TransformRuntimeCall[] = [
      {
        group: 'position',
        type: AnimaXLayerPropertyType.TransformPosition,
        value: { x: transform.positionX, y: transform.positionY },
      },
      {
        group: 'anchor',
        type: AnimaXLayerPropertyType.TransformAnchor,
        value: { x: transform.anchorX, y: transform.anchorY },
      },
      {
        group: 'scale',
        type: AnimaXLayerPropertyType.TransformScale,
        value: { x: transform.scaleX / 100, y: transform.scaleY / 100 },
      },
      {
        group: 'rotation',
        type: AnimaXLayerPropertyType.TransformRotation,
        value: transform.rotation,
      },
      {
        group: 'opacity',
        type: AnimaXLayerPropertyType.TransformOpacity,
        value: transform.opacity,
      },
    ];
    const calls = propertyGroupSet
      ? allCalls.filter((call) => propertyGroupSet.has(call.group))
      : allCalls;
    if (calls.length === 0) return true;

    const applyCall = (call: TransformRuntimeCall) =>
      new Promise<boolean>((resolve) => {
        let settled = false;
        const timer = options.waitForCallback
          ? window.setTimeout(() => {
              if (settled) return;
              settled = true;
              if (!options.silent) {
                pushLog(`[警告] Transform API 调用超时：${layerName}`);
              }
              resolve(false);
            }, 1000)
          : null;

        element.updateLayerProperty(
          call.type,
          layerName,
          createAnimaXValueParam(call.value),
          (success, errorType) => {
            if (settled) return;
            settled = true;
            if (timer !== null) window.clearTimeout(timer);
            if (!success && !options.silent) {
              pushLog(`[错误] Transform API 调用失败：${layerName}，errorType=${errorType}`);
            }
            resolve(Boolean(success));
          },
        );

        if (!options.waitForCallback) {
          settled = true;
          resolve(true);
        }
      });

    const results = await Promise.all(calls.map(applyCall));
    if (options.syncFrame !== false) {
      refreshCurrentFrameIfPaused(element);
    }
    return results.every(Boolean);
  };

  const applyLayerTransformToRuntime = async (
    row: LayerRow,
    transform: LayerTransform,
    options: {
      layerName?: string;
      silent?: boolean;
      waitForCallback?: boolean;
      syncFrame?: boolean;
      propertyGroups?: LayerTransformPropertyGroup[];
      refreshBounds?: boolean;
    } = {},
  ) => {
    const applied = await applyLayerTransformToElement(
      animRef.current,
      options.layerName ?? getLayerRuntimeName(row),
      transform,
      options,
    );
    if (options.refreshBounds !== false && activeLayerBoundsKeys.includes(row.key)) {
      requestLayerBounds(row, { silent: true });
    }
    return applied;
  };

  const applyLayerVisibilityToElement = async (
    element: AnimaXViewElement | null,
    layerName: string,
    visible: boolean,
    options: {
      silent?: boolean;
      waitForCallback?: boolean;
      syncFrame?: boolean;
    } = {},
  ) => {
    if (!element || typeof element.updateLayerProperty !== 'function') return false;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const timer =
        options.waitForCallback !== false
          ? window.setTimeout(() => {
              if (settled) return;
              settled = true;
              if (!options.silent) {
                pushLog(`[警告] Visibility API 调用超时：${layerName}`);
              }
              resolve(false);
            }, 1000)
          : null;

      element.updateLayerProperty(
        AnimaXLayerPropertyType.Visibility,
        layerName,
        createAnimaXValueParam(visible ? 1 : 0),
        (success, errorType) => {
          if (settled) return;
          settled = true;
          if (timer !== null) window.clearTimeout(timer);
          if (!success && !options.silent) {
            pushLog(`[错误] Visibility API 调用失败：${layerName}，errorType=${errorType}`);
          }
          resolve(Boolean(success));
        },
      );

      if (options.waitForCallback === false) {
        settled = true;
        resolve(true);
      }
    }).then((success) => {
      if (success && options.syncFrame !== false) {
        refreshCurrentFrameIfPaused(element);
      }
      return success;
    });
  };

  const applyLayerVisibilityToRuntime = async (
    row: LayerRow,
    visible: boolean,
    options: {
      layerName?: string;
      silent?: boolean;
      waitForCallback?: boolean;
      syncFrame?: boolean;
      refreshBounds?: boolean;
    } = {},
  ) => {
    const applied = await applyLayerVisibilityToElement(
      animRef.current,
      options.layerName ?? getLayerRuntimeName(row),
      visible,
      options,
    );
    if (options.refreshBounds !== false && activeLayerBoundsKeys.includes(row.key)) {
      requestLayerBounds(row, { silent: true });
    }
    return applied;
  };

  const handleApplyLayerTransform = async (row: LayerRow, transform: LayerTransform) => {
    let nextJson = jsonEditorTextRef.current;
    try {
      nextJson = updateJsonLayerTransform(
        jsonEditorTextRef.current,
        row.path,
        transform,
        row.transformStaticState,
      );
    } catch (err) {
      pushLog(`[错误] Transform 写入失败：${(err as Error)?.message ?? String(err)}`);
      toast.error('Transform 写入失败');
      return;
    }

    const runtimeLayerName = getLayerRuntimeName(row);
    const propertyGroups = getChangedTransformGroups(
      row.transform,
      transform,
      row.transformStaticState,
    );
    const appliedRuntime = await applyLayerTransformToRuntime(row, transform, {
      layerName: runtimeLayerName,
      waitForCallback: true,
      propertyGroups,
    });
    const nextUrl = await uploadJsonAndReloadAnimation(nextJson, {
      label: row.name,
      uploadPrefix: 'layer_transform',
      doneTitle: 'Transform JSON 已上传',
      doneDetail: '已重新加载播放器实例',
    });
    commitLayerTransformEdit({ key: row.key, layerName: row.name, transform });
    toast.success(`Transform 已应用：${row.name}`);
    pushLog(`[信息] Transform 已应用：${row.name}${appliedRuntime ? '' : '（仅写入 JSON）'}`);
    pushLog(`[信息] Transform 修改已上传并重新加载：${row.name} -> ${nextUrl}`);
    pushLog(`[信息] 已记录 Transform API 调用：${row.name}`);
  };

  const handleRenameLayer = (row: LayerRow, nextName: string) => {
    const cleanName = nextName.trim();
    if (!cleanName) {
      toast.error('图层名不能为空');
      return;
    }

    let nextJson = jsonEditorTextRef.current;
    try {
      nextJson = updateJsonLayerName(jsonEditorTextRef.current, row.path, cleanName);
    } catch (err) {
      pushLog(`[错误] 图层重命名失败：${(err as Error)?.message ?? String(err)}`);
      toast.error('图层重命名失败');
      return;
    }

    commitJsonEditorText(nextJson, true);
    pushLog(`[信息] 图层已重命名：${row.name} -> ${cleanName}`);
    toast.success('图层名已更新');
    setSelectedLayerKey(row.key);
  };

  const handlePreviewLayerTransform = (row: LayerRow, transform: LayerTransform) => {
    const previous = layerPreviewRuntimeTransformsRef.current[row.key] ?? row.transform;
    const propertyGroups = getChangedTransformGroups(previous, transform, row.transformStaticState);
    layerPreviewRuntimeTransformsRef.current[row.key] = transform;
    if (row.editableKind) {
      setLayerTransformPreviewOverrides((prev) => ({ ...prev, [row.key]: transform }));
    }
    if (propertyGroups.length === 0) return;
    void applyLayerTransformToRuntime(row, transform, {
      silent: true,
      waitForCallback: true,
      syncFrame: true,
      propertyGroups,
      refreshBounds: false,
    });
  };

  const handleCancelLayerTransformPreview = (row: LayerRow) => {
    const previous = layerPreviewRuntimeTransformsRef.current[row.key] ?? row.transform;
    const propertyGroups = getChangedTransformGroups(
      previous,
      row.transform,
      row.transformStaticState,
    );
    clearLayerTransformPreview(row.key);
    if (propertyGroups.length === 0) return;
    void applyLayerTransformToRuntime(row, row.transform, {
      silent: true,
      waitForCallback: true,
      syncFrame: true,
      propertyGroups,
      refreshBounds: false,
    });
  };

  const handlePreviewLayerVisibility = (row: LayerRow, visible: boolean) => {
    const currentVisible = !row.hidden;
    const previous = layerPreviewRuntimeVisibilityRef.current[row.key] ?? currentVisible;
    if (previous === visible) return;
    layerPreviewRuntimeVisibilityRef.current[row.key] = visible;
    void applyLayerVisibilityToRuntime(row, visible, {
      silent: true,
      waitForCallback: true,
      syncFrame: true,
      refreshBounds: false,
    });
  };

  const handleCancelLayerVisibilityPreview = (row: LayerRow) => {
    const currentVisible = !row.hidden;
    const previous = layerPreviewRuntimeVisibilityRef.current[row.key] ?? currentVisible;
    clearLayerVisibilityPreview(row.key);
    if (previous === currentVisible) return;
    void applyLayerVisibilityToRuntime(row, currentVisible, {
      silent: true,
      waitForCallback: true,
      syncFrame: true,
      refreshBounds: false,
    });
  };

  const handleApplyLayerEdit = async (
    row: LayerRow,
    nextName: string,
    transform: LayerTransform,
    visible: boolean,
  ) => {
    const cleanName = nextName.trim();
    if (!cleanName) {
      toast.error('图层名不能为空');
      return false;
    }

    let nextJson = jsonEditorTextRef.current;
    const visibilityChanged = visible !== !row.hidden;
    try {
      if (cleanName !== row.name) {
        nextJson = updateJsonLayerName(nextJson, row.path, cleanName);
      }
      nextJson = updateJsonLayerTransform(nextJson, row.path, transform, row.transformStaticState);
      if (visibilityChanged) {
        nextJson = updateJsonLayerVisibility(nextJson, row.path, visible);
      }
    } catch (err) {
      pushLog(`[错误] 图层编辑失败：${(err as Error)?.message ?? String(err)}`);
      toast.error('图层编辑失败');
      return false;
    }

    const runtimeLayerName = getLayerRuntimeName(row);
    const propertyGroups = getChangedTransformGroups(
      row.transform,
      transform,
      row.transformStaticState,
    );
    const appliedRuntime = await applyLayerTransformToRuntime(row, transform, {
      layerName: runtimeLayerName,
      waitForCallback: true,
      propertyGroups,
    });
    const appliedVisibility = visibilityChanged
      ? await applyLayerVisibilityToRuntime(row, visible, {
          layerName: runtimeLayerName,
          waitForCallback: true,
        })
      : true;
    if (cleanName !== row.name) {
      layerRuntimeNameOverridesRef.current[row.key] = cleanName;
    }
    clearLayerTransformPreview(row.key);
    clearLayerVisibilityPreview(row.key);
    pendingSelectedLayerKeyRef.current = row.key;
    setSelectedLayerKey(row.key);
    const nextUrl = await uploadJsonAndReloadAnimation(nextJson, {
      label: cleanName,
      uploadPrefix: 'layer_edit',
      doneTitle: '图层 JSON 已上传',
      doneDetail: '已重新加载播放器实例',
    });
    commitLayerTransformEdit({ key: row.key, layerName: cleanName, transform, visible });
    toast.success(`图层修改已应用：${cleanName}`);
    pushLog(
      `[信息] 图层修改已应用：${row.name} -> ${cleanName}${
        appliedRuntime && appliedVisibility ? '' : '（仅写入 JSON）'
      }`,
    );
    pushLog(`[信息] 图层修改已上传并重新加载：${cleanName} -> ${nextUrl}`);
    pushLog(`[信息] 已记录图层属性 API 调用：${cleanName}`);
    return true;
  };

  const handlePreviewEditableLayer = async (
    input: CreateEditableLayerInput,
    options: PreviewEditableLayerOptions = {},
  ) => {
    try {
      const baseJson = editableLayerPreviewRef.current?.baseJson ?? jsonEditorTextRef.current;
      const result = addJsonEditableLayer(baseJson, input);
      editableLayerPreviewRef.current = { baseJson };
      const nextLayerKey = `editable-preview:${result.layerIndex}`;
      setEditableLayerPreview({
        key: nextLayerKey,
        name: result.layerName,
        input,
      });
      pendingSelectedLayerKeyRef.current = nextLayerKey;
      setSelectedLayerKey(nextLayerKey);
      setActiveTab('layers');
      pushLog(`[信息] 已预览新增图层：${result.layerName}`);
      if (!options.silent) {
        toast.success(`已预览：${result.layerName}`);
      }
      return true;
    } catch (err) {
      pushLog(`[错误] 预览新增图层失败：${(err as Error)?.message ?? String(err)}`);
      toast.error('预览新增图层失败');
      return false;
    }
  };

  const handleCancelEditableLayerPreview = () => {
    if (!editableLayerPreviewRef.current && !editableLayerPreview) return;
    editableLayerPreviewRef.current = null;
    setEditableLayerPreview(null);
    pendingSelectedLayerKeyRef.current = '';
    setSelectedLayerKey('');
    clearLayerBoundsHighlight();
    pushLog('[信息] 已取消新增图层预览');
  };

  const handleCreateEditableLayer = async (input: CreateEditableLayerInput) => {
    try {
      const preview = editableLayerPreviewRef.current;
      const baseJson = preview?.baseJson ?? jsonEditorTextRef.current;
      const result = addJsonEditableLayer(baseJson, input);
      editableLayerPreviewRef.current = null;
      setEditableLayerPreview(null);
      const layerTypeName =
        input.kind === 'solid' ? 'Solid' : input.kind === 'image' ? '图片' : '文本';
      const nextLayerKey = `主合成:${result.layerIndex}`;
      pendingSelectedLayerKeyRef.current = nextLayerKey;
      setSelectedLayerKey(nextLayerKey);
      const nextUrl = await uploadJsonAndReloadAnimation(result.jsonText, {
        label: result.layerName,
        uploadPrefix: 'editable_layer',
        doneTitle: '新 JSON 已上传',
        doneDetail: '已重新加载播放器实例',
      });
      pushLog(`[信息] 已新增${layerTypeName}图层并重新加载：${result.layerName} -> ${nextUrl}`);
      toast.success(`已新增并重新加载：${result.layerName}`);
      setActiveTab('layers');
    } catch (err) {
      pushLog(`[错误] 新增图层失败：${(err as Error)?.message ?? String(err)}`);
      finishDirectoryProgress({
        phase: 'error',
        title: '新增图层失败',
        detail: (err as Error)?.message ?? String(err),
        completed: 0,
        total: 1,
      });
      toast.error('新增图层失败');
    }
  };

  useEffect(() => {
    clearLayerBoundsHighlight();
  }, [animaxViewKey]);

  useEffect(() => {
    if (activeLayerBoundsKeys.length === 0 || !animElement) return;
    const activeRows = activeLayerBoundsKeys
      .map((key) => layerRows.find((item) => item.key === key))
      .filter((row): row is LayerRow => Boolean(row));
    if (activeRows.length === 0) {
      clearLayerBoundsHighlight();
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      activeRows.forEach((row) => requestLayerBounds(row, { silent: true }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeLayerBoundsKeys, animElement, currentFrame, layerRows]);

  const setDirectoryProgress = (progress: DirectoryUploadProgress | null) => {
    if (directoryUploadClearTimerRef.current !== null) {
      window.clearTimeout(directoryUploadClearTimerRef.current);
      directoryUploadClearTimerRef.current = null;
    }
    setDirectoryUploadProgress(progress);
  };

  const finishDirectoryProgress = (progress: DirectoryUploadProgress) => {
    setDirectoryUploadProgress(progress);
    if (directoryUploadClearTimerRef.current !== null) {
      window.clearTimeout(directoryUploadClearTimerRef.current);
    }
    directoryUploadClearTimerRef.current = window.setTimeout(
      () => {
        setDirectoryUploadProgress(null);
        directoryUploadClearTimerRef.current = null;
      },
      progress.phase === 'done' ? 1200 : 2400,
    );
  };

  const requestAlphaZipConversion = (fileName: string, info: AlphaZipBundleInfo) =>
    new Promise<boolean>((resolve) => {
      alphaZipPromptResolverRef.current?.(false);
      alphaZipPromptResolverRef.current = resolve;
      setPendingAlphaZipPrompt({ fileName, info });
    });

  const settleAlphaZipConversion = (accepted: boolean) => {
    const resolve = alphaZipPromptResolverRef.current;
    alphaZipPromptResolverRef.current = null;
    setPendingAlphaZipPrompt(null);
    resolve?.(accepted);
  };

  const getUrlFileName = (url: string, fallback: string) => {
    try {
      const pathname = new URL(url).pathname;
      const name = decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '');
      return name || fallback;
    } catch {
      return fallback;
    }
  };

  const ensureHttpUrl = (value: string) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error('请输入有效的 http(s) 链接');
    }
    if (!/^https?:$/i.test(parsed.protocol)) {
      throw new Error('仅支持 http(s) 链接');
    }
    return parsed.toString();
  };

  const createResourceValidationError = (kind: ResourceKind) =>
    `${getResourceKindName(kind)}链接不可用，请检查地址是否正确或是否允许浏览器访问`;

  const validateResourceUrlWithTimeout = (
    kind: ResourceKind,
    validator: (fail: (error?: Error) => void, pass: () => void) => void,
  ) =>
    new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        finish(new Error(createResourceValidationError(kind)));
      }, RESOURCE_URL_VALIDATE_TIMEOUT_MS);

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };

      validator(
        (error) => finish(error ?? new Error(createResourceValidationError(kind))),
        () => finish(),
      );
    });

  const validateImageResourceUrl = (url: string) =>
    validateResourceUrlWithTimeout('image', (fail, pass) => {
      const image = new Image();
      image.onload = () => pass();
      image.onerror = () => fail();
      image.src = url;
    });

  const validateVideoResourceUrl = (url: string) =>
    validateResourceUrlWithTimeout('video', (fail, pass) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => pass();
      video.oncanplay = () => pass();
      video.onerror = () => fail();
      video.src = url;
      video.load();
    });

  const validateFontResourceUrl = async (url: string) => {
    if (!('FontFace' in window)) {
      const response = await fetch(url, { method: 'HEAD' });
      if (!response.ok) throw new Error(createResourceValidationError('font'));
      return;
    }

    try {
      const escapedUrl = url.replace(/["\\]/g, '\\$&');
      await new FontFace(`AnimaxPreviewerValidation${Date.now()}`, `url("${escapedUrl}")`).load();
    } catch {
      throw new Error(createResourceValidationError('font'));
    }
  };

  const validateReplacementResourceUrl = async (kind: ResourceKind, url: string) => {
    if (kind === 'image') {
      await validateImageResourceUrl(url);
      return;
    }
    if (kind === 'video') {
      await validateVideoResourceUrl(url);
      return;
    }
    await validateFontResourceUrl(url);
  };

  const inferRemoteSourceKind = (
    url: string,
    fileName?: string,
    contentType?: string,
  ): RemoteSourceKind => {
    if (isZipLikePath(url) || (fileName && isZipLikePath(fileName))) return 'zip';
    if (isJsonLikePath(url) || (fileName && isJsonLikePath(fileName))) return 'json';
    const normalizedType = contentType?.split(';')[0].trim().toLowerCase() ?? '';
    if (normalizedType === 'application/zip' || normalizedType === 'application/x-zip-compressed')
      return 'zip';
    if (
      normalizedType === 'application/json' ||
      normalizedType === 'text/json' ||
      normalizedType === 'text/plain'
    )
      return 'json';
    return 'unknown';
  };

  const getRemoteLoadErrorDetail = (kind: RemoteSourceKind, message: string) => {
    if (/HTTP 403/i.test(message)) {
      return `${kind === 'zip' ? 'ZIP' : 'JSON'} 链接无访问权限，请确认资源可被浏览器直接读取`;
    }
    if (/HTTP 404/i.test(message)) {
      return `${kind === 'zip' ? 'ZIP' : 'JSON'} 链接不存在，请检查地址是否正确`;
    }
    if (/Failed to fetch|NetworkError/i.test(message)) {
      return '网络请求失败，请检查链接可访问性、跨域策略或登录态';
    }
    if (/有效的 http/i.test(message) || /仅支持 http/i.test(message)) {
      return message;
    }
    return message;
  };

  const applyJsonText = (text: string) => {
    try {
      const formatted = `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
      commitJsonEditorText(formatted);
      return { parsed: JSON.parse(text) as any, formatted };
    } catch (error) {
      setJsonEditorTextState(text);
      setJsonPreviewStatus({
        tone: 'error',
        message: `JSON 语法错误：${getJsonErrorMessage(error)}`,
      });
      throw new Error('JSON 内容无法解析，请确认链接返回的是合法 Lottie JSON');
    }
  };

  const fetchRemoteFile = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const fallbackName = isZipLikePath(url) ? 'remote.zip' : 'remote.json';
    return new File([blob], getUrlFileName(url, fallbackName), {
      type:
        blob.type ||
        (isZipLikePath(url) ? 'application/zip' : isJsonLikePath(url) ? 'application/json' : ''),
    });
  };

  const fetchRemoteText = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return {
      text: await response.text(),
      contentType: response.headers.get('content-type') ?? '',
      fileName: getUrlFileName(url, 'remote.json'),
    };
  };

  const processZipFile = async (zipFile: File) => {
    setDirectoryProgress({
      phase: 'scanning',
      title: '正在解压 ZIP',
      detail: zipFile.name,
      completed: 0,
      total: 1,
    });
    const alphaZipInfo = await inspectAlphaZipBundle(zipFile);
    if (alphaZipInfo) {
      setDirectoryProgress(null);
      const confirmed = await requestAlphaZipConversion(zipFile.name, alphaZipInfo);
      if (!confirmed) {
        pushLog(`[信息] 已取消 Alpha ZIP 转换：${zipFile.name}`);
        return;
      }

      setDirectoryProgress({
        phase: 'scanning',
        title: '正在转换 Alpha ZIP',
        detail: zipFile.name,
        completed: 0,
        total: 1,
      });
      const converted = await convertAlphaZipToAnimaxLottie(zipFile);
      if (!converted) {
        finishDirectoryProgress({
          phase: 'error',
          title: '转换失败',
          detail: '未识别到可转换的 Alpha ZIP 配置',
          completed: 0,
          total: 1,
        });
        return;
      }

      const convertedFiles = converted.files.map(({ file, relPath }) =>
        attachRelativePath(file, relPath),
      );
      pushLog(
        `[信息] Alpha ZIP 已转换为 animaxLottie：${zipFile.name} -> ${convertedFiles.length} 个文件，尺寸 ${converted.info.width}x${converted.info.height}，总帧数 ${converted.info.totalFrames}`,
      );
      await uploadPickedDirectory(convertedFiles);
      return;
    }

    const zip = await JSZip.loadAsync(zipFile);
    const zipFiles: File[] = [];
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    for (const entry of entries) {
      const blob = await entry.async('blob');
      const fileName = normalizeRelPath(entry.name).split('/').pop() || 'resource';
      const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
      zipFiles.push(attachRelativePath(file, entry.name));
    }

    if (zipFiles.length === 0) {
      finishDirectoryProgress({
        phase: 'error',
        title: 'ZIP 解压失败',
        detail: '压缩包内没有文件',
        completed: 0,
        total: 1,
      });
      return;
    }

    pushLog(`[信息] ZIP 已解压：${zipFile.name}，${zipFiles.length} 个文件`);
    await uploadPickedDirectory(zipFiles);
  };

  const loadAnimationSource = (
    nextSrc: string,
    forceRecreate = false,
    options?: { preservePendingResourceReplacement?: boolean },
  ) => {
    const normalizedSrc = nextSrc.trim();
    if (!normalizedSrc) return;
    const shouldRecreate = forceRecreate || normalizedSrc !== src;
    const pendingResourceReplacement = options?.preservePendingResourceReplacement
      ? pendingResourceReplacementRef.current
      : null;

    if (objectUrlRef.current && objectUrlRef.current !== normalizedSrc) {
      revokeNamedObjectUrl(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    clearResourceEdits();
    clearLayerBoundsHighlight();
    if (pendingResourceReplacement) {
      pendingResourceReplacementRef.current = pendingResourceReplacement;
    }
    clearTextEdits();
    clearLayerTransformEdits();
    setTextDrafts({});
    setPreviewJsonText('');
    currentFrameRef.current = 0;
    setCurrentFrame(0);
    setTotalFrame(1);
    setDurationMs(null);
    setIsReady(false);
    markPaused(1200);
    setSrcInput(normalizedSrc);
    setSrc(normalizedSrc);
    const nextJsonResourceBaseUrl = getJsonResourceBaseUrl(normalizedSrc);
    if (nextJsonResourceBaseUrl) {
      jsonResourceBaseUrlRef.current = nextJsonResourceBaseUrl;
    }
    if (shouldRecreate) {
      setAnimaxViewKey((prev) => prev + 1);
    }
    pushLog(`[信息] 加载：${normalizedSrc}`);
  };

  const clearJsonAutoRefreshTimer = () => {
    if (jsonAutoRefreshTimerRef.current === null) return;
    window.clearTimeout(jsonAutoRefreshTimerRef.current);
    jsonAutoRefreshTimerRef.current = null;
  };

  const refreshPreviewFromJsonText = (jsonText: string, message: string) => {
    clearJsonAutoRefreshTimer();
    const baseUrl =
      jsonResourceBaseUrlRef.current ||
      getJsonResourceBaseUrl(src) ||
      getJsonResourceBaseUrl(srcInput);
    const { jsonText: previewJsonText, rewrittenResourceCount } = preparePreviewJsonText(
      jsonText,
      baseUrl,
    );
    clearResourceEdits();
    clearLayerBoundsHighlight();
    clearTextEdits();
    clearLayerTransformEdits();
    setTextDrafts({});
    currentFrameRef.current = 0;
    setCurrentFrame(0);
    setTotalFrame(1);
    setDurationMs(null);
    setIsReady(false);
    markPaused(1200);
    jsonPreviewedTextRef.current = jsonText;
    setPreviewJsonText(previewJsonText);
    setAnimaxViewKey((prev) => prev + 1);
    setJsonPreviewStatus({
      tone: 'success',
      message,
    });
    pushLog(`[信息] ${message}`);
    if (rewrittenResourceCount > 0) {
      pushLog(`[信息] 已为 JSON 预览补全 ${rewrittenResourceCount} 个相对资源路径`);
    }
  };

  const handleRefreshJsonPreview = () => {
    clearJsonAutoRefreshTimer();
    const nextJsonText = jsonEditorTextRef.current;
    try {
      JSON.parse(nextJsonText);
    } catch (error) {
      const message = `JSON 语法错误：${getJsonErrorMessage(error)}`;
      setJsonPreviewStatus({
        tone: 'error',
        message,
      });
      pushLog(`[错误] ${message}`);
      toast.error('JSON 语法错误');
      return;
    }

    refreshPreviewFromJsonText(nextJsonText, '预览成功：JSON 已刷新');
    toast.success('预览已刷新');
  };

  const handleResetJsonEditor = () => {
    clearJsonAutoRefreshTimer();
    const baselineText = jsonBaselineTextRef.current;
    setJsonEditorTextState(baselineText);
    try {
      JSON.parse(baselineText);
    } catch (error) {
      const message = `JSON 语法错误：${getJsonErrorMessage(error)}`;
      setJsonPreviewStatus({
        tone: 'error',
        message,
      });
      pushLog(`[错误] 初始 JSON 无法还原：${getJsonErrorMessage(error)}`);
      toast.error('初始 JSON 无法解析');
      return;
    }

    refreshPreviewFromJsonText(baselineText, '已还原并刷新预览');
    toast.success('JSON 已还原');
  };

  useEffect(() => {
    clearJsonAutoRefreshTimer();
    const nextJsonText = jsonEditorText;
    if (isDirectoryUploading || !nextJsonText.trim()) return undefined;
    if (nextJsonText === jsonPreviewedTextRef.current) return undefined;

    try {
      JSON.parse(nextJsonText);
    } catch {
      return undefined;
    }

    jsonAutoRefreshTimerRef.current = window.setTimeout(() => {
      if (jsonEditorTextRef.current !== nextJsonText) return;
      try {
        JSON.parse(nextJsonText);
      } catch {
        return;
      }
      refreshPreviewFromJsonText(nextJsonText, '自动预览：JSON 已刷新');
    }, JSON_AUTO_REFRESH_DELAY_MS);

    return clearJsonAutoRefreshTimer;
  }, [isDirectoryUploading, jsonEditorText]);

  const loadRemoteJsonSource = async (url: string) => {
    setDirectoryProgress({
      phase: 'scanning',
      title: '正在下载 JSON',
      detail: url,
      completed: 0,
      total: 1,
    });
    const { text, contentType, fileName } = await fetchRemoteText(url);
    const kind = inferRemoteSourceKind(url, fileName, contentType);
    if (kind === 'zip') {
      throw new Error('该链接返回的是 ZIP 文件，请使用 ZIP 流程加载');
    }
    const { parsed } = applyJsonText(text);
    const relativeResourcePaths = collectRelativeResourcePaths(parsed);
    pushLog(
      `[信息] 已下载远程 JSON：${fileName}${
        relativeResourcePaths.size > 0
          ? `，检测到 ${relativeResourcePaths.size} 个相对资源路径，将按 JSON 同级目录解析`
          : ''
      }`,
    );
    setDirectoryProgress({
      phase: 'loading',
      title: '正在加载动画',
      detail: fileName,
      completed: 1,
      total: 1,
    });
    loadAnimationSource(url, true);
    finishDirectoryProgress({
      phase: 'done',
      title: '远程 JSON 已加载',
      detail: fileName,
      completed: 1,
      total: 1,
    });
  };

  const handleRemoteSource = async (rawUrl: string) => {
    const url = ensureHttpUrl(rawUrl);
    const byPathKind = inferRemoteSourceKind(url);
    if (byPathKind === 'zip') {
      setDirectoryProgress({
        phase: 'scanning',
        title: '正在下载 ZIP',
        detail: url,
        completed: 0,
        total: 1,
      });
      const zipFile = await fetchRemoteFile(url);
      pushLog(`[信息] 已下载远程 ZIP：${zipFile.name}`);
      await processZipFile(zipFile);
      return;
    }
    if (byPathKind === 'json') {
      await loadRemoteJsonSource(url);
      return;
    }

    setDirectoryProgress({
      phase: 'scanning',
      title: '正在探测远程资源',
      detail: url,
      completed: 0,
      total: 1,
    });
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    const fileName = getUrlFileName(url, 'remote');
    const inferredKind = inferRemoteSourceKind(url, fileName, contentType);
    if (inferredKind === 'zip') {
      const blob = await response.blob();
      const zipFile = new File([blob], fileName || 'remote.zip', {
        type: blob.type || 'application/zip',
      });
      pushLog(`[信息] 已探测远程 ZIP：${zipFile.name}`);
      await processZipFile(zipFile);
      return;
    }
    if (inferredKind === 'json') {
      const text = await response.text();
      const { parsed } = applyJsonText(text);
      const relativeResourcePaths = collectRelativeResourcePaths(parsed);
      pushLog(
        `[信息] 已探测远程 JSON：${fileName}${
          relativeResourcePaths.size > 0
            ? `，检测到 ${relativeResourcePaths.size} 个相对资源路径，将按 JSON 同级目录解析`
            : ''
        }`,
      );
      setDirectoryProgress({
        phase: 'loading',
        title: '正在加载动画',
        detail: fileName,
        completed: 1,
        total: 1,
      });
      loadAnimationSource(url, true);
      finishDirectoryProgress({
        phase: 'done',
        title: '远程 JSON 已加载',
        detail: fileName,
        completed: 1,
        total: 1,
      });
      return;
    }

    throw new Error('未识别远程资源类型，请使用 .json 或 .zip 链接');
  };

  const handleConfirm = async () => {
    const nextSrc = srcInput.trim();
    if (!nextSrc) return;
    if (isRemoteOrInlineResource(nextSrc) && /^https?:/i.test(nextSrc)) {
      try {
        await handleRemoteSource(nextSrc);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const kind = inferRemoteSourceKind(nextSrc);
        const title =
          kind === 'zip'
            ? '远程 ZIP 加载失败'
            : kind === 'json'
              ? '远程 JSON 加载失败'
              : '远程资源加载失败';
        const detail = getRemoteLoadErrorDetail(kind, message);
        pushLog(`[错误] ${title}：${detail}`);
        finishDirectoryProgress({
          phase: 'error',
          title,
          detail,
          completed: 0,
          total: 1,
        });
      }
      return;
    }
    loadAnimationSource(nextSrc, true);
  };

  const handleCopyShareLink = async () => {
    const shareSrc = src.trim();
    if (!shareSrc) {
      toast.error('当前没有可分享的动画链接');
      pushLog('[警告] 当前没有可分享的动画链接');
      return;
    }
    if (/^(blob|data|file):/i.test(shareSrc)) {
      toast.error('当前资源不是可分享链接');
      pushLog('[警告] 当前资源不是可分享链接');
      return;
    }

    try {
      const shareUrl = new URL(window.location.href);
      shareUrl.search = '';
      shareUrl.hash = '';
      shareUrl.searchParams.set('src', shareSrc);
      await copyPlainTextToClipboard(shareUrl.toString());
      toast.success('分享链接已复制');
      pushLog(`[信息] 分享链接已复制：${shareUrl.toString()}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('复制分享链接失败');
      pushLog(`[警告] 复制分享链接失败：${message}`);
    }
  };

  const pickRandomLottieUrl = () => {
    const currentSrc = src.trim();
    const lastRandomUrl = lastRandomLottieUrlRef.current;
    let candidates = randomLottieUrls.filter((url) => url !== currentSrc && url !== lastRandomUrl);
    if (candidates.length === 0 && randomLottieUrls.length > 1) {
      candidates = randomLottieUrls.filter((url) => url !== currentSrc);
    }
    if (candidates.length === 0) candidates = randomLottieUrls;
    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  const handleLoadRandomLottie = async () => {
    if (isRandomLottieLoading || isDirectoryUploading) return;

    const nextUrl = pickRandomLottieUrl();
    if (!nextUrl) {
      pushLog('[警告] 随机 Lottie 资源库为空');
      toast.error('请先配置 Lottie 资源库');
      return;
    }

    setIsRandomLottieLoading(true);
    setSrcInput(nextUrl);
    lastRandomLottieUrlRef.current = nextUrl;
    pushLog(`[信息] 随机加载 Lottie：${nextUrl}`);

    try {
      await handleRemoteSource(nextUrl);
      toast.success('已随机加载 Lottie');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const kind = inferRemoteSourceKind(nextUrl);
      const detail = getRemoteLoadErrorDetail(kind, message);
      pushLog(`[错误] 随机 Lottie 加载失败：${detail}`);
      finishDirectoryProgress({
        phase: 'error',
        title: '随机 Lottie 加载失败',
        detail,
        completed: 0,
        total: 1,
      });
      toast.error('随机 Lottie 加载失败');
    } finally {
      setIsRandomLottieLoading(false);
    }
  };

  const handleRepack = async () => {
    if (isRepacking) return;

    setIsRepacking(true);
    pushLog('[信息] 重打包开始');
    try {
      const result = await createAnimaXRepack({
        jsonText: jsonEditorText,
        sourceUrl: src,
      });
      downloadBlob(result.blob, result.fileName);
      pushLog(
        `[信息] 重打包完成：${result.fileName}，json=${result.jsonFileName}，图片=${result.downloadedImages}，视频=${result.downloadedVideos}，base64 图片=${result.skippedBase64Images}，base64 视频=${result.skippedBase64Videos}，字体=${result.downloadedFonts}`,
      );
      result.warnings.forEach((warning) => pushLog(`[警告] ${warning}`));
    } catch (err) {
      pushLog(`[错误] 重打包失败：${(err as Error)?.message ?? String(err)}`);
    } finally {
      setIsRepacking(false);
    }
  };

  const handleTogglePlay = () => {
    const element = animRef.current;
    if (!element) return;

    if (!isPaused) {
      element.pause();
      markPaused();
      pushLog('[信息] 暂停');
      return;
    }

    if (isReady && currentFrameRef.current > 0) {
      element.resume();
    } else {
      element.play();
    }
    markPlaying();
    pushLog(isReady ? '[信息] 继续播放' : '[信息] 播放');
  };

  const handleProgressChange = (nextFrame: number) => {
    const element = animRef.current;
    lastScrubFrameRef.current = nextFrame;
    currentFrameRef.current = nextFrame;
    suppressRuntimeFrameSyncUntilRef.current = 0;
    setCurrentFrame(nextFrame);
    if (!element) return;
    element.seek(nextFrame);
  };

  const handleScrubStart = () => {
    const element = animRef.current;
    isScrubbingRef.current = true;
    if (!element) return;
    scrubbingWasAnimatingRef.current = element.isAnimating();
    if (scrubbingWasAnimatingRef.current) {
      element.pause();
      markPaused();
    }
  };

  const handleScrubEnd = () => {
    const element = animRef.current;
    isScrubbingRef.current = false;
    if (!element) return;
    const frame = lastScrubFrameRef.current;
    pushLog(`[信息] 定位帧：${frame}`);
    if (scrubbingWasAnimatingRef.current) {
      element.resume();
      markPlaying();
    }
    scrubbingWasAnimatingRef.current = false;
  };

  const createLocalResourceUrl = async (file: Blob, _uploadDir: string, filename: string) => {
    const objectUrl = createNamedObjectUrl(file, filename);
    pushLog(`[信息] 已创建本地资源映射：${filename} -> ${objectUrl}`);
    return objectUrl;
  };

  const uploadJsonAndReloadAnimation = async (
    jsonText: string,
    options: {
      label: string;
      uploadPrefix: string;
      doneTitle: string;
      doneDetail: string;
    },
  ) => {
    setDirectoryProgress({
      phase: 'uploading',
      title: '正在上传新 JSON',
      detail: options.label,
      completed: 0,
      total: 1,
    });
    const now = Date.now();
    const fileName = `${safeSegment(options.label) || 'animation'}_${now}.json`;
    const uploadDir = `lottie/tmp/${options.uploadPrefix}_${now}`;
    const nextUrl = ensureHttpsUrl(
      await createLocalResourceUrl(
        new Blob([jsonText], { type: 'application/json' }),
        uploadDir,
        fileName,
      ),
    );
    if (nextUrl.startsWith('blob:')) {
      if (objectUrlRef.current && objectUrlRef.current !== nextUrl) {
        revokeNamedObjectUrl(objectUrlRef.current);
      }
      objectUrlRef.current = nextUrl;
    }
    commitJsonEditorText(jsonText, true);
    loadAnimationSource(nextUrl, true);
    finishDirectoryProgress({
      phase: 'done',
      title: options.doneTitle,
      detail: options.doneDetail,
      completed: 1,
      total: 1,
    });
    return nextUrl;
  };

  const handleDropFile = (file: File) => {
    const nextObjectUrl = createNamedObjectUrl(file, file.name);
    if (objectUrlRef.current) revokeNamedObjectUrl(objectUrlRef.current);
    objectUrlRef.current = nextObjectUrl;

    clearResourceEdits();
    clearLayerBoundsHighlight();
    clearTextEdits();
    clearLayerTransformEdits();
    setTextDrafts({});
    setSrcInput(nextObjectUrl);
    setSrc(nextObjectUrl);
    if (/\.(lottie\.json|json)$/i.test(file.name)) {
      file
        .text()
        .then((text) => {
          try {
            const formatted = `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
            commitJsonEditorText(formatted);
          } catch (error) {
            setJsonEditorTextState(text);
            setJsonPreviewStatus({
              tone: 'error',
              message: `JSON 语法错误：${getJsonErrorMessage(error)}`,
            });
          }
        })
        .catch(() => {
          pushLog('[警告] 读取 JSON 失败');
        });
    }
    pushLog(`[信息] 文件已加载：${file.name} (${Math.round(file.size / 1024)}KB)`);
  };

  const handlePickDirectory = async (files: File[]) => {
    if (isDirectoryUploading) return;
    try {
      await uploadPickedDirectory(files);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushLog(`[错误] 目录上传失败：${message}`);
      finishDirectoryProgress({
        phase: 'error',
        title: '目录上传失败',
        detail: message,
        completed: 0,
        total: 1,
      });
    }
  };

  const handlePickFiles = async (files: File[]) => {
    if (isDirectoryUploading || files.length === 0) return;

    const zipFile =
      files.length === 1 && /\.zip$/i.test(files[0].name.trim()) ? files[0] : undefined;
    const jsonFile =
      files.length === 1 && /\.(lottie\.json|json)$/i.test(files[0].name.trim())
        ? files[0]
        : undefined;
    if (!zipFile) {
      if (jsonFile) {
        await handleSingleJsonFile(jsonFile);
        return;
      }
      await handlePickDirectory(files);
      return;
    }

    try {
      await processZipFile(zipFile);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushLog(`[错误] ZIP 加载失败：${message}`);
      finishDirectoryProgress({
        phase: 'error',
        title: 'ZIP 加载失败',
        detail: message,
        completed: 0,
        total: 1,
      });
    }
  };

  const handleSingleJsonFile = async (file: File) => {
    try {
      setDirectoryProgress({
        phase: 'scanning',
        title: '正在解析 JSON',
        detail: file.name,
        completed: 0,
        total: 1,
      });
      const text = await file.text();
      const parsed = JSON.parse(text) as any;
      const relativeResourcePaths = collectRelativeResourcePaths(parsed);

      if (relativeResourcePaths.size > 0) {
        pushLog(
          `[警告] ${file.name} 引用了 ${relativeResourcePaths.size} 个本地资源，单独选择 JSON 无法读取同级目录，请改用“选择目录”或上传 zip`,
        );
        finishDirectoryProgress({
          phase: 'error',
          title: '缺少同级资源权限',
          detail: '含 images/videos/fonts 的 JSON 请改用“选择目录”或 zip',
          completed: 0,
          total: 1,
        });
        return;
      }

      await uploadPickedDirectory([attachRelativePath(file, file.name)]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushLog(`[错误] JSON 加载失败：${message}`);
      finishDirectoryProgress({
        phase: 'error',
        title: 'JSON 加载失败',
        detail: message,
        completed: 0,
        total: 1,
      });
    }
  };

  const uploadPickedDirectory = async (
    files: File[],
    options: UploadPickedDirectoryOptions = {},
  ) => {
    setDirectoryProgress({
      phase: 'scanning',
      title: '正在扫描目录',
      detail: `${files.length} 个文件`,
      completed: 0,
      total: 1,
    });

    const entries = files.map((file) => {
      const rel = normalizeRelPath(String((file as any).webkitRelativePath || file.name));
      return { file, rel };
    });
    if (entries.length === 0) {
      setDirectoryProgress(null);
      return;
    }

    const root = entries[0]?.rel.split('/')[0] ?? '';
    const shouldStripRoot =
      entries.length > 1 &&
      root.length > 0 &&
      entries.every((e) => e.rel === root || e.rel.startsWith(`${root}/`));

    const normalized = entries.map(({ file, rel }) => {
      const stripped = shouldStripRoot ? rel.slice(root.length + 1) : rel;
      const clean = stripped.replace(/^\/+/, '');
      return { file, relPath: clean.length > 0 ? clean : file.name };
    });

    const sorted = normalized.sort((a, b) => a.relPath.localeCompare(b.relPath));
    const jsonEntries = sorted
      .filter((e) => /\.(lottie\.json|json)$/i.test(e.relPath))
      .sort((a, b) => {
        const aLottie = /\.lottie\.json$/i.test(a.relPath) ? 0 : 1;
        const bLottie = /\.lottie\.json$/i.test(b.relPath) ? 0 : 1;
        return aLottie - bLottie || a.relPath.localeCompare(b.relPath);
      });

    if (jsonEntries.length === 0) {
      window.alert('目录中未找到 JSON 文件');
      pushLog('[错误] 目录中未找到 JSON 文件');
      finishDirectoryProgress({
        phase: 'error',
        title: '上传终止',
        detail: '目录中未找到 JSON 文件',
        completed: 0,
        total: 1,
      });
      return;
    }

    let picked = jsonEntries[0];
    let pickedJson: any = null;
    for (const entry of jsonEntries) {
      const text = await entry.file.text();
      try {
        const parsed = JSON.parse(text) as any;
        const isLottieJson =
          Array.isArray(parsed?.layers) ||
          Array.isArray(parsed?.assets) ||
          Array.isArray(parsed?.videos) ||
          typeof parsed?.fr === 'number';
        if (!pickedJson || isLottieJson) {
          picked = entry;
          pickedJson = parsed;
        }
        if (isLottieJson) break;
      } catch {
        // Continue scanning other JSON files.
      }
    }

    if (!pickedJson) {
      window.alert('目录中的 JSON 无法解析');
      pushLog('[错误] 目录中的 JSON 无法解析');
      finishDirectoryProgress({
        phase: 'error',
        title: '上传终止',
        detail: '目录中的 JSON 无法解析',
        completed: 0,
        total: 1,
      });
      return;
    }

    pushLog(`[信息] 已选择目录：${sorted.length} 个文件，主文件=${picked.relPath}`);

    const pickedBase = picked.relPath.split('/').pop() || picked.relPath;
    const pickedWithoutExt = pickedBase
      .replace(/\.(lottie\.json|json)$/i, '')
      .replace(/\.[^./]+$/i, '');
    const prefixParts = ['lottie/tmp'];
    prefixParts.push(`${safeSegment(pickedWithoutExt || pickedBase) || 'upload'}_${Date.now()}`);
    const uploadPrefix = prefixParts.filter(Boolean).join('/');
    pushLog(`[信息] 上传前缀：${uploadPrefix}`);

    const fileByRelPath = new Map(sorted.map((item) => [item.relPath, item.file]));
    const jsonDir = getDirName(picked.relPath);
    const findLocalResourcePath = (resourcePath: string) => {
      const trimmed = resourcePath.trim().replace(/^\/+/, '');
      if (!trimmed || isRemoteOrInlineResource(trimmed)) return '';
      const decoded = (() => {
        try {
          return decodeURIComponent(trimmed);
        } catch {
          return trimmed;
        }
      })();
      const candidates = [
        joinRelPath(jsonDir, trimmed),
        joinRelPath(trimmed),
        joinRelPath(jsonDir, decoded),
        joinRelPath(decoded),
        normalizeRelPath(trimmed).split('/').pop() ?? '',
        normalizeRelPath(decoded).split('/').pop() ?? '',
      ];
      return candidates.find((candidate) => fileByRelPath.has(candidate)) ?? '';
    };

    const referencedResources = new Set<string>();
    if (Array.isArray(pickedJson.assets)) {
      pickedJson.assets.forEach((asset: any) => {
        if (!asset || Array.isArray(asset.layers)) return;
        const p = typeof asset.p === 'string' ? asset.p : '';
        const u = typeof asset.u === 'string' ? asset.u : '';
        const localPath = findLocalResourcePath(`${u}${p}`);
        if (localPath) referencedResources.add(localPath);
      });
    }
    if (Array.isArray(pickedJson.videos)) {
      pickedJson.videos.forEach((video: any) => {
        const p = typeof video?.p === 'string' ? video.p : '';
        const u = typeof video?.u === 'string' ? video.u : '';
        const localPath = findLocalResourcePath(`${u}${p}`);
        if (localPath) referencedResources.add(localPath);
      });
    }
    if (Array.isArray(pickedJson.fonts?.list)) {
      pickedJson.fonts.list.forEach((font: any) => {
        const fPath = typeof font?.fPath === 'string' ? font.fPath : '';
        const localPath = findLocalResourcePath(fPath);
        if (localPath) referencedResources.add(localPath);
      });
    }

    const uploadEntries = sorted.filter(
      (item) =>
        item.relPath !== picked.relPath &&
        (/\.(lottie\.json|json)$/i.test(item.relPath) ||
          isDirectoryAsset(item.relPath) ||
          referencedResources.has(item.relPath)),
    );
    const totalUploads = uploadEntries.length + 1;
    let completedUploads = 0;

    setDirectoryProgress({
      phase: 'uploading',
      title: uploadEntries.length > 0 ? '正在上传资源' : '准备上传 JSON',
      detail:
        uploadEntries.length > 0
          ? `0 / ${uploadEntries.length} 个资源`
          : '未发现需要上传的外部资源',
      completed: 0,
      total: totalUploads,
    });

    const uploadOne = async (
      item: { file: File; relPath: string },
      content: Blob = item.file,
      filenameOverride?: string,
      progress?: { phase: DirectoryUploadPhase; title: string; detail?: string },
    ) => {
      const relPath = item.relPath;
      try {
        const parts = relPath.split('/');
        const defaultName = parts.pop() || item.file.name;
        const name = getUploadFileName(filenameOverride || defaultName);
        const subDir = parts
          .map((part) => safeSegment(part))
          .filter(Boolean)
          .join('/');
        const uploadDir = subDir ? `${uploadPrefix}/${subDir}` : uploadPrefix;
        const resourceUrl = await createLocalResourceUrl(content, uploadDir, name);
        return { file: item.file, resourceUrl, relPath } as const;
      } catch (err) {
        pushLog(`[错误] 上传失败：${relPath}: ${(err as Error)?.message ?? String(err)}`);
        return null;
      } finally {
        if (progress) {
          completedUploads += 1;
          setDirectoryProgress({
            phase: progress.phase,
            title: progress.title,
            detail: progress.detail ?? relPath,
            completed: completedUploads,
            total: totalUploads,
          });
        }
      }
    };

    const resourceResults = await Promise.all(
      uploadEntries.map((item) =>
        uploadOne(item, item.file, undefined, {
          phase: 'uploading',
          title: '正在上传资源',
          detail: item.relPath,
        }),
      ),
    );
    const uploadedByRelPath = new Map<string, string>();
    resourceResults.forEach((result) => {
      if (result) uploadedByRelPath.set(result.relPath, ensureHttpsUrl(result.resourceUrl));
    });

    const nextJson = JSON.parse(JSON.stringify(pickedJson)) as any;
    if (Array.isArray(nextJson.assets)) {
      nextJson.assets.forEach((asset: any) => {
        if (!asset || Array.isArray(asset.layers)) return;
        const p = typeof asset.p === 'string' ? asset.p : '';
        const u = typeof asset.u === 'string' ? asset.u : '';
        const localPath = findLocalResourcePath(`${u}${p}`);
        const uploadedUrl = localPath ? uploadedByRelPath.get(localPath) : '';
        if (!uploadedUrl) return;
        asset.u = '';
        asset.p = uploadedUrl;
        asset.e = 0;
      });
    }
    if (Array.isArray(nextJson.videos)) {
      nextJson.videos.forEach((video: any) => {
        const p = typeof video?.p === 'string' ? video.p : '';
        const u = typeof video?.u === 'string' ? video.u : '';
        const localPath = findLocalResourcePath(`${u}${p}`);
        const uploadedUrl = localPath ? uploadedByRelPath.get(localPath) : '';
        if (!uploadedUrl) return;
        video.u = '';
        video.p = uploadedUrl;
        video.e = 0;
      });
    }
    if (Array.isArray(nextJson.fonts?.list)) {
      nextJson.fonts.list.forEach((font: any) => {
        const fPath = typeof font?.fPath === 'string' ? font.fPath : '';
        const localPath = findLocalResourcePath(fPath);
        const uploadedUrl = localPath ? uploadedByRelPath.get(localPath) : '';
        if (uploadedUrl) font.fPath = uploadedUrl;
      });
    }

    const nextJsonText = `${JSON.stringify(nextJson, null, 2)}\n`;
    setDirectoryProgress({
      phase: 'json',
      title: '正在上传 JSON',
      detail: pickedBase,
      completed: completedUploads,
      total: totalUploads,
    });
    const mainResult = await uploadOne(
      picked,
      new Blob([nextJsonText], { type: 'application/json' }),
      getUploadFileName(pickedBase, 'animation.json'),
      { phase: 'json', title: '正在上传 JSON', detail: pickedBase },
    );
    if (!mainResult) {
      finishDirectoryProgress({
        phase: 'error',
        title: '上传失败',
        detail: 'JSON 上传失败',
        completed: completedUploads,
        total: totalUploads,
      });
      return;
    }

    const nextUrl = ensureHttpsUrl(mainResult.resourceUrl);
    setDirectoryProgress({
      phase: 'loading',
      title: '正在加载动画',
      detail: '所有资源已上传，正在创建播放器',
      completed: totalUploads,
      total: totalUploads,
    });
    if (options.pendingResourceReplacement) {
      pendingResourceReplacementRef.current = options.pendingResourceReplacement;
    }
    commitJsonEditorText(nextJsonText);
    loadAnimationSource(nextUrl, true, {
      preservePendingResourceReplacement: Boolean(options.pendingResourceReplacement),
    });
    finishDirectoryProgress({
      phase: 'done',
      title: '上传完成',
      detail: '已更新链接并开始加载',
      completed: totalUploads,
      total: totalUploads,
    });
    pushLog(
      `[信息] 目录上传完成：JSON 1 个，资源 ${uploadedByRelPath.size} 个，使用链接：${nextUrl}`,
    );
    return nextUrl;
  };

  const uploadRepackedAnimation = async (
    result: RepackResult,
    options: UploadPickedDirectoryOptions = {},
  ) => {
    const zip = await JSZip.loadAsync(result.blob);
    const files: File[] = [];

    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const blob = await entry.async('blob');
      const fileName = normalizeRelPath(entry.name).split('/').pop() || 'resource';
      files.push(attachRelativePath(new File([blob], fileName), entry.name));
    }

    if (!files.some((file) => /\.(lottie\.json|json)$/i.test(file.name))) {
      throw new Error('重打包结果中未找到 JSON 文件');
    }

    return uploadPickedDirectory(files, options);
  };

  const handleTextDraftChange = (key: string, value: string) => {
    setTextDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const handleTextLayerUpdate = (row: TextLayerRow) => {
    const nextText = (textDrafts[row.key] ?? row.text).trimEnd();
    let nextJson = jsonEditorTextRef.current;
    try {
      nextJson = updateJsonTextLayerValue(jsonEditorTextRef.current, row.path, nextText);
    } catch (err) {
      pushLog(`[错误] 文本更新失败：${(err as Error)?.message ?? String(err)}`);
      return;
    }

    const element = animRef.current;
    const frameToRestore = currentFrameRef.current;
    const shouldRestart = Boolean(element?.isAnimating() || !isPausedRef.current);

    if (shouldRestart && element) {
      stopForRestartUpdate(element);
    }

    commitJsonEditorText(nextJson, true);

    if (!element) {
      commitTextEdit({ key: row.key, name: row.name, text: nextText });
      pushLog(`[信息] 文本已更新：${row.name}`);
      return;
    }

    if (shouldRestart) {
      element.updateTextByLayerName(row.name, nextText, 0, (success, errorType) => {
        if (!success) {
          pushLog(`[错误] 文本更新失败：${row.name}，errorType=${errorType}`);
          return;
        }

        const activeElement = animRef.current;
        if (!activeElement) return;

        commitTextEdit({ key: row.key, name: row.name, text: nextText });
        activeElement.seek(0);
        setCurrentFrame(0);
        toast.success(`更新 ${row.name} 到 ${nextText}`);
        playWhenVisible(
          activeElement,
          () => {
            pushLog(`[信息] 文本已更新并从头播放：${row.name}`);
          },
          () => {
            pushLog(`[警告] 文本已更新，但播放启动失败：${row.name}`);
          },
        );
      });
      return;
    }

    element.updateTextByLayerName(row.name, nextText, undefined, (success, errorType) => {
      if (!success) {
        pushLog(`[错误] 文本更新失败：${row.name}，errorType=${errorType}`);
        return;
      }

      const activeElement = animRef.current;
      if (!activeElement) return;

      isScrubbingRef.current = false;
      scrubbingWasAnimatingRef.current = false;

      commitTextEdit({ key: row.key, name: row.name, text: nextText });
      activeElement.seek(frameToRestore);
      setCurrentFrame(frameToRestore);
      activeElement.pause();
      markPaused();
      toast.success(`更新 ${row.name} 到 ${nextText}`);
      pushLog(`[信息] 文本已更新并刷新当前帧：${row.name}`);
    });
  };

  const handleReplaceResource = (row: AssetRow) => {
    replacementTargetRef.current = { kind: row.kind, id: row.id };
    replacementPickerRef.current?.click();
  };

  const handleReplaceFontStyle = async (row: AssetRow, nextStyle: string) => {
    if (row.kind !== 'font') {
      throw new Error('只有字体资源支持 Style 替换');
    }

    const cleanStyle = nextStyle.trim();
    if (!cleanStyle) {
      throw new Error('请选择字体 Style');
    }

    const nextJson = updateJsonFontStyle(jsonEditorTextRef.current, row.id, cleanStyle);
    const nextFontStyleEdits = {
      ...fontStyleEditsRef.current,
      [row.id]: { id: row.id, style: cleanStyle },
    };

    const element = animRef.current;
    if (element) {
      const applied = await applyFontStyleEdit(element, { id: row.id, style: cleanStyle });
      if (!applied) {
        throw new Error(`字体 Style 更新失败：${row.id}`);
      }
      element.seek(currentFrameRef.current);
    }

    commitJsonEditorText(nextJson);
    commitFontStyleEdits(nextFontStyleEdits);
    toast.success(`字体 Style 已更新：${row.id} -> ${cleanStyle}`);
  };

  const applyResourceReplacement = async (
    target: { kind: ResourceKind; id: string },
    nextUrl: string,
    fileName: string,
    file?: File,
  ) => {
    const element = animRef.current;
    if (element) stopForRestartUpdate(element);

    const nextJson = updateJsonResourcePath(
      jsonEditorTextRef.current,
      target.kind,
      target.id,
      nextUrl,
    );
    const currentFontOrigin =
      target.kind === 'font'
        ? getFontOriginFromJsonText(jsonEditorTextRef.current, target.id)
        : undefined;

    if (target.kind === 'font' && currentFontOrigin !== 3) {
      pushLog(
        `[信息] 字体 ${target.id} 当前 origin=${getFontOriginLogLabel(
          currentFontOrigin,
        )}，正在转为远端字体并重新上传动画 JSON`,
      );
      setDirectoryProgress({
        phase: 'scanning',
        title: '正在转换字体资源',
        detail: `${target.id} 将改为远端字体并重新生成 JSON`,
        completed: 0,
        total: 1,
      });

      const repackResult = await createAnimaXRepack({
        jsonText: nextJson,
        sourceUrl: src,
      });
      repackResult.warnings.forEach((warning) => pushLog(`[警告] ${warning}`));
      pushLog(
        `[信息] 字体转换重打包完成：json=${repackResult.jsonFileName}，图片=${repackResult.downloadedImages}，视频=${repackResult.downloadedVideos}，字体=${repackResult.downloadedFonts}`,
      );

      // The font URL has already been written into the repacked JSON. Applying a
      // second runtime font update after reload can reset the font asset before draw.
      const nextJsonUrl = await uploadRepackedAnimation(repackResult);
      if (!nextJsonUrl) throw new Error('字体转换后的 JSON 上传失败');

      pushLog(`[信息] 字体已转为远端字体，新 JSON 链接：${nextJsonUrl}`);
      toast.success('已生成远端字体 JSON，正在重新加载');
      return;
    }

    const nextEdit: ResourceEdit = {
      kind: target.kind,
      id: target.id,
      url: nextUrl,
      fileName,
      file,
    };
    const nextResourceEdits = {
      ...resourceEditsRef.current,
      [createResourceKey(target.kind, target.id)]: nextEdit,
    };

    commitJsonEditorText(nextJson);
    commitResourceEdits(nextResourceEdits);

    pendingResourceReplacementRef.current = {
      kind: target.kind,
      id: target.id,
      url: nextUrl,
      fileName,
    };
    setIsReady(false);
    currentFrameRef.current = 0;
    setCurrentFrame(0);
    setAnimaxViewKey((prev) => prev + 1);
    pushLog(`[信息] ${getResourceKindName(target.kind)}已替换，等待播放器重建：${target.id}`);
  };

  const handleReplacementFile = async (file: File) => {
    const target = replacementTargetRef.current;
    if (!target) return;

    try {
      const uploadFileName = `${safeSegment(target.id) || 'resource'}_${Date.now()}${
        getFileExtension(file.name) || (target.kind === 'image' ? '.png' : '')
      }`;
      const resourceUrl = await createLocalResourceUrl(
        file,
        `lottie/tmp/tools/${safeSegment(target.id) || 'resource'}`,
        uploadFileName,
      );
      await applyResourceReplacement(target, ensureHttpsUrl(resourceUrl), uploadFileName, file);
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      pushLog(`[错误] 替换失败：${message}`);
      toast.error(`替换失败：${message}`);
    } finally {
      replacementTargetRef.current = null;
    }
  };

  const handleReplaceResourceFromUrl = async (row: AssetRow, rawUrl: string) => {
    try {
      const nextUrl = ensureHttpUrl(ensureHttpsUrl(rawUrl));
      await validateReplacementResourceUrl(row.kind, nextUrl);
      await applyResourceReplacement(
        { kind: row.kind, id: row.id },
        nextUrl,
        getUrlFileName(nextUrl, row.name || row.id),
      );
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      pushLog(`[错误] URL 替换失败：${message}`);
      toast.error(`替换失败：${message}`);
      throw new Error(`替换失败：${message}`);
    }
  };

  const handleCycleSpeed = () => {
    const speeds = [1.0, 1.5, 2.0, 2.5, 0.5];
    setSpeed((prev) => {
      const idx = speeds.indexOf(Number(prev.toFixed(1)));
      const next = speeds[(idx + 1 + speeds.length) % speeds.length];
      pushLog(`[信息] 速度：x${next.toFixed(1)}`);
      return next;
    });
  };

  const handleToggleLoop = () => {
    setLoop((prev) => {
      const next = !prev;
      pushLog(`[信息] 循环：${next ? '开启' : '关闭'}`);
      return next;
    });
  };

  const handleToggleDynamicResource = () => {
    const nextOn = !dynamicResourceOnRef.current;
    dynamicResourceOnRef.current = nextOn;
    setDynamicResourceOn(nextOn);
    setIsReady(false);
    markPaused();
    setAnimaxViewKey((prev) => prev + 1);
    pushLog(`[信息] 动态资源：${nextOn ? '开启' : '关闭'}`);
  };

  // --- Effects ---

  useEffect(() => {
    const input = filePickerRef.current;
    if (!input) return;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
  }, []);

  useEffect(() => {
    let disposed = false;

    ensureAnimaXRuntimeInitialized({
      onLog: (line) => {
        if (!disposed) pushLog(line);
      },
    })
      .then((status) => {
        if (disposed) return;
        setRuntimeStatus(status);
        setRuntimeReady(status.ready);
        if (status.ready) {
          setRuntimeError(null);
          pushLog(
            `[信息] 运行时可用：字体=${status.fontLoaded ? '已加载' : '失败'}(${
              status.fontCount
            } 组)，Textra=${status.textraModuleLoaded ? '已加载' : '失败'}(${Math.round(
              status.textraModuleBytes / 1024,
            )}KB，${
              status.textraModuleFromCache ? '本地缓存' : '网络下载'
            })，视频=${status.videoModuleLoaded ? '已加载' : '失败'}(${Math.round(
              status.videoModuleBytes / 1024,
            )}KB，${status.videoModuleFromCache ? '本地缓存' : '网络下载'})`,
          );
          return;
        }

        const message = status.warnings.join('；') || '字体、Textra 或视频模块未完成加载';
        setRuntimeError(message);
        pushLog(`[错误] 运行时未就绪，播放器不会挂载：${message}`);
      })
      .catch((err: unknown) => {
        if (disposed) return;
        const message = err instanceof Error ? err.message : String(err);
        setRuntimeReady(false);
        setRuntimeError(message);
        pushLog(`[错误] 运行时初始化失败，播放器不会挂载：${message}`);
      });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    setIsReady(false);
    setCurrentFrame(0);
    setTotalFrame(1);
    setDurationMs(null);
  }, [src]);

  useEffect(() => {
    const url = src.trim();
    if (!/\.(lottie\.json|json)(\?|#|$)/i.test(url)) return;
    const preserveResourceState = Boolean(pendingResourceReplacementRef.current);

    const controller = new AbortController();
    let alive = true;

    (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        const text = await res.text();
        if (!alive) return;
        try {
          const formatted = `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
          commitJsonEditorText(formatted);
        } catch (error) {
          setJsonEditorTextState(text);
          setJsonPreviewStatus({
            tone: 'error',
            message: `JSON 语法错误：${getJsonErrorMessage(error)}`,
          });
        }
        if (!preserveResourceState) {
          clearResourceEdits();
          clearTextEdits();
          clearLayerTransformEdits();
          setTextDrafts({});
        }
      } catch (err) {
        if (!alive) return;
        if ((err as any)?.name === 'AbortError') return;
        pushLog(`[警告] 拉取 JSON 失败：${(err as Error)?.message ?? String(err)}`);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [src]);

  useEffect(() => {
    if (!canvasElement) return;
    const padding = 18;
    const progressReserve = 84;

    const compute = () => {
      const rect = canvasElement.getBoundingClientRect();
      const w = Math.max(0, rect.width - padding * 2);
      const h = Math.max(0, rect.height - padding * 2 - progressReserve);
      const next = Math.max(240, Math.min(960, Math.floor(Math.min(w, h))));
      setStageSize((prev) => (prev === next ? prev : next));
    };

    compute();

    const ro = new ResizeObserver(() => {
      compute();
    });
    ro.observe(canvasElement);
    return () => ro.disconnect();
  }, [canvasElement]);

  useEffect(() => {
    return () => {
      alphaZipPromptResolverRef.current?.(false);
      alphaZipPromptResolverRef.current = null;
      if (objectUrlRef.current) {
        revokeNamedObjectUrl(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      clearJsonAutoRefreshTimer();
      if (directoryUploadClearTimerRef.current !== null) {
        window.clearTimeout(directoryUploadClearTimerRef.current);
        directoryUploadClearTimerRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!runtimeReady) return;
    if (!animElement) return;
    const element = animElement;
    setFps(null);

    let durationTimer: number | null = null;
    const clearUpdateSubscriptions = () => {
      const frames = subscribedUpdateFramesRef.current;
      if (frames.length === 0) return;
      if (typeof element.unsubscribeUpdateEvents === 'function') {
        element.unsubscribeUpdateEvents(frames);
      }
      subscribedUpdateFramesRef.current = [];
    };

    const syncUpdateSubscriptions = (total: number) => {
      if (!Number.isFinite(total) || total <= 0) return;
      const frameCount = Math.ceil(total);
      const frames = Array.from({ length: frameCount }, (_, index) => index);
      clearUpdateSubscriptions();
      element.subscribeUpdateEvents(frames);
      subscribedUpdateFramesRef.current = frames;
    };

    const scheduleDurationRefresh = () => {
      if (durationTimer !== null) window.clearTimeout(durationTimer);
      let tries = 0;
      const tick = () => {
        const next = element.getDuration();
        if (Number.isFinite(next) && next > 0) {
          setDurationMs((prev) => (prev === next ? prev : next));
          durationTimer = null;
          return;
        }
        tries += 1;
        if (tries >= 12) {
          durationTimer = null;
          return;
        }
        durationTimer = window.setTimeout(tick, 50);
      };
      tick();
    };

    const handleReady = (e: Event) => {
      const detail = (e as CustomEvent<any>).detail;
      const nextTotal = Number(detail?.total);
      const nextCurrent = Number(detail?.current);
      if (Number.isFinite(nextTotal) && nextTotal > 0) {
        setTotalFrame(nextTotal);
        syncUpdateSubscriptions(nextTotal);
      }
      if (Number.isFinite(nextCurrent)) setCurrentFrame(nextCurrent);
      scheduleDurationRefresh();
      setIsReady(true);
      pushLog('[信息] 动画已就绪');
      if (dynamicResourceOnRef.current) {
        try {
          const code = dynamicResourceCodeRef.current;
          const fn = new Function(
            'animRef',
            'anim',
            'createAnimaXValueParam',
            'AnimaXLayerPropertyType',
            'AnimaXResourcePropertyType',
            'log',
            String(code ?? ''),
          );
          fn(
            animRef,
            element,
            createAnimaXValueParam,
            AnimaXLayerPropertyType,
            AnimaXResourcePropertyType,
            (...args: any[]) => {
              pushLog(`[dyn] ${args.map((v) => String(v)).join(' ')}`);
            },
          );
          pushLog('[信息] 动态代码已执行');
        } catch (err) {
          pushLog(`[错误] 动态代码执行失败：${(err as Error)?.message ?? String(err)}`);
        }
      }

      void (async () => {
        const pendingResourceReplacement = pendingResourceReplacementRef.current;
        const pendingResourceKey = pendingResourceReplacement
          ? createResourceKey(pendingResourceReplacement.kind, pendingResourceReplacement.id)
          : '';
        const pendingEdit = pendingResourceKey
          ? resourceEditsRef.current[pendingResourceKey]
          : null;
        const editedResourceCount = applyEditedResources(element);
        const editedFontStyleCount = await applyEditedFontStyles(element);
        const editedTextCount = await applyEditedTexts(element);
        const editedLayerTransformCount = await applyEditedLayerTransforms(element);
        if (animRef.current !== element) return;

        if (pendingResourceReplacement) {
          pendingResourceReplacementRef.current = null;
          const resourceName = getResourceKindName(pendingResourceReplacement.kind);
          if (!pendingEdit || pendingEdit.url !== pendingResourceReplacement.url) {
            applyResourceEdit(element, {
              kind: pendingResourceReplacement.kind,
              id: pendingResourceReplacement.id,
              url: pendingResourceReplacement.url,
              fileName: pendingResourceReplacement.fileName,
            });
          }
          element.seek(0);
          currentFrameRef.current = 0;
          setCurrentFrame(0);
          toast.success(
            `更新${resourceName} ${pendingResourceReplacement.id} 到 ${pendingResourceReplacement.fileName}`,
          );
          pushLog(
            `[信息] ${resourceName}已替换并应用到新播放器：${pendingResourceReplacement.id} -> ${pendingResourceReplacement.url}`,
          );
        } else if (editedResourceCount > 0) {
          pushLog(`[信息] 已恢复历史资源替换：${editedResourceCount} 个`);
        }

        if (editedFontStyleCount > 0) {
          pushLog(`[信息] 已恢复历史字体 Style 替换：${editedFontStyleCount} 个`);
        }

        if (editedTextCount > 0) {
          pushLog(`[信息] 已恢复历史文本更新：${editedTextCount} 个`);
        }

        if (editedLayerTransformCount > 0) {
          pushLog(`[信息] 已恢复历史 Transform API 调用：${editedLayerTransformCount} 个`);
        }

        playWhenVisible(
          element,
          () => {
            pushLog(
              pendingResourceReplacement
                ? `[信息] ${getResourceKindName(pendingResourceReplacement.kind)}更新完成并播放`
                : '[信息] 动画已就绪并播放',
            );
          },
          () => {
            pushLog('[警告] 动画已就绪，但播放启动失败');
          },
        );
      })();
    };

    const handleUpdate = (e: Event) => {
      if (isScrubbingRef.current) return;
      const detail = (e as CustomEvent<any>).detail;
      const nextTotal = Number(detail?.total);
      const nextCurrent = Number(detail?.current);
      const ignoreRuntimeFrameSync = performance.now() < suppressRuntimeFrameSyncUntilRef.current;
      const previousFrame = currentFrameRef.current;
      if (Number.isFinite(nextTotal) && nextTotal > 0) setTotalFrame(nextTotal);
      if (ignoreRuntimeFrameSync) return;
      if (Number.isFinite(nextCurrent)) {
        const isFrameMoving = Math.abs(nextCurrent - previousFrame) > 0.001;
        currentFrameRef.current = nextCurrent;
        setCurrentFrame(nextCurrent);
        if (
          isFrameMoving &&
          isPausedRef.current &&
          performance.now() >= suppressPlayingSyncUntilRef.current
        ) {
          markPlaying();
        }
      } else if (
        isPausedRef.current &&
        element.isAnimating() &&
        performance.now() >= suppressPlayingSyncUntilRef.current
      ) {
        markPlaying();
      }
    };

    const handleCompletion = (e: Event) => {
      const detail = (e as CustomEvent<any>).detail;
      const nextTotal = Number(detail?.total);
      const nextCurrent = Number(detail?.current);
      if (Number.isFinite(nextTotal) && nextTotal > 0) setTotalFrame(nextTotal);
      if (Number.isFinite(nextCurrent)) setCurrentFrame(nextCurrent);
      if (loopRef.current || element.isAnimating()) return;
      markPaused(0);
      pushLog('[信息] 播放完成');
    };

    const handleFps = (e: Event) => {
      const detail = (e as CustomEvent<any>).detail;
      const nextFps = Number(detail?.fps);
      if (!Number.isFinite(nextFps) || nextFps < 0) return;
      setFps(nextFps);
    };

    const handleCompositionReady = () => {
      scheduleDurationRefresh();
    };

    const handleFirstFrame = () => {
      scheduleDurationRefresh();
    };

    element.addEventListener('ready', handleReady);
    element.addEventListener('update', handleUpdate);
    element.addEventListener('completion', handleCompletion);
    element.addEventListener('fps', handleFps);
    element.addEventListener('compositionready', handleCompositionReady);
    element.addEventListener('firstframe', handleFirstFrame);
    return () => {
      element.removeEventListener('ready', handleReady);
      element.removeEventListener('update', handleUpdate);
      element.removeEventListener('completion', handleCompletion);
      element.removeEventListener('fps', handleFps);
      element.removeEventListener('compositionready', handleCompositionReady);
      element.removeEventListener('firstframe', handleFirstFrame);
      clearUpdateSubscriptions();
      if (durationTimer !== null) window.clearTimeout(durationTimer);
    };
  }, [animElement, animaxViewKey, runtimeReady]);

  return (
    <AnimaXContext.Provider
      value={{
        animRef,
        canvasRef,
        filePickerRef,
        uploadFilePickerRef,
        replacementPickerRef,
        srcInput,
        setSrcInput,
        src,
        setSrc,
        previewJsonText,
        activeTab,
        setActiveTab,
        bindAnimRef,
        bindCanvasRef,
        speed,
        setSpeed,
        loop,
        setLoop,
        isPaused,
        setIsPaused,
        currentFrame,
        setCurrentFrame,
        totalFrame,
        setTotalFrame,
        stageSize,
        setStageSize,
        pushLog,
        mappingOpen,
        setMappingOpen,
        durationMs,
        setDurationMs,
        fps,
        setFps,
        jsonEditorText,
        jsonPreviewStatus,
        jsonSizeBytes,
        parsedJson,
        composition,
        textLayerRows,
        layerRows,
        textDrafts,
        assetRows,
        activeLayerBoundsKeys,
        layerBoundsOverlays,
        selectedLayerKey,
        editableLayerPreview,
        layerTransformPreviewOverrides,
        animaxViewKey,
        setAnimaxViewKey,
        dynamicResourceOn,
        setDynamicResourceOn,
        dynamicResourceCode,
        setDynamicResourceCode,
        isDraggingFile,
        setIsDraggingFile,
        directoryUploadProgress,
        isDirectoryUploading,
        runtimeReady,
        runtimeStatus,
        runtimeError,
        canConfirm,
        canApplyDynamicResourceCode,
        canRepack,
        isRepacking,
        canRefreshJsonPreview,
        canResetJsonEditor,
        canRandomLottie,
        isRandomLottieLoading,
        randomLottieCount,
        canShareSrc,
        pendingAlphaZipInfo: pendingAlphaZipPrompt?.info ?? null,
        pendingAlphaZipName: pendingAlphaZipPrompt?.fileName ?? '',
        handleConfirm,
        handleJsonEditorTextChange,
        handleRefreshJsonPreview,
        handleResetJsonEditor,
        handleLoadRandomLottie,
        handleRepack,
        handleCopyShareLink,
        handleTogglePlay,
        handleProgressChange,
        handleScrubStart,
        handleScrubEnd,
        handleDropFile,
        handlePickDirectory,
        handlePickFiles,
        handleTextDraftChange,
        handleTextLayerUpdate,
        handleToggleLayerBounds,
        handleSelectLayer,
        handlePreviewEditableLayer,
        handleCancelEditableLayerPreview,
        handleCreateEditableLayer,
        handleRenameLayer,
        handlePreviewLayerTransform,
        handleCancelLayerTransformPreview,
        handlePreviewLayerVisibility,
        handleCancelLayerVisibilityPreview,
        handleApplyLayerEdit,
        handleApplyLayerTransform,
        handleReplaceResource,
        handleReplaceResourceFromUrl,
        handleReplaceFontStyle,
        handleReplacementFile,
        handleCycleSpeed,
        handleToggleLoop,
        handleToggleDynamicResource,
        handleConfirmAlphaZipConversion: () => settleAlphaZipConversion(true),
        handleCancelAlphaZipConversion: () => settleAlphaZipConversion(false),
      }}
    >
      {children}
    </AnimaXContext.Provider>
  );
};
