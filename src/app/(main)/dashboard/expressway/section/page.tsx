import type { Metadata } from "next";

import { SectionTable } from "./_components/section-table";

export const metadata: Metadata = {
  title: "路段 | 高速公路数据",
  description: "查询江苏省高速公路路段，支持按高速分组、按方向与类型筛选，并可编辑路段基础信息。",
  alternates: { canonical: "/dashboard/expressway/section" },
};

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl leading-none font-normal tracking-tight">路段</h1>
        <p className="text-muted-foreground text-sm">
          高速公路路段主数据，来自 expressway_section，通过 expressway_section_road 关联省内高速后按高速分组展示。
        </p>
      </div>
      <SectionTable />
    </div>
  );
}
