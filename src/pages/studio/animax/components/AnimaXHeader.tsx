import React from 'react';
import { useAnimaX } from './AnimaXContext';

export const AnimaXHeader: React.FC = () => {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const pickerRef = React.useRef<HTMLDivElement>(null);
  const {
    filePickerRef,
    uploadFilePickerRef,
    replacementPickerRef,
    handlePickDirectory,
    handlePickFiles,
    handleReplacementFile,
    srcInput,
    setSrcInput,
    handleConfirm,
    canConfirm,
    handleLoadRandomLottie,
    canRandomLottie,
    isRandomLottieLoading,
    randomLottieCount,
    handleRepack,
    canRepack,
    isRepacking,
    handleCopyShareLink,
    canShareSrc,
    directoryUploadProgress,
    isDirectoryUploading,
  } = useAnimaX();
  const uploadPercent = directoryUploadProgress
    ? Math.min(
        100,
        Math.max(
          0,
          Math.round(
            (directoryUploadProgress.completed / Math.max(1, directoryUploadProgress.total)) * 100,
          ),
        ),
      )
    : 0;

  React.useEffect(() => {
    if (!pickerOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (pickerRef.current?.contains(event.target as Node)) return;
      setPickerOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [pickerOpen]);

  return (
    <header className="animax-topbar">
      <div className="animax-row">
        <div className="animax-group animax-topbar-controls">
          <div className="animax-file-picker" ref={pickerRef}>
            <button
              type="button"
              className="animax-btn topbar-action file-action"
              disabled={isDirectoryUploading}
              title="支持目录、纯 .json 和 .zip 的加载；识别到 Alpha ZIP 时会提示转换；含本地资源的 JSON 请选目录"
              aria-haspopup="menu"
              aria-expanded={pickerOpen}
              onClick={() => {
                setPickerOpen((open) => !open);
              }}
            >
              {isDirectoryUploading ? '上传中...' : '选择文件'}
            </button>
            {pickerOpen ? (
              <div className="animax-file-picker-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setPickerOpen(false);
                    filePickerRef.current?.click();
                  }}
                >
                  <strong>选择目录</strong>
                  <span>递归上传目录中的 JSON 和资源</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setPickerOpen(false);
                    uploadFilePickerRef.current?.click();
                  }}
                >
                  <strong>选择纯 JSON / ZIP</strong>
                  <span>Alpha ZIP 会先提示转换，含本地资源的 JSON 请用目录加载</span>
                </button>
              </div>
            ) : null}
          </div>
          <input
            ref={filePickerRef}
            type="file"
            className="animax-hidden"
            multiple
            {...({ webkitdirectory: '', directory: '' } as any)}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length === 0) return;
              handlePickDirectory(files).catch((error) => {
                console.error('[animax] 目录上传失败', error);
              });
              e.currentTarget.value = '';
            }}
          />
          <input
            ref={uploadFilePickerRef}
            type="file"
            className="animax-hidden"
            accept=".json,.lottie.json,.zip,application/json,application/zip"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length === 0) return;
              handlePickFiles(files).catch((error) => {
                console.error('[animax] 文件加载失败', error);
              });
              e.currentTarget.value = '';
            }}
          />
          <input
            ref={replacementPickerRef}
            type="file"
            className="animax-hidden"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (!file) return;
              handleReplacementFile(file).catch((error) => {
                console.error('[animax] 资源替换失败', error);
              });
            }}
          />
          <button
            type="button"
            className="animax-btn topbar-action random-action"
            onClick={() => {
              handleLoadRandomLottie().catch((error) => {
                console.error('[animax] 随机 Lottie 加载失败', error);
              });
            }}
            disabled={!canRandomLottie}
            title={
              randomLottieCount > 0
                ? `从 ${randomLottieCount} 个 Lottie 中随机加载一个`
                : '请先配置 Lottie 资源库'
            }
          >
            {isRandomLottieLoading ? '随机中...' : '随机示例'}
          </button>
          <div className="animax-input animax-url-input">
            <label>链接</label>
            <input
              value={srcInput}
              onChange={(e) => setSrcInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm();
              }}
              placeholder="https://example.com/anim.json 或 https://example.com/bundle.zip"
            />
          </div>
          <button
            type="button"
            className="animax-btn topbar-action load-action"
            onClick={handleConfirm}
            disabled={!canConfirm || isDirectoryUploading}
          >
            加载
          </button>
          <button
            type="button"
            className="animax-btn topbar-action repack-action"
            onClick={() => {
              handleRepack().catch((error) => {
                console.error('[animax] 重打包失败', error);
              });
            }}
            disabled={!canRepack || isDirectoryUploading}
          >
            {isRepacking ? '重打包中...' : '重打包'}
          </button>
          <button
            type="button"
            className="animax-btn topbar-action share-action"
            onClick={() => {
              handleCopyShareLink().catch((error) => {
                console.error('[animax] 分享链接复制失败', error);
              });
            }}
            disabled={!canShareSrc}
            title={canShareSrc ? '复制当前动画的分享链接' : '当前动画没有可分享链接'}
            aria-label="复制分享链接"
          >
            <span className="animax-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                <path
                  d="M8.8 12.7L15.2 16.4M15.2 7.6L8.8 11.3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle cx="6.5" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="17.5" cy="6.3" r="2.4" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="17.5" cy="17.7" r="2.4" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </span>
          </button>
        </div>
      </div>
      {directoryUploadProgress ? (
        <div
          className={`animax-upload-progress ${directoryUploadProgress.phase}`}
          role="status"
          aria-live="polite"
        >
          <div className="animax-upload-progress-head">
            <span>{directoryUploadProgress.title}</span>
            <strong>{uploadPercent}%</strong>
          </div>
          <div className="animax-upload-progress-track">
            <div className="animax-upload-progress-bar" style={{ width: `${uploadPercent}%` }} />
          </div>
          <div className="animax-upload-progress-detail">
            <span>{directoryUploadProgress.detail}</span>
            <span>
              {directoryUploadProgress.completed} / {directoryUploadProgress.total}
            </span>
          </div>
        </div>
      ) : null}
    </header>
  );
};
