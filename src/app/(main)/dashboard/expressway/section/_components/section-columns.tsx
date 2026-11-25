"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "cn";
import { Copy, MoreHorizontal, PencilLine } from "lucide-react";

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
import type { SectionRow } from "@/types/expressway";

const STATUS_TEXT: Record<number, string> = {
  0: "关闭",
  1: "通行",
};

function DirectionBadge({ direction }: { direction: string | null }) {
  if (direction === "UP" || direction === "DOWN") {
    return (
      <Badge variant="outline" className="rounded-sm font-mono text-[11px]">
        {direction === "UP" ? "上行" : "下行"}
      </Badge>
    );
  }

  return <span className="text-muted-foreground text-sm">{direction ?? "—"}</span>;
}

function RampStatus({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground text-sm">—</span>;

  return (
    <span className={cn("text-sm", value === 1 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
      {STATUS_TEXT[value] ?? String(value)}
    </span>
  );
}

export function createSectionColumns({
  onEdit,
}: {
  onEdit: (row: SectionRow) => void;
}): ColumnDef<DataTableFeatures, SectionRow>[] {
  return [
    {
      // 隐藏列，承接搜索关键词
      id: "search",
      accessorFn: (row) =>
        `${row.expressway_number ?? ""} ${row.expressway_name ?? ""} ${row.start_location ?? ""} ${
          row.end_location ?? ""
        } ${row.section_type ?? ""}`,
      filterFn: "includesString",
      enableHiding: false,
      enableGrouping: false,
      enableSorting: false,
    },
    {
      // 隐藏列，按高速公路分组用；值为 expressway_id
      id: "expressway",
      accessorFn: (row) => row.expressway_id,
      enableHiding: false,
      enableSorting: false,
      header: "所属高速",
    },
    {
      accessorKey: "start_location",
      header: "起终点",
      enableGrouping: false,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className={cn("truncate", !row.original.start_location && "text-muted-foreground")}>
            {row.original.start_location ?? "—"}
          </span>
          <span className="text-muted-foreground shrink-0">→</span>
          <span className={cn("truncate", !row.original.end_location && "text-muted-foreground")}>
            {row.original.end_location ?? "—"}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "direction",
      header: "方向",
      filterFn: "equalsString",
      enableGrouping: false,
      enableSorting: false,
      cell: ({ row }) => <DirectionBadge direction={row.original.direction} />,
    },
    {
      accessorKey: "section_type",
      header: "类型",
      filterFn: "equalsString",
      enableGrouping: false,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground font-mono text-xs">{row.original.section_type ?? "—"}</span>
      ),
    },
    {
      accessorKey: "entrance_ramp_status",
      header: "入口",
      enableGrouping: false,
      enableSorting: false,
      cell: ({ row }) => <RampStatus value={row.original.entrance_ramp_status} />,
    },
    {
      accessorKey: "exit_ramp_status",
      header: "出口",
      enableGrouping: false,
      enableSorting: false,
      cell: ({ row }) => <RampStatus value={row.original.exit_ramp_status} />,
    },
    {
      id: "actions",
      header: "",
      enableGrouping: false,
      enableSorting: false,
      cell: ({ row }) => {
        const section = row.original;
        const route = `${section.start_location ?? ""} → ${section.end_location ?? ""}`;

        return (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground data-[state=open]:bg-muted">
                  <MoreHorizontal />
                  <span className="sr-only">打开菜单</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onSelect={() => onEdit(section)}>
                  <PencilLine />
                  编辑路段
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void copyToClipboard(route, "已复制起终点")}>
                  <Copy />
                  复制起终点
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void copyToClipboard(section.id, "已复制路段 ID")}>
                  <Copy />
                  复制 ID
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
