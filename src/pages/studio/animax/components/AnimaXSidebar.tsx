import React from 'react';

import { useAppPreferences } from '../../../../contexts/AppPreferencesContext';
import { useAnimaX } from './AnimaXContext';
import {
  AnimaXAssetsPanel,
  AnimaXJsonPanel,
  AnimaXLayersPanel,
  AnimaXTextPanel,
} from './AnimaXInspectorPanels';

interface AnimaXSidebarProps {
  layout?: 'full' | 'card';
}

export const AnimaXSidebar: React.FC<AnimaXSidebarProps> = ({ layout = 'full' }) => {
  const { t } = useAppPreferences();
  const isCardLayout = layout === 'card';
  const {
    activeTab,
    setActiveTab,
    pushLog,
    src,
    jsonEditorText,
    jsonPreviewStatus,
    jsonSizeBytes,
    canResetJsonEditor,
    handleJsonEditorTextChange,
    handleResetJsonEditor,
    parsedJson,
    composition,
    textLayerRows,
    layerRows,
    activeLayerBoundsKeys,
    layerBoundsOverlays,
    textDrafts,
    assetRows,
    resourceWarningCount,
    isFixingResources,
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
    handleProcessVideoResource,
    handleProbeVideoResource,
    handleApplyProcessedVideoResource,
    handleFixResource,
    handleFixAllResources,
    dynamicResourceOn,
    handleToggleDynamicResource,
    canApplyDynamicResourceCode,
    dynamicResourceCode,
    setDynamicResourceCode,
  } = useAnimaX();

  const tabs = (
    isCardLayout
      ? [
          ['layers', t('animax.sidebar.layers'), true],
          ['assets', t('animax.sidebar.assets'), true],
        ]
      : [
          ['layers', t('animax.sidebar.layers'), true],
          ['assets', t('animax.sidebar.assets'), true],
          ['text', t('animax.sidebar.text'), true],
          ['json', 'JSON', true],
        ]
  ) as readonly (readonly [typeof activeTab, string, boolean])[];

  React.useEffect(() => {
    if (isCardLayout && activeTab !== 'layers' && activeTab !== 'assets') {
      setActiveTab('layers');
    }
  }, [activeTab, isCardLayout, setActiveTab]);

  return (
    <aside className="animax-side">
      <div className="animax-tabs" id="tabs">
        {tabs.map(([key, label, enabled]) => (
          <button
            key={key}
            type="button"
            className={`${activeTab === key ? 'animax-tab active' : 'animax-tab'}${enabled ? '' : ' soft-disabled'}`}
            onClick={() => {
              if (!enabled) {
                pushLog(t('animax.sidebar.tabUnavailable', { label }));
                return;
              }
              setActiveTab(key);
            }}
          >
            {label}
            {key === 'assets' && resourceWarningCount > 0 ? (
              <span className="animax-tab-warning">{resourceWarningCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="animax-panel">
        {activeTab === 'text' ? (
          <div className="tabpane" data-pane="text">
            <AnimaXTextPanel
              textLayerRows={textLayerRows}
              textDrafts={textDrafts}
              onDraftChange={handleTextDraftChange}
              onUpdate={handleTextLayerUpdate}
            />
          </div>
        ) : null}

        {activeTab === 'layers' ? (
          <div className="tabpane" data-pane="layers">
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
        ) : null}

        {activeTab === 'assets' ? (
          <div className="tabpane" data-pane="assets">
            <AnimaXAssetsPanel
              assetRows={assetRows}
              onReplace={handleReplaceResource}
              onReplaceUrl={handleReplaceResourceFromUrl}
              onReplaceFontStyle={handleReplaceFontStyle}
              onProcessVideo={handleProcessVideoResource}
              onProbeVideo={handleProbeVideoResource}
              onApplyProcessedVideo={handleApplyProcessedVideoResource}
              onFixResource={handleFixResource}
              onFixAllResources={handleFixAllResources}
              isFixingResources={isFixingResources}
            />
          </div>
        ) : null}

        {activeTab === 'json' ? (
          <div className="tabpane" data-pane="json">
            <AnimaXJsonPanel
              jsonEditorText={jsonEditorText}
              previewStatus={jsonPreviewStatus}
              canReset={canResetJsonEditor}
              onChange={handleJsonEditorTextChange}
              onReset={handleResetJsonEditor}
            />
          </div>
        ) : null}


        {activeTab === 'script' ? (
          <div className="tabpane" data-pane="script">
            <div className="animax-section">
              <h3>{t('animax.sidebar.dynamicResource')}</h3>
              <div className="subline">{t('animax.sidebar.dynamicDebug')}</div>

              <div className="animax-editor">
                <div className="toolbar">
                  <button
                    type="button"
                    className={dynamicResourceOn ? 'animax-btn small primary' : 'animax-btn small'}
                    onClick={handleToggleDynamicResource}
                    disabled={!dynamicResourceOn && !canApplyDynamicResourceCode}
                  >
                    {t('animax.sidebar.applyCode')}
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
                  {t('animax.sidebar.status')}:
                  {dynamicResourceOn ? t('animax.sidebar.enabled') : t('animax.sidebar.disabled')}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
};
