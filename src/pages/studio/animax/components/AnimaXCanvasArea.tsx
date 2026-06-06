import React from 'react';
import type { AnimaXViewElement, AnimaXViewProps } from '@animax-js/animax';

import type { CreateEditableLayerInput, LayerBoundsOverlay, LayerRow } from '../toolTypes';
import { estimateOnelineTextSize, formatBytes } from '../toolUtils';
import { useAnimaX } from './AnimaXContext';

const previewBackgroundOptions = [
  { label: '透明', value: 'transparent' },
  { label: '黑', value: '#050505' },
  { label: '白', value: '#ffffff' },
  { label: '灰', value: '#6b7280' },
  { label: '粉', value: '#ff6b9a' },
  { label: '蓝', value: '#2563eb' },
] as const;

const getPreviewPixelRatio = () => {
  const ratio = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
};

const TAP_MISS_DELAY_MS = 320;
const TAP_POPOVER_WIDTH = 280;
const TAP_POPOVER_MAX_HEIGHT = 240;

interface LayerTapHit {
  id: string;
  name: string;
  typeLabel: string;
  index?: number;
  refId?: string;
  row?: LayerRow;
}

interface LayerTapPopup {
  x: number;
  y: number;
  hits: LayerTapHit[];
  empty: boolean;
}

interface RenderedEditableLayerPreview {
  key: string;
  name: string;
  kind: string;
  style: React.CSSProperties;
  textStyle?: React.CSSProperties;
  src?: string;
  text?: string;
  selected: boolean;
}

const clamp = (value: number, min: number, max: number) => {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
};

const getTapMatteLabel = (row: LayerRow) =>
  row.matteLayerIndex !== undefined ? `Matte #${row.matteLayerIndex}` : 'Matte';

const getTapMatteTitle = (row: LayerRow) =>
  row.matteLayerIndex !== undefined
    ? `这个图层使用了 #${row.matteLayerIndex} 图层作为遮罩`
    : '这个图层使用 Track Matte 作为遮罩';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'animax-view': React.DetailedHTMLProps<
        React.HTMLAttributes<AnimaXViewElement>,
        AnimaXViewElement
      > &
        AnimaXViewProps;
    }
  }
}

export const AnimaXCanvasArea: React.FC = () => {
  const [previewBackground, setPreviewBackground] = React.useState('transparent');
  const [customPreviewBackground, setCustomPreviewBackground] = React.useState('#14b8a6');
  const {
    animRef,
    totalFrame,
    durationMs,
    fps,
    jsonSizeBytes,
    bindCanvasRef,
    setIsDraggingFile,
    handleDropFile,
    stageSize,
    animaxViewKey,
    bindAnimRef,
    src,
    previewJsonText,
    loop,
    speed,
    isDraggingFile,
    handleTogglePlay,
    isPaused,
    handleCycleSpeed,
    handleToggleLoop,
    currentFrame,
    handleProgressChange,
    handleScrubStart,
    handleScrubEnd,
    layerRows,
    activeLayerBoundsKeys,
    runtimeReady,
    runtimeError,
    parsedJson,
    layerBoundsOverlays,
    handleToggleLayerBounds,
    selectedLayerKey,
    editableLayerPreview,
    pushLog,
  } = useAnimaX();

  const [layerTapInspectEnabled, setLayerTapInspectEnabled] = React.useState(false);
  const [layerTapPopup, setLayerTapPopup] = React.useState<LayerTapPopup | null>(null);
  const lastTapPointRef = React.useRef<{ x: number; y: number } | null>(null);
  const tapMissTimerRef = React.useRef<number | null>(null);

  const formatDuration = (ms: number | null) => {
    if (!Number.isFinite(ms)) return '--';
    const value = ms as number;
    if (value < 1000) return `${Math.round(value)}ms`;
    return `${(value / 1000).toFixed(2)}s`;
  };

  const formatFps = (value: number | null) => {
    if (!Number.isFinite(value)) return '--';
    return (value as number).toFixed(2);
  };

  const getFpsTone = (value: number | null) => {
    if (!Number.isFinite(value)) return '';
    if ((value as number) < 30) return 'danger';
    if ((value as number) < 55) return 'warning';
    return 'good';
  };

  const displayCurrentFrame = Math.max(0, Math.round(currentFrame));
  const displayTotalFrame = Math.max(0, Math.round(totalFrame));
  const previewSurfaceSize = Math.max(1, Math.round(stageSize * getPreviewPixelRatio()));

  const activePreviewBackground =
    previewBackground === 'custom' ? customPreviewBackground : previewBackground;
  const isTransparentBackground = activePreviewBackground === 'transparent';

  const clearTapMissTimer = React.useCallback(() => {
    if (tapMissTimerRef.current !== null) {
      window.clearTimeout(tapMissTimerRef.current);
      tapMissTimerRef.current = null;
    }
  }, []);

  const layerRowsByName = React.useMemo(() => {
    const map = new Map<string, LayerRow[]>();
    layerRows.forEach((row) => {
      const rows = map.get(row.name);
      if (rows) {
        rows.push(row);
      } else {
        map.set(row.name, [row]);
      }
    });
    return map;
  }, [layerRows]);

  const createLayerTapHits = React.useCallback(
    (names: string[]) =>
      names.flatMap((name, nameIndex) => {
        const matches = layerRowsByName.get(name);
        if (!matches || matches.length === 0) {
          return [
            {
              id: `raw-${nameIndex}-${name}`,
              name,
              typeLabel: '图层',
            },
          ];
        }

        return matches.map((row, matchIndex) => ({
          id: `${row.key}-${nameIndex}-${matchIndex}`,
          name: row.name,
          typeLabel: row.typeLabel,
          index: row.index,
          refId: row.refId,
          row,
        }));
      }),
    [layerRowsByName],
  );

  const getTapPopoverStyle = React.useCallback(
    (popup: LayerTapPopup) =>
      ({
        left: clamp(popup.x + 12, 12, stageSize - TAP_POPOVER_WIDTH - 12),
        top: clamp(popup.y + 12, 12, stageSize - TAP_POPOVER_MAX_HEIGHT - 12),
      }) as React.CSSProperties,
    [stageSize],
  );

  const handleToggleLayerTapInspect = () => {
    setLayerTapInspectEnabled((enabled) => {
      const nextEnabled = !enabled;
      if (!nextEnabled) {
        clearTapMissTimer();
        setLayerTapPopup(null);
        lastTapPointRef.current = null;
      }
      return nextEnabled;
    });
  };

  const handleStageTapCapture = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!layerTapInspectEnabled || !runtimeReady) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('.animax-layer-tap-popover')) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left, 0, rect.width);
      const y = clamp(event.clientY - rect.top, 0, rect.height);
      lastTapPointRef.current = { x, y };
      setLayerTapPopup(null);
      clearTapMissTimer();
      tapMissTimerRef.current = window.setTimeout(() => {
        setLayerTapPopup({ x, y, hits: [], empty: true });
        tapMissTimerRef.current = null;
      }, TAP_MISS_DELAY_MS);
    },
    [clearTapMissTimer, layerTapInspectEnabled, runtimeReady],
  );

  React.useEffect(() => () => clearTapMissTimer(), [clearTapMissTimer]);

  React.useEffect(() => {
    clearTapMissTimer();
    setLayerTapPopup(null);
    lastTapPointRef.current = null;
  }, [animaxViewKey, clearTapMissTimer]);

  React.useEffect(() => {
    if (!layerTapInspectEnabled) {
      clearTapMissTimer();
      setLayerTapPopup(null);
      lastTapPointRef.current = null;
    }
  }, [clearTapMissTimer, layerTapInspectEnabled]);

  React.useEffect(() => {
    const element = animRef.current;
    if (!runtimeReady || !element || !layerTapInspectEnabled) return;

    const handleTapLayers = (event: Event) => {
      const detail = (event as CustomEvent<{ layerList?: unknown }>).detail;
      const layerNames = Array.isArray(detail?.layerList)
        ? detail.layerList
            .filter((item): item is string => typeof item === 'string' && item.length > 0)
            .filter((item, index, array) => array.indexOf(item) === index)
        : [];
      if (layerNames.length === 0) return;

      clearTapMissTimer();
      const point = lastTapPointRef.current ?? { x: stageSize / 2, y: stageSize / 2 };
      const hits = createLayerTapHits(layerNames);
      setLayerTapPopup({ x: point.x, y: point.y, hits, empty: false });
      pushLog(`[信息] 点选命中图层：${layerNames.join('、')}`);
    };

    element.addEventListener('taplayers', handleTapLayers);
    return () => element.removeEventListener('taplayers', handleTapLayers);
  }, [
    animRef,
    animaxViewKey,
    clearTapMissTimer,
    createLayerTapHits,
    layerTapInspectEnabled,
    pushLog,
    runtimeReady,
    stageSize,
  ]);

  const createLayerBoundsStyle = React.useCallback(
    (overlay: LayerBoundsOverlay) => {
      const density = overlay.density || getPreviewPixelRatio();
      const rootWidth = (Number(parsedJson?.w) || 720) * density;
      const rootHeight = (Number(parsedJson?.h) || 720) * density;
      if (
        !Number.isFinite(rootWidth) ||
        !Number.isFinite(rootHeight) ||
        rootWidth <= 0 ||
        rootHeight <= 0
      ) {
        return null;
      }

      const normalizedWidth = Math.abs(overlay.width);
      const normalizedHeight = Math.abs(overlay.height);
      const normalizedX = overlay.width >= 0 ? overlay.x : overlay.x + overlay.width;
      const normalizedY = overlay.height >= 0 ? overlay.y : overlay.y + overlay.height;
      const scale = Math.min(stageSize / rootWidth, stageSize / rootHeight);
      const renderWidth = rootWidth * scale;
      const renderHeight = rootHeight * scale;
      const offsetX = (stageSize - renderWidth) / 2;
      const offsetY = (stageSize - renderHeight) / 2;

      return {
        left: offsetX + normalizedX * scale,
        top: offsetY + normalizedY * scale,
        width: Math.max(1, normalizedWidth * scale),
        height: Math.max(1, normalizedHeight * scale),
        '--animax-layer-bound-color': overlay.color || '#93c5fd',
      } as React.CSSProperties;
    },
    [parsedJson, stageSize],
  );

  const layerBoundsOverlayItems = React.useMemo(
    () =>
      layerBoundsOverlays
        .map((overlay) => ({
          overlay,
          style: createLayerBoundsStyle(overlay),
        }))
        .filter((item): item is { overlay: LayerBoundsOverlay; style: React.CSSProperties } =>
          Boolean(item.style),
        ),
    [createLayerBoundsStyle, layerBoundsOverlays],
  );

  const editableLayerPreviews = React.useMemo<RenderedEditableLayerPreview[]>(() => {
    const rootWidth = Number(parsedJson?.w) || 720;
    const rootHeight = Number(parsedJson?.h) || 720;
    if (
      !Number.isFinite(rootWidth) ||
      !Number.isFinite(rootHeight) ||
      rootWidth <= 0 ||
      rootHeight <= 0
    ) {
      return [];
    }

    const renderScale = Math.min(stageSize / rootWidth, stageSize / rootHeight);
    const renderWidth = rootWidth * renderScale;
    const renderHeight = rootHeight * renderScale;
    const offsetX = (stageSize - renderWidth) / 2;
    const offsetY = (stageSize - renderHeight) / 2;
    const previews: RenderedEditableLayerPreview[] = [];
    const createPreviewStyle = (
      transform: CreateEditableLayerInput['transform'],
      layerWidth: number,
      layerHeight: number,
      zIndex: number,
    ) =>
      ({
        left: offsetX + (transform.positionX - transform.anchorX) * renderScale,
        top: offsetY + (transform.positionY - transform.anchorY) * renderScale,
        width: layerWidth * renderScale,
        height: layerHeight * renderScale,
        opacity: Math.max(0, Math.min(100, transform.opacity)) / 100,
        transform: `rotate(${transform.rotation}deg) scale(${transform.scaleX / 100}, ${
          transform.scaleY / 100
        })`,
        transformOrigin: `${transform.anchorX * renderScale}px ${
          transform.anchorY * renderScale
        }px`,
        zIndex,
      }) as React.CSSProperties;

    if (editableLayerPreview) {
      const { input } = editableLayerPreview;
      const previewZIndex = 4 + layerRows.length;

      if (input.kind === 'text') {
        const fontSize = 64;
        const textSize = estimateOnelineTextSize(input.text, fontSize);
        previews.push({
          key: editableLayerPreview.key,
          name: editableLayerPreview.name,
          kind: input.kind,
          style: createPreviewStyle(
            input.transform,
            textSize.width,
            textSize.height,
            previewZIndex,
          ),
          text: input.text,
          textStyle: {
            color: '#ffffff',
            fontFamily: 'Noto Sans SC, sans-serif',
            fontSize: fontSize * renderScale,
            lineHeight: `${textSize.height * renderScale}px`,
          },
          selected: selectedLayerKey === editableLayerPreview.key,
        });
      } else if (input.kind === 'image') {
        previews.push({
          key: editableLayerPreview.key,
          name: editableLayerPreview.name,
          kind: input.kind,
          style: createPreviewStyle(input.transform, input.width, input.height, previewZIndex),
          src: input.dataUrl,
          selected: selectedLayerKey === editableLayerPreview.key,
        });
      } else {
        const layerWidth = Math.max(1, Number(input.width) || rootWidth);
        const layerHeight = Math.max(1, Number(input.height) || rootHeight);
        previews.push({
          key: editableLayerPreview.key,
          name: editableLayerPreview.name,
          kind: input.kind,
          style: {
            ...createPreviewStyle(input.transform, layerWidth, layerHeight, previewZIndex),
            backgroundColor:
              input.color.trim().toLowerCase() === 'transparent' ? 'transparent' : input.color,
          },
          selected: selectedLayerKey === editableLayerPreview.key,
        });
      }
    }

    return previews;
  }, [editableLayerPreview, layerRows, parsedJson, selectedLayerKey, stageSize]);

  const layerTapPopupStyle = React.useMemo(
    () => (layerTapPopup ? getTapPopoverStyle(layerTapPopup) : undefined),
    [getTapPopoverStyle, layerTapPopup],
  );

  return (
    <section className="animax-canvas-area">
      <div className="animax-canvas-toolbar">
        <div className="animax-canvas-toolbar-metrics">
          <div className="animax-chip">
            帧数：<strong className="animax-mono">{Math.round(totalFrame)}</strong>
          </div>
          <div className="animax-chip">
            时长：<strong className="animax-mono">{formatDuration(durationMs)}</strong>
          </div>
          <div className={['animax-chip', 'animax-fps-chip', getFpsTone(fps)].join(' ').trim()}>
            FPS：<strong className="animax-mono">{formatFps(fps)}</strong>
          </div>
        </div>
        <button
          type="button"
          className={
            layerTapInspectEnabled ? 'animax-btn canvas-mode active' : 'animax-btn canvas-mode'
          }
          onClick={handleToggleLayerTapInspect}
          disabled={!runtimeReady}
          aria-pressed={layerTapInspectEnabled}
          title={layerTapInspectEnabled ? '关闭点选图层' : '点击动画内容查看命中的图层'}
        >
          <span className="animax-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="15" height="15">
              <path
                d="M12 3v3M12 18v3M3 12h3M18 12h3"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
              <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="12" r="1.7" fill="currentColor" />
            </svg>
          </span>
          点选图层
        </button>
        <div className="animax-canvas-toolbar-spacer" />
        <div className="animax-preview-bg-control" aria-label="预览背景色">
          <span className="animax-preview-bg-label">背景</span>
          <div className="animax-preview-bg-swatches">
            {previewBackgroundOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  previewBackground === option.value
                    ? 'animax-preview-bg-swatch active'
                    : 'animax-preview-bg-swatch'
                }
                style={
                  option.value === 'transparent'
                    ? undefined
                    : ({ '--animax-swatch-color': option.value } as React.CSSProperties)
                }
                onClick={() => setPreviewBackground(option.value)}
                title={`背景：${option.label}`}
                aria-label={`背景：${option.label}`}
              />
            ))}
            <label
              className={
                previewBackground === 'custom'
                  ? 'animax-preview-bg-swatch custom active'
                  : 'animax-preview-bg-swatch custom'
              }
              style={{ '--animax-swatch-color': customPreviewBackground } as React.CSSProperties}
              title="自定义背景"
              aria-label="自定义背景"
            >
              <input
                type="color"
                value={customPreviewBackground}
                onClick={() => setPreviewBackground('custom')}
                onChange={(e) => {
                  setCustomPreviewBackground(e.currentTarget.value);
                  setPreviewBackground('custom');
                }}
              />
            </label>
          </div>
        </div>
        <div className="animax-chip animax-json-size-chip">
          JSON 大小：<strong className="animax-mono">{formatBytes(jsonSizeBytes)}</strong>
        </div>
      </div>

      <div
        className={isTransparentBackground ? 'animax-canvas' : 'animax-canvas solid-bg'}
        style={
          isTransparentBackground
            ? undefined
            : ({ '--animax-preview-bg': activePreviewBackground } as React.CSSProperties)
        }
        ref={bindCanvasRef}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingFile(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingFile(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingFile(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingFile(false);
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          handleDropFile(file);
        }}
      >
        <div className="animax-canvas-inner">
          <div
            className={
              layerTapInspectEnabled ? 'animax-canvas-stage tap-inspect' : 'animax-canvas-stage'
            }
            style={{ width: stageSize, height: stageSize }}
            onClickCapture={handleStageTapCapture}
          >
            {runtimeReady ? (
              <animax-view
                id="animax-view"
                key={animaxViewKey}
                ref={bindAnimRef}
                src={previewJsonText ? undefined : src}
                json={previewJsonText || undefined}
                width={previewSurfaceSize}
                height={previewSurfaceSize}
                loop={loop}
                speed={speed}
                autoplay={false}
                fps-event-interval={1000}
                dynamic-resource={true}
                objectfit="contain"
                style={{ display: 'block', width: '100%', height: '100%' }}
              />
            ) : (
              <div className="animax-runtime-placeholder" role="status">
                <strong>{runtimeError ? '运行时初始化失败' : '正在准备运行时资源'}</strong>
                <span>{runtimeError || '等待字体、Textra 与视频模块加载完成'}</span>
              </div>
            )}
            {editableLayerPreviews.map((preview) => (
              <div
                key={preview.key}
                className={
                  preview.selected
                    ? `animax-editable-layer-preview ${preview.kind} selected`
                    : `animax-editable-layer-preview ${preview.kind}`
                }
                style={preview.style}
              >
                {preview.kind === 'text' ? (
                  <span style={preview.textStyle}>{preview.text}</span>
                ) : preview.src ? (
                  <img src={preview.src} alt="" draggable={false} />
                ) : null}
                {preview.selected ? <em>{preview.name}</em> : null}
              </div>
            ))}
            {layerBoundsOverlayItems.map(({ overlay, style }) => (
              <div className="animax-layer-bounds-overlay" style={style} key={overlay.layerKey}>
                <span title={overlay.layerName}>{overlay.layerName}</span>
              </div>
            ))}
            {layerTapInspectEnabled ? (
              <div className="animax-layer-tap-hint">点击动画内容查看图层</div>
            ) : null}
            {layerTapPopup ? (
              <>
                <div
                  className={
                    layerTapPopup.empty
                      ? 'animax-layer-tap-marker empty'
                      : 'animax-layer-tap-marker'
                  }
                  style={{ left: layerTapPopup.x, top: layerTapPopup.y }}
                />
                <div
                  className="animax-layer-tap-popover"
                  style={layerTapPopupStyle}
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <div className="animax-layer-tap-popover-head">
                    <span>{layerTapPopup.empty ? '未命中图层' : '命中图层'}</span>
                    <button
                      type="button"
                      className="animax-layer-tap-close"
                      onClick={() => setLayerTapPopup(null)}
                      aria-label="关闭点选结果"
                      title="关闭"
                    >
                      ×
                    </button>
                  </div>
                  {layerTapPopup.empty ? (
                    <div className="animax-layer-tap-empty">这个位置没有可点选图层。</div>
                  ) : (
                    <div className="animax-layer-tap-list">
                      {layerTapPopup.hits.map((hit) => {
                        const located = hit.row
                          ? activeLayerBoundsKeys.includes(hit.row.key)
                          : false;
                        return (
                          <div className="animax-layer-tap-item" key={hit.id}>
                            <span className="animax-layer-tap-kind">{hit.typeLabel}</span>
                            <div className="animax-layer-tap-main">
                              <strong title={hit.name}>{hit.name}</strong>
                              <div className="animax-layer-tap-meta">
                                {hit.index !== undefined ? <span>#{hit.index}</span> : null}
                                {hit.refId ? <span>{hit.refId}</span> : null}
                                {hit.row?.isMatte ? (
                                  <span title="该图层是 Track Matte 源图层，不支持定位">
                                    {getTapMatteLabel(hit.row)}
                                  </span>
                                ) : null}
                                {hit.row?.matteType !== undefined && hit.row.matteType > 0 ? (
                                  <span title={getTapMatteTitle(hit.row)}>
                                    {getTapMatteLabel(hit.row)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            {hit.row && !hit.row.isMatte ? (
                              <button
                                type="button"
                                className={
                                  located
                                    ? 'animax-layer-tap-locate active'
                                    : 'animax-layer-tap-locate'
                                }
                                onClick={() => handleToggleLayerBounds(hit.row as LayerRow)}
                                title={located ? '取消定位' : '定位图层'}
                                aria-label={located ? '取消定位图层' : '定位图层'}
                              >
                                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
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
                                </svg>
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
        {isDraggingFile ? (
          <>
            <div className="animax-highlight"></div>
          </>
        ) : null}

        <div className="animax-canvas-progress">
          <div className="animax-progress-controls">
            <button
              type="button"
              className="animax-btn primary iconBtn"
              onClick={handleTogglePlay}
              disabled={!runtimeReady}
              aria-label={isPaused ? '播放' : '暂停'}
              title={isPaused ? '播放' : '暂停'}
            >
              {isPaused ? (
                <span className="animax-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path d="M8 5v14l12-7z" fill="currentColor" />
                  </svg>
                </span>
              ) : (
                <span className="animax-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
                  </svg>
                </span>
              )}
            </button>
            <button
              type="button"
              className="animax-btn speedBtn"
              onClick={handleCycleSpeed}
              aria-label="切换播放速度"
              title="切换播放速度"
            >
              x{speed.toFixed(1)}
            </button>
            <button
              type="button"
              className={loop ? 'animax-btn primary iconBtn' : 'animax-btn iconBtn'}
              onClick={handleToggleLoop}
              aria-label={loop ? '关闭循环' : '开启循环'}
              title={loop ? '关闭循环' : '开启循环'}
            >
              <span className="animax-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path
                    d="M7 7h10a3 3 0 0 1 3 3v2h-2v-2a1 1 0 0 0-1-1H7v3L3 8l4-4v3zm10 10H7a3 3 0 0 1-3-3v-2h2v2a1 1 0 0 0 1 1h10v-3l4 4-4 4v-3z"
                    fill="currentColor"
                  />
                </svg>
              </span>
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, totalFrame - 1)}
            value={Math.min(currentFrame, Math.max(0, totalFrame - 1))}
            disabled={!runtimeReady}
            onChange={(e) => handleProgressChange(Number(e.currentTarget.value))}
            onPointerDown={handleScrubStart}
            onPointerUp={handleScrubEnd}
            onPointerCancel={handleScrubEnd}
          />
          <div className="animax-frame-indicator" aria-label="播放帧信息">
            <strong>
              {displayCurrentFrame}
              <span>/</span>
              {displayTotalFrame}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
};
