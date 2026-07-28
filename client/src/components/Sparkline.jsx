import React from 'react';

/**
 * Reusable SVG Sparkline Chart component (pure SVG, 0 external deps).
 * Supports line or bar chart rendering.
 */
const Sparkline = ({
  data = [],
  width = 160,
  height = 40,
  color = 'var(--theme-primary, #0d9488)',
  type = 'line',
  qtyKey = 'qty',
  countKey = 'count',
}) => {
  if (!data || data.length === 0) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--theme-text-muted)' }}>
        No trend data
      </div>
    );
  }

  // Extract numeric series (prefer qty if available, fallback to count)
  const values = data.map(d => (d[qtyKey] !== undefined ? d[qtyKey] : d[countKey] || 0));
  const maxVal = Math.max(...values, 1);
  const minVal = 0;
  const range = maxVal - minVal || 1;

  const padding = 4;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;

  if (type === 'bar') {
    const barWidth = Math.max(2, Math.floor(availableWidth / data.length) - 1);
    return (
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        {values.map((val, i) => {
          const barHeight = Math.max(2, (val / maxVal) * availableHeight);
          const x = padding + i * (barWidth + 1);
          const y = height - padding - barHeight;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill={color}
              rx={1}
              opacity={val > 0 ? 0.85 : 0.25}
            >
              <title>{`${data[i]?.date || ''}: ${val}`}</title>
            </rect>
          );
        })}
      </svg>
    );
  }

  // Line chart path calculation
  const points = values.map((val, i) => {
    const x = padding + (i / Math.max(values.length - 1, 1)) * availableWidth;
    const y = height - padding - ((val - minVal) / range) * availableHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = points.length > 0 ? `M ${points.join(' L ')}` : '';

  // Gradient area path under line
  const areaD = points.length > 0
    ? `M ${points[0].split(',')[0]},${height - padding} L ${points.join(' L ')} L ${points[points.length - 1].split(',')[0]},${height - padding} Z`
    : '';

  const gradientId = `spark-grad-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={areaD} fill={`url(#${gradientId})`} />

      {/* Line stroke */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Endpoint marker */}
      {points.length > 0 && (() => {
        const lastPt = points[points.length - 1].split(',');
        return (
          <circle
            cx={lastPt[0]}
            cy={lastPt[1]}
            r="3"
            fill={color}
            stroke="var(--theme-card-bg, #ffffff)"
            strokeWidth="1.5"
          />
        );
      })()}
    </svg>
  );
};

export default Sparkline;
