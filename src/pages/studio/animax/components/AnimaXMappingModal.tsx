import React from 'react';
import { useAnimaX } from './AnimaXContext';

export const AnimaXMappingModal: React.FC = () => {
  const { mappingOpen, setMappingOpen } = useAnimaX();

  return (
    <div
      className={mappingOpen ? 'animax-overlay show' : 'animax-overlay'}
      onClick={(e) => {
        if (e.currentTarget !== e.target) return;
        setMappingOpen(false);
      }}
    >
      <div className="animax-modal">
        <div className="animax-modal-head">
          <div className="t">资源映射设置</div>
          <button
            type="button"
            className="animax-btn iconBtn ghost"
            onClick={() => setMappingOpen(false)}
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
            <h3>字体映射 (font_x.ttf)</h3>
            <div className="animax-input">
              <input placeholder="输入本地文件路径或链接..." />
            </div>
            <div className="subline" style={{ marginTop: 8 }}>
              当前状态：<b>缺失</b>
            </div>
          </div>
          <div className="animax-section">
            <h3>图片映射 (img_0.png)</h3>
            <div className="animax-input">
              <input placeholder="输入链接..." />
            </div>
          </div>
        </div>
        <div className="animax-modal-foot">
          <button type="button" className="animax-btn" onClick={() => setMappingOpen(false)}>
            取消
          </button>
          <button
            type="button"
            className="animax-btn primary"
            onClick={() => setMappingOpen(false)}
          >
            保存映射
          </button>
        </div>
      </div>
    </div>
  );
};
