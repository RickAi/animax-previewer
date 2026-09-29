import React from 'react';
import { useAnimaX } from './AnimaXContext';

const PACKAGE_RECORDS_ANIMATION_MS = 220;

const getShortUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const tail = parts.slice(-3).join('/');
    return `${parsed.host}/${tail || parts[parts.length - 1] || ''}`;
  } catch {
    return url;
  }
};

const formatPackageRecordTime = (createdAt?: number) => {
  if (!Number.isFinite(createdAt)) return '未知时间';
  const date = new Date(createdAt as number);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

export const AnimaXPackageRecordsModal: React.FC = () => {
  const {
    packageRecordsOpen,
    packageRecords,
    src,
    handleClosePackageRecords,
    handleLoadPackageRecord,
    handleCopyPackageRecordShareLink,
    handleRemovePackageRecord,
  } = useAnimaX();
  const [query, setQuery] = React.useState('');
  const [shouldRender, setShouldRender] = React.useState(packageRecordsOpen);
  const [isClosing, setIsClosing] = React.useState(false);

  React.useEffect(() => {
    if (!packageRecordsOpen) return;
    setQuery('');
  }, [packageRecordsOpen]);

  React.useEffect(() => {
    if (packageRecordsOpen) {
      setShouldRender(true);
      setIsClosing(false);
      return undefined;
    }

    if (!shouldRender) return undefined;

    setIsClosing(true);
    const timer = window.setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
    }, PACKAGE_RECORDS_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [packageRecordsOpen, shouldRender]);

  if (!shouldRender) return null;

  const keyword = query.trim().toLowerCase();
  const filteredRecords = keyword
    ? packageRecords.filter(
        (item) =>
          item.fileName.toLowerCase().includes(keyword) || item.url.toLowerCase().includes(keyword),
      )
    : packageRecords;

  return (
    <div
      className={`animax-overlay animax-upload-overlay animax-package-records-overlay show ${
        isClosing ? 'closing' : 'opening'
      }`}
      onClick={(event) => {
        if (event.currentTarget !== event.target) return;
        handleClosePackageRecords();
      }}
    >
      <div className="animax-modal animax-upload-modal animax-package-records-modal">
        <div className="animax-modal-head">
          <div>
            <div className="t">打包记录</div>
            <div className="animax-repack-subtitle">上传后自动保存到云端；仅显示当前浏览器会话的记录。清除浏览器站点数据后将无法找回列表，请保留分享链接。</div>
          </div>
          <button
            type="button"
            className="animax-btn iconBtn ghost"
            onClick={handleClosePackageRecords}
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

        <div className="animax-modal-body animax-package-records-body">
          <input
            className="animax-package-records-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索链接或文件名"
          />

          <div className="animax-package-records-list">
            {filteredRecords.length > 0 ? (
              filteredRecords.map((item) => (
                <div
                  key={item.url}
                  role="button"
                  tabIndex={0}
                  className={`animax-package-record ${src === item.url ? 'active' : ''}`}
                  onClick={() => {
                    void handleLoadPackageRecord(item.url);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    void handleLoadPackageRecord(item.url);
                  }}
                >
                  <div className="animax-package-record-main">
                    <strong>{item.fileName}</strong>
                    <em title={item.url}>{getShortUrl(item.url)}</em>
                    <span>{formatPackageRecordTime(item.createdAt)}</span>
                  </div>
                  <div className="animax-package-record-actions">
                    <button
                      type="button"
                      className="animax-btn iconBtn small"
                      title="复制分享链接"
                      aria-label={`复制 ${item.fileName} 的分享链接`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleCopyPackageRecordShareLink(item.url);
                      }}
                    >
                      <span className="animax-icon">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                          <path
                            d="M8.8 12.7L15.2 16.4M15.2 7.6L8.8 11.3"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                          <circle
                            cx="6.5"
                            cy="12"
                            r="2.4"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          />
                          <circle
                            cx="17.5"
                            cy="6.3"
                            r="2.4"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          />
                          <circle
                            cx="17.5"
                            cy="17.7"
                            r="2.4"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          />
                        </svg>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="animax-btn iconBtn small danger"
                      title="隐藏记录（不删除文件）"
                      aria-label={`隐藏 ${item.fileName}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRemovePackageRecord(item.url);
                      }}
                    >
                      <span className="animax-icon">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                          <path
                            d="M9 6h6m-7 3v9.5A1.5 1.5 0 0 0 9.5 20h5a1.5 1.5 0 0 0 1.5-1.5V9M10 6l.6-2h2.8L14 6"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="animax-package-records-empty">
                {packageRecords.length === 0 ? '暂无打包记录' : '没有匹配的打包记录'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
