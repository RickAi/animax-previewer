export type AnimaXToolTab = 'text' | 'layers' | 'assets' | 'json' | 'script' | 'perf';
export type ResourceKind = 'image' | 'video' | 'font';
export type EditableLayerKind = 'image' | 'text' | 'solid';
export type JsonPreviewStatusTone = 'idle' | 'pending' | 'success' | 'error';

export interface JsonPreviewStatus {
  tone: JsonPreviewStatusTone;
  message: string;
}

export interface LayerTransform {
  positionX: number;
  positionY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  anchorX: number;
  anchorY: number;
}

export type LayerTransformField = keyof LayerTransform;

export type LayerTransformStaticState = Record<LayerTransformField, boolean>;

interface BaseCreateLayerInput {
  name: string;
  transform: LayerTransform;
}

export type CreateEditableLayerInput =
  | (BaseCreateLayerInput & {
      kind: 'image';
      fileName: string;
      dataUrl: string;
      width: number;
      height: number;
    })
  | (BaseCreateLayerInput & {
      kind: 'text';
      text: string;
    })
  | (BaseCreateLayerInput & {
      kind: 'solid';
      color: string;
      width?: number;
      height?: number;
    });

export interface PreviewEditableLayerOptions {
  silent?: boolean;
}

export interface EditableLayerDraftPreview {
  key: string;
  name: string;
  input: CreateEditableLayerInput;
}

export interface ResourceEdit {
  kind: ResourceKind;
  id: string;
  url: string;
  fileName: string;
  file?: File;
  packPath?: string;
  local?: boolean;
}

export interface AssetRow {
  kind: ResourceKind;
  id: string;
  name: string;
  detail: string;
  resourcePath?: string;
  style?: string;
  origin?: number;
  sizeBytes?: number;
  sizeLabel?: string;
  formatTags?: string[];
  formatTitle?: string;
  refCount: number;
  status: 'ok' | 'mapped' | 'missing' | 'unused';
  previewUrl?: string;
  check?: ResourceCheckResult;
}

export type ResourceCheckIssueCode = 'image-jpg' | 'video-b-frames';

export interface ResourceCheckIssue {
  code: ResourceCheckIssueCode;
  message: string;
  fixLabel: string;
  fixable?: boolean;
}

export interface ResourceCheckResult {
  status: 'idle' | 'checking' | 'ok' | 'warning' | 'error';
  issues: ResourceCheckIssue[];
  message?: string;
}

export type VideoIframeMode = 'frames' | 'seconds' | 'frameNumbers';

export interface VideoProcessOptions {
  iframeMode?: VideoIframeMode;
  iframeIntervalFrames?: number;
  iframeIntervalSeconds?: number;
  iframeFrameNumbers?: string;
  noBFrames?: boolean;
}

export interface VideoProcessProgress {
  stage: 'loading' | 'writing' | 'transcoding' | 'reading';
  message: string;
  progress?: number;
  log?: string;
}

export interface ProcessedVideoResource {
  file: File;
  fileName: string;
  packPath: string;
  blobUrl: string;
  originalSizeBytes?: number;
  outputSizeBytes: number;
}

export interface ProcessedImageResource {
  file: File;
  fileName: string;
  packPath: string;
  blobUrl: string;
  originalSizeBytes?: number;
  outputSizeBytes: number;
}

export interface VideoResourceInfo {
  durationSeconds: number | null;
  frameRate: number | null;
  totalFrames: number | null;
  totalFramesEstimated: boolean;
  hasBFrames?: boolean;
  bFrameCount?: number;
}

export interface TextLayerRow {
  key: string;
  name: string;
  text: string;
  path: Array<string | number>;
}

export interface LayerEffectSummary {
  kind: 'gaussian-blur' | 'drop-shadow' | 'unsupported';
  name: string;
  matchName?: string;
}

export interface LayerRow {
  key: string;
  name: string;
  typeLabel: string;
  typeCode: number;
  path: Array<string | number>;
  transform: LayerTransform;
  transformStaticState: LayerTransformStaticState;
  index: number;
  order: number;
  startFrame: number;
  endFrame: number;
  compositionName: string;
  editableKind?: EditableLayerKind;
  refId?: string;
  fontNames?: string[];
  timeStretch?: number;
  effects?: LayerEffectSummary[];
  parentIndex?: number;
  hidden?: boolean;
  isMatte?: boolean;
  matteType?: number;
  matteLayerIndex?: number;
  is3d?: boolean;
}

export interface LayerBoundsOverlay {
  layerKey: string;
  layerName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  density: number;
  color: string;
}
