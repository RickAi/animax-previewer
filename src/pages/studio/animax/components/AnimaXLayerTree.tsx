import React, { useState } from 'react';
import { LayerModel, LayerType, BaseAnimatableValue } from '../../../../utils/lottie-parser';

interface AnimaXLayerTreeProps {
  layers: LayerModel[];
}

const formatValue = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') return val.toFixed(2).replace(/\.00$/, '');
  if (typeof val === 'string') return val;
  if (val.x !== undefined && val.y !== undefined)
    return `${formatValue(val.x)}, ${formatValue(val.y)}`;
  if (Array.isArray(val)) return `[${val.length}]`;
  return JSON.stringify(val);
};

const ChevronIcon: React.FC<{ expanded: boolean; visible?: boolean }> = ({
  expanded,
  visible = true,
}) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    style={{
      transform: expanded ? 'rotate(90deg)' : 'none',
      transition: 'transform 0.1s',
      opacity: visible ? 1 : 0,
      flexShrink: 0,
      fill: 'currentColor',
    }}
  >
    <path
      d="M4 2L8 6L4 10"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PropertyNode: React.FC<{ name: string; value: any; level: number }> = ({
  name,
  value,
  level,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (value === null || value === undefined) return null;

  // Handle Animatable Values
  if (value instanceof BaseAnimatableValue) {
    const isStatic = value.IsStatic();
    const staticVal = isStatic && value.keyframes.length > 0 ? value.keyframes[0].startValue : null;

    // If it's a simple static value, show it inline
    if (isStatic && staticVal) {
      // Extract raw value from BaseValue wrapper if possible
      const raw = (staticVal as any).value !== undefined ? (staticVal as any).value : staticVal;
      return (
        <div
          style={{
            paddingLeft: level * 16 + 16,
            paddingTop: 2,
            paddingBottom: 2,
            fontSize: 12,
            fontFamily: 'var(--animax-mono)',
            color: 'var(--animax-muted)',
            display: 'flex',
            alignItems: 'center',
            height: 20,
          }}
        >
          <span style={{ color: 'var(--animax-text)', marginRight: 6 }}>{name}:</span>{' '}
          {formatValue(raw)}
        </div>
      );
    }

    return (
      <div style={{ paddingLeft: level * 16 }}>
        <div
          onClick={() => setExpanded(!expanded)}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            fontFamily: 'var(--animax-mono)',
            height: 20,
          }}
        >
          <span style={{ color: 'var(--animax-muted)', display: 'flex', alignItems: 'center' }}>
            <ChevronIcon expanded={expanded} />
          </span>
          <span style={{ color: 'var(--animax-accent)' }}>{name}</span>
          <span style={{ color: 'var(--animax-muted)', fontSize: 10 }}>
            {value.keyframes.length} kfs
          </span>
        </div>
        {expanded && (
          <div style={{ paddingLeft: 16, color: 'var(--animax-muted)', fontSize: 11 }}>
            {/* List keyframes or just summary */}
            {value.keyframes
              .map((kf, idx) => (
                <div key={idx} style={{ paddingLeft: 4 }}>
                  Frame {kf.startFrame}: {JSON.stringify(kf.startValue)}
                </div>
              ))
              .slice(0, 5)}
            {value.keyframes.length > 5 && <div style={{ paddingLeft: 4 }}>...</div>}
          </div>
        )}
      </div>
    );
  }

  // Handle Arrays (Shapes, Masks)
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return (
      <div style={{ paddingLeft: level * 16 }}>
        <div
          onClick={() => setExpanded(!expanded)}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            fontFamily: 'var(--animax-mono)',
            height: 20,
          }}
        >
          <span style={{ color: 'var(--animax-muted)', display: 'flex', alignItems: 'center' }}>
            <ChevronIcon expanded={expanded} />
          </span>
          <span>{name}</span>
          <span style={{ color: 'var(--animax-muted)', fontSize: 10 }}>[{value.length}]</span>
        </div>
        {expanded && (
          <div>
            {value.map((item, idx) => (
              <PropertyNode key={idx} name={`${idx}`} value={item} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Handle Objects (Transform, Shape Items)
  if (typeof value === 'object') {
    // For Shapes with 'ty'
    const label = value.ty ? `${value.nm || 'Shape'} (${value.ty})` : name;

    return (
      <div style={{ paddingLeft: level * 16 }}>
        <div
          onClick={() => setExpanded(!expanded)}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            fontFamily: 'var(--animax-mono)',
            height: 20,
          }}
        >
          <span style={{ color: 'var(--animax-muted)', display: 'flex', alignItems: 'center' }}>
            <ChevronIcon expanded={expanded} />
          </span>
          <span>{label}</span>
        </div>
        {expanded && (
          <div>
            {Object.entries(value).map(([k, v]) => {
              if (k === 'ty' || k === 'nm' || k === 'v') return null; // Skip metadata
              return <PropertyNode key={k} name={k} value={v} level={level + 1} />;
            })}
          </div>
        )}
      </div>
    );
  }

  // Primitives
  return (
    <div
      style={{
        paddingLeft: level * 16 + 16,
        paddingTop: 2,
        paddingBottom: 2,
        fontSize: 12,
        fontFamily: 'var(--animax-mono)',
        color: 'var(--animax-muted)',
        display: 'flex',
        alignItems: 'center',
        height: 20,
      }}
    >
      <span style={{ color: 'var(--animax-text)', marginRight: 6 }}>{name}:</span>{' '}
      {formatValue(value)}
    </div>
  );
};

const LayerNode: React.FC<{
  layer: LayerModel;
}> = ({ layer }) => {
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = () => {
    setExpanded(!expanded);
  };

  return (
    <div style={{ userSelect: 'none', borderBottom: '1px solid var(--animax-line)' }}>
      {/* Layer Row */}
      <div
        onClick={toggleExpand}
        style={{
          paddingLeft: 4,
          paddingRight: 8,
          height: 28,
          cursor: 'pointer',
          backgroundColor: expanded ? 'var(--bg-card-hover)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderRadius: 4,
        }}
      >
        <div
          style={{
            color: 'var(--animax-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 16,
            height: 16,
          }}
        >
          <ChevronIcon expanded={expanded} visible={true} />
        </div>

        <span
          style={{
            width: 40,
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--animax-muted)',
            fontFamily: 'var(--animax-mono)',
          }}
        >
          {layer.layerId}
        </span>

        <span
          style={{
            fontSize: 13,
            fontWeight: expanded ? 500 : 400,
            flex: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontFamily: 'var(--animax-mono)',
            paddingLeft: 8,
          }}
        >
          {layer.name || `Layer ${layer.layerId}`}
        </span>

        <span
          style={{
            width: 80,
            fontSize: 12,
            color: 'var(--animax-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {LayerType[layer.layerType]}
        </span>
      </div>

      {/* Property Panel (Only if expanded) */}
      {expanded && (
        <div style={{ padding: '8px 0 8px 12px', background: 'var(--bg-app)' }}>
          <div style={{ marginBottom: 8 }}>
            <PropertyNode name="Name" value={layer.name || `Layer ${layer.layerId}`} level={0} />
            <PropertyNode name="Type" value={LayerType[layer.layerType]} level={0} />
            <PropertyNode name="Layer ID" value={layer.layerId} level={0} />
            <PropertyNode
              name="Parent ID"
              value={layer.parentId !== -1 ? layer.parentId : 'None'}
              level={0}
            />
            <PropertyNode name="In Frame" value={layer.startFrame} level={0} />
            <PropertyNode name="Out Frame" value={layer.endFrame} level={0} />
            {layer.refId && <PropertyNode name="Ref ID" value={layer.refId} level={0} />}
          </div>

          <div style={{ borderTop: '1px solid var(--animax-line)', paddingTop: 8 }}>
            {/* Transform */}
            {layer.transform && <PropertyNode name="Transform" value={layer.transform} level={0} />}
            {/* Masks */}
            {layer.masks && layer.masks.length > 0 && (
              <PropertyNode name="Masks" value={layer.masks} level={0} />
            )}
            {/* Shapes */}
            {layer.shapes && layer.shapes.length > 0 && (
              <PropertyNode name="Shapes" value={layer.shapes} level={0} />
            )}
            {/* Text */}
            {layer.text && <PropertyNode name="Text" value={layer.text} level={0} />}
          </div>
        </div>
      )}
    </div>
  );
};

export const AnimaXLayerTree: React.FC<AnimaXLayerTreeProps> = ({ layers }) => {
  // Flat list sorted by layerId
  const sortedLayers = [...layers].sort((a, b) => a.layerId - b.layerId);

  return (
    <div className="animax-tree-container">
      {sortedLayers.map((layer) => (
        <LayerNode key={layer.layerId} layer={layer} />
      ))}
    </div>
  );
};
