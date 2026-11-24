import type { Metadata } from "next";

import { InterchangeTable } from "./_components/interchange-table";

export const metadata: Metadata = {
  title: "互通 | 高速公路数据",
  description: "查看高速公路互通与枢纽节点，包括编码、类型、所属行政区与经纬度坐标。",
  alternates: { canonical: "/dashboard/expressway/interchange" },
};

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl leading-none font-normal tracking-tight">互通</h1>
        <p className="text-muted-foreground text-sm">
          高速公路互通与枢纽节点主数据，来自 expressway_interchange 表，当前仅展示江苏省（行政区划代码 32 开头）。坐标为
          GCJ02（火星坐标系）。
        </p>
      </div>
      <InterchangeTable />
    </div>
  );
}
