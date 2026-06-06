import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  AssetRow,
  CreateEditableLayerInput,
  EditableLayerKind,
  JsonPreviewStatus,
  LayerBoundsOverlay,
  LayerRow,
  LayerTransform,
  LayerTransformStaticState,
  PreviewEditableLayerOptions,
  TextLayerRow,
} from '../toolTypes';
import { AnimaXJsonCodeEditor } from './AnimaXJsonCodeEditor';

const getResourceKindLabel = (kind: AssetRow['kind']) => {
  if (kind === 'image') return '图片';
  if (kind === 'video') return '视频';
  return '字体';
};

const getResourceSummaryLabel = (kind: AssetRow['kind']) => {
  return getResourceKindLabel(kind);
};

const getResourceKindTone = (kind: AssetRow['kind']) => {
  if (kind === 'image') return 'image';
  if (kind === 'video') return 'video';
  return 'font';
};

const getResourceUrlPlaceholder = (kind: AssetRow['kind']) => {
  if (kind === 'image') return 'https://example.com/image.png';
  if (kind === 'video') return 'https://example.com/video.mp4';
  return 'https://example.com/font.ttf';
};

const getFontOriginHint = (origin?: number) => {
  if (origin === 0) {
    return 'origin=0 使用系统字体，不能直接替换字体文件；替换时会先生成远端字体 JSON 并重新加载。';
  }
  if (origin === 3) {
    return 'origin=3 使用远端字体资源，可以直接替换字体文件。';
  }
  return `origin=${origin ?? '--'} 来源未识别，替换前请确认 JSON 中的字体配置。`;
};

const FONT_STYLE_OPTIONS = [
  'Regular',
  'Italic',
  'Bold',
  'Medium',
  'Semibold',
  'Light',
  'ExtraBold',
  'Black',
  'Bold Italic',
] as const;

const getFontStyleOptions = (currentStyle?: string) => {
  const trimmedStyle = currentStyle?.trim();
  if (!trimmedStyle || FONT_STYLE_OPTIONS.some((style) => style === trimmedStyle)) {
    return FONT_STYLE_OPTIONS;
  }

  return [trimmedStyle, ...FONT_STYLE_OPTIONS];
};

const VideoResourceThumbnail: React.FC<{ src: string; id: string; onPreview: () => void }> = ({
  src,
  id,
  onPreview,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <button
      type="button"
      className="animax-editor-resource-thumb-btn video"
      onClick={onPreview}
      title={src}
      aria-label={`预览视频 ${id}`}
    >
      <video
        ref={videoRef}
        className="animax-editor-resource-thumb"
        src={src}
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={() => {
          const video = videoRef.current;
          if (!video) return;
          video.currentTime = Math.min(0.001, video.duration || 0.001);
        }}
      />
      <span className="animax-editor-video-play" aria-hidden="true">
        ▶
      </span>
    </button>
  );
};

interface TextPanelProps {
  textLayerRows: TextLayerRow[];
  textDrafts: Record<string, string>;
  onDraftChange: (key: string, value: string) => void;
  onUpdate: (row: TextLayerRow) => void;
}

export const AnimaXTextPanel: React.FC<TextPanelProps> = ({
  textLayerRows,
  textDrafts,
  onDraftChange,
  onUpdate,
}) => {
  return (
    <div className="animax-editor-panel">
      <div className="animax-editor-section">
        <div className="animax-editor-section-body">
          <div className="animax-editor-text-list">
            {textLayerRows.length > 0 ? (
              <div className="animax-editor-text-header" aria-hidden="true">
                <span>文本图层名</span>
                <span>文本内容</span>
                <span />
              </div>
            ) : null}
            {textLayerRows.map((row) => (
              <div className="animax-editor-text-row" key={row.key}>
                <div className="animax-editor-text-layer">
                  <strong title={row.name}>{row.name}</strong>
                </div>
                <input
                  className="animax-editor-input animax-editor-inline-input animax-editor-text-input"
                  value={textDrafts[row.key] ?? row.text}
                  onChange={(event) => onDraftChange(row.key, event.currentTarget.value)}
                />
                <button
                  type="button"
                  className="animax-editor-btn action"
                  onClick={() => onUpdate(row)}
                >
                  更新
                </button>
              </div>
            ))}
            {textLayerRows.length === 0 && (
              <div className="animax-editor-empty-list">未发现文本图层。</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const formatLayerFrame = (frame: number) => {
  if (!Number.isFinite(frame)) return '--';
  return Number.isInteger(frame) ? String(frame) : frame.toFixed(2);
};

const getLayerFrameRange = (row: LayerRow) =>
  `${formatLayerFrame(row.startFrame)} → ${formatLayerFrame(row.endFrame)}`;

const getLayerFrameRangeTitle = (row: LayerRow) =>
  `该图层从${formatLayerFrame(row.startFrame)}帧开始可见，${formatLayerFrame(
    row.endFrame,
  )}帧变得不可见`;

const hasLayerTimeStretch = (row: LayerRow) =>
  typeof row.timeStretch === 'number' &&
  Number.isFinite(row.timeStretch) &&
  Math.abs(row.timeStretch - 1) > 0.0001;

const getLayerMatteLabel = (row: LayerRow) =>
  row.matteLayerIndex !== undefined ? `Matte #${row.matteLayerIndex}` : 'Matte';

const getLayerMatteTitle = (row: LayerRow) =>
  row.matteLayerIndex !== undefined
    ? `这个图层使用了 #${row.matteLayerIndex} 图层作为遮罩`
    : '这个图层使用 Track Matte 作为遮罩';

const getLayerDetailTitle = (row: LayerRow) => {
  const parts = [getLayerFrameRangeTitle(row)];
  if (row.refId) parts.push(row.refId);
  return parts.join(' / ');
};

const getLayerKindTone = (row: LayerRow) => {
  if (row.typeLabel === '图片') return 'image';
  if (row.typeLabel === '文本') return 'text';
  if (row.typeLabel === 'Solid' || row.typeLabel === '纯色') return 'solid';
  if (row.typeLabel === '预合成') return 'precomp';
  if (row.typeLabel === '形状') return 'shape';
  if (row.typeLabel === '视频') return 'video';
  if (row.typeLabel === '音频') return 'audio';
  if (row.typeLabel === '相机') return 'camera';
  if (row.typeLabel === '空对象') return 'null';
  return 'unknown';
};

const LayerChip: React.FC<{
  label: string;
  tone:
    | 'frame'
    | 'ref'
    | 'parent'
    | 'matte'
    | 'three-d'
    | 'hidden'
    | 'stretch'
    | 'effect'
    | 'effect-unsupported'
    | 'state'
    | 'font-ref';
  tooltip: string;
}> = ({ label, tone, tooltip }) => (
  <span
    className={['animax-editor-layer-chip', tone].join(' ')}
    title={tooltip}
    data-tooltip={tooltip}
  >
    <span className="animax-editor-layer-chip-label">{label}</span>
  </span>
);

const DEFAULT_EDIT_TRANSFORM: LayerTransform = {
  positionX: 0,
  positionY: 0,
  scaleX: 100,
  scaleY: 100,
  rotation: 0,
  opacity: 100,
  anchorX: 0,
  anchorY: 0,
};

const ADD_LAYER_SWATCHES = [
  'transparent',
  '#ffffff',
  '#111111',
  '#6d5dfc',
  '#3b82f6',
  '#ff6b9a',
  '#14b8a6',
];

const getDefaultLayerName = (kind: EditableLayerKind) => {
  if (kind === 'image') return 'Image Layer';
  if (kind === 'text') return 'Text Layer';
  return 'Solid Layer';
};

const getEditableKindLabel = (kind: EditableLayerKind) => {
  if (kind === 'image') return '图片图层';
  if (kind === 'text') return '文字图层';
  return 'Solid 图层';
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });

const readImageSize = (src: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => reject(new Error('读取图片尺寸失败'));
    image.src = src;
  });

const TransformField: React.FC<{
  label: string;
  value: number;
  suffix: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  disabledReason?: string;
  tooltipPlacement?: 'start' | 'end';
  onChange: (value: number) => void;
}> = ({
  label,
  value,
  suffix,
  min,
  max,
  step = 1,
  disabled = false,
  disabledReason,
  tooltipPlacement = 'start',
  onChange,
}) => (
  <label
    className={disabled ? 'animax-layer-transform-field disabled' : 'animax-layer-transform-field'}
  >
    <span className="animax-layer-transform-label">
      <span>{label}</span>
      {disabled ? (
        <span
          className={`animax-layer-transform-help ${tooltipPlacement}`}
          role="img"
          aria-label={disabledReason}
          tabIndex={0}
          data-tooltip={disabledReason}
        >
          ?
        </span>
      ) : null}
    </span>
    <div className="animax-layer-transform-control">
      <input
        className="animax-editor-input animax-layer-transform-input"
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => {
          if (disabled) return;
          const next = Number(event.currentTarget.value);
          onChange(Number.isFinite(next) ? next : 0);
        }}
      />
      <span>{suffix}</span>
    </div>
  </label>
);

const LayerTransformEditor: React.FC<{
  title: string;
  layerName?: string;
  transform: LayerTransform;
  staticState?: LayerTransformStaticState;
  onChange: (transform: LayerTransform) => void;
}> = ({ title, layerName, transform, staticState, onChange }) => {
  const disabledReason = '该 Transform 属性存在关键帧或非静态表达，当前只支持修改静态值。';
  const isFieldEditable = (key: keyof LayerTransform) => staticState?.[key] ?? true;
  const updateTransform = (key: keyof LayerTransform, value: number) => {
    if (!isFieldEditable(key)) return;
    onChange({ ...transform, [key]: value });
  };

  return (
    <div className="animax-layer-transform-panel">
      <div className="animax-layer-transform-head">
        <div>
          <h3>{title}</h3>
          {layerName ? <span>{layerName}</span> : null}
        </div>
      </div>
      <div className="animax-layer-transform-grid">
        <TransformField
          label="位置 X"
          value={transform.positionX}
          suffix="px"
          step={1}
          disabled={!isFieldEditable('positionX')}
          disabledReason={disabledReason}
          tooltipPlacement="start"
          onChange={(value) => updateTransform('positionX', value)}
        />
        <TransformField
          label="位置 Y"
          value={transform.positionY}
          suffix="px"
          step={1}
          disabled={!isFieldEditable('positionY')}
          disabledReason={disabledReason}
          tooltipPlacement="end"
          onChange={(value) => updateTransform('positionY', value)}
        />
        <TransformField
          label="缩放 X"
          value={transform.scaleX}
          suffix="%"
          min={0}
          step={1}
          disabled={!isFieldEditable('scaleX')}
          disabledReason={disabledReason}
          tooltipPlacement="start"
          onChange={(value) => updateTransform('scaleX', value)}
        />
        <TransformField
          label="缩放 Y"
          value={transform.scaleY}
          suffix="%"
          min={0}
          step={1}
          disabled={!isFieldEditable('scaleY')}
          disabledReason={disabledReason}
          tooltipPlacement="end"
          onChange={(value) => updateTransform('scaleY', value)}
        />
        <TransformField
          label="旋转"
          value={transform.rotation}
          suffix="deg"
          step={1}
          disabled={!isFieldEditable('rotation')}
          disabledReason={disabledReason}
          tooltipPlacement="start"
          onChange={(value) => updateTransform('rotation', value)}
        />
        <TransformField
          label="不透明度"
          value={transform.opacity}
          suffix="%"
          min={0}
          max={100}
          step={1}
          disabled={!isFieldEditable('opacity')}
          disabledReason={disabledReason}
          tooltipPlacement="end"
          onChange={(value) => updateTransform('opacity', value)}
        />
        <TransformField
          label="锚点 X"
          value={transform.anchorX}
          suffix="px"
          step={1}
          disabled={!isFieldEditable('anchorX')}
          disabledReason={disabledReason}
          tooltipPlacement="start"
          onChange={(value) => updateTransform('anchorX', value)}
        />
        <TransformField
          label="锚点 Y"
          value={transform.anchorY}
          suffix="px"
          step={1}
          disabled={!isFieldEditable('anchorY')}
          disabledReason={disabledReason}
          tooltipPlacement="end"
          onChange={(value) => updateTransform('anchorY', value)}
        />
      </div>
    </div>
  );
};

const LayerVisibilitySwitch: React.FC<{
  visible: boolean;
  onChange: (visible: boolean) => void;
}> = ({ visible, onChange }) => (
  <div className="animax-layer-visibility-row">
    <div className="animax-layer-visibility-copy">
      <span>可见性</span>
      <strong>{visible ? '显示图层' : '隐藏图层'}</strong>
    </div>
    <label className="animax-layer-visibility-switch">
      <input
        type="checkbox"
        role="switch"
        checked={visible}
        aria-label="图层可见性"
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className="animax-layer-visibility-track" aria-hidden="true">
        <span className="animax-layer-visibility-thumb" />
      </span>
    </label>
  </div>
);

interface AddLayerDraft {
  kind: EditableLayerKind | null;
  name: string;
  text: string;
  color: string;
  fileName: string;
  dataUrl: string;
  width: number;
  height: number;
  transform: LayerTransform;
}

interface AddLayerPreviewRequest {
  input: CreateEditableLayerInput;
  options: PreviewEditableLayerOptions;
}

const createInitialAddLayerDraft = (): AddLayerDraft => ({
  kind: null,
  name: '',
  text: 'Text Layer',
  color: '#6d5dfc',
  fileName: '',
  dataUrl: '',
  width: 1,
  height: 1,
  transform: DEFAULT_EDIT_TRANSFORM,
});

const AddLayerWizard: React.FC<{
  onCancel: () => void;
  onPreview: (
    input: CreateEditableLayerInput,
    options?: PreviewEditableLayerOptions,
  ) => Promise<boolean>;
  onCancelPreview: () => void;
  onCreate: (input: CreateEditableLayerInput) => Promise<void>;
}> = ({ onCancel, onPreview, onCancelPreview, onCreate }) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const previewedRef = useRef(false);
  const createdRef = useRef(false);
  const onPreviewRef = useRef(onPreview);
  const onCancelPreviewRef = useRef(onCancelPreview);
  const isPreviewingRef = useRef(false);
  const previewTimerRef = useRef<number | null>(null);
  const latestPreviewRequestRef = useRef<AddLayerPreviewRequest | null>(null);
  const previewQueuedRef = useRef(false);
  const [step, setStep] = useState<'type' | 'config'>('type');
  const [draft, setDraft] = useState<AddLayerDraft>(() => createInitialAddLayerDraft());
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [hasPreview, setHasPreview] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [imageError, setImageError] = useState('');

  useEffect(() => {
    onPreviewRef.current = onPreview;
  }, [onPreview]);

  useEffect(() => {
    onCancelPreviewRef.current = onCancelPreview;
  }, [onCancelPreview]);

  useEffect(
    () => () => {
      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      if (previewedRef.current && !createdRef.current) onCancelPreviewRef.current();
    },
    [],
  );

  const clearScheduledPreview = () => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    previewQueuedRef.current = false;
    latestPreviewRequestRef.current = null;
  };

  const chooseKind = (kind: EditableLayerKind) => {
    setDraft((prev) => ({
      ...prev,
      kind,
      name: prev.name || getDefaultLayerName(kind),
    }));
    setStep('config');
  };

  const handleImageFile = async (file: File) => {
    setImageError('');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const size = await readImageSize(dataUrl);
      setDraft((prev) => ({
        ...prev,
        fileName: file.name,
        dataUrl,
        width: size.width,
        height: size.height,
        transform: {
          ...prev.transform,
          anchorX: Math.round(size.width / 2),
          anchorY: Math.round(size.height / 2),
        },
      }));
    } catch (err) {
      setImageError((err as Error)?.message ?? String(err));
    }
  };

  const setImageDimension = (key: 'width' | 'height', value: number) => {
    const nextValue = Math.max(1, Math.round(Number.isFinite(value) ? value : 1));
    setDraft((prev) => {
      const nextWidth = key === 'width' ? nextValue : prev.width;
      const nextHeight = key === 'height' ? nextValue : prev.height;
      return {
        ...prev,
        width: nextWidth,
        height: nextHeight,
        transform: {
          ...prev.transform,
          anchorX: Math.round(nextWidth / 2),
          anchorY: Math.round(nextHeight / 2),
        },
      };
    });
  };

  const canCreate =
    draft.kind === 'image'
      ? Boolean(draft.dataUrl)
      : draft.kind === 'text'
        ? draft.text.trim().length > 0
        : draft.kind === 'solid';

  const buildCreateInput = useCallback((): CreateEditableLayerInput | null => {
    if (draft.kind === 'image') {
      return {
        kind: 'image',
        name: draft.name || getDefaultLayerName('image'),
        fileName: draft.fileName || 'image.png',
        dataUrl: draft.dataUrl,
        width: draft.width,
        height: draft.height,
        transform: draft.transform,
      };
    }
    if (draft.kind === 'text') {
      return {
        kind: 'text',
        name: draft.name || getDefaultLayerName('text'),
        text: draft.text,
        transform: draft.transform,
      };
    }
    if (draft.kind === 'solid') {
      return {
        kind: 'solid',
        name: draft.name || getDefaultLayerName('solid'),
        color: draft.color,
        transform: draft.transform,
      };
    }
    return null;
  }, [draft]);

  const runPreview = useCallback(
    async (input: CreateEditableLayerInput, options: PreviewEditableLayerOptions = {}) => {
      latestPreviewRequestRef.current = { input, options };
      if (isPreviewingRef.current) {
        previewQueuedRef.current = true;
        return false;
      }

      isPreviewingRef.current = true;
      setIsPreviewing(true);
      let previewedAny = false;
      try {
        let nextRequest: AddLayerPreviewRequest | null = { input, options };
        while (nextRequest && !createdRef.current) {
          previewQueuedRef.current = false;
          const previewed = await onPreviewRef.current(nextRequest.input, nextRequest.options);
          if (previewed) {
            previewedAny = true;
            previewedRef.current = true;
            setHasPreview(true);
          }
          nextRequest = previewQueuedRef.current ? latestPreviewRequestRef.current : null;
        }
        return previewedAny;
      } finally {
        isPreviewingRef.current = false;
        setIsPreviewing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!previewedRef.current || createdRef.current || !canCreate) return;
    const input = buildCreateInput();
    if (!input) return;
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = window.setTimeout(() => {
      previewTimerRef.current = null;
      void runPreview(input, { silent: true });
    }, 220);
    return () => {
      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
    };
  }, [buildCreateInput, canCreate, runPreview]);

  const cancelLocalPreview = () => {
    clearScheduledPreview();
    if (!previewedRef.current || createdRef.current) return;
    previewedRef.current = false;
    setHasPreview(false);
    onCancelPreviewRef.current();
  };

  const handleBack = () => {
    cancelLocalPreview();
    setStep('type');
  };

  const handlePreview = async () => {
    const input = buildCreateInput();
    if (!input || isPreviewing) return;
    clearScheduledPreview();
    await runPreview(input);
  };

  const handleCreate = async () => {
    const input = buildCreateInput();
    if (!input) return;
    clearScheduledPreview();
    setIsCreating(true);
    try {
      createdRef.current = true;
      previewedRef.current = false;
      setHasPreview(false);
      await onCreate(input);
      onCancel();
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="animax-add-layer-wizard">
      {step === 'type' ? (
        <div className="animax-add-layer-type-grid">
          {(['image', 'text', 'solid'] as const).map((kind) => (
            <button
              type="button"
              key={kind}
              className={['animax-add-layer-type-option', kind].join(' ')}
              onClick={() => chooseKind(kind)}
            >
              <span>{kind === 'image' ? '▧' : kind === 'text' ? 'T' : '■'}</span>
              <strong>{getEditableKindLabel(kind)}</strong>
              <em>
                {kind === 'image' ? '上传图片' : kind === 'text' ? '输入文字内容' : '选择颜色'}
              </em>
            </button>
          ))}
        </div>
      ) : null}

      {step === 'config' && draft.kind ? (
        <div className="animax-add-layer-config">
          <label className="animax-add-layer-label">
            <span>图层名</span>
            <input
              className="animax-editor-input"
              value={draft.name}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, name: event.currentTarget.value }))
              }
              spellCheck={false}
            />
          </label>

          {draft.kind === 'image' ? (
            <>
              <div className="animax-add-layer-upload">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="animax-hidden"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void handleImageFile(file);
                  }}
                />
                <button
                  type="button"
                  className="animax-editor-btn action"
                  onClick={() => imageInputRef.current?.click()}
                >
                  上传图片
                </button>
                <span>
                  {draft.fileName
                    ? `${draft.fileName} · ${draft.width}×${draft.height}`
                    : '选择本地图片作为图层资源'}
                </span>
                {imageError ? <em>{imageError}</em> : null}
              </div>
              <div className="animax-add-layer-size-grid">
                <label className="animax-add-layer-label">
                  <span>宽度</span>
                  <input
                    className="animax-editor-input"
                    type="number"
                    min={1}
                    step={1}
                    value={draft.width}
                    onChange={(event) =>
                      setImageDimension('width', Number(event.currentTarget.value))
                    }
                  />
                </label>
                <label className="animax-add-layer-label">
                  <span>高度</span>
                  <input
                    className="animax-editor-input"
                    type="number"
                    min={1}
                    step={1}
                    value={draft.height}
                    onChange={(event) =>
                      setImageDimension('height', Number(event.currentTarget.value))
                    }
                  />
                </label>
              </div>
            </>
          ) : null}

          {draft.kind === 'text' ? (
            <label className="animax-add-layer-label">
              <span>文字内容</span>
              <input
                className="animax-editor-input"
                value={draft.text}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, text: event.currentTarget.value }))
                }
              />
            </label>
          ) : null}

          {draft.kind === 'solid' ? (
            <div className="animax-add-layer-color">
              <span>颜色</span>
              <div>
                {ADD_LAYER_SWATCHES.map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={[
                      color === 'transparent' ? 'transparent' : '',
                      draft.color === color ? 'active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ '--animax-add-layer-color': color } as React.CSSProperties}
                    onClick={() => setDraft((prev) => ({ ...prev, color }))}
                    aria-label={color === 'transparent' ? '选择透明颜色' : `选择颜色 ${color}`}
                    title={color === 'transparent' ? '透明' : color}
                  />
                ))}
                <input
                  type="color"
                  value={draft.color === 'transparent' ? '#000000' : draft.color}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, color: event.currentTarget.value }))
                  }
                />
              </div>
            </div>
          ) : null}

          <LayerTransformEditor
            title="初始 Transform"
            layerName={draft.name}
            transform={draft.transform}
            onChange={(transform) => setDraft((prev) => ({ ...prev, transform }))}
          />

          <div className="animax-add-layer-actions">
            <button type="button" className="animax-editor-btn" onClick={handleBack}>
              返回
            </button>
            <button
              type="button"
              className="animax-editor-btn"
              disabled={!canCreate || isCreating || isPreviewing}
              onClick={() => void handlePreview()}
            >
              {isPreviewing ? '预览中...' : hasPreview ? '更新预览' : '预览'}
            </button>
            <button
              type="button"
              className="animax-editor-btn action"
              disabled={!canCreate || isCreating || isPreviewing}
              onClick={() => void handleCreate()}
            >
              {isCreating ? '创建中...' : '新增图层'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const LayerBottomSheet: React.FC<{
  title: string;
  subtitle?: string;
  variant?: 'add' | 'edit';
  closing: boolean;
  onRequestClose: () => void;
  onExited: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, variant, closing, onRequestClose, onExited, children }) => {
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(onExited, 240);
    return () => window.clearTimeout(timer);
  }, [closing, onExited]);

  const overlayClassName = ['animax-layer-sheet-overlay', closing ? 'closing' : '', variant ?? '']
    .filter(Boolean)
    .join(' ');
  const sheetClassName = ['animax-layer-sheet', variant ?? ''].filter(Boolean).join(' ');

  return (
    <div
      className={overlayClassName}
      role="presentation"
      onClick={onRequestClose}
      onAnimationEnd={(event) => {
        if (closing && event.animationName === 'animax-layer-sheet-overlay-out') onExited();
      }}
    >
      <section
        className={sheetClassName}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="animax-layer-sheet-head">
          <div>
            <strong>{title}</strong>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
          <button
            type="button"
            className="animax-layer-icon-btn"
            onClick={(event) => {
              event.stopPropagation();
              onRequestClose();
            }}
            aria-label="关闭弹窗"
          >
            ×
          </button>
        </header>
        <div className="animax-layer-sheet-body">{children}</div>
      </section>
    </div>
  );
};

const LayerEditSheet: React.FC<{
  row: LayerRow;
  onPreviewTransform: (row: LayerRow, transform: LayerTransform) => void;
  onCancelPreview: (row: LayerRow) => void;
  onPreviewVisibility: (row: LayerRow, visible: boolean) => void;
  onCancelVisibilityPreview: (row: LayerRow) => void;
  onApply: (
    row: LayerRow,
    nextName: string,
    transform: LayerTransform,
    visible: boolean,
  ) => Promise<boolean>;
  onApplied: () => void;
}> = ({
  row,
  onPreviewTransform,
  onCancelPreview,
  onPreviewVisibility,
  onCancelVisibilityPreview,
  onApply,
  onApplied,
}) => {
  const [nameDraft, setNameDraft] = useState(row.name);
  const [transformDraft, setTransformDraft] = useState<LayerTransform>(row.transform);
  const [visibleDraft, setVisibleDraft] = useState(!row.hidden);
  const [isApplying, setIsApplying] = useState(false);
  const onPreviewTransformRef = useRef(onPreviewTransform);
  const onCancelPreviewRef = useRef(onCancelPreview);
  const onPreviewVisibilityRef = useRef(onPreviewVisibility);
  const onCancelVisibilityPreviewRef = useRef(onCancelVisibilityPreview);
  const isApplyingRef = useRef(false);
  const appliedRef = useRef(false);
  const previewReadyRef = useRef(false);
  const hasPreviewedRef = useRef(false);
  const previewTimerRef = useRef<number | null>(null);
  const visibilityPreviewReadyRef = useRef(false);
  const hasVisibilityPreviewedRef = useRef(false);
  const visibilityPreviewTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onPreviewTransformRef.current = onPreviewTransform;
  }, [onPreviewTransform]);

  useEffect(() => {
    onCancelPreviewRef.current = onCancelPreview;
  }, [onCancelPreview]);

  useEffect(() => {
    onPreviewVisibilityRef.current = onPreviewVisibility;
  }, [onPreviewVisibility]);

  useEffect(() => {
    onCancelVisibilityPreviewRef.current = onCancelVisibilityPreview;
  }, [onCancelVisibilityPreview]);

  useEffect(() => {
    appliedRef.current = false;
    isApplyingRef.current = false;
    previewReadyRef.current = false;
    hasPreviewedRef.current = false;
    visibilityPreviewReadyRef.current = false;
    hasVisibilityPreviewedRef.current = false;
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (visibilityPreviewTimerRef.current !== null) {
      window.clearTimeout(visibilityPreviewTimerRef.current);
      visibilityPreviewTimerRef.current = null;
    }
    setIsApplying(false);
    setNameDraft(row.name);
    setTransformDraft(row.transform);
    setVisibleDraft(!row.hidden);
  }, [row]);

  useEffect(() => {
    if (!previewReadyRef.current) {
      previewReadyRef.current = true;
      return;
    }
    hasPreviewedRef.current = true;
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = window.setTimeout(() => {
      previewTimerRef.current = null;
      onPreviewTransformRef.current(row, transformDraft);
    }, 220);
    return () => {
      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
    };
  }, [row, transformDraft]);

  useEffect(
    () => () => {
      if (!appliedRef.current && !isApplyingRef.current && hasPreviewedRef.current) {
        onCancelPreviewRef.current(row);
      }
      if (!appliedRef.current && !isApplyingRef.current && hasVisibilityPreviewedRef.current) {
        onCancelVisibilityPreviewRef.current(row);
      }
    },
    [row],
  );

  useEffect(() => {
    if (!visibilityPreviewReadyRef.current) {
      visibilityPreviewReadyRef.current = true;
      return;
    }
    hasVisibilityPreviewedRef.current = true;
    if (visibilityPreviewTimerRef.current !== null) {
      window.clearTimeout(visibilityPreviewTimerRef.current);
    }
    visibilityPreviewTimerRef.current = window.setTimeout(() => {
      visibilityPreviewTimerRef.current = null;
      onPreviewVisibilityRef.current(row, visibleDraft);
    }, 140);
    return () => {
      if (visibilityPreviewTimerRef.current !== null) {
        window.clearTimeout(visibilityPreviewTimerRef.current);
        visibilityPreviewTimerRef.current = null;
      }
    };
  }, [row, visibleDraft]);

  const handleApply = async () => {
    if (isApplying) return;
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (visibilityPreviewTimerRef.current !== null) {
      window.clearTimeout(visibilityPreviewTimerRef.current);
      visibilityPreviewTimerRef.current = null;
    }
    setIsApplying(true);
    isApplyingRef.current = true;
    const applied = await onApply(row, nameDraft, transformDraft, visibleDraft);
    isApplyingRef.current = false;
    setIsApplying(false);
    if (!applied) return;
    appliedRef.current = true;
    onApplied();
  };

  return (
    <div className="animax-layer-edit-form">
      <div className="animax-layer-basic-panel">
        <label className="animax-layer-name-row">
          <span>图层名</span>
          <input
            className="animax-editor-input animax-layer-name-input"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.currentTarget.value)}
            spellCheck={false}
          />
        </label>
        <LayerVisibilitySwitch visible={visibleDraft} onChange={setVisibleDraft} />
      </div>
      <LayerTransformEditor
        title="Transform"
        layerName={row.name}
        transform={transformDraft}
        staticState={row.transformStaticState}
        onChange={setTransformDraft}
      />
      <div className="animax-layer-sheet-actions">
        <button
          type="button"
          className="animax-editor-btn action"
          disabled={isApplying}
          onClick={() => void handleApply()}
        >
          {isApplying ? '应用中...' : '应用修改'}
        </button>
      </div>
    </div>
  );
};

interface LayersPanelProps {
  layerRows: LayerRow[];
  activeLayerBoundsKeys: string[];
  layerBoundsOverlays: LayerBoundsOverlay[];
  onToggleBounds: (row: LayerRow) => void;
  onSelectLayer: (row: LayerRow) => void;
  onPreviewCreateLayer: (
    input: CreateEditableLayerInput,
    options?: PreviewEditableLayerOptions,
  ) => Promise<boolean>;
  onCancelCreateLayerPreview: () => void;
  onCreateLayer: (input: CreateEditableLayerInput) => Promise<void>;
  onPreviewLayerTransform: (row: LayerRow, transform: LayerTransform) => void;
  onCancelLayerTransformPreview: (row: LayerRow) => void;
  onPreviewLayerVisibility: (row: LayerRow, visible: boolean) => void;
  onCancelLayerVisibilityPreview: (row: LayerRow) => void;
  onApplyLayerEdit: (
    row: LayerRow,
    nextName: string,
    transform: LayerTransform,
    visible: boolean,
  ) => Promise<boolean>;
}

export const AnimaXLayersPanel: React.FC<LayersPanelProps> = ({
  layerRows,
  activeLayerBoundsKeys,
  layerBoundsOverlays,
  onToggleBounds,
  onSelectLayer,
  onPreviewCreateLayer,
  onCancelCreateLayerPreview,
  onCreateLayer,
  onPreviewLayerTransform,
  onCancelLayerTransformPreview,
  onPreviewLayerVisibility,
  onCancelLayerVisibilityPreview,
  onApplyLayerEdit,
}) => {
  const [layerSearchText, setLayerSearchText] = useState('');
  const [addLayerOpen, setAddLayerOpen] = useState(false);
  const [editingLayerKey, setEditingLayerKey] = useState('');
  const [closingSheet, setClosingSheet] = useState<'add' | 'edit' | ''>('');
  const activeLayerBoundsKeySet = useMemo(
    () => new Set(activeLayerBoundsKeys),
    [activeLayerBoundsKeys],
  );
  const layerBoundsColorMap = useMemo(
    () => new Map(layerBoundsOverlays.map((overlay) => [overlay.layerKey, overlay.color] as const)),
    [layerBoundsOverlays],
  );
  const normalizedLayerSearchText = layerSearchText.trim().toLocaleLowerCase();
  const matchedLayerRows = useMemo(() => {
    if (!normalizedLayerSearchText) return [];
    return layerRows.filter((row) =>
      row.name.toLocaleLowerCase().includes(normalizedLayerSearchText),
    );
  }, [layerRows, normalizedLayerSearchText]);
  const visibleLayerRows = normalizedLayerSearchText ? matchedLayerRows : layerRows;
  const editingLayer = useMemo(
    () => layerRows.find((row) => row.key === editingLayerKey) ?? null,
    [editingLayerKey, layerRows],
  );

  useEffect(() => {
    setLayerSearchText('');
  }, [layerRows]);

  useEffect(() => {
    if (editingLayerKey && !editingLayer) setEditingLayerKey('');
  }, [editingLayer, editingLayerKey]);

  const requestCloseAddLayerSheet = () => {
    if (addLayerOpen && closingSheet !== 'add') {
      onCancelCreateLayerPreview();
      setClosingSheet('add');
    }
  };

  const requestCloseEditSheet = (options: { revertPreview?: boolean } = {}) => {
    if (options.revertPreview !== false && editingLayer) {
      onCancelLayerTransformPreview(editingLayer);
      onCancelLayerVisibilityPreview(editingLayer);
    }
    if (editingLayerKey && closingSheet !== 'edit') setClosingSheet('edit');
  };

  const finishClosingSheet = () => {
    if (closingSheet === 'add') {
      setAddLayerOpen(false);
    }
    if (closingSheet === 'edit') {
      setEditingLayerKey('');
    }
    setClosingSheet('');
  };

  const handleLayerSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && layerSearchText) {
      event.preventDefault();
      setLayerSearchText('');
    }
  };

  const handleLayerSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLayerSearchText(event.currentTarget.value);
  };

  return (
    <div className="animax-editor-panel">
      <div className="animax-editor-section no-head">
        <div className="animax-editor-section-body animax-editor-layer-panel-body">
          <div className="animax-editor-layer-panel-head">
            <button
              type="button"
              className="animax-editor-layer-bounds-toggle animax-editor-add-layer-btn"
              onClick={() => {
                setEditingLayerKey('');
                setClosingSheet('');
                setAddLayerOpen(true);
              }}
            >
              <span className="animax-editor-layer-bounds-icon" aria-hidden="true">
                +
              </span>
              <span>新增图层</span>
            </button>
          </div>
          <div className="animax-editor-resource-list">
            {visibleLayerRows.map((row) => {
              const active = activeLayerBoundsKeySet.has(row.key);
              const activeColor = layerBoundsColorMap.get(row.key);
              const detailTitle = getLayerDetailTitle(row);
              const metaItems: Array<{
                label: string;
                tone:
                  | 'parent'
                  | 'matte'
                  | 'three-d'
                  | 'hidden'
                  | 'stretch'
                  | 'effect'
                  | 'effect-unsupported'
                  | 'state'
                  | 'font-ref';
                title?: string;
              }> = [];
              row.fontNames?.forEach((fontName) => {
                metaItems.push({
                  label: fontName,
                  tone: 'font-ref',
                  title: `该图层文本使用了 ${fontName} 字体`,
                });
              });
              if (row.isMatte) {
                metaItems.push({
                  label: 'Matte',
                  tone: 'matte',
                  title: '该图层是 Track Matte 源图层，不支持定位',
                });
              }
              if (row.parentIndex !== undefined) {
                metaItems.push({
                  label: `Parent #${row.parentIndex}`,
                  tone: 'parent',
                  title: `这个图层继承了 #${row.parentIndex} 图层的 transform 属性`,
                });
              }
              if (row.is3d) {
                metaItems.push({
                  label: '3D',
                  tone: 'three-d',
                  title: '该图层启用了 3D transform',
                });
              }
              if (row.hidden)
                metaItems.push({
                  label: 'Hidden',
                  tone: 'hidden',
                  title: '该图层在 JSON 中标记为隐藏',
                });
              if (hasLayerTimeStretch(row)) {
                metaItems.push({
                  label: `Stretch ${formatLayerFrame(row.timeStretch ?? 1)}x`,
                  tone: 'stretch',
                  title: `该图层 time stretch(sr) 为 ${formatLayerFrame(row.timeStretch ?? 1)}`,
                });
              }
              row.effects
                ?.filter((effect) => effect.kind !== 'unsupported')
                .forEach((effect) => {
                  const label = effect.kind === 'gaussian-blur' ? 'Gaussian Blur' : 'Drop Shadow';
                  metaItems.push({
                    label,
                    tone: 'effect',
                    title: `该图层使用了 ${label} effect，当前支持渲染`,
                  });
                });
              const unsupportedEffects =
                row.effects?.filter((effect) => effect.kind === 'unsupported') ?? [];
              if (unsupportedEffects.length > 0) {
                const effectNames = unsupportedEffects
                  .map((effect) => effect.name || effect.matchName || 'Effect')
                  .join('、');
                metaItems.push({
                  label:
                    unsupportedEffects.length === 1
                      ? 'Unsupported Effect'
                      : `Unsupported Effects ${unsupportedEffects.length}`,
                  tone: 'effect-unsupported',
                  title: `该图层包含暂不支持的 effects：${effectNames}。当前仅支持 Gaussian Blur 和 Drop Shadow。`,
                });
              }
              if (row.matteType !== undefined && row.matteType > 0) {
                metaItems.push({
                  label: getLayerMatteLabel(row),
                  tone: 'matte',
                  title: getLayerMatteTitle(row),
                });
              }

              return (
                <div
                  className={[
                    'animax-editor-resource-card animax-editor-layer-card',
                    active ? 'active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={row.key}
                  style={
                    active && activeColor
                      ? ({ '--animax-layer-bound-color': activeColor } as React.CSSProperties)
                      : undefined
                  }
                >
                  <div className="animax-editor-resource-kind-cell">
                    <span
                      className={[
                        'animax-editor-resource-kind',
                        'animax-editor-layer-kind',
                        getLayerKindTone(row),
                      ].join(' ')}
                    >
                      {row.typeLabel}
                    </span>
                    <span className="animax-editor-resource-size">#{row.index}</span>
                  </div>
                  <div className="animax-editor-resource-main">
                    <div className="animax-editor-resource-title" title={row.name}>
                      {row.name}
                    </div>
                    <div className="animax-editor-layer-detail" title={detailTitle}>
                      <LayerChip
                        label={getLayerFrameRange(row)}
                        tone="frame"
                        tooltip={getLayerFrameRangeTitle(row)}
                      />
                      {row.refId ? (
                        <LayerChip
                          label={row.refId}
                          tone="ref"
                          tooltip={
                            row.typeLabel === '图片'
                              ? `该图层图片引用了 ${row.refId}`
                              : `该图层引用了 ${row.refId}`
                          }
                        />
                      ) : null}
                      {metaItems.map((item) => (
                        <LayerChip
                          key={`${item.tone}:${item.label}`}
                          label={item.label}
                          tone={item.tone}
                          tooltip={item.title ?? item.label}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="animax-editor-resource-action">
                    {!row.isMatte ? (
                      <button
                        type="button"
                        className={
                          active
                            ? 'animax-editor-layer-bounds-toggle active'
                            : 'animax-editor-layer-bounds-toggle'
                        }
                        aria-pressed={active}
                        title={active ? '取消图层定位' : '显示图层定位'}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleBounds(row);
                        }}
                      >
                        <span className="animax-editor-layer-bounds-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="15" height="15">
                            <path
                              d="M12 3v3M12 18v3M3 12h3M18 12h3"
                              fill="none"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeWidth="2"
                            />
                            <circle
                              cx="12"
                              cy="12"
                              r="5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            />
                            <circle cx="12" cy="12" r="1.7" fill="currentColor" />
                          </svg>
                        </span>
                        <span>{active ? '已定位' : '定位'}</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="animax-layer-icon-btn animax-layer-edit-entry"
                      title="编辑图层"
                      aria-label={`编辑图层 ${row.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectLayer(row);
                        setAddLayerOpen(false);
                        setClosingSheet('');
                        setEditingLayerKey(row.key);
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                        <path
                          d="M4 20h4L19 9l-4-4L4 16v4z"
                          fill="none"
                          stroke="currentColor"
                          strokeLinejoin="round"
                          strokeWidth="2"
                        />
                        <path
                          d="M13 7l4 4"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeWidth="2"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
            {visibleLayerRows.length === 0 ? (
              <div className="animax-editor-empty-list">
                {normalizedLayerSearchText ? '没有匹配的图层。' : '未解析到图层。'}
              </div>
            ) : null}
          </div>
          <div className="animax-editor-layer-search">
            <div className="animax-editor-layer-search-input-wrap">
              <input
                className="animax-editor-input animax-editor-layer-search-input"
                value={layerSearchText}
                onChange={handleLayerSearchChange}
                onKeyDown={handleLayerSearchKeyDown}
                placeholder="搜索图层名"
                spellCheck={false}
              />
              {layerSearchText ? (
                <button
                  type="button"
                  className="animax-editor-layer-search-clear"
                  onClick={() => setLayerSearchText('')}
                  aria-label="清空图层搜索"
                >
                  ×
                </button>
              ) : null}
            </div>
            <div className="animax-editor-layer-search-status">
              {normalizedLayerSearchText
                ? `${visibleLayerRows.length} / ${layerRows.length} 个图层`
                : `${layerRows.length} 个图层`}
            </div>
          </div>
          {addLayerOpen ? (
            <LayerBottomSheet
              title="新增图层"
              variant="add"
              closing={closingSheet === 'add'}
              onRequestClose={requestCloseAddLayerSheet}
              onExited={finishClosingSheet}
            >
              <AddLayerWizard
                onCancel={requestCloseAddLayerSheet}
                onPreview={onPreviewCreateLayer}
                onCancelPreview={onCancelCreateLayerPreview}
                onCreate={onCreateLayer}
              />
            </LayerBottomSheet>
          ) : null}
          {editingLayer ? (
            <LayerBottomSheet
              title="编辑图层"
              subtitle={`${editingLayer.typeLabel} · #${editingLayer.index}`}
              variant="edit"
              closing={closingSheet === 'edit'}
              onRequestClose={requestCloseEditSheet}
              onExited={finishClosingSheet}
            >
              <LayerEditSheet
                row={editingLayer}
                onPreviewTransform={onPreviewLayerTransform}
                onCancelPreview={onCancelLayerTransformPreview}
                onPreviewVisibility={onPreviewLayerVisibility}
                onCancelVisibilityPreview={onCancelLayerVisibilityPreview}
                onApply={onApplyLayerEdit}
                onApplied={() => requestCloseEditSheet({ revertPreview: false })}
              />
            </LayerBottomSheet>
          ) : null}
        </div>
      </div>
    </div>
  );
};

interface AssetsPanelProps {
  assetRows: AssetRow[];
  onReplace: (row: AssetRow) => void;
  onReplaceUrl: (row: AssetRow, rawUrl: string) => Promise<void>;
  onReplaceFontStyle: (row: AssetRow, nextStyle: string) => Promise<void>;
}

export const AnimaXAssetsPanel: React.FC<AssetsPanelProps> = ({
  assetRows,
  onReplace,
  onReplaceUrl,
  onReplaceFontStyle,
}) => {
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [urlReplaceRow, setUrlReplaceRow] = useState<AssetRow | null>(null);
  const [urlReplaceValue, setUrlReplaceValue] = useState('');
  const [urlReplaceError, setUrlReplaceError] = useState('');
  const [urlReplacePending, setUrlReplacePending] = useState(false);
  const [styleReplaceRow, setStyleReplaceRow] = useState<AssetRow | null>(null);
  const [styleReplaceValue, setStyleReplaceValue] = useState('');
  const [styleReplaceError, setStyleReplaceError] = useState('');
  const [styleReplacePending, setStyleReplacePending] = useState(false);
  const [replaceMenuKey, setReplaceMenuKey] = useState<string | null>(null);
  const [replaceMenuPlacement, setReplaceMenuPlacement] = useState<'top' | 'bottom'>('bottom');
  const replaceMenuRef = useRef<HTMLDivElement>(null);
  const resourceKindSummary = useMemo(() => {
    const summary = assetRows.reduce(
      (acc, row) => {
        acc[row.kind].count += 1;
        return acc;
      },
      {
        image: { count: 0 },
        font: { count: 0 },
        video: { count: 0 },
      },
    );

    return (['image', 'font', 'video'] as const)
      .map((kind) => ({
        kind,
        label: getResourceSummaryLabel(kind),
        count: summary[kind].count,
      }))
      .filter((item) => item.count > 0);
  }, [assetRows]);

  useEffect(() => {
    if (!replaceMenuKey) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (replaceMenuRef.current?.contains(event.target as Node)) return;
      setReplaceMenuKey(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [replaceMenuKey]);

  const getRowKey = (row: AssetRow) => `${row.kind}:${row.id}`;

  const toggleReplaceMenu = (row: AssetRow, button: HTMLButtonElement) => {
    const rowKey = getRowKey(row);
    if (replaceMenuKey === rowKey) {
      setReplaceMenuKey(null);
      return;
    }

    const rect = button.getBoundingClientRect();
    const scrollContainerBottom =
      button.closest('.animax-editor-section-body')?.getBoundingClientRect().bottom ??
      window.innerHeight;
    const menuHeight = row.kind === 'font' ? 172 : 122;
    const availableBelow = Math.min(window.innerHeight, scrollContainerBottom) - rect.bottom;
    setReplaceMenuPlacement(availableBelow < menuHeight ? 'top' : 'bottom');
    setReplaceMenuKey(rowKey);
  };

  const openUrlReplace = (row: AssetRow) => {
    setReplaceMenuKey(null);
    setUrlReplaceRow(row);
    setUrlReplaceValue('');
    setUrlReplaceError('');
  };

  const closeUrlReplace = () => {
    setUrlReplaceRow(null);
    setUrlReplaceValue('');
    setUrlReplaceError('');
    setUrlReplacePending(false);
  };

  const openStyleReplace = (row: AssetRow) => {
    setReplaceMenuKey(null);
    setStyleReplaceRow(row);
    setStyleReplaceValue(row.style || 'Regular');
    setStyleReplaceError('');
  };

  const closeStyleReplace = () => {
    setStyleReplaceRow(null);
    setStyleReplaceValue('');
    setStyleReplaceError('');
    setStyleReplacePending(false);
  };

  const submitUrlReplace = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!urlReplaceRow || urlReplacePending) return;

    setUrlReplacePending(true);
    setUrlReplaceError('');
    try {
      await onReplaceUrl(urlReplaceRow, urlReplaceValue);
      closeUrlReplace();
    } catch (err) {
      setUrlReplaceError(err instanceof Error ? err.message : String(err));
    } finally {
      setUrlReplacePending(false);
    }
  };

  const submitStyleReplace = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!styleReplaceRow || styleReplacePending) return;

    setStyleReplacePending(true);
    setStyleReplaceError('');
    try {
      await onReplaceFontStyle(styleReplaceRow, styleReplaceValue);
      closeStyleReplace();
    } catch (err) {
      setStyleReplaceError(err instanceof Error ? err.message : String(err));
    } finally {
      setStyleReplacePending(false);
    }
  };

  return (
    <div className="animax-editor-panel">
      <div className="animax-editor-section no-head">
        <div className="animax-editor-section-body">
          {resourceKindSummary.length > 0 && (
            <div className="animax-editor-resource-summary" aria-label="资源统计">
              {resourceKindSummary.map((item) => (
                <span
                  className={[
                    'animax-editor-resource-summary-item',
                    getResourceKindTone(item.kind),
                  ].join(' ')}
                  key={item.kind}
                >
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </span>
              ))}
            </div>
          )}
          <div className="animax-editor-resource-list">
            {assetRows.map((row) => {
              const rowKey = getRowKey(row);
              const kindLabel = getResourceKindLabel(row.kind);
              const uploadActionTitle = row.kind === 'font' ? '文件替换字体' : '上传文件';
              const uploadActionDesc =
                row.kind === 'font'
                  ? '选择本地字体文件，上传后替换当前字体'
                  : `选择本地${kindLabel}，上传后替换当前资源`;
              const urlActionTitle = row.kind === 'font' ? 'URL 替换字体' : '使用 URL';
              const urlActionDesc =
                row.kind === 'font'
                  ? '填写字体文件 URL，校验通过后替换当前字体'
                  : `填写线上${kindLabel}链接，校验通过后替换`;
              const menuOpen = replaceMenuKey === rowKey;

              return (
                <div
                  className={
                    row.kind === 'image' || row.kind === 'video'
                      ? 'animax-editor-resource-card media-card'
                      : 'animax-editor-resource-card'
                  }
                  key={rowKey}
                >
                  <div className="animax-editor-resource-kind-cell">
                    <span
                      className={[
                        'animax-editor-resource-kind',
                        getResourceKindTone(row.kind),
                      ].join(' ')}
                    >
                      {kindLabel}
                    </span>
                    {row.sizeLabel ? (
                      <span className="animax-editor-resource-size">{row.sizeLabel}</span>
                    ) : null}
                  </div>
                  <div className="animax-editor-resource-main">
                    <div className="animax-editor-resource-title" title={row.name}>
                      {row.name}
                    </div>
                    <div className="animax-editor-resource-detail" title={row.detail}>
                      {row.detail}
                    </div>
                    <div className="animax-editor-resource-meta">
                      <div
                        className="animax-resource-replace"
                        ref={menuOpen ? replaceMenuRef : undefined}
                      >
                        <button
                          type="button"
                          className="animax-editor-btn action animax-resource-replace-trigger"
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          onClick={(event) => toggleReplaceMenu(row, event.currentTarget)}
                        >
                          替换
                          <span className="animax-resource-replace-caret" aria-hidden="true">
                            <svg viewBox="0 0 12 12" width="12" height="12">
                              <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" />
                            </svg>
                          </span>
                        </button>
                        {menuOpen ? (
                          <div
                            className={
                              replaceMenuPlacement === 'top'
                                ? 'animax-resource-replace-menu drop-up'
                                : 'animax-resource-replace-menu'
                            }
                            role="menu"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setReplaceMenuKey(null);
                                onReplace(row);
                              }}
                            >
                              <strong>{uploadActionTitle}</strong>
                              <span>{uploadActionDesc}</span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => openUrlReplace(row)}
                            >
                              <strong>{urlActionTitle}</strong>
                              <span>{urlActionDesc}</span>
                            </button>
                            {row.kind === 'font' ? (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => openStyleReplace(row)}
                              >
                                <strong>修改字体 Style</strong>
                                <span>只修改 fStyle，不替换字体文件</span>
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="animax-editor-resource-action">
                    {row.kind === 'font' ? (
                      <span
                        className="animax-editor-origin-pill"
                        data-tooltip={getFontOriginHint(row.origin)}
                      >
                        origin: {row.origin ?? '--'}
                      </span>
                    ) : null}
                    {row.kind === 'image' ? (
                      row.previewUrl ? (
                        <button
                          type="button"
                          className="animax-editor-resource-thumb-btn"
                          onClick={() => setPreviewImageUrl(row.previewUrl ?? null)}
                          title={row.previewUrl}
                          aria-label={`预览图片 ${row.id}`}
                        >
                          <img
                            className="animax-editor-resource-thumb"
                            src={row.previewUrl}
                            alt={row.id}
                          />
                        </button>
                      ) : (
                        <div className="animax-editor-resource-thumb missing">无图片</div>
                      )
                    ) : null}
                    {row.kind === 'video' ? (
                      row.previewUrl ? (
                        <VideoResourceThumbnail
                          src={row.previewUrl}
                          id={row.id}
                          onPreview={() => setPreviewVideoUrl(row.previewUrl ?? null)}
                        />
                      ) : (
                        <div className="animax-editor-resource-thumb missing">无视频</div>
                      )
                    ) : null}
                  </div>
                </div>
              );
            })}
            {assetRows.length === 0 && (
              <div className="animax-editor-empty-list">未解析到资源。</div>
            )}
          </div>
        </div>
      </div>

      {previewImageUrl && (
        <div className="animax-editor-image-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="animax-editor-image-modal-close"
            onClick={() => setPreviewImageUrl(null)}
            aria-label="关闭图片预览"
          >
            ×
          </button>
          <img src={previewImageUrl} alt="资源预览" />
        </div>
      )}

      {previewVideoUrl && (
        <div className="animax-editor-image-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="animax-editor-image-modal-close"
            onClick={() => setPreviewVideoUrl(null)}
            aria-label="关闭视频预览"
          >
            ×
          </button>
          <video
            className="animax-editor-video-modal-player"
            src={previewVideoUrl}
            controls
            autoPlay
            muted
            loop
            playsInline
          />
        </div>
      )}

      {urlReplaceRow && (
        <div
          className="animax-overlay show"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.currentTarget === event.target) closeUrlReplace();
          }}
        >
          <form className="animax-modal animax-resource-url-modal" onSubmit={submitUrlReplace}>
            <div className="animax-modal-head">
              <div className="t">使用 URL 替换{getResourceKindLabel(urlReplaceRow.kind)}</div>
              <button
                type="button"
                className="animax-btn iconBtn ghost"
                onClick={closeUrlReplace}
                aria-label="关闭 URL 替换"
              >
                <span className="animax-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <path
                      d="M18 6L6 18M6 6l12 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </button>
            </div>
            <div className="animax-modal-body">
              <div className="animax-resource-url-target">
                <span>{getResourceKindLabel(urlReplaceRow.kind)}</span>
                <strong title={urlReplaceRow.name}>{urlReplaceRow.name}</strong>
                <em title={urlReplaceRow.id}>{urlReplaceRow.id}</em>
              </div>
              <label className="animax-resource-url-field">
                <span>资源 URL</span>
                <input
                  key={`${urlReplaceRow.kind}:${urlReplaceRow.id}`}
                  className="animax-editor-input animax-editor-inline-input animax-editor-text-input"
                  value={urlReplaceValue}
                  disabled={urlReplacePending}
                  onChange={(event) => {
                    setUrlReplaceValue(event.currentTarget.value);
                    setUrlReplaceError('');
                  }}
                  placeholder={getResourceUrlPlaceholder(urlReplaceRow.kind)}
                  autoFocus
                />
              </label>
              <div className="animax-resource-url-note">
                提交前会先校验链接是否可访问，校验失败不会替换当前资源。
              </div>
              {urlReplaceError ? (
                <div className="animax-resource-url-error">{urlReplaceError}</div>
              ) : null}
            </div>
            <div className="animax-modal-foot">
              <button
                type="button"
                className="animax-editor-btn"
                onClick={closeUrlReplace}
                disabled={urlReplacePending}
              >
                取消
              </button>
              <button
                type="submit"
                className="animax-editor-btn action"
                disabled={urlReplacePending}
              >
                {urlReplacePending ? '校验中...' : '替换'}
              </button>
            </div>
          </form>
        </div>
      )}

      {styleReplaceRow && (
        <div
          className="animax-overlay show"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.currentTarget === event.target) closeStyleReplace();
          }}
        >
          <form className="animax-modal animax-font-style-modal" onSubmit={submitStyleReplace}>
            <div className="animax-modal-head">
              <div className="t">替换字体 Style</div>
              <button
                type="button"
                className="animax-btn iconBtn ghost"
                onClick={closeStyleReplace}
                aria-label="关闭字体 Style 替换"
              >
                <span className="animax-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <path
                      d="M18 6L6 18M6 6l12 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </button>
            </div>
            <div className="animax-modal-body">
              <div className="animax-resource-url-target">
                <span>字体</span>
                <strong title={styleReplaceRow.name}>{styleReplaceRow.name}</strong>
                <em title={styleReplaceRow.id}>{styleReplaceRow.id}</em>
              </div>
              <div className="animax-font-style-current">
                当前 Style：<strong>{styleReplaceRow.style || '--'}</strong>
              </div>
              <div className="animax-font-style-options" role="group" aria-label="字体 Style">
                {getFontStyleOptions(styleReplaceRow.style || styleReplaceValue).map((style) => {
                  const checked = styleReplaceValue === style;
                  return (
                    <label
                      className={
                        checked ? 'animax-font-style-option active' : 'animax-font-style-option'
                      }
                      key={style}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={styleReplacePending}
                        onChange={() => {
                          setStyleReplaceValue(style);
                          setStyleReplaceError('');
                        }}
                      />
                      <span>{style}</span>
                    </label>
                  );
                })}
              </div>
              <div className="animax-resource-url-note">
                提交后只更新 JSON 中的 fStyle，并同步应用到当前播放器。
              </div>
              {styleReplaceError ? (
                <div className="animax-resource-url-error">{styleReplaceError}</div>
              ) : null}
            </div>
            <div className="animax-modal-foot">
              <button
                type="button"
                className="animax-editor-btn"
                onClick={closeStyleReplace}
                disabled={styleReplacePending}
              >
                取消
              </button>
              <button
                type="submit"
                className="animax-editor-btn action"
                disabled={styleReplacePending || !styleReplaceValue}
              >
                {styleReplacePending ? '更新中...' : '替换'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

interface JsonPanelProps {
  jsonEditorText: string;
  previewStatus: JsonPreviewStatus;
  canReset: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}

export const AnimaXJsonPanel: React.FC<JsonPanelProps> = ({
  jsonEditorText,
  previewStatus,
  canReset,
  onChange,
  onReset,
}) => {
  return (
    <AnimaXJsonCodeEditor
      value={jsonEditorText}
      previewStatus={previewStatus}
      canReset={canReset}
      onChange={onChange}
      onReset={onReset}
    />
  );
};
