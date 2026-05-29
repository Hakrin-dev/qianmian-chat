"use client";

import { useRef, useCallback, useState, useEffect } from "react";

export type RadarAxis = {
  key: string;
  label: string;
  low: string;
  high: string;
};

type Props = {
  axes: RadarAxis[];
  values: Record<string, number>;
  onChange: (key: string, value: number) => void;
  size?: number;
  margin?: number;
  levels?: number;
};

export default function RadarChart({
  axes,
  values,
  onChange,
  size = 280,
  margin = 48,
  levels = 5,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const center = size / 2;
  const radius = center - margin;
  const n = axes.length;

  const angleForIndex = useCallback(
    (i: number) => (2 * Math.PI * i) / n - Math.PI / 2,
    [n],
  );

  const axisPoint = useCallback(
    (i: number, val: number) => {
      const angle = angleForIndex(i);
      const r = (val / 100) * radius;
      return {
        x: center + r * Math.cos(angle),
        y: center + r * Math.sin(angle),
      };
    },
    [angleForIndex, center, radius],
  );

  const polygonPoints = axes
    .map((a, i) => {
      const p = axisPoint(i, values[a.key] ?? 50);
      return `${p.x},${p.y}`;
    })
    .join(" ");

  const gridPolygons = Array.from({ length: levels }, (_, level) => {
    const r = ((level + 1) / levels) * radius;
    const pts = axes
      .map((_, i) => {
        const angle = angleForIndex(i);
        return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
      })
      .join(" ");
    return pts;
  });

  function getValueFromPoint(clientX: number, clientY: number, axisIndex: number): number {
    const svg = svgRef.current;
    if (!svg) return 50;
    const rect = svg.getBoundingClientRect();
    const scaleX = size / rect.width;
    const scaleY = size / rect.height;
    const sx = (clientX - rect.left) * scaleX;
    const sy = (clientY - rect.top) * scaleY;
    const angle = angleForIndex(axisIndex);
    const dx = sx - center;
    const dy = sy - center;
    const proj = ((dx * Math.cos(angle) + dy * Math.sin(angle)) / radius) * 100;
    return Math.round(Math.max(0, Math.min(100, proj)));
  }

  const handlePointerDown = useCallback(
    (axisKey: string, axisIndex: number) =>
      (e: React.PointerEvent) => {
        e.preventDefault();
        (e.target as Element).setPointerCapture?.(e.pointerId);
        setDragging(axisKey);
        const val = getValueFromPoint(e.clientX, e.clientY, axisIndex);
        onChange(axisKey, val);
      },
    [onChange, angleForIndex, center, radius, size],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const idx = axes.findIndex((a) => a.key === dragging);
      if (idx < 0) return;
      const val = getValueFromPoint(e.clientX, e.clientY, idx);
      onChange(dragging, val);
    },
    [dragging, axes, onChange, angleForIndex, center, radius, size],
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onUp = () => setDragging(null);
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [dragging]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${size} ${size}`}
      className="w-full max-w-[280px] touch-none select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Grid polygons */}
      {gridPolygons.map((pts, i) => (
        <polygon
          key={`grid-${i}`}
          points={pts}
          fill="none"
          stroke="rgba(147,51,234,0.12)"
          strokeWidth={1}
        />
      ))}

      {/* Axis lines */}
      {axes.map((_, i) => {
        const p = axisPoint(i, 100);
        return (
          <line
            key={`axis-${i}`}
            x1={center}
            y1={center}
            x2={p.x}
            y2={p.y}
            stroke="rgba(147,51,234,0.2)"
            strokeWidth={1}
          />
        );
      })}

      {/* Value polygon */}
      <polygon
        points={polygonPoints}
        fill="rgba(147,51,234,0.18)"
        stroke="rgba(147,51,234,0.6)"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Draggable handles */}
      {axes.map((a, i) => {
        const p = axisPoint(i, values[a.key] ?? 50);
        const isDragging = dragging === a.key;
        return (
          <g key={`handle-${a.key}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={isDragging ? 10 : 7}
              fill="white"
              stroke={isDragging ? "#7c3aed" : "rgba(147,51,234,0.7)"}
              strokeWidth={2}
              className="cursor-grab transition-[r] duration-150"
              onPointerDown={handlePointerDown(a.key, i)}
            />
            {/* Axis label */}
            <text
              x={axisPoint(i, 118).x}
              y={axisPoint(i, 118).y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-zinc-500 text-[10px]"
              style={{ fontSize: "10px" }}
            >
              {a.label}
            </text>
            {/* Value label on handle */}
            <text
              x={p.x}
              y={p.y - 14}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-purple-700 font-semibold"
              style={{ fontSize: "9px" }}
            >
              {values[a.key] ?? 50}
            </text>
          </g>
        );
      })}

      {/* Low/High labels on outer ring */}
      {axes.map((a, i) => {
        return (
          <text
            key={`label-${a.key}`}
            x={axisPoint(i, 112).x}
            y={axisPoint(i, 112).y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-zinc-300"
            style={{ fontSize: "8px" }}
          >
            {a.low}←→{a.high}
          </text>
        );
      })}
    </svg>
  );
}
