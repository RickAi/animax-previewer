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
}

export interface AssetRow {
  kind: ResourceKind;
  id: string;
  name: string;
  detail: string;
  style?: string;
  origin?: number;
  sizeBytes?: number;
  sizeLabel?: string;
  refCount: number;
  status: 'ok' | 'mapped' | 'missing' | 'unused';
  previewUrl?: string;
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
