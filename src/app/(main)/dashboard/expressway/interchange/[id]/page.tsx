"use client";

import * as React from "react";

import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import {
  fetchDistrictName,
  fetchInterchange,
  fetchRelatedExpressways,
  type InterchangeDetail,
  type RelatedExpressway,
  UUID_RE,
} from "./_components/interchange-detail";

const LINK_ROLES: Record<string, { label: string; className: string }> = {
  hub: { label: "枢纽", className: "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  ramp: { label: "匝道", className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
};

function LinkRoleBadge({ role }: { role: string | null }) {
  const style = role ? LINK_ROLES[role] : undefined;

  if (!style) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  return (
    <Badge variant="outline" className={`rounded-sm border font-medium ${style.className}`}>
      {style.label}
    </Badge>
  );
}

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate font-mono text-sm">{value}</dd>
    </div>
  );
}

/** 行政区名称还没查到时先显示代码，避免把缓存里的 map 对象当成 children 渲染 */
function resolveDistrictLabel(code: string | null | undefined, name: string | null | undefined) {
  if (!code) return "—";

  return typeof name === "string" ? name : code;
}

export default function InterchangeOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);

  const validId = UUID_RE.test(id);

  const { data: interchange } = useSWR<InterchangeDetail | null>(validId ? ["expressway_interchange", id] : null, () =>
    fetchInterchange(id),
  );

  const { data: districtName } = useSWR(
    interchange?.district ? ["expressway_interchange_district", interchange.district] : null,
    () => fetchDistrictName(interchange?.district ?? ""),
    { revalidateOnFocus: false },
  );

  const {
    data: related = [],
    isLoading,
    error,
  } = useSWR<RelatedExpressway[]>(["interchange_related_expressways", id], () => fetchRelatedExpressways(id), {
    revalidateOnFocus: false,
  });

  let relatedBody: React.ReactNode;

  if (isLoading) {
    relatedBody = (
      <div className="text-muted-foreground flex h-32 items-center justify-center gap-2 text-sm">
        <Spinner className="size-4" /> 加载中…
      </div>
    );
  } else if (error) {
    relatedBody = (
      <div className="text-destructive flex h-32 flex-col items-center justify-center gap-1 text-sm">
        <p className="font-medium">加载失败</p>
        <p className="text-muted-foreground">{error instanceof Error ? error.message : "未知错误"}</p>
      </div>
    );
  } else if (related.length === 0) {
    relatedBody = (
      <div className="text-muted-foreground flex h-32 flex-col items-center justify-center gap-1 text-sm">
        <p className="text-foreground text-sm font-medium">未关联任何高速</p>
        <p className="text-sm">expressway_interchange_road 里还没有这个互通的线路关联。</p>
      </div>
    );
  } else {
    relatedBody = (
      <Table className="**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-muted-foreground h-11 w-24 font-medium">编号</TableHead>
            <TableHead className="text-muted-foreground h-11 font-medium">简称</TableHead>
            <TableHead className="text-muted-foreground h-11 font-medium">全称</TableHead>
            <TableHead className="text-muted-foreground h-11 text-right font-medium">桩号 (km)</TableHead>
            <TableHead className="text-muted-foreground h-11 font-medium">关联方式</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {related.map((row) => (
            <TableRow key={row.expressway_id} className="border-border/60 hover:bg-muted/20">
              <TableCell className="py-3 align-middle">
                {row.number ? (
                  <Badge variant="outline" className="rounded-sm font-mono text-[11px]">
                    {row.number}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
              </TableCell>
              <TableCell className="py-3 align-middle">
                <span className="text-sm font-medium">{row.abbreviated_name ?? "—"}</span>
              </TableCell>
              <TableCell className="text-muted-foreground py-3 align-middle">
                <span className="text-sm">{row.name ?? "—"}</span>
              </TableCell>
              <TableCell className="py-3 text-right align-middle">
                <span
                  className={
                    typeof row.stake_km === "number"
                      ? "font-mono text-xs tabular-nums"
                      : "text-muted-foreground font-mono text-xs tabular-nums"
                  }
                >
                  {typeof row.stake_km === "number" ? row.stake_km.toFixed(2) : "—"}
                </span>
              </TableCell>
              <TableCell className="py-3 align-middle">
                <LinkRoleBadge role={row.link_role} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="border-border/70 bg-background grid grid-cols-2 gap-4 rounded-xl border p-4 sm:grid-cols-4">
        <MetaItem label="互通编码" value={interchange?.node_code ?? "—"} />
        <MetaItem label="行政区" value={resolveDistrictLabel(interchange?.district, districtName)} />
        <MetaItem
          label="坐标（GCJ02）"
          value={
            typeof interchange?.lng === "number" && typeof interchange.lat === "number"
              ? `${interchange.lng.toFixed(5)}, ${interchange.lat.toFixed(5)}`
              : "—"
          }
        />
        <MetaItem label="坐标系" value={interchange?.crs ?? "—"} />
      </dl>

      <div className="border-border/70 bg-background overflow-hidden rounded-xl border">
        <div className="flex items-baseline gap-2 border-b px-4 py-3">
          <span className="text-sm font-medium">关联高速</span>
          <span className="text-muted-foreground text-xs">
            来自 expressway_interchange_road 表 · 共 {related.length} 条
          </span>
        </div>
        {relatedBody}
      </div>
    </div>
  );
}
