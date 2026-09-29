import React from 'react';
import { useAnimaX } from './AnimaXContext';

const uploadKindLabel = {
  json: 'JSON',
  zip: 'ZIP',
  directory: '目录',
  unsupported: '不支持',
} as const;

export const AnimaXUploadModal: React.FC = () => {
  const [dragActive, setDragActive] = React.useState(false);
  const {
    filePickerRef,
    uploadFilePickerRef,
    uploadDialogOpen,
    pendingUploadSelection,
    uploadDialogError,
    isUploadDialogConfirming,
    isDirectoryUploading,
    handleCloseUploadDialog,
    handleUploadDrop,
    handleConfirmUploadSelection,
  } = useAnimaX();

  if (!uploadDialogOpen) return null;

  const hasSelection = Boolean(pendingUploadSelection);
  const canConfirm =
    Boolean(pendingUploadSelection) &&
    !pendingUploadSelection?.invalidReason &&
    !isDirectoryUploading &&
    !isUploadDialogConfirming;

  const openFilePicker = () => {
    if (isDirectoryUploading || isUploadDialogConfirming) return;
    uploadFilePickerRef.current?.click();
  };

  const openDirectoryPicker = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (isDirectoryUploading || isUploadDialogConfirming) return;
    filePickerRef.current?.click();
  };

  return (
    <div
      className="animax-overlay animax-upload-overlay show"
      onClick={(event) => {
        if (event.currentTarget !== event.target) return;
        handleCloseUploadDialog();
      }}
    >
      <div className="animax-modal animax-upload-modal">
        <div className="animax-modal-head">
          <div className="t">加载文件</div>
          <button
            type="button"
            className="animax-btn iconBtn ghost"
            onClick={handleCloseUploadDialog}
            aria-label="关闭"
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

        <div className="animax-modal-body animax-upload-body">
          <p>文件将保存到云端；持有分享链接的人可以访问。请勿上传机密文件。单文件上限 20 MB；每个用户每日累计上限 200 MB（北京时间零点重置），同一 IP 共享每日限额。</p>
          <div
            role="button"
            tabIndex={0}
            className={[
              'animax-upload-dropzone',
              dragActive ? 'dragging' : '',
              hasSelection ? 'selected' : '',
              uploadDialogError ? 'error' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={openFilePicker}
            onKeyDown={(event) => {
              if (event.currentTarget !== event.target) return;
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              openFilePicker();
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDragActive(false);
              void handleUploadDrop(event.dataTransfer);
            }}
          >
            {pendingUploadSelection ? (
              <div className="animax-upload-selected">
                <span className="animax-upload-file-icon" aria-hidden="true">
                  {pendingUploadSelection.kind === 'directory' ? (
                    <svg viewBox="0 0 24 24" width="34" height="34">
                      <path
                        d="M3.5 6.5h6l1.6 2h9.4v9.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2z"
                        fill="currentColor"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="34" height="34">
                      <path
                        d="M6 3h8l4 4v14H6V3zm7 1.8V8h3.2L13 4.8zM8.8 12h6.4v1.7H8.8V12zm0 3.2h6.4v1.7H8.8v-1.7z"
                        fill="currentColor"
                      />
                    </svg>
                  )}
                </span>
                <span className="animax-upload-kind">
                  {uploadKindLabel[pendingUploadSelection.kind]}
                  {pendingUploadSelection.source === 'drop' ? ' · 拖拽' : ''}
                </span>
                <strong>{pendingUploadSelection.title}</strong>
                <em>{pendingUploadSelection.detail}</em>
                <span className="animax-upload-selected-actions">
                  <button
                    type="button"
                    className="animax-btn small"
                    onClick={(event) => {
                      event.stopPropagation();
                      openFilePicker();
                    }}
                  >
                    重新上传
                  </button>
                </span>
              </div>
            ) : (
              <div className="animax-upload-empty">
                <span className="animax-upload-cloud" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="42" height="42">
                    <path
                      d="M8.5 19h8a4.5 4.5 0 0 0 .4-9A6.1 6.1 0 0 0 5.1 8.3 5.4 5.4 0 0 0 6 19h2.5zm3.5-2V9.8m0 0L8.8 13m3.2-3.2L15.2 13"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <strong>点击选择文件，或拖拽文件/目录到此处</strong>
                <span className="animax-upload-subtitle">
                  支持 .json、.lottie.json、.zip；目录可拖拽或
                  <button
                    type="button"
                    className="animax-upload-inline-action"
                    onClick={openDirectoryPicker}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    选择目录
                  </button>
                </span>
              </div>
            )}
          </div>

          {uploadDialogError ? (
            <div className="animax-upload-error">{uploadDialogError}</div>
          ) : null}
        </div>

        <div className="animax-modal-foot">
          <button
            type="button"
            className="animax-btn"
            disabled={isUploadDialogConfirming}
            onClick={handleCloseUploadDialog}
          >
            取消
          </button>
          <button
            type="button"
            className="animax-btn primary"
            disabled={!canConfirm}
            onClick={() => {
              void handleConfirmUploadSelection();
            }}
          >
            {isUploadDialogConfirming ? '确认中...' : '确定'}
          </button>
        </div>
      </div>
    </div>
  );
};
