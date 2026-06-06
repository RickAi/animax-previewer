import React from 'react';
import { useAnimaX } from './AnimaXContext';

export const AnimaXAlphaZipConvertModal: React.FC = () => {
  const {
    pendingAlphaZipInfo,
    pendingAlphaZipName,
    handleConfirmAlphaZipConversion,
    handleCancelAlphaZipConversion,
  } = useAnimaX();

  const open = Boolean(pendingAlphaZipInfo);
  if (!pendingAlphaZipInfo) return null;

  return (
    <div
      className={open ? 'animax-overlay show' : 'animax-overlay'}
      onClick={(event) => {
        if (event.currentTarget !== event.target) return;
        handleCancelAlphaZipConversion();
      }}
    >
      <div className="animax-modal">
        <div className="animax-modal-head">
          <div className="t">转换 Alpha ZIP</div>
          <button
            type="button"
            className="animax-btn iconBtn ghost"
            onClick={handleCancelAlphaZipConversion}
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
        <div className="animax-modal-body">
          <div className="animax-section">
            <h3>{pendingAlphaZipName}</h3>
            <div className="subline" style={{ marginTop: 8 }}>
              检测到当前 ZIP 是 AlphaPlayer 资源包，Web 预览暂不直接支持，建议先转换成
              animaxLottie 再加载。
            </div>
          </div>
          <div className="animax-section">
            <h3>识别结果</h3>
            <div className="subline" style={{ marginTop: 8 }}>
              场景：{pendingAlphaZipInfo.sceneName}
            </div>
            <div className="subline">尺寸：{pendingAlphaZipInfo.width} x {pendingAlphaZipInfo.height}</div>
            <div className="subline">总帧数：{pendingAlphaZipInfo.totalFrames}</div>
            <div className="subline">视频文件：{pendingAlphaZipInfo.sourceVideoPath}</div>
          </div>
        </div>
        <div className="animax-modal-foot">
          <button type="button" className="animax-btn" onClick={handleCancelAlphaZipConversion}>
            取消
          </button>
          <button
            type="button"
            className="animax-btn primary"
            onClick={handleConfirmAlphaZipConversion}
          >
            转换并加载
          </button>
        </div>
      </div>
    </div>
  );
};
