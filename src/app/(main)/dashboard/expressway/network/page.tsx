import type { Metadata } from "next";

import { NetworkMap } from "./_components/network-map";

export const metadata: Metadata = {
  title: "路网地图 | 高速公路数据",
  description: "在地图上查看江苏省内全部互通点位与路段线路。",
  alternates: { canonical: "/dashboard/expressway/network" },
};

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl leading-none font-normal tracking-tight">路网地图</h1>
        <p className="text-muted-foreground text-sm">
          显示江苏省内全部互通点位与路段线路，路段来自 expressway_section，通过 expressway_section_road
          关联省内高速筛选。
        </p>
      </div>
      <NetworkMap />
    </div>
  );
}
