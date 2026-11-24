"use client";

import { cn } from "cn";

type Position = [number, number];

type GeometryPreviewProps = {
  coordinates: Position[];
  className?: string;
};

const VIEW_WIDTH = 96;
const VIEW_HEIGHT = 56;
const VIEW_PADDING = 6;

/** 把经纬度折线等比缩放到固定画布，纬度向上、经度向右 */
function projectCoordinates(coordinates: Position[]) {
  const lngs = coordinates.map(([lng]) => lng);
  const lats = coordinates.map(([, lat]) => lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const spanLng = maxLng - minLng || 1e-6;
  const spanLat = maxLat - minLat || 1e-6;
  const scale = Math.min((VIEW_WIDTH - VIEW_PADDING * 2) / spanLng, (VIEW_HEIGHT - VIEW_PADDING * 2) / spanLat);
  const offsetX = (VIEW_WIDTH - spanLng * scale) / 2;
  const offsetY = (VIEW_HEIGHT - spanLat * scale) / 2;

  return coordinates.map(([lng, lat]) => [offsetX + (lng - minLng) * scale, offsetY + (maxLat - lat) * scale] as const);
}

export function GeometryPreview({ coordinates, className }: GeometryPreviewProps) {
  if (coordinates.length === 0) {
    return <div className={cn("bg-muted/40 rounded-md", className)} />;
  }

  const points = projectCoordinates(coordinates);
  const first = points[0];
  const last = points[points.length - 1];
  const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      className={cn("text-foreground/70", className)}
      role="img"
      aria-label="匝道几何预览"
      fill="none"
    >
      <path
        d={path}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {first ? <circle cx={first[0]} cy={first[1]} r={2} className="fill-emerald-500" stroke="none" /> : null}
      {last ? <circle cx={last[0]} cy={last[1]} r={2} className="fill-rose-500" stroke="none" /> : null}
    </svg>
  );
}
