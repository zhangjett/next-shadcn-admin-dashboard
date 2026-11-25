import type { Metadata } from "next";

import { SectionEditLoader } from "./_components/section-edit-loader";

export const metadata: Metadata = {
  title: "编辑路段 | 高速公路数据",
  description: "修改江苏省高速公路路段的起终点、方向与通行状态。",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <SectionEditLoader id={id} />;
}
