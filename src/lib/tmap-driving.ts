import Decimal from "decimal.js";

/** 解码腾讯地图压缩坐标：首点为绝对坐标，其后每两位为相对前一点的偏移 */
export function decodePolyline(coors: number[]): [number, number][] {
  const kr = 1_000_000;
  const points = [...coors];

  for (let i = 2; i < points.length; i++) {
    const previous = new Decimal(points[i - 2]);
    const offset = new Decimal(points[i]).dividedBy(kr);
    points[i] = previous.plus(offset).toNumber();
  }

  const path: [number, number][] = [];
  for (let i = 0; i < points.length; i += 2) {
    path.push([points[i], points[i + 1]]);
  }

  return path;
}

/**
 * 调本地代理 /api/map/driving（服务端转发腾讯地图驾车路线规划），返回解码后的 [lat, lng] 序列。
 * 注意这是 GCJ02 坐标。
 */
export async function fetchDrivingRoute(url: string): Promise<[number, number][]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());

  const { routes }: { routes: { polyline: number[] }[] } = await res.json();
  if (!routes[0]?.polyline) throw new Error("no polyline");

  return decodePolyline(routes[0].polyline);
}
