import React from 'react';
import { useAnimaX } from './AnimaXContext';

export const AnimaXRepackModal: React.FC = () => {
  const { src, isRepacking, repackDialogOpen, handleCloseRepackDialog, handleRepack } = useAnimaX();
  const [exportLocal, setExportLocal] = React.useState(true);
  const [uploadCdn, setUploadCdn] = React.useState(false);

  React.useEffect(() => {
    if (!repackDialogOpen) return;
    setExportLocal(true);
    setUploadCdn(false);
  }, [repackDialogOpen]);

  if (!repackDialogOpen) return null;

  const canSubmit = !isRepacking && (exportLocal || uploadCdn);
  const sourceLabel = src.trim() || '当前 JSON';

  return (
    <div
      className="animax-overlay animax-upload-overlay show"
      onClick={(event) => {
        if (event.currentTarget !== event.target) return;
        handleCloseRepackDialog();
      }}
    >
      <div className="animax-modal animax-upload-modal animax-repack-modal">
        <div className="animax-modal-head">
          <div>
            <div className="t">重打包设置</div>
            <div className="animax-repack-subtitle">选择产物输出方式</div>
          </div>
          <button
            type="button"
            className="animax-btn iconBtn ghost"
            onClick={handleCloseRepackDialog}
            aria-label="关闭"
            disabled={isRepacking}
          >
            <span className="animax-icon">
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

        <div className="animax-modal-body animax-repack-body">
          <div className="animax-repack-source">
            <span>源文件</span>
            <strong title={sourceLabel}>{sourceLabel}</strong>
          </div>

          <label className={`animax-repack-option ${exportLocal ? 'selected' : ''}`}>
            <input
              type="checkbox"
              checked={exportLocal}
              disabled={isRepacking}
              onChange={(event) => setExportLocal(event.target.checked)}
            />
            <span className="animax-repack-checkbox" aria-hidden="true" />
            <span className="animax-repack-option-copy">
              <strong>本地导出产物</strong>
              <em>生成本地 JSON / 资源产物包</em>
            </span>
          </label>

          <label className={`animax-repack-option ${uploadCdn ? 'selected' : ''}`}>
            <input
              type="checkbox"
              checked={uploadCdn}
              disabled={isRepacking}
              onChange={(event) => setUploadCdn(event.target.checked)}
            />
            <span className="animax-repack-checkbox" aria-hidden="true" />
            <span className="animax-repack-option-copy">
              <strong>上传 CDN</strong>
              <em>上传成功后写入历史记录，并复制分享链接到剪切板</em>
            </span>
          </label>
        </div>

        <div className="animax-modal-foot">
          <button
            type="button"
            className="animax-btn"
            disabled={isRepacking}
            onClick={handleCloseRepackDialog}
          >
            取消
          </button>
          <button
            type="button"
            className="animax-btn primary"
            disabled={!canSubmit}
            onClick={() => {
              void handleRepack({ exportLocal, uploadCdn })
                .then(() => {
                  handleCloseRepackDialog();
                })
                .catch(() => {
                  // Error toast and log are emitted by handleRepack.
                });
            }}
          >
            {isRepacking ? '重打包中...' : '开始重打包'}
          </button>
        </div>
      </div>
    </div>
  );
};
