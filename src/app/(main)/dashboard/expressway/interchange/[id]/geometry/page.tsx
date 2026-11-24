import type { Metadata } from "next";

import { InterchangeGeometry } from "../_components/interchange-geometry";

export const metadata: Metadata = {
  title: "互通匝道几何 | 高速公路数据",
  description: "查看某个互通下的匝道几何折线，包括线路编码、节点数量、经纬度范围与 GeoJSON。",
};

export default async function GeometryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <InterchangeGeometry interchangeId={id} />;
}
