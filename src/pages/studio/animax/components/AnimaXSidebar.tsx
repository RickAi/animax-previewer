import React from 'react';

import { useAnimaX } from './AnimaXContext';
import {
  AnimaXAssetsPanel,
  AnimaXJsonPanel,
  AnimaXLayersPanel,
  AnimaXTextPanel,
} from './AnimaXInspectorPanels';

export const AnimaXSidebar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    pushLog,
    jsonEditorText,
    jsonPreviewStatus,
    canResetJsonEditor,
    handleJsonEditorTextChange,
    handleResetJsonEditor,
    textLayerRows,
    layerRows,
    activeLayerBoundsKeys,
    layerBoundsOverlays,
    textDrafts,
    assetRows,
    handleTextDraftChange,
    handleTextLayerUpdate,
    handleToggleLayerBounds,
    handleSelectLayer,
    handlePreviewEditableLayer,
    handleCancelEditableLayerPreview,
    handleCreateEditableLayer,
    handlePreviewLayerTransform,
    handleCancelLayerTransformPreview,
    handlePreviewLayerVisibility,
    handleCancelLayerVisibilityPreview,
    handleApplyLayerEdit,
    handleReplaceResource,
    handleReplaceResourceFromUrl,
    handleReplaceFontStyle,
    dynamicResourceOn,
    handleToggleDynamicResource,
    canApplyDynamicResourceCode,
    dynamicResourceCode,
    setDynamicResourceCode,
  } = useAnimaX();

  return (
    <aside className="animax-side">
      <div className="animax-tabs" id="tabs">
        {/* TODO: 动态资源、性能 TAB 暂时隐藏，等调试能力稳定后再恢复入口。 */}
        {(
          [
            ['layers', '图层', true],
            ['assets', '资源', true],
            ['text', '文本', true],
            ['json', 'JSON', true],
          ] as const
        ).map(([key, label, enabled]) => (
          <button
            key={key}
            type="button"
            className={`${activeTab === key ? 'animax-tab active' : 'animax-tab'}${enabled ? '' : ' soft-disabled'}`}
            onClick={() => {
              if (!enabled) {
                pushLog(`[信息] ${label} 暂未开放`);
                return;
              }
              setActiveTab(key);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="animax-panel">
        <div className={activeTab === 'text' ? 'tabpane' : 'animax-hidden'} data-pane="text">
          <AnimaXTextPanel
            textLayerRows={textLayerRows}
            textDrafts={textDrafts}
            onDraftChange={handleTextDraftChange}
            onUpdate={handleTextLayerUpdate}
          />
        </div>

        <div className={activeTab === 'layers' ? 'tabpane' : 'animax-hidden'} data-pane="layers">
          <AnimaXLayersPanel
            layerRows={layerRows}
            activeLayerBoundsKeys={activeLayerBoundsKeys}
            layerBoundsOverlays={layerBoundsOverlays}
            onToggleBounds={handleToggleLayerBounds}
            onSelectLayer={handleSelectLayer}
            onPreviewCreateLayer={handlePreviewEditableLayer}
            onCancelCreateLayerPreview={handleCancelEditableLayerPreview}
            onCreateLayer={handleCreateEditableLayer}
            onPreviewLayerTransform={handlePreviewLayerTransform}
            onCancelLayerTransformPreview={handleCancelLayerTransformPreview}
            onPreviewLayerVisibility={handlePreviewLayerVisibility}
            onCancelLayerVisibilityPreview={handleCancelLayerVisibilityPreview}
            onApplyLayerEdit={handleApplyLayerEdit}
          />
        </div>

        <div className={activeTab === 'assets' ? 'tabpane' : 'animax-hidden'} data-pane="assets">
          <AnimaXAssetsPanel
            assetRows={assetRows}
            onReplace={handleReplaceResource}
            onReplaceUrl={handleReplaceResourceFromUrl}
            onReplaceFontStyle={handleReplaceFontStyle}
          />
        </div>

        <div className={activeTab === 'json' ? 'tabpane' : 'animax-hidden'} data-pane="json">
          <AnimaXJsonPanel
            jsonEditorText={jsonEditorText}
            previewStatus={jsonPreviewStatus}
            canReset={canResetJsonEditor}
            onChange={handleJsonEditorTextChange}
            onReset={handleResetJsonEditor}
          />
        </div>

        <div className={activeTab === 'script' ? 'tabpane' : 'animax-hidden'} data-pane="script">
          <div className="animax-section">
            <h3>动态资源</h3>
            <div className="subline">动态属性调试</div>

            <div className="animax-editor">
              <div className="toolbar">
                <button
                  type="button"
                  className={dynamicResourceOn ? 'animax-btn small primary' : 'animax-btn small'}
                  onClick={handleToggleDynamicResource}
                  disabled={!dynamicResourceOn && !canApplyDynamicResourceCode}
                >
                  应用下方代码
                </button>
              </div>
              <div className="body">
                <textarea
                  spellCheck={false}
                  value={dynamicResourceCode}
                  onChange={(e) => setDynamicResourceCode(e.currentTarget.value)}
                  placeholder={`调用案例：
animRef.current?.updateTextByLayerName('文本图层', '你好');

API 列表：
updateLayerProperty(layer_type: AnimaXLayerPropertyType, layer_name: string, value: AnimaXValueParam, callback?: AnimaXPropertyCallback): void;
updateTextSizeByLayerName(layerName: string, textSize: number, targetFrame?: number, callback?: AnimaXPropertyCallback): void;
updateTextColorByLayerName(layerName: string, textColor: string, targetFrame?: number, callback?: AnimaXPropertyCallback): boolean;
updateTextByLayerName(layerName: string, newText: string, targetFrame?: number, callback?: AnimaXPropertyCallback): void;
updateImageById(imageId: string, newImageUrl: string): void;
updateVideoById(videoId: string, newVideoUrl: string): void;
updateFontByName(fontName: string, newFontPath: string): void;`}
                />
              </div>
              <div className="animax-statusline">
                状态：{dynamicResourceOn ? '已开启' : '已关闭'}
              </div>
            </div>
          </div>
        </div>

        {/* TODO: 性能面板入口暂时隐藏，后续恢复 TAB 时再启用。 */}
      </div>
    </aside>
  );
};
