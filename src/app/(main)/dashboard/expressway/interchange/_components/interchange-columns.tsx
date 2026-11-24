"use client";

import Link from "next/link";

import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "cn";
import { Copy, MoreHorizontal, Waypoints } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { copyToClipboard } from "@/lib/clipboard";
import type { DataTableFeatures } from "@/lib/data-table-features";

import type { InterchangeRow } from "./interchange-table";
import { InterTypeBadge } from "./interchange-type-badge";

export function createInterchangeColumns(
  districtNames: Record<string, string>,
): ColumnDef<DataTableFeatures, InterchangeRow>[] {
  return [
    {
      // 隐藏列，只用来承接搜索关键词，跨名称、编码和所属高速匹配
      id: "search",
      accessorFn: (row) => `${row.node_name ?? ""} ${row.node_code ?? ""} ${row.expressway_label ?? ""}`,
      filterFn: "includesString",
      enableHiding: false,
      enableGrouping: false,
      enableSorting: false,
    },
    {
      // 隐藏列，按高速公路分组时使用；值为 expressway_id，空串代表未关联
      id: "expressway",
      accessorFn: (row) => row.expressway_id ?? "",
      enableHiding: false,
      enableSorting: false,
      header: "所属高速",
    },
    {
      accessorKey: "node_name",
      header: "互通名称",
      enableGrouping: false,
      enableSorting: false,
      cell: ({ row }) => (
        <span className={cn("text-sm font-medium", !row.original.node_name && "text-muted-foreground")}>
          {row.original.node_name ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "node_code",
      header: "编码",
      enableGrouping: false,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground font-mono text-xs">{row.original.node_code ?? "—"}</span>
      ),
    },
    {
      accessorKey: "inter_type",
      header: "类型",
      enableSorting: false,
      cell: ({ row }) => <InterTypeBadge type={row.original.inter_type} />,
    },
    {
      accessorKey: "stake_km",
      header: "桩号 (km)",
      enableGrouping: false,
      enableSorting: false,
      cell: ({ row }) => {
        const stake = row.original.stake_km;

        return (
          <span className={cn("font-mono text-xs tabular-nums", stake === null && "text-muted-foreground")}>
            {typeof stake === "number" ? stake.toFixed(2) : "—"}
          </span>
        );
      },
    },
    {
      accessorKey: "district",
      header: "行政区",
      enableSorting: false,
      cell: ({ row }) => {
        const code = row.original.district;

        return <span className="text-sm">{code ? (districtNames[code] ?? code) : "—"}</span>;
      },
    },
    {
      accessorKey: "crs",
      header: "坐标系",
      enableGrouping: false,
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant="outline" className="text-muted-foreground rounded-sm font-mono text-[11px]">
          {row.original.crs ?? "—"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      enableGrouping: false,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground data-[state=open]:bg-muted">
                <MoreHorizontal />
                <span className="sr-only">打开菜单</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/expressway/interchange/${row.original.id}/geometry`}>
                  <Waypoints />
                  查看几何
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!row.original.node_code}
                onSelect={() => {
                  if (row.original.node_code) void copyToClipboard(row.original.node_code, "已复制互通编码");
                }}
              >
                <Copy />
                复制编码
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void copyToClipboard(row.original.id, "已复制互通 ID")}>
                <Copy />
                复制 ID
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];
}
