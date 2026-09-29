import React from 'react';
import { useAppPreferences } from '../../../../contexts/AppPreferencesContext';
import { useAnimaX } from './AnimaXContext';

interface AnimaXHeaderProps {
  layout?: 'full' | 'card';
}

export const AnimaXHeader: React.FC<AnimaXHeaderProps> = ({ layout = 'full' }) => {
  const { t } = useAppPreferences();
  const isCardLayout = layout === 'card';
  const [uploadElapsedMs, setUploadElapsedMs] = React.useState(0);
  const {
    filePickerRef,
    uploadFilePickerRef,
    replacementPickerRef,
    handleOpenUploadDialog,
    handleOpenPackageRecords,
    handleOpenRepackDialog,
    canRepack,
    handleSelectUploadDirectory,
    handleSelectUploadFiles,
    handleReplacementFile,
    srcInput,
    setSrcInput,
    handleConfirm,
    canConfirm,
    handleDownloadInputLottie,
    isDownloadingLottie,
    handleLoadRandomLottie,
    canRandomLottie,
    isRandomLottieLoading,
    randomLottieCount,
    handleCopyShareLink,
    handleCopyCardShareLink,
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
  const shouldShowUploadElapsed =
    Boolean(directoryUploadProgress?.startedAt) &&
    (directoryUploadProgress?.phase === 'uploading' || directoryUploadProgress?.phase === 'json');

  React.useEffect(() => {
    if (!shouldShowUploadElapsed || !directoryUploadProgress?.startedAt) {
      setUploadElapsedMs(0);
      return undefined;
    }

    const update = () => {
      setUploadElapsedMs(Math.max(0, performance.now() - directoryUploadProgress.startedAt!));
    };
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [directoryUploadProgress?.startedAt, shouldShowUploadElapsed]);

  const uploadElapsedLabel =
    uploadElapsedMs >= 1000
      ? `${Math.floor(uploadElapsedMs / 1000)}s`
      : `${Math.round(uploadElapsedMs)}ms`;

  return (
    <header className="animax-topbar">
      <div className="animax-row">
        <div className="animax-group animax-topbar-controls">
          {isCardLayout ? null : (
            <button
              type="button"
              className="animax-btn topbar-action file-action"
              disabled={isDirectoryUploading}
              onClick={handleOpenUploadDialog}
            >
              {isDirectoryUploading ? t('animax.header.uploading') : t('animax.header.chooseFile')}
            </button>
          )}
          {isCardLayout ? null : <>
            <button type="button" className="animax-btn topbar-action" onClick={handleOpenPackageRecords}>云端记录</button>
            <button type="button" className="animax-btn topbar-action" disabled={!canRepack || isDirectoryUploading} onClick={handleOpenRepackDialog}>重打包</button>
          </>}
          <input
            ref={filePickerRef}
            type="file"
            className="animax-hidden"
            multiple
            {...({ webkitdirectory: '', directory: '' } as any)}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length === 0) return;
              handleSelectUploadDirectory(files);
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
              handleSelectUploadFiles(files);
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
          {isCardLayout ? null : (
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
                  ? t('animax.header.randomTitleWithCount', { count: randomLottieCount })
                  : t('animax.header.randomTitleEmpty')
              }
            >
              {isRandomLottieLoading
                ? t('animax.header.randomLoading')
                : t('animax.header.randomExample')}
            </button>
          )}
          <div className="animax-input animax-url-input">
            <label>{t('animax.header.urlLabel')}</label>
            <input
              value={srcInput}
              onChange={(e) => setSrcInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm();
              }}
              placeholder={t('animax.header.urlPlaceholder')}
            />
          </div>
          {isCardLayout ? null : (
            <button
              type="button"
              className="animax-btn topbar-action load-action"
              onClick={handleConfirm}
              disabled={!canConfirm || isDirectoryUploading}
            >
              {t('animax.header.load')}
            </button>
          )}
          <button
            type="button"
            className="animax-btn topbar-action download-action iconBtn"
            onClick={() => {
              handleDownloadInputLottie().catch((error) => {
                console.error('[animax] Lottie 下载失败', error);
              });
            }}
            disabled={!canConfirm || isDirectoryUploading || isDownloadingLottie}
            data-tooltip={t('animax.header.downloadTitle')}
            aria-label={t('animax.header.downloadTitle')}
          >
            <span className="animax-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none">
                <path
                  d="M12 4.5v10M7.8 10.8 12 15l4.2-4.2M5 18.5h14"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
          {isCardLayout ? null : (
            <>
              <button
                type="button"
                className="animax-btn topbar-action share-action iconBtn"
                onClick={() => {
                  handleCopyShareLink().catch((error) => {
                    console.error('[animax] 分享链接复制失败', error);
                  });
                }}
                disabled={!canShareSrc}
                data-tooltip={
                  canShareSrc ? t('animax.header.copyShare') : t('animax.header.copyShareDisabled')
                }
                aria-label={t('animax.header.copyShareAria')}
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
              <button
                type="button"
                className="animax-btn topbar-action card-share-action iconBtn"
                onClick={() => {
                  handleCopyCardShareLink().catch((error) => {
                    console.error('[animax] 飞书卡片链接复制失败', error);
                  });
                }}
                disabled={!canShareSrc}
                data-tooltip={
                  canShareSrc
                    ? t('animax.header.copyCardShare')
                    : t('animax.header.copyShareDisabled')
                }
                aria-label={t('animax.header.copyCardShareAria')}
              >
                <span className="animax-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                    <rect
                      x="4.5"
                      y="5.5"
                      width="15"
                      height="13"
                      rx="2.2"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                    <path
                      d="M8 9h8M8 12.3h5.2M8 15.5h7"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </button>
            </>
          )}
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
              {shouldShowUploadElapsed
                ? `${t('animax.header.uploadWaited', { time: uploadElapsedLabel })} · `
                : ''}
              {directoryUploadProgress.completed} / {directoryUploadProgress.total}
            </span>
          </div>
        </div>
      ) : null}
    </header>
  );
};
