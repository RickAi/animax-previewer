import { cloudFetch } from '../services/cloudApi';
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
} from '@lynx-js/animax';
import JSZip from 'jszip';
import toast from 'react-hot-toast';
import { ensureAnimaXRuntimeInitialized, type AnimaXRuntimeStatus } from '../AnimaXRuntime';
import { ANIMAX_RANDOM_LOTTIE_URLS, DEFAULT_ANIMAX_LOTTIE_URL } from '../lottieLibrary';
import { getLocationParam } from '../../../../utils/locationParams';
import {
  convertAlphaZipToAnimaxLottie,
  inspectAlphaZipBundle,
  type AlphaZipBundleInfo,
} from '../services/alphaZipToAnimaxLottie';
import {
  addAnimaXCdnHistoryUrl,
  copyPlainTextToClipboard,
  createAnimaXShareUrl,
  createAnimaXShareText,
  readAnimaXCdnHistory,
  removeAnimaXCdnHistoryUrl,
  type AnimaXCdnHistoryItem,
} from '../services/cdnHistory';
import {
  analyzeLottieJsonText,
  inspectLottieJsonText,
  type LottieAnalysisResult,
  type LottieAnalysisWorkerResponse,
  type LottieCompositionSummary,
  type LottieJsonInspection,
} from '../services/lottieAnalysis';
import {
  createAnimaXDownloadBundle,
  createAnimaXRepack,
  downloadBlob,
  type RepackResult,
} from '../services/repack';
import {
  createVideoBFramesCheckResult,
  fileToDataUrl,
  getImageResourceCheck,
  getVideoResourceCheckSignature,
  hasFixableIssue,
  isBase64ResourcePath,
  isHttpResourcePath,
  RESOURCE_CHECK_OK,
} from '../services/resourceCheck';
import {
  probeVideoResource,
  processImageToPng8Resource,
  processVideoResource,
} from '../services/videoProcess';
import type {
  AnimaXToolTab,
  AssetRow,
  CreateEditableLayerInput,
  EditableLayerDraftPreview,
  JsonPreviewStatus,
  LayerBoundsOverlay,
  LayerTransform,
  LayerRow,
  LayerTransformStaticState,
  PreviewEditableLayerOptions,
  ProcessedImageResource,
  ProcessedVideoResource,
  ResourceCheckResult,
  ResourceEdit,
  ResourceKind,
  TextLayerRow,
  VideoProcessOptions,
  VideoProcessProgress,
  VideoResourceInfo,
} from '../toolTypes';
import {
  addJsonEditableLayer,
  createResourceKey,
  ensureHttpsUrl,
  formatBytes,
  formatKilobytes,
  formatResourceSourceLabel,
  getDataUrlByteSize,
  getFileExtension,
  getImageResourceFormat,
  getImageResourceFormatFromBytes,
  resolveResourceUrl,
  safeSegment,
  type ImageResourceFormat,
  updateJsonFontStyle,
  updateJsonLayerName,
  updateJsonLayerTransform,
  updateJsonLayerVisibility,
  updateJsonResourcePath,
  updateJsonTextLayerValue,
} from '../toolUtils';

type JsonAnalysisStatus = 'pending' | 'ready' | 'error';

type JsonAnalysisState = LottieAnalysisResult & {
  status: JsonAnalysisStatus;
  error: string;
};

interface LottieLoadStatus {
  tone: 'loading' | 'success' | 'error';
  label: string;
  detail: string;
}

interface PreviewStageStatus {
  visible: boolean;
  title: string;
  detail: string;
}

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
  jsonAnalysisStatus: JsonAnalysisStatus;
  jsonAnalysisError: string;
  lottieLoadStatus: LottieLoadStatus;
  previewStageStatus: PreviewStageStatus;
  parsedJson: any;
  composition: LottieCompositionSummary | null;
  textLayerRows: TextLayerRow[];
  layerRows: LayerRow[];
  textDrafts: Record<string, string>;
  assetRows: AssetRow[];
  resourceWarningCount: number;
  isFixingResources: boolean;
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
  uploadDialogOpen: boolean;
  pendingUploadSelection: PendingUploadSelection | null;
  uploadDialogError: string;
  isUploadDialogConfirming: boolean;
  directoryUploadProgress: DirectoryUploadProgress | null;
  isDirectoryUploading: boolean;
  runtimeReady: boolean;
  runtimeStatus: AnimaXRuntimeStatus | null;
  runtimeError: string | null;
  isAnimationReady: boolean;
  repackDialogOpen: boolean;
  packageRecordsOpen: boolean;
  packageRecords: AnimaXCdnHistoryItem[];

  canConfirm: boolean;
  canApplyDynamicResourceCode: boolean;
  canRepack: boolean;
  isRepacking: boolean;
  isDownloadingLottie: boolean;
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
  handleOpenRepackDialog: () => void;
  handleCloseRepackDialog: () => void;
  handleRepack: (options?: RepackOutputOptions) => Promise<void>;
  handleDownloadInputLottie: () => Promise<void>;
  handleOpenPackageRecords: () => void;
  handleClosePackageRecords: () => void;
  handleLoadPackageRecord: (url: string) => Promise<void>;
  handleCopyPackageRecordShareLink: (url: string) => Promise<void>;
  handleRemovePackageRecord: (url: string) => void;
  handleCopyShareLink: () => Promise<void>;
  handleCopyCardShareLink: () => Promise<void>;
  handleTogglePlay: () => void;
  handleProgressChange: (nextFrame: number) => void;
  handleScrubStart: () => void;
  handleScrubEnd: () => void;
  handleOpenUploadDialog: () => void;
  handleCloseUploadDialog: () => void;
  handleResetUploadSelection: () => void;
  handleSelectUploadFiles: (files: File[], source?: UploadSelectionSource) => void;
  handleSelectUploadDirectory: (files: File[], source?: UploadSelectionSource) => void;
  handleUploadDrop: (dataTransfer: DataTransfer) => Promise<void>;
  handleConfirmUploadSelection: () => Promise<void>;
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
  handleProcessVideoResource: (
    row: AssetRow,
    options: VideoProcessOptions,
    onProgress?: (progress: VideoProcessProgress) => void,
  ) => Promise<ProcessedVideoResource>;
  handleProbeVideoResource: (
    row: AssetRow,
    onProgress?: (progress: VideoProcessProgress) => void,
  ) => Promise<VideoResourceInfo>;
  handleApplyProcessedVideoResource: (
    row: AssetRow,
    processed: ProcessedVideoResource,
  ) => Promise<void>;
  handleFixResource: (row: AssetRow) => Promise<void>;
  handleFixAllResources: () => Promise<void>;
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
  startedAt?: number;
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

type LayerTransformPropertyGroup = 'position' | 'anchor' | 'scale' | 'rotation' | 'opacity';

interface LayerTransformEdit {
  key: string;
  layerName: string;
  transform: LayerTransform;
  propertyGroups?: LayerTransformPropertyGroup[];
  visible?: boolean;
}

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
  if (edit.local && edit.packPath) {
    return `${edit.fileName} / 本地预览，待打包到 ${edit.packPath}`;
  }
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

type TextEdit = Pick<TextLayerRow, 'key' | 'name'> & { text: string };

type PendingAlphaZipPrompt = {
  fileName: string;
  info: AlphaZipBundleInfo;
};

type UploadSelectionSource = 'picker' | 'drop';
type UploadSelectionMode = 'file' | 'directory' | 'drop';
type UploadSelectionKind = 'json' | 'zip' | 'directory' | 'unsupported';
type UploadActionOptions = {
  rethrow?: boolean;
};

export interface RepackOutputOptions {
  exportLocal: boolean;
  uploadCdn: boolean;
}

interface SourceTextLoadStatus {
  loading: boolean;
  title: string;
  detail: string;
}

interface PendingUploadSelection {
  files: File[];
  source: UploadSelectionSource;
  kind: UploadSelectionKind;
  title: string;
  detail: string;
  description: string;
  sizeLabel: string;
  fileCount: number;
  invalidReason?: string;
}

type RemoteSourceKind = 'json' | 'zip' | 'unknown';

const INITIAL_JSON_EDITOR_TEXT = '{\n  "v": "5.7.4"\n}\n';
const JSON_AUTO_REFRESH_DELAY_MS = 800;
const UPDATE_EVENT_SUBSCRIPTION_LIMIT = 120;
const WORKER_INSPECTION_TIMEOUT_MS = 15000;
const RESOURCE_UPLOAD_CONCURRENCY = 4;
const REMOTE_IMAGE_FORMAT_CONCURRENCY = 4;

type RemoteImageFormatCache = Record<string, ImageResourceFormat | null>;

interface RemoteImageFormatTarget {
  url: string;
  fallbackPath: string;
}

const createIdleSourceTextStatus = (): SourceTextLoadStatus => ({
  loading: false,
  title: '',
  detail: '',
});

const createEmptyJsonAnalysis = (status: JsonAnalysisStatus, error = ''): JsonAnalysisState => ({
  status,
  error,
  parsedJson: null,
  composition: null,
  textLayerRows: [],
  layerRows: [],
  elapsedMs: 0,
});

const getJsonErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

class HandledUploadError extends Error {}

const yieldToBrowser = () =>
  new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });

const withTrailingNewline = (text: string) => (text.endsWith('\n') ? text : `${text}\n`);

const createEditorJsonText = (jsonText: string) => withTrailingNewline(jsonText);

const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
) => {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index], index);
      }
    }),
  );

  return results;
};

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

const preparePreviewJsonText = (
  jsonText: string,
  baseUrl: string,
  options: { hasRelativeResources?: boolean } = {},
) => {
  if (!baseUrl || options.hasRelativeResources === false) {
    return { jsonText, rewrittenResourceCount: 0 };
  }

  const parsed = JSON.parse(jsonText) as any;

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
const checkUploadSize = (file: Blob, name: string) => {
  if (file.size > 20 * 1024 * 1024) throw new Error(`${name}：单文件不能超过 20 MB`);
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

const isDirectorySelection = (files: File[]) =>
  files.some((file) =>
    normalizeRelPath(String((file as any).webkitRelativePath || '')).includes('/'),
  );

const describeUploadSelection = (
  rawFiles: File[],
  mode: UploadSelectionMode,
  source: UploadSelectionSource,
): PendingUploadSelection => {
  const files = rawFiles.filter(Boolean);
  const fileCount = files.length;
  const totalSize = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
  const sizeLabel = fileCount > 0 ? formatBytes(totalSize) : '--';
  const firstFileName = files[0]?.name || '未选择文件';
  const hasDirectoryPath = isDirectorySelection(files);
  const shouldTreatAsDirectory = mode === 'directory' || hasDirectoryPath || fileCount > 1;

  if (fileCount === 0) {
    return {
      files,
      source,
      kind: 'unsupported',
      title: '未选择文件',
      detail: '请拖入或选择 .json、.zip 或目录',
      description: '当前没有可加载的文件。',
      sizeLabel,
      fileCount,
      invalidReason: '请选择 .json、.zip 或目录后再确认',
    };
  }

  if (shouldTreatAsDirectory) {
    return {
      files,
      source,
      kind: 'directory',
      title: hasDirectoryPath
        ? normalizeRelPath(String((files[0] as any).webkitRelativePath)).split('/')[0] || '目录'
        : '文件集合',
      detail: `${fileCount} 个文件 · ${sizeLabel}`,
      description:
        '确认后会扫描目录内可解析的主 JSON，并上传 JSON 引用的 images、videos、fonts 资源。',
      sizeLabel,
      fileCount,
    };
  }

  if (isZipLikePath(firstFileName)) {
    return {
      files,
      source,
      kind: 'zip',
      title: firstFileName,
      detail: `ZIP · ${sizeLabel}`,
      description: '确认后会解压 ZIP；识别到 Alpha ZIP 时会先提示转换，再加载预览。',
      sizeLabel,
      fileCount,
    };
  }

  if (isJsonLikePath(firstFileName)) {
    return {
      files,
      source,
      kind: 'json',
      title: firstFileName,
      detail: `JSON · ${sizeLabel}`,
      description: '确认后会解析 JSON；如果它引用同级本地资源，会提示改用目录或 ZIP 加载。',
      sizeLabel,
      fileCount,
    };
  }

  return {
    files,
    source,
    kind: 'unsupported',
    title: firstFileName,
    detail: `${fileCount} 个文件 · ${sizeLabel}`,
    description: '当前类型无法加载。',
    sizeLabel,
    fileCount,
    invalidReason: '仅支持 .json、.lottie.json、.zip 或包含 JSON 的目录',
  };
};

const readDroppedFile = (entry: FileSystemFileEntry) =>
  new Promise<File>((resolve, reject) => {
    entry.file(resolve, reject);
  });

const readDroppedDirectoryEntries = (reader: FileSystemDirectoryReader) =>
  new Promise<FileSystemEntry[]>((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });

const traverseDroppedEntry = async (entry: FileSystemEntry, parentPath = ''): Promise<File[]> => {
  const relPath = joinRelPath(parentPath, entry.name);
  if (entry.isFile) {
    const file = await readDroppedFile(entry as FileSystemFileEntry);
    return [attachRelativePath(file, relPath || file.name)];
  }

  if (!entry.isDirectory) return [];

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const files: File[] = [];
  while (true) {
    const entries = await readDroppedDirectoryEntries(reader);
    if (entries.length === 0) break;
    const nestedFiles = await Promise.all(
      entries.map((childEntry) => traverseDroppedEntry(childEntry, relPath)),
    );
    nestedFiles.forEach((items) => files.push(...items));
  }
  return files;
};

const collectDroppedFiles = async (dataTransfer: DataTransfer) => {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item) => (item.kind === 'file' ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => Boolean(entry));

  if (entries.length > 0) {
    const nestedFiles = await Promise.all(entries.map((entry) => traverseDroppedEntry(entry)));
    return nestedFiles.flat();
  }

  return Array.from(dataTransfer.files ?? []).map((file) => attachRelativePath(file, file.name));
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
  const resourceObjectUrlsRef = useRef<Record<string, string>>({});
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
  const frameUiCommitTimerRef = useRef<number | null>(null);
  const lastFrameUiCommitAtRef = useRef(0);
  const pendingFrameUiStateRef = useRef<{ current?: number; total?: number }>({});
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
  const jsonAnalysisWorkerRef = useRef<Worker | null>(null);
  const jsonAnalysisRequestIdRef = useRef(0);

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
  const initialSourceTextLoading = isJsonLikePath(initialSrc);

  const [srcInput, setSrcInput] = useState(initialSrc);
  const [src, setSrc] = useState(initialSrc);
  const [previewJsonText, setPreviewJsonText] = useState('');
  const [sourceTextLoadStatus, setSourceTextLoadStatus] = useState<SourceTextLoadStatus>(() =>
    initialSourceTextLoading
      ? {
          loading: true,
          title: '等待下载远程 JSON',
          detail: initialSrc.split('/').filter(Boolean).pop()?.split('?')[0] || 'remote.json',
        }
      : createIdleSourceTextStatus(),
  );
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
  const [jsonAnalysis, setJsonAnalysis] = useState<JsonAnalysisState>(() =>
    createEmptyJsonAnalysis('pending'),
  );
  const [animaxViewKey, setAnimaxViewKey] = useState(0);
  const [dynamicResourceOn, setDynamicResourceOn] = useState(initialDynamicResourceOn);
  const [dynamicResourceCode, setDynamicResourceCode] = useState(initialDynamicResourceCode);
  const [resourceEdits, setResourceEdits] = useState<Record<string, ResourceEdit>>({});
  const [remoteImageFormats, setRemoteImageFormats] = useState<RemoteImageFormatCache>({});
  const [resourceCheckResults, setResourceCheckResults] = useState<
    Record<string, ResourceCheckResult>
  >({});
  const [isFixingResources, setIsFixingResources] = useState(false);
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
  const [isDownloadingLottie, setIsDownloadingLottie] = useState(false);
  const [isRandomLottieLoading, setIsRandomLottieLoading] = useState(false);
  const [directoryUploadProgress, setDirectoryUploadProgress] =
    useState<DirectoryUploadProgress | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<AnimaXRuntimeStatus | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [runtimeInitDetail, setRuntimeInitDetail] = useState('等待运行时初始化开始');
  const [animElement, setAnimElement] = useState<AnimaXViewElement | null>(null);
  const [canvasElement, setCanvasElement] = useState<HTMLDivElement | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [repackDialogOpen, setRepackDialogOpen] = useState(false);
  const [packageRecordsOpen, setPackageRecordsOpen] = useState(false);
  const [packageRecords, setPackageRecords] = useState<AnimaXCdnHistoryItem[]>(() =>
    readAnimaXCdnHistory(),
  );
  const [pendingUploadSelection, setPendingUploadSelection] =
    useState<PendingUploadSelection | null>(null);
  const [uploadDialogError, setUploadDialogError] = useState('');
  const [isUploadDialogConfirming, setIsUploadDialogConfirming] = useState(false);
  const [pendingAlphaZipPrompt, setPendingAlphaZipPrompt] = useState<PendingAlphaZipPrompt | null>(
    null,
  );

  const jsonEditorTextRef = useRef(jsonEditorText);
  const jsonBaselineTextRef = useRef(jsonBaselineText);
  const jsonEditorSourceUrlRef = useRef('');
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

  const commitFrameUiState = (state: { current?: number; total?: number }, immediate = false) => {
    pendingFrameUiStateRef.current = {
      ...pendingFrameUiStateRef.current,
      ...state,
    };

    const flush = () => {
      frameUiCommitTimerRef.current = null;
      lastFrameUiCommitAtRef.current = performance.now();
      const pending = pendingFrameUiStateRef.current;
      pendingFrameUiStateRef.current = {};
      if (Number.isFinite(pending.total)) {
        setTotalFrame(pending.total as number);
      }
      if (Number.isFinite(pending.current)) {
        setCurrentFrame(pending.current as number);
      }
    };

    if (immediate || performance.now() - lastFrameUiCommitAtRef.current >= 66) {
      if (frameUiCommitTimerRef.current !== null) {
        window.clearTimeout(frameUiCommitTimerRef.current);
        frameUiCommitTimerRef.current = null;
      }
      flush();
      return;
    }

    if (frameUiCommitTimerRef.current !== null) return;
    frameUiCommitTimerRef.current = window.setTimeout(flush, 66);
  };

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

  const jsonSizeBytes = useMemo(
    () => new TextEncoder().encode(jsonEditorText).length,
    [jsonEditorText],
  );

  const parsedJson = jsonAnalysis.status === 'ready' ? jsonAnalysis.parsedJson : null;
  const composition = jsonAnalysis.status === 'ready' ? jsonAnalysis.composition : null;
  const textLayerRows = jsonAnalysis.status === 'ready' ? jsonAnalysis.textLayerRows : [];
  const layerRows = jsonAnalysis.status === 'ready' ? jsonAnalysis.layerRows : [];
  const canRepack = jsonAnalysis.status === 'ready' && Boolean(parsedJson) && !isRepacking;
  const isDirectoryUploading = Boolean(
    directoryUploadProgress &&
    directoryUploadProgress.phase !== 'done' &&
    directoryUploadProgress.phase !== 'error',
  );
  const canRefreshJsonPreview = jsonEditorText.trim().length > 0 && !isDirectoryUploading;
  const canResetJsonEditor = jsonEditorText !== jsonBaselineText;
  const canRandomLottie = randomLottieCount > 0 && !isRandomLottieLoading && !isDirectoryUploading;
  const previewStageStatus = useMemo<PreviewStageStatus>(() => {
    if (runtimeError) {
      return {
        visible: true,
        title: '运行时初始化失败',
        detail: runtimeError,
      };
    }

    if (!runtimeStatus || !runtimeStatus.ready) {
      return {
        visible: true,
        title: '正在准备运行时资源',
        detail: runtimeInitDetail,
      };
    }

    if (!isReady) {
      return {
        visible: true,
        title: '正在解析动画并绘制首帧',
        detail: 'AnimaX 已挂载，复杂 shape/path JSON 首次解析可能需要更久',
      };
    }

    return {
      visible: false,
      title: '',
      detail: '',
    };
  }, [isReady, runtimeError, runtimeInitDetail, runtimeStatus]);

  const lottieLoadStatus = useMemo<LottieLoadStatus>(() => {
    if (sourceTextLoadStatus.loading) {
      return {
        tone: 'loading',
        label: 'JSON 同步中',
        detail: `${sourceTextLoadStatus.title}：${sourceTextLoadStatus.detail}`,
      };
    }

    if (runtimeError) {
      return {
        tone: 'error',
        label: '加载异常',
        detail: runtimeError,
      };
    }

    if (runtimeStatus?.fontTimedOut) {
      return {
        tone: 'error',
        label: '字体超时',
        detail: `字体注册超过 ${Math.round(runtimeStatus.fontTimeoutMs / 1000)}s，请刷新页面重试`,
      };
    }

    if (jsonAnalysis.status === 'error') {
      return {
        tone: 'error',
        label: 'JSON 异常',
        detail: jsonAnalysis.error || 'JSON 解析失败',
      };
    }

    if (runtimeStatus?.warnings.length) {
      return {
        tone: 'error',
        label: '加载异常',
        detail: runtimeStatus.warnings.join('；'),
      };
    }

    if (!runtimeStatus || !runtimeStatus.ready) {
      return {
        tone: 'loading',
        label: '运行时加载中',
        detail: runtimeInitDetail,
      };
    }

    if (!isReady) {
      return {
        tone: 'loading',
        label: '播放器加载中',
        detail: '正在解析动画 JSON 并等待首帧',
      };
    }

    if (runtimeStatus.fontLoading) {
      return {
        tone: 'loading',
        label: '字体加载中',
        detail: '正在等待字体注册完成后展示动画',
      };
    }

    if (jsonAnalysis.status === 'pending') {
      return {
        tone: 'loading',
        label: 'JSON 解析中',
        detail: '右侧图层、资源和文本数据正在异步解析',
      };
    }

    return {
      tone: 'success',
      label: '加载正常',
      detail: '运行时和 JSON 解析正常',
    };
  }, [
    isReady,
    jsonAnalysis.error,
    jsonAnalysis.status,
    runtimeError,
    runtimeInitDetail,
    runtimeStatus,
    sourceTextLoadStatus,
  ]);

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
    Object.values(resourceObjectUrlsRef.current).forEach((url) => {
      URL.revokeObjectURL(url);
    });
    resourceObjectUrlsRef.current = {};
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

  const isSameLayerCollection = (left: Array<string | number>, right: Array<string | number>) => {
    if (left.length !== right.length) return false;
    if (left.length === 0) return false;
    return left.slice(0, -1).every((segment, index) => segment === right[index]);
  };

  const hasDuplicateLayerName = (row: LayerRow, nextName: string) =>
    layerRows.some(
      (candidate) =>
        candidate.key !== row.key &&
        candidate.name === nextName &&
        isSameLayerCollection(candidate.path, row.path),
    );

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
      (edit) =>
        edit.layerName &&
        edit.transform &&
        ((edit.propertyGroups?.length ?? 0) > 0 || edit.visible !== undefined),
    );
    if (editedTransforms.length === 0) return 0;

    const results = await Promise.all(
      editedTransforms.map(async (edit) => {
        const shouldApplyTransform = (edit.propertyGroups?.length ?? 0) > 0;
        const appliedTransform = shouldApplyTransform
          ? await applyLayerTransformToElement(element, edit.layerName, edit.transform, {
              silent: true,
              waitForCallback: true,
              propertyGroups: edit.propertyGroups,
            })
          : true;
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

  const remoteImageFormatTargets = useMemo<RemoteImageFormatTarget[]>(() => {
    if (!composition) return [];

    const rawImageAssets = new Map<string, any>();
    if (Array.isArray(parsedJson?.assets)) {
      parsedJson.assets.forEach((asset: any) => {
        if (asset?.id && asset?.p) rawImageAssets.set(asset.id, asset);
      });
    }

    const targets = new Map<string, RemoteImageFormatTarget>();
    Object.entries(composition.images).forEach(([id, asset]) => {
      const edit = resourceEdits[createResourceKey('image', id)];
      const rawAsset = rawImageAssets.get(id);
      const sourceForFormat = edit?.url || rawAsset?.p || '';
      const previewUrl = resolveResourceUrl(src, asset.dirName, asset.fileName, edit);
      if (!previewUrl || !/^https?:\/\//i.test(previewUrl) || /^data:/i.test(sourceForFormat)) {
        return;
      }

      targets.set(previewUrl, {
        url: previewUrl,
        fallbackPath: asset.fileName,
      });
    });

    return [...targets.values()];
  }, [composition, parsedJson, resourceEdits, src]);

  useEffect(() => {
    const pendingTargets = remoteImageFormatTargets.filter(
      (target) => !(target.url in remoteImageFormats),
    );
    if (pendingTargets.length === 0) return undefined;

    const abortController = new AbortController();
    let cancelled = false;

    const loadRemoteFormats = async () => {
      const entries = await mapWithConcurrency(
        pendingTargets,
        REMOTE_IMAGE_FORMAT_CONCURRENCY,
        async (target) => {
          try {
            const response = await fetch(target.url, { signal: abortController.signal });
            if (!response.ok) return [target.url, null] as const;

            const contentType = response.headers.get('content-type');
            const bytes = new Uint8Array(await response.arrayBuffer());
            return [
              target.url,
              getImageResourceFormatFromBytes(bytes, 'URL', target.fallbackPath, contentType) ??
                null,
            ] as const;
          } catch {
            return [target.url, null] as const;
          }
        },
      );

      if (cancelled) return;

      setRemoteImageFormats((current) => {
        let changed = false;
        const next = { ...current };
        entries.forEach(([url, format]) => {
          if (url in next) return;
          next[url] = format;
          changed = true;
        });
        return changed ? next : current;
      });
    };

    void loadRemoteFormats();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [remoteImageFormatTargets, remoteImageFormats]);

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
      const resourceKey = createResourceKey('image', id);
      const edit = resourceEdits[resourceKey];
      const previewUrl = resolveResourceUrl(src, asset.dirName, asset.fileName, edit);
      const refCount = refCounts[id] || 0;
      const rawAsset = rawImageAssets.get(id);
      const sizeBytes = getResourceSize(edit, rawAsset, asset.fileName);
      const sizeLabel = formatKilobytes(sizeBytes);
      const resourcePath = `${asset.dirName || ''}${asset.fileName || ''}`;
      const sourceForFormat = edit?.url || rawAsset?.p || previewUrl;
      const localImageFormat = getImageResourceFormat(sourceForFormat, asset.fileName);
      const remoteImageFormat =
        previewUrl && !/^data:/i.test(sourceForFormat) ? remoteImageFormats[previewUrl] : undefined;
      const imageFormat = remoteImageFormat || localImageFormat;
      const checkTargetName = edit?.fileName || resourcePath || previewUrl || id;
      const check =
        resourceCheckResults[resourceKey] ?? getImageResourceCheck(resourcePath, checkTargetName);
      rows.push({
        kind: 'image',
        id,
        name: id,
        resourcePath,
        detail: `${asset.width}x${asset.height} / ${formatResourceSourceLabel(previewUrl)}`,
        sizeBytes,
        sizeLabel: sizeLabel || undefined,
        formatTags: imageFormat?.tags,
        formatTitle: imageFormat?.title,
        refCount,
        status: edit ? 'mapped' : previewUrl ? (refCount > 0 ? 'ok' : 'unused') : 'missing',
        previewUrl,
        check,
      });
    });

    Object.entries(composition.videos).forEach(([id, asset]) => {
      const resourceKey = createResourceKey('video', id);
      const edit = resourceEdits[resourceKey];
      const previewUrl = resolveResourceUrl(src, asset.dirName, asset.fileName, edit);
      const refCount = refCounts[id] || 0;
      const sizeBytes = getResourceSize(edit, rawVideoAssets.get(id), asset.fileName) ?? asset.size;
      const sizeLabel = formatKilobytes(sizeBytes);
      const check = resourceCheckResults[resourceKey];
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
        check,
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
  }, [
    composition,
    fontStyleEdits,
    parsedJson,
    remoteImageFormats,
    resourceCheckResults,
    resourceEdits,
    src,
  ]);

  const resourceWarningCount = useMemo(
    () =>
      assetRows.reduce(
        (count, row) => count + (row.check?.status === 'warning' ? row.check.issues.length : 0),
        0,
      ),
    [assetRows],
  );

  const videoResourceCheckSignature = useMemo(
    () => getVideoResourceCheckSignature(assetRows),
    [assetRows],
  );

  const pushLog = (line: string) => {
    console.log('[animax]', line);
  };

  const inspectJsonTextForUpload = (jsonText: string) =>
    new Promise<LottieJsonInspection>((resolve, reject) => {
      const runFallback = () => {
        window.setTimeout(() => {
          try {
            resolve(inspectLottieJsonText(jsonText));
          } catch (error) {
            reject(error);
          }
        }, 0);
      };

      if (typeof Worker === 'undefined') {
        runFallback();
        return;
      }

      let worker: Worker | null = null;
      let settled = false;
      const requestId = Date.now();

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        worker?.terminate();
        worker = null;
        callback();
      };

      const timer = window.setTimeout(() => {
        finish(() => {
          pushLog('[警告] JSON 校验 Worker 超时，回退到延迟主线程解析');
          runFallback();
        });
      }, WORKER_INSPECTION_TIMEOUT_MS);

      try {
        worker = new Worker(new URL('../services/lottieAnalysis.worker.ts', import.meta.url), {
          type: 'module',
        });
        worker.onmessage = (event: MessageEvent<LottieAnalysisWorkerResponse>) => {
          const response = event.data;
          if (response.requestId !== requestId || response.mode !== 'inspect') return;
          if (response.ok) {
            finish(() => resolve(response.result));
          } else {
            finish(() => reject(new Error(response.error)));
          }
        };
        worker.onerror = (event) => {
          finish(() => reject(new Error(event.message || 'JSON 校验 Worker 异常')));
        };
        worker.postMessage({ requestId, mode: 'inspect', jsonText });
      } catch (error) {
        if (worker) {
          worker.terminate();
          worker = null;
        }
        window.clearTimeout(timer);
        pushLog(
          `[警告] JSON 校验 Worker 创建失败，回退到延迟主线程解析：${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        runFallback();
      }
    });

  useEffect(() => {
    const jsonText = jsonEditorText;
    const requestId = jsonAnalysisRequestIdRef.current + 1;
    jsonAnalysisRequestIdRef.current = requestId;

    if (!jsonText.trim()) {
      setJsonAnalysis(createEmptyJsonAnalysis('error', 'JSON 内容为空'));
      return undefined;
    }

    const finishAnalysis = (result: LottieAnalysisResult) => {
      if (jsonAnalysisRequestIdRef.current !== requestId) return;
      setJsonAnalysis({
        ...result,
        status: 'ready',
        error: '',
      });
      if (result.elapsedMs > 120) {
        pushLog(
          `[信息] 右侧 JSON 解析完成：${result.layerRows.length} 个图层，${result.textLayerRows.length} 个文本，${Math.round(
            result.elapsedMs,
          )}ms`,
        );
      }
    };

    const failAnalysis = (message: string) => {
      if (jsonAnalysisRequestIdRef.current !== requestId) return;
      setJsonAnalysis(createEmptyJsonAnalysis('error', message));
    };

    setJsonAnalysis(createEmptyJsonAnalysis('pending'));

    try {
      if (typeof Worker !== 'undefined') {
        if (!jsonAnalysisWorkerRef.current) {
          jsonAnalysisWorkerRef.current = new Worker(
            new URL('../services/lottieAnalysis.worker.ts', import.meta.url),
            { type: 'module' },
          );
        }
        const worker = jsonAnalysisWorkerRef.current;
        worker.onmessage = (event: MessageEvent<LottieAnalysisWorkerResponse>) => {
          const response = event.data;
          if (response.requestId !== requestId || response.mode !== 'analyze') return;
          if (response.ok) {
            finishAnalysis(response.result);
          } else {
            failAnalysis(response.error);
          }
        };
        worker.onerror = (event) => {
          const message = event.message || 'JSON 解析 Worker 异常';
          failAnalysis(message);
          worker.terminate();
          if (jsonAnalysisWorkerRef.current === worker) {
            jsonAnalysisWorkerRef.current = null;
          }
        };
        worker.postMessage({ requestId, mode: 'analyze', jsonText });
        return undefined;
      }
    } catch (error) {
      pushLog(
        `[警告] JSON 解析 Worker 创建失败，回退到延迟主线程解析：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const timer = window.setTimeout(() => {
      try {
        finishAnalysis(analyzeLottieJsonText(jsonText));
      } catch (error) {
        failAnalysis(error instanceof Error ? error.message : String(error));
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [jsonEditorText]);

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
    if (propertyGroups.length > 0) {
      commitLayerTransformEdit({ key: row.key, layerName: row.name, transform, propertyGroups });
    }
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
    if (cleanName !== row.name && hasDuplicateLayerName(row, cleanName)) {
      toast.error('同一合成内已有同名图层');
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
    if (cleanName !== row.name && hasDuplicateLayerName(row, cleanName)) {
      toast.error('同一合成内已有同名图层');
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
    const shouldReplayLayerEdit = propertyGroups.length > 0 || visibilityChanged;
    if (shouldReplayLayerEdit) {
      commitLayerTransformEdit({
        key: row.key,
        layerName: cleanName,
        transform,
        propertyGroups,
        visible: visibilityChanged ? visible : undefined,
      });
    }
    toast.success(`图层修改已应用：${cleanName}`);
    pushLog(
      `[信息] 图层修改已应用：${row.name} -> ${cleanName}${
        appliedRuntime && appliedVisibility ? '' : '（仅写入 JSON）'
      }`,
    );
    pushLog(`[信息] 图层修改已上传并重新加载：${cleanName} -> ${nextUrl}`);
    if (shouldReplayLayerEdit) {
      pushLog(`[信息] 已记录图层属性 API 调用：${cleanName}`);
    }
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
    setDirectoryUploadProgress((previous) => {
      if (!progress) return null;
      const shouldTrackElapsed = progress.phase === 'uploading' || progress.phase === 'json';
      if (!shouldTrackElapsed) return progress;
      return {
        ...progress,
        startedAt:
          progress.startedAt ??
          (previous?.phase === 'uploading' || previous?.phase === 'json'
            ? previous.startedAt
            : undefined) ??
          performance.now(),
      };
    });
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

  const handleOpenUploadDialog = () => {
    if (isDirectoryUploading) return;
    setPendingUploadSelection(null);
    setUploadDialogError('');
    setUploadDialogOpen(true);
  };

  const handleCloseUploadDialog = () => {
    if (isUploadDialogConfirming) return;
    setUploadDialogOpen(false);
    setPendingUploadSelection(null);
    setUploadDialogError('');
  };

  const handleOpenRepackDialog = () => {
    if (isRepacking || isDirectoryUploading || !canRepack) return;
    setRepackDialogOpen(true);
  };

  const handleCloseRepackDialog = () => {
    if (isRepacking) return;
    setRepackDialogOpen(false);
  };

  const cloudSession = useRef<Promise<void> | null>(null);
  const ensureCloudSession = () => {
    if (!cloudSession.current) {
      cloudSession.current = cloudFetch('/api/session').then(async response => {
        if (!response.ok) throw new Error('云端服务暂时不可用');
        const result = await response.json();
        if (!result.ready) throw new Error('云端存储尚未配置');
      }).catch(error => { cloudSession.current = null; throw error; });
    }
    return cloudSession.current;
  };

  const handleOpenPackageRecords = async () => {
    setPackageRecordsOpen(true);
    try {
      await ensureCloudSession();
      const response = await cloudFetch('/api/files');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '读取记录失败');
      setPackageRecords(result.files);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '读取云端记录失败');
    }
  };

  const handleClosePackageRecords = () => {
    setPackageRecordsOpen(false);
  };

  const handleResetUploadSelection = () => {
    if (isUploadDialogConfirming) return;
    setPendingUploadSelection(null);
    setUploadDialogError('');
  };

  const setUploadSelection = (
    files: File[],
    mode: UploadSelectionMode,
    source: UploadSelectionSource,
  ) => {
    const selection = describeUploadSelection(files, mode, source);
    setPendingUploadSelection(selection);
    setUploadDialogError(selection.invalidReason ?? '');
    setUploadDialogOpen(true);
  };

  const handleSelectUploadFiles = (files: File[], source: UploadSelectionSource = 'picker') => {
    setUploadSelection(files, source === 'drop' ? 'drop' : 'file', source);
  };

  const handleSelectUploadDirectory = (files: File[], source: UploadSelectionSource = 'picker') => {
    setUploadSelection(files, 'directory', source);
  };

  const handleUploadDrop = async (dataTransfer: DataTransfer) => {
    try {
      const files = await collectDroppedFiles(dataTransfer);
      handleSelectUploadFiles(files, 'drop');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setUploadDialogError(`读取拖拽内容失败：${message}`);
      setPendingUploadSelection(null);
      setUploadDialogOpen(true);
      pushLog(`[错误] 读取拖拽内容失败：${message}`);
    }
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
      const response = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
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

  const fetchRemoteFile = async (url: string) => {
    const response = await fetch(url, { cache: 'no-cache' });
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
    const response = await fetch(url, { cache: 'no-cache' });
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
    checkUploadSize(zipFile, zipFile.name);
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
        const detail = '未识别到可转换的 Alpha ZIP 配置';
        finishDirectoryProgress({
          phase: 'error',
          title: '转换失败',
          detail,
          completed: 0,
          total: 1,
        });
        throw new Error(detail);
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
      const detail = '压缩包内没有文件';
      finishDirectoryProgress({
        phase: 'error',
        title: 'ZIP 解压失败',
        detail,
        completed: 0,
        total: 1,
      });
      throw new Error(detail);
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
      URL.revokeObjectURL(objectUrlRef.current);
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
    setSourceTextLoadStatus(
      isJsonLikePath(normalizedSrc)
        ? {
            loading: true,
            title: '正在读取 JSON 文本',
            detail: getUrlFileName(normalizedSrc, 'remote.json'),
          }
        : createIdleSourceTextStatus(),
    );
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
    const { text, contentType, fileName } = await fetchRemoteText(url);
    const kind = inferRemoteSourceKind(url, fileName, contentType);
    if (kind === 'zip') {
      throw new Error('该链接返回的是 ZIP 文件，请使用 ZIP 流程加载');
    }
    await yieldToBrowser();
    const inspection = await inspectJsonTextForUpload(text);
    if (!inspection.previewable) {
      throw new Error('不是可预览的 Lottie/Animax JSON');
    }
    const editorJsonText = createEditorJsonText(text);
    pushLog(
      `[信息] 已下载远程 JSON：${fileName}${
        inspection.relativeResourcePaths.length > 0
          ? `，检测到 ${inspection.relativeResourcePaths.length} 个相对资源路径，将按 JSON 同级目录解析`
          : ''
      }`,
    );
    commitJsonEditorText(editorJsonText, true);
    jsonEditorSourceUrlRef.current = url;
    await yieldToBrowser();
    loadAnimationSource(url, true);
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

    const response = await fetch(url, { cache: 'no-cache' });
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
      await yieldToBrowser();
      const inspection = await inspectJsonTextForUpload(text);
      if (!inspection.previewable) {
        throw new Error('不是可预览的 Lottie/Animax JSON');
      }
      const editorJsonText = createEditorJsonText(text);
      pushLog(
        `[信息] 已探测远程 JSON：${fileName}${
          inspection.relativeResourcePaths.length > 0
            ? `，检测到 ${inspection.relativeResourcePaths.length} 个相对资源路径，将按 JSON 同级目录解析`
            : ''
        }`,
      );
      commitJsonEditorText(editorJsonText, true);
      jsonEditorSourceUrlRef.current = url;
      await yieldToBrowser();
      loadAnimationSource(url, true);
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
        toast.error(detail);
        if (kind === 'zip') {
          finishDirectoryProgress({
            phase: 'error',
            title,
            detail,
            completed: 0,
            total: 1,
          });
        } else {
          setJsonPreviewStatus({
            tone: 'error',
            message: `${title}：${detail}`,
          });
        }
      }
      return;
    }
    loadAnimationSource(nextSrc, true);
  };

  const handleLoadPackageRecord = async (url: string) => {
    const nextSrc = url.trim();
    if (!nextSrc) return;
    setSrcInput(nextSrc);
    try {
      if (isRemoteOrInlineResource(nextSrc) && /^https?:/i.test(nextSrc)) {
        await handleRemoteSource(nextSrc);
      } else {
        loadAnimationSource(nextSrc, true);
      }
      setPackageRecordsOpen(false);
      toast.success('已加载打包记录');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const kind = inferRemoteSourceKind(nextSrc);
      const title =
        kind === 'zip'
          ? '打包记录 ZIP 加载失败'
          : kind === 'json'
            ? '打包记录 JSON 加载失败'
            : '打包记录加载失败';
      const detail = getRemoteLoadErrorDetail(kind, message);
      pushLog(`[错误] ${title}：${detail}`);
      toast.error(detail);
      if (kind === 'zip') {
        finishDirectoryProgress({
          phase: 'error',
          title,
          detail,
          completed: 0,
          total: 1,
        });
      } else {
        setJsonPreviewStatus({
          tone: 'error',
          message: `${title}：${detail}`,
        });
      }
    }
  };

  const handleCopyPackageRecordShareLink = async (url: string) => {
    try {
      const shareUrl = createAnimaXShareUrl(url);
      await copyPlainTextToClipboard(shareUrl);
      toast.success('分享链接已复制');
      pushLog(`[信息] 打包记录分享链接已复制：${shareUrl}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('复制分享链接失败');
      pushLog(`[警告] 打包记录分享链接复制失败：${message}`);
    }
  };

  const handleRemovePackageRecord = async (url: string) => {
    try {
      const id = new URL(url).pathname.split('/')[3];
      await ensureCloudSession();
      const response = await cloudFetch(`/api/files/${id}/hide`, { method: 'POST' });
      if (!response.ok) throw new Error('移除记录失败');
      setPackageRecords(records => records.filter(item => item.url !== url));
      removeAnimaXCdnHistoryUrl(url);
      toast.success('记录已隐藏，已有分享链接仍然有效');
    } catch (error) { toast.error(error instanceof Error ? error.message : '移除记录失败'); }
  };

  const getShareableSrc = () => {
    const shareSrc = src.trim();
    if (!shareSrc) {
      toast.error('当前没有可分享的动画链接');
      pushLog('[警告] 当前没有可分享的动画链接');
      return '';
    }
    if (/^(blob|data|file):/i.test(shareSrc)) {
      toast.error('当前资源不是可分享链接');
      pushLog('[警告] 当前资源不是可分享链接');
      return '';
    }
    return shareSrc;
  };

  const handleCopyShareLink = async () => {
    const shareSrc = getShareableSrc();
    if (!shareSrc) return;

    try {
      const share = createAnimaXShareText(shareSrc, 'preview');
      await copyPlainTextToClipboard(share.text);
      toast.success('分享链接已复制');
      pushLog(`[信息] 分享链接已复制：${share.url}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('复制分享链接失败');
      pushLog(`[警告] 复制分享链接失败：${message}`);
    }
  };

  const handleCopyCardShareLink = async () => {
    const shareSrc = getShareableSrc();
    if (!shareSrc) return;

    try {
      const share = createAnimaXShareText(shareSrc, 'card');
      await copyPlainTextToClipboard(share.text);
      toast.success('飞书卡片链接已复制');
      pushLog(`[信息] 飞书卡片链接已复制：${share.url}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('复制飞书卡片链接失败');
      pushLog(`[警告] 复制飞书卡片链接失败：${message}`);
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
      if (kind === 'zip') {
        finishDirectoryProgress({
          phase: 'error',
          title: '随机 Lottie 加载失败',
          detail,
          completed: 0,
          total: 1,
        });
      }
      toast.error('随机 Lottie 加载失败');
    } finally {
      setIsRandomLottieLoading(false);
    }
  };

  const handleRepack = async (
    options: RepackOutputOptions = { exportLocal: true, uploadCdn: false },
  ) => {
    if (isRepacking) return;
    if (!options.exportLocal && !options.uploadCdn) {
      toast.error('请至少选择一种产物输出方式');
      return;
    }

    setIsRepacking(true);
    let localExportDone = false;
    let cdnUploadStarted = false;
    pushLog(
      `[信息] 重打包开始：${
        [options.exportLocal ? '本地导出产物' : '', options.uploadCdn ? '上传 CDN' : '']
          .filter(Boolean)
          .join('、') || '未选择输出'
      }`,
    );
    try {
      const result = await createAnimaXRepack({
        jsonText: jsonEditorText,
        sourceUrl: src,
        resourceEdits: resourceEditsRef.current,
      });
      if (options.exportLocal) {
        downloadBlob(result.blob, result.fileName);
        localExportDone = true;
      }
      pushLog(
        `[信息] 重打包完成：${result.fileName}，json=${result.jsonFileName}，图片=${result.downloadedImages}，视频=${result.downloadedVideos}，base64 图片=${result.skippedBase64Images}，base64 视频=${result.skippedBase64Videos}，字体=${result.downloadedFonts}`,
      );
      result.warnings.forEach((warning) => pushLog(`[警告] ${warning}`));

      if (options.uploadCdn) {
        cdnUploadStarted = true;
        const nextJsonUrl = await uploadRepackedAnimation(result);
        if (!nextJsonUrl) throw new Error('重打包后的 JSON 上传失败');

        setPackageRecords(addAnimaXCdnHistoryUrl(nextJsonUrl, { fileName: result.jsonFileName }));
        pushLog(`[信息] 重打包 CDN 链接已写入历史记录：${nextJsonUrl}`);

        const shareUrl = createAnimaXShareUrl(nextJsonUrl);
        try {
          await copyPlainTextToClipboard(shareUrl);
          toast.success('已复制分享链接了');
          pushLog(`[信息] 重打包分享链接已复制：${shareUrl}`);
        } catch (copyError) {
          const message = copyError instanceof Error ? copyError.message : String(copyError);
          toast.error('重打包完成，复制分享链接失败');
          pushLog(`[警告] 重打包分享链接复制失败：${message}`);
        }
      } else if (options.exportLocal) {
        toast.success('重打包完成');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const toastMessage =
        localExportDone && cdnUploadStarted
          ? `本地导出完成，CDN 上传失败：${message}`
          : `重打包失败：${message}`;
      toast.error(toastMessage);
      pushLog(`[错误] 重打包失败：${message}`);
      throw err;
    } finally {
      setIsRepacking(false);
    }
  };

  const handleDownloadInputLottie = async () => {
    if (isDownloadingLottie || isDirectoryUploading) return;

    const sourceUrl = srcInput.trim();
    if (!sourceUrl) {
      toast.error('请输入 Lottie 链接');
      return;
    }

    setIsDownloadingLottie(true);
    pushLog(`[信息] Lottie 下载打包开始：${sourceUrl}`);
    try {
      const result = await createAnimaXDownloadBundle({
        sourceUrl,
        currentAnimation: {
          sourceUrl: jsonEditorSourceUrlRef.current,
          jsonText: jsonEditorTextRef.current,
          resourceEdits: resourceEditsRef.current,
        },
      });
      downloadBlob(result.blob, result.fileName);
      pushLog(
        `[信息] Lottie 下载打包完成：${result.fileName}，json=${result.jsonFileName}，图片=${result.downloadedImages}，视频=${result.downloadedVideos}，base64 图片=${result.skippedBase64Images}，base64 视频=${result.skippedBase64Videos}，字体=${result.downloadedFonts}`,
      );
      result.warnings.forEach((warning) => pushLog(`[警告] ${warning}`));
      toast.success('Lottie 下载打包完成，已触发浏览器下载');
    } catch (error) {
      const detail = getJsonErrorMessage(error);
      pushLog(`[错误] Lottie 下载打包失败：${detail}`);
      toast.error(`Lottie 下载失败：${detail}`);
    } finally {
      setIsDownloadingLottie(false);
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

  const uploadToCdn = async (file: Blob, _uploadDir: string, filename: string) => {
    checkUploadSize(file, filename);
    await ensureCloudSession();
    const form = new FormData();
    form.append('file', file, filename);
    const res = await cloudFetch('/api/files', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || `上传失败：HTTP ${res.status}`);
    return data.url as string;
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
      await uploadToCdn(new Blob([jsonText], { type: 'application/json' }), uploadDir, fileName),
    );
    const editorJsonText = createEditorJsonText(jsonText);
    commitJsonEditorText(editorJsonText, true);
    jsonEditorSourceUrlRef.current = nextUrl;
    setDirectoryProgress({
      phase: 'loading',
      title: '正在创建播放器',
      detail: '使用已上传 CDN URL 创建播放器',
      completed: 1,
      total: 1,
    });
    await yieldToBrowser();
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

  const handlePickDirectory = async (files: File[], options: UploadActionOptions = {}) => {
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
      if (options.rethrow) throw new Error(`目录上传失败：${message}`);
    }
  };

  const handlePickFiles = async (files: File[], options: UploadActionOptions = {}) => {
    if (isDirectoryUploading || files.length === 0) return;

    const zipFile =
      files.length === 1 && /\.zip$/i.test(files[0].name.trim()) ? files[0] : undefined;
    const jsonFile =
      files.length === 1 && /\.(lottie\.json|json)$/i.test(files[0].name.trim())
        ? files[0]
        : undefined;
    if (!zipFile) {
      if (jsonFile) {
        await handleSingleJsonFile(jsonFile, options);
        return;
      }
      await handlePickDirectory(files, options);
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
      if (options.rethrow) throw new Error(`ZIP 加载失败：${message}`);
    }
  };

  const handleConfirmUploadSelection = async () => {
    const selection = pendingUploadSelection;
    if (!selection || isUploadDialogConfirming) return;

    if (selection.invalidReason) {
      setUploadDialogError(selection.invalidReason);
      return;
    }

    setIsUploadDialogConfirming(true);
    setUploadDialogError('');
    setUploadDialogOpen(false);
    setPendingUploadSelection(null);
    try {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
      if (selection.kind === 'directory') {
        await handlePickDirectory(selection.files, { rethrow: true });
      } else {
        await handlePickFiles(selection.files, { rethrow: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushLog(`[错误] 文件加载失败：${message}`);
      toast.error(message.includes('失败') ? message : `加载失败：${message}`);
    } finally {
      setIsUploadDialogConfirming(false);
    }
  };

  const handleSingleJsonFile = async (file: File, options: UploadActionOptions = {}) => {
    try {
      setDirectoryProgress({
        phase: 'scanning',
        title: '正在读取本地 JSON',
        detail: `${file.name} · ${formatBytes(file.size)}`,
        completed: 0,
        total: 1,
      });
      await yieldToBrowser();
      const text = await file.text();
      setDirectoryProgress({
        phase: 'scanning',
        title: '正在校验 JSON 结构',
        detail: file.name,
        completed: 0,
        total: 1,
      });
      await yieldToBrowser();
      const inspection = await inspectJsonTextForUpload(text);
      if (!inspection.previewable) {
        const detail = '不是可预览的 Lottie/Animax JSON';
        pushLog(`[错误] JSON 加载失败：${detail}`);
        finishDirectoryProgress({
          phase: 'error',
          title: 'JSON 加载失败',
          detail,
          completed: 0,
          total: 1,
        });
        if (options.rethrow) throw new HandledUploadError(detail);
        return;
      }

      setDirectoryProgress({
        phase: 'scanning',
        title: '正在扫描资源引用',
        detail:
          inspection.relativeResourcePaths.length > 0
            ? `检测到 ${inspection.relativeResourcePaths.length} 个相对资源路径`
            : '未发现同级资源引用',
        completed: 0,
        total: 1,
      });
      await yieldToBrowser();

      if (inspection.relativeResourcePaths.length > 0) {
        const detail = '含 images/videos/fonts 的 JSON 请改用“选择目录”或 zip';
        pushLog(
          `[警告] ${file.name} 引用了 ${inspection.relativeResourcePaths.length} 个本地资源，单独选择 JSON 无法读取同级目录，请改用“选择目录”或上传 zip`,
        );
        finishDirectoryProgress({
          phase: 'error',
          title: '缺少同级资源权限',
          detail,
          completed: 0,
          total: 1,
        });
        if (options.rethrow) throw new HandledUploadError(detail);
        return;
      }

      const editorJsonText = createEditorJsonText(text);
      commitJsonEditorText(editorJsonText, true);
      setDirectoryProgress({
        phase: 'uploading',
        title: '正在上传 JSON 到 CDN',
        detail: file.name,
        completed: 0,
        total: 1,
      });
      await yieldToBrowser();
      const now = Date.now();
      const baseName = file.name.replace(/\.(lottie\.json|json)$/i, '');
      const uploadDir = `lottie/tmp/${safeSegment(baseName) || 'upload'}_${now}`;
      const uploadFileName = getUploadFileName(file.name, 'animation.json');
      const nextUrl = ensureHttpsUrl(
        await uploadToCdn(
          new Blob([text], { type: file.type || 'application/json' }),
          uploadDir,
          uploadFileName,
        ),
      );
      jsonEditorSourceUrlRef.current = nextUrl;
      setDirectoryProgress({
        phase: 'loading',
        title: '正在创建播放器',
        detail: '使用已上传 CDN URL 创建播放器',
        completed: 1,
        total: 1,
      });
      await yieldToBrowser();
      loadAnimationSource(nextUrl, true);
      finishDirectoryProgress({
        phase: 'done',
        title: '上传完成',
        detail: '已生成可分享链接并开始预览',
        completed: 1,
        total: 1,
      });
      pushLog(
        `[信息] 本地 JSON 已上传并加载：${file.name} (${Math.round(file.size / 1024)}KB) -> ${nextUrl}`,
      );
    } catch (err) {
      if (err instanceof HandledUploadError) {
        if (options.rethrow) throw err;
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      pushLog(`[错误] JSON 加载失败：${message}`);
      finishDirectoryProgress({
        phase: 'error',
        title: 'JSON 加载失败',
        detail: message,
        completed: 0,
        total: 1,
      });
      if (options.rethrow) throw new Error(message);
    }
  };

  const uploadPickedDirectory = async (
    files: File[],
    options: UploadPickedDirectoryOptions = {},
  ) => {
    files.forEach((file) => checkUploadSize(file, file.name));
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
      const detail = '目录中未找到 JSON 文件';
      pushLog(`[错误] ${detail}`);
      finishDirectoryProgress({
        phase: 'error',
        title: '上传终止',
        detail,
        completed: 0,
        total: 1,
      });
      throw new Error(detail);
    }

    let picked = jsonEntries[0];
    let pickedJson: any = null;
    let pickedJsonText = '';
    let parseableJsonCount = 0;
    for (const entry of jsonEntries) {
      setDirectoryProgress({
        phase: 'scanning',
        title: '正在选择主 JSON',
        detail: entry.relPath,
        completed: parseableJsonCount,
        total: jsonEntries.length,
      });
      await yieldToBrowser();
      const text = await entry.file.text();
      try {
        const inspection = await inspectJsonTextForUpload(text);
        parseableJsonCount += 1;
        if (inspection.previewable) {
          picked = entry;
          pickedJsonText = text;
          break;
        }
      } catch {
        // Continue scanning other JSON files.
      }
    }

    if (!pickedJsonText) {
      const detail =
        parseableJsonCount > 0
          ? '目录中未找到可预览的 Lottie/Animax JSON'
          : '目录中的 JSON 无法解析';
      pushLog(`[错误] ${detail}`);
      finishDirectoryProgress({
        phase: 'error',
        title: '上传终止',
        detail,
        completed: 0,
        total: 1,
      });
      throw new Error(detail);
    }

    setDirectoryProgress({
      phase: 'scanning',
      title: '正在解析主 JSON',
      detail: picked.relPath,
      completed: jsonEntries.length,
      total: jsonEntries.length,
    });
    await yieldToBrowser();
    pickedJson = JSON.parse(pickedJsonText) as any;

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
    setDirectoryProgress({
      phase: 'scanning',
      title: '正在定位引用资源',
      detail: picked.relPath,
      completed: 0,
      total: 1,
    });
    await yieldToBrowser();
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
        const cdnUrl = await uploadToCdn(content, uploadDir, name);
        return { file: item.file, cdnUrl, relPath } as const;
      } catch (err) {
        pushLog(`[错误] 上传失败：${relPath}: ${(err as Error)?.message ?? String(err)}`);
        throw err;
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

    const resourceResults = await mapWithConcurrency(
      uploadEntries,
      RESOURCE_UPLOAD_CONCURRENCY,
      (item) =>
        uploadOne(item, item.file, undefined, {
          phase: 'uploading',
          title: '正在上传资源',
          detail: item.relPath,
        }),
    );
    const uploadedByRelPath = new Map<string, string>();
    resourceResults.forEach((result) => {
      if (result) uploadedByRelPath.set(result.relPath, ensureHttpsUrl(result.cdnUrl));
    });

    setDirectoryProgress({
      phase: 'json',
      title: '正在生成预览 JSON',
      detail:
        uploadedByRelPath.size > 0
          ? `已替换 ${uploadedByRelPath.size} 个资源链接`
          : '未发现需要替换的资源链接',
      completed: completedUploads,
      total: totalUploads,
    });
    await yieldToBrowser();
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

    const nextJsonText = JSON.stringify(nextJson);
    const editorJsonText = createEditorJsonText(nextJsonText);
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

    const nextUrl = ensureHttpsUrl(mainResult.cdnUrl);
    setDirectoryProgress({
      phase: 'loading',
      title: '正在创建播放器',
      detail: '使用已上传 CDN URL 创建播放器',
      completed: totalUploads,
      total: totalUploads,
    });
    await yieldToBrowser();
    if (options.pendingResourceReplacement) {
      pendingResourceReplacementRef.current = options.pendingResourceReplacement;
    }
    commitJsonEditorText(editorJsonText, true);
    jsonEditorSourceUrlRef.current = nextUrl;
    loadAnimationSource(nextUrl, true, {
      preservePendingResourceReplacement: Boolean(options.pendingResourceReplacement),
    });
    finishDirectoryProgress({
      phase: 'done',
      title: '上传完成',
      detail: '已更新链接并开始预览',
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

    const baseUrl =
      jsonResourceBaseUrlRef.current || getJsonResourceBaseUrl(src) || getJsonResourceBaseUrl(srcInput);
    const prepared = preparePreviewJsonText(nextJson, baseUrl);
    clearJsonAutoRefreshTimer();
    const element = animRef.current;
    if (element) stopForRestartUpdate(element);
    // FontStyle hot updates can leave stale glyph state; initialize it from JSON instead.
    // Keep resource edits and their object URLs alive for the replacement player.
    commitJsonEditorText(nextJson);
    commitFontStyleEdits(nextFontStyleEdits);
    clearLayerBoundsHighlight();
    currentFrameRef.current = 0;
    setCurrentFrame(0);
    setIsReady(false);
    markPaused(1200);
    setPreviewJsonText(prepared.jsonText);
    setAnimaxViewKey((previous) => previous + 1);
    pushLog(`[信息] 字体 Style 已写入 JSON，重新加载播放器：${row.id} -> ${cleanStyle}`);
    toast.success(`字体 Style 已更新：${row.id} -> ${cleanStyle}`);
  };

  const fetchVideoRowFile = async (row: AssetRow) => {
    if (row.kind !== 'video') throw new Error('只有视频资源支持该操作');
    if (!row.previewUrl) throw new Error('当前视频缺少可读取的预览地址');

    const response = await fetch(row.previewUrl);
    if (!response.ok) throw new Error(`读取视频失败：HTTP ${response.status}`);

    const blob = await response.blob();
    const fileName = getResourcePathFileName(row.name || row.id, `${row.id}.mp4`);
    return new File([blob], fileName, { type: blob.type || 'video/mp4' });
  };

  const fetchImageRowFile = async (row: AssetRow) => {
    if (row.kind !== 'image') throw new Error('只有图片资源支持该操作');
    if (!row.previewUrl) throw new Error('当前图片缺少可读取的预览地址');

    const response = await fetch(row.previewUrl);
    if (!response.ok) throw new Error(`读取图片失败：HTTP ${response.status}`);

    const blob = await response.blob();
    const fileName = getResourcePathFileName(row.name || row.id, `${row.id}.jpg`);
    return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
  };

  const createVideoPackPath = (row: AssetRow, fileName: string) =>
    `videos/${safeSegment(row.id) || 'video'}_${Date.now()}${getFileExtension(fileName) || '.mp4'}`;

  const createImagePackPath = (row: AssetRow, fileName: string) =>
    `images/${safeSegment(row.id) || 'image'}_${Date.now()}${getFileExtension(fileName) || '.png'}`;

  const handleProcessVideoResource = async (
    row: AssetRow,
    options: VideoProcessOptions,
    onProgress?: (progress: VideoProcessProgress) => void,
  ): Promise<ProcessedVideoResource> => {
    if (row.kind !== 'video') throw new Error('只有视频资源支持处理');

    const actionName = '插入 I 帧';
    pushLog(`[信息] 视频${actionName}开始：${row.id}`);
    const inputFile = await fetchVideoRowFile(row);
    const processed = await processVideoResource({
      file: inputFile,
      fileName: inputFile.name,
      options,
      onProgress,
    });
    const blobUrl = URL.createObjectURL(processed.file);

    pushLog(
      `[信息] 视频${actionName}完成：${row.id}，${formatBytes(inputFile.size)} -> ${formatBytes(
        processed.file.size,
      )}`,
    );

    return {
      file: processed.file,
      fileName: processed.fileName,
      packPath: createVideoPackPath(row, processed.fileName),
      blobUrl,
      originalSizeBytes: inputFile.size,
      outputSizeBytes: processed.file.size,
    };
  };

  const handleProcessImageToPng8Resource = async (
    row: AssetRow,
    onProgress?: (progress: VideoProcessProgress) => void,
  ): Promise<ProcessedImageResource> => {
    if (row.kind !== 'image') throw new Error('只有图片资源支持处理');

    pushLog(`[信息] 图片 PNG8 转换开始：${row.id}`);
    const inputFile = await fetchImageRowFile(row);
    const processed = await processImageToPng8Resource({
      file: inputFile,
      fileName: inputFile.name,
      onProgress,
    });
    const blobUrl = URL.createObjectURL(processed.file);

    pushLog(
      `[信息] 图片 PNG8 转换完成：${row.id}，${formatBytes(inputFile.size)} -> ${formatBytes(
        processed.file.size,
      )}`,
    );

    return {
      file: processed.file,
      fileName: processed.fileName,
      packPath: createImagePackPath(row, processed.fileName),
      blobUrl,
      originalSizeBytes: inputFile.size,
      outputSizeBytes: processed.file.size,
    };
  };

  const handleProbeVideoResource = async (
    row: AssetRow,
    onProgress?: (progress: VideoProcessProgress) => void,
  ): Promise<VideoResourceInfo> => {
    if (row.kind !== 'video') throw new Error('只有视频资源支持该操作');

    const inputFile = await fetchVideoRowFile(row);
    return probeVideoResource({
      file: inputFile,
      fileName: inputFile.name,
      onProgress,
    });
  };

  useEffect(() => {
    const videoRowsToCheck = assetRows.filter(
      (row) =>
        row.kind === 'video' && row.previewUrl && (!row.check || row.check.status === 'idle'),
    );
    if (videoRowsToCheck.length === 0) return;

    let cancelled = false;
    videoRowsToCheck.forEach((row) => {
      const resourceKey = createResourceKey('video', row.id);
      setResourceCheckResults((previous) => {
        if (previous[resourceKey] && previous[resourceKey].status !== 'idle') return previous;
        return {
          ...previous,
          [resourceKey]: {
            status: 'checking',
            issues: [],
            message: '正在检查视频帧类型',
          },
        };
      });

      handleProbeVideoResource(row)
        .then((info) => {
          if (cancelled) return;
          setResourceCheckResults((previous) => ({
            ...previous,
            [resourceKey]: info.hasBFrames
              ? createVideoBFramesCheckResult(info.bFrameCount)
              : RESOURCE_CHECK_OK,
          }));
        })
        .catch((err) => {
          if (cancelled) return;
          setResourceCheckResults((previous) => ({
            ...previous,
            [resourceKey]: {
              status: 'error',
              issues: [],
              message: err instanceof Error ? err.message : String(err),
            },
          }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [videoResourceCheckSignature]);

  const applyResourceReplacement = async (
    target: { kind: ResourceKind; id: string },
    nextUrl: string,
    fileName: string,
    file?: File,
    options?: { packPath?: string; local?: boolean; preserveJsonPath?: boolean },
  ) => {
    const element = animRef.current;
    if (element) stopForRestartUpdate(element);

    const nextJson = options?.preserveJsonPath
      ? jsonEditorTextRef.current
      : updateJsonResourcePath(
          jsonEditorTextRef.current,
          target.kind,
          target.id,
          nextUrl,
          options?.packPath,
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
        resourceEdits: resourceEditsRef.current,
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
      packPath: options?.packPath,
      local: options?.local,
    };
    const nextResourceEdits = {
      ...resourceEditsRef.current,
      [createResourceKey(target.kind, target.id)]: nextEdit,
    };

    commitJsonEditorText(nextJson);
    commitResourceEdits(nextResourceEdits);
    setResourceCheckResults((previous) => {
      const resourceKey = createResourceKey(target.kind, target.id);
      if (!previous[resourceKey]) return previous;
      const next = { ...previous };
      delete next[resourceKey];
      return next;
    });

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

  const handleApplyProcessedVideoResource = async (
    row: AssetRow,
    processed: ProcessedVideoResource,
  ) => {
    if (row.kind !== 'video') throw new Error('只有视频资源支持处理结果替换');

    const resourceKey = createResourceKey('video', row.id);
    const previousUrl = resourceObjectUrlsRef.current[resourceKey];
    if (previousUrl && previousUrl !== processed.blobUrl) {
      URL.revokeObjectURL(previousUrl);
    }
    resourceObjectUrlsRef.current[resourceKey] = processed.blobUrl;

    await applyResourceReplacement(
      { kind: 'video', id: row.id },
      processed.blobUrl,
      processed.fileName,
      processed.file,
      {
        packPath: processed.packPath,
        local: true,
      },
    );
    pushLog(
      `[信息] 视频已使用本地文件预览，重打包时会写入 ZIP：${row.id} -> ${processed.packPath}`,
    );
  };

  const handleApplyProcessedImageResource = async (
    row: AssetRow,
    processed: ProcessedImageResource,
  ) => {
    if (row.kind !== 'image') throw new Error('只有图片资源支持处理结果替换');

    const rawResourcePath = row.resourcePath || row.previewUrl || '';
    if (isHttpResourcePath(rawResourcePath)) {
      throw new Error('图片 url 需要业务自行处理');
    }

    const resourceKey = createResourceKey('image', row.id);
    const previousUrl = resourceObjectUrlsRef.current[resourceKey];
    if (previousUrl && previousUrl !== processed.blobUrl) {
      URL.revokeObjectURL(previousUrl);
    }

    if (isBase64ResourcePath(rawResourcePath)) {
      const dataUrl = await fileToDataUrl(processed.file);
      resourceObjectUrlsRef.current[resourceKey] = dataUrl;
      await applyResourceReplacement(
        { kind: 'image', id: row.id },
        dataUrl,
        processed.fileName,
        undefined,
      );
      setResourceCheckResults((previous) => ({
        ...previous,
        [resourceKey]: RESOURCE_CHECK_OK,
      }));
      pushLog(`[信息] base64 图片已转换为 PNG8 data URL：${row.id}`);
      return;
    }

    resourceObjectUrlsRef.current[resourceKey] = processed.blobUrl;
    const packPath = rawResourcePath.trim().replace(/^\/+/, '') || processed.packPath;

    await applyResourceReplacement(
      { kind: 'image', id: row.id },
      processed.blobUrl,
      processed.fileName,
      processed.file,
      {
        packPath,
        local: true,
        preserveJsonPath: true,
      },
    );
    setResourceCheckResults((previous) => ({
      ...previous,
      [resourceKey]: RESOURCE_CHECK_OK,
    }));
    pushLog(`[信息] 本地路径图片已转换为 PNG8，重打包时会覆盖同一路径：${row.id} -> ${packPath}`);
  };

  const handleFixResource = async (row: AssetRow) => {
    const issues = row.check?.issues ?? [];
    if (issues.length === 0) return;

    if (row.kind === 'image' && issues.some((issue) => issue.code === 'image-jpg')) {
      if (isHttpResourcePath(row.resourcePath || '')) {
        throw new Error('图片 url 需要业务自行处理');
      }
      const processed = await handleProcessImageToPng8Resource(row);
      await handleApplyProcessedImageResource(row, processed);
      toast.success(`图片已转换为 PNG8：${row.id}`);
      return;
    }

    if (row.kind === 'video' && issues.some((issue) => issue.code === 'video-b-frames')) {
      const processed = await handleProcessVideoResource(row, {
        iframeMode: 'frames',
        iframeIntervalFrames: 30,
        noBFrames: true,
      });
      await handleApplyProcessedVideoResource(row, processed);
      setResourceCheckResults((previous) => ({
        ...previous,
        [createResourceKey('video', row.id)]: RESOURCE_CHECK_OK,
      }));
      toast.success(`视频已移除 B 帧：${row.id}`);
      return;
    }

    throw new Error(`暂不支持自动修复 ${row.id} 的资源问题`);
  };

  const handleFixAllResources = async () => {
    if (isFixingResources) return;
    const rowsToFix = assetRows.filter(hasFixableIssue);
    if (rowsToFix.length === 0) return;

    setIsFixingResources(true);
    try {
      for (const row of rowsToFix) {
        await handleFixResource(row);
      }
      toast.success(`资源修复完成：${rowsToFix.length} 个`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushLog(`[错误] 资源修复失败：${message}`);
      toast.error(`资源修复失败：${message}`);
      throw err;
    } finally {
      setIsFixingResources(false);
    }
  };

  const handleReplacementFile = async (file: File) => {
    const target = replacementTargetRef.current;
    if (!target) return;

    try {
      const uploadFileName = `${safeSegment(target.id) || 'resource'}_${Date.now()}${
        getFileExtension(file.name) || (target.kind === 'image' ? '.png' : '')
      }`;
      const cdnUrl = await uploadToCdn(
        file,
        `lottie/tmp/tools/${safeSegment(target.id) || 'resource'}`,
        uploadFileName,
      );
      await applyResourceReplacement(target, ensureHttpsUrl(cdnUrl), uploadFileName, file);
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

  useEffect(
    () => () => {
      Object.values(resourceObjectUrlsRef.current).forEach((url) => {
        URL.revokeObjectURL(url);
      });
      resourceObjectUrlsRef.current = {};
    },
    [],
  );

  useEffect(() => {
    let disposed = false;
    const getRuntimeFontLabel = (status: AnimaXRuntimeStatus) => {
      if (status.fontLoaded) return '已加载';
      if (status.fontLoading) return '加载中';
      if (status.fontTimedOut) return '超时';
      return '失败';
    };

    const applyRuntimeStatus = (status: AnimaXRuntimeStatus, logSummary: boolean) => {
      setRuntimeStatus(status);
      setRuntimeReady(status.ready);
      if (status.ready) {
        setRuntimeError(null);
        if (logSummary) {
          pushLog(
            `[信息] 运行时可用：字体=${getRuntimeFontLabel(status)}(${status.fontCount} 组)，Textra=${
              status.textraModuleLoaded ? '已加载' : '失败'
            }(${Math.round(status.textraModuleBytes / 1024)}KB，${
              status.textraModuleFromCache ? '本地缓存' : '网络下载'
            })，视频=${status.videoModuleLoaded ? '已加载' : '失败'}(${Math.round(
              status.videoModuleBytes / 1024,
            )}KB，${status.videoModuleFromCache ? '本地缓存' : '网络下载'})`,
          );
        }
        return;
      }

      const message = status.warnings.join('；') || 'Textra 或视频模块未完成加载';
      setRuntimeError(message);
      if (logSummary) {
        pushLog(`[错误] 运行时未就绪，播放器不会挂载：${message}`);
      }
    };

    ensureAnimaXRuntimeInitialized({
      onLog: (line) => {
        if (!disposed) {
          const detail = line.replace(/^\[[^\]]+\]\s*/, '').replace(/^运行时初始化：/, '');
          if (detail) setRuntimeInitDetail(detail);
          pushLog(line);
        }
      },
      onStatus: (status) => {
        if (!disposed) applyRuntimeStatus(status, false);
      },
    })
      .then((status) => {
        if (disposed) return;
        applyRuntimeStatus(status, true);
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
    if (!/\.(lottie\.json|json)(\?|#|$)/i.test(url)) {
      setSourceTextLoadStatus(createIdleSourceTextStatus());
      return;
    }
    if (jsonEditorSourceUrlRef.current === url) {
      setSourceTextLoadStatus(createIdleSourceTextStatus());
      return;
    }
    const preserveResourceState = Boolean(pendingResourceReplacementRef.current);

    const controller = new AbortController();
    let alive = true;

    (async () => {
      try {
        setSourceTextLoadStatus({
          loading: true,
          title: '正在下载远程 JSON',
          detail: getUrlFileName(url, 'remote.json'),
        });
        const res = await fetch(url, { signal: controller.signal, cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!alive) return;
        setSourceTextLoadStatus({
          loading: true,
          title: '正在校验 JSON',
          detail: getUrlFileName(url, 'remote.json'),
        });
        await yieldToBrowser();
        const inspection = await inspectJsonTextForUpload(text);
        if (!alive) return;
        if (!inspection.previewable) {
          throw new Error('不是可预览的 Lottie/Animax JSON');
        }
        const editorJsonText = createEditorJsonText(text);
        commitJsonEditorText(editorJsonText, true);
        jsonEditorSourceUrlRef.current = url;
        if (!preserveResourceState) {
          clearResourceEdits();
          clearTextEdits();
          clearLayerTransformEdits();
          setTextDrafts({});
        }
        setSourceTextLoadStatus(createIdleSourceTextStatus());
      } catch (err) {
        if (!alive) return;
        if ((err as any)?.name === 'AbortError') return;
        const message = (err as Error)?.message ?? String(err);
        setSourceTextLoadStatus(createIdleSourceTextStatus());
        setJsonPreviewStatus({
          tone: 'error',
          message: `JSON 加载失败：${message}`,
        });
        pushLog(`[警告] 拉取 JSON 失败：${message}`);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [src]);

  useEffect(() => {
    if (!canvasElement) return;
    const isCardLayout = getLocationParam('layout') === 'card';
    const padding = isCardLayout ? 8 : 18;
    const progressReserve = isCardLayout ? 54 : 84;
    const minStageSize = isCardLayout ? 120 : 240;

    const compute = () => {
      const rect = canvasElement.getBoundingClientRect();
      const w = Math.max(0, rect.width - padding * 2);
      const h = Math.max(0, rect.height - padding * 2 - progressReserve);
      const next = Math.max(minStageSize, Math.min(960, Math.floor(Math.min(w, h))));
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
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      clearJsonAutoRefreshTimer();
      if (directoryUploadClearTimerRef.current !== null) {
        window.clearTimeout(directoryUploadClearTimerRef.current);
        directoryUploadClearTimerRef.current = null;
      }
      if (frameUiCommitTimerRef.current !== null) {
        window.clearTimeout(frameUiCommitTimerRef.current);
        frameUiCommitTimerRef.current = null;
      }
      jsonAnalysisWorkerRef.current?.terminate();
      jsonAnalysisWorkerRef.current = null;
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
        try {
          element.unsubscribeUpdateEvents(frames);
        } catch (error) {
          console.warn('[animax] 取消帧更新订阅失败，已忽略', error);
        }
      }
      subscribedUpdateFramesRef.current = [];
    };

    const syncUpdateSubscriptions = (total: number) => {
      if (!Number.isFinite(total) || total <= 0) return;
      const frameCount = Math.ceil(total);
      const step = Math.max(1, Math.ceil(frameCount / UPDATE_EVENT_SUBSCRIPTION_LIMIT));
      const frames = Array.from(
        { length: Math.ceil(frameCount / step) },
        (_, index) => index * step,
      );
      const lastFrame = Math.max(0, frameCount - 1);
      if (!frames.includes(lastFrame)) frames.push(lastFrame);
      clearUpdateSubscriptions();
      if (typeof element.subscribeUpdateEvents !== 'function') return;
      try {
        element.subscribeUpdateEvents(frames);
        subscribedUpdateFramesRef.current = frames;
      } catch (error) {
        subscribedUpdateFramesRef.current = [];
        console.warn('[animax] 注册帧更新订阅失败，已忽略', error);
      }
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
      const immediateFrameState: { current?: number; total?: number } = {};
      if (Number.isFinite(nextTotal) && nextTotal > 0) {
        totalFrameRef.current = nextTotal;
        immediateFrameState.total = nextTotal;
        syncUpdateSubscriptions(nextTotal);
      }
      if (Number.isFinite(nextCurrent)) {
        currentFrameRef.current = nextCurrent;
        immediateFrameState.current = nextCurrent;
      }
      commitFrameUiState(immediateFrameState, true);
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
      const nextUiFrameState: { current?: number; total?: number } = {};
      if (Number.isFinite(nextTotal) && nextTotal > 0) {
        totalFrameRef.current = nextTotal;
        nextUiFrameState.total = nextTotal;
      }
      if (ignoreRuntimeFrameSync) {
        if (Number.isFinite(nextUiFrameState.total)) {
          commitFrameUiState(nextUiFrameState);
        }
        return;
      }
      if (Number.isFinite(nextCurrent)) {
        const isFrameMoving = Math.abs(nextCurrent - previousFrame) > 0.001;
        currentFrameRef.current = nextCurrent;
        nextUiFrameState.current = nextCurrent;
        commitFrameUiState(nextUiFrameState);
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
      const nextUiFrameState: { current?: number; total?: number } = {};
      if (Number.isFinite(nextTotal) && nextTotal > 0) {
        totalFrameRef.current = nextTotal;
        nextUiFrameState.total = nextTotal;
      }
      if (Number.isFinite(nextCurrent)) {
        currentFrameRef.current = nextCurrent;
        nextUiFrameState.current = nextCurrent;
      }
      commitFrameUiState(nextUiFrameState, true);
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
        jsonAnalysisStatus: jsonAnalysis.status,
        jsonAnalysisError: jsonAnalysis.error,
        lottieLoadStatus,
        previewStageStatus,
        parsedJson,
        composition,
        textLayerRows,
        layerRows,
        textDrafts,
        assetRows,
        resourceWarningCount,
        isFixingResources,
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
        uploadDialogOpen,
        pendingUploadSelection,
        uploadDialogError,
        isUploadDialogConfirming,
        directoryUploadProgress,
        isDirectoryUploading,
        runtimeReady,
        runtimeStatus,
        runtimeError,
        isAnimationReady: isReady,
        repackDialogOpen,
        packageRecordsOpen,
        packageRecords,
        canConfirm,
        canApplyDynamicResourceCode,
        canRepack,
        isRepacking,
        isDownloadingLottie,
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
        handleOpenRepackDialog,
        handleCloseRepackDialog,
        handleRepack,
        handleDownloadInputLottie,
        handleOpenPackageRecords,
        handleClosePackageRecords,
        handleLoadPackageRecord,
        handleCopyPackageRecordShareLink,
        handleRemovePackageRecord,
        handleCopyShareLink,
        handleCopyCardShareLink,
        handleTogglePlay,
        handleProgressChange,
        handleScrubStart,
        handleScrubEnd,
        handleOpenUploadDialog,
        handleCloseUploadDialog,
        handleResetUploadSelection,
        handleSelectUploadFiles,
        handleSelectUploadDirectory,
        handleUploadDrop,
        handleConfirmUploadSelection,
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
        handleProcessVideoResource,
        handleProbeVideoResource,
        handleApplyProcessedVideoResource,
        handleFixResource,
        handleFixAllResources,
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
