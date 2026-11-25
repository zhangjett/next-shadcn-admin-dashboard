import type { Metadata } from "next";

import { SectionFormBody } from "../_components/section-form-body";

export const metadata: Metadata = {
  title: "新增路段 | 高速公路数据",
  description: "新增江苏省高速公路路段，并关联到所属高速。",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-3xl leading-none font-normal tracking-tight">新增路段</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        新增路段后会同步写入 expressway_section_road，按所属高速归组展示。
      </p>
      <SectionFormBody mode="create" />
    </div>
  );
}
