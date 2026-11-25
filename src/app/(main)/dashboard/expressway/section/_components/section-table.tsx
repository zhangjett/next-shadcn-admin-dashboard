"use client";

import * as React from "react";

import {
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type ExpandedState,
  type GroupingState,
  useTable,
} from "@tanstack/react-table";
import { cn } from "cn";
import { ChevronRight, ListFilter, Plus, Search, X } from "lucide-react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchJiangsuSectionRows } from "@/data/expressway";
import { dataTableFeatures } from "@/lib/data-table-features";
import type { SectionRow } from "@/types/expressway";

import { createSectionColumns } from "./section-columns";
import { SectionCreateDialog, SectionEditDialog } from "./section-dialogs";

/** 路段列表固定按所属高速分组 */
const GROUPING: GroupingState = ["expressway"];

const DIRECTION_FILTERS = [
  { value: "all", label: "全部方向" },
  { value: "UP", label: "上行" },
  { value: "DOWN", label: "下行" },
] as const;

const ALL_FILTER = "all";

export function SectionTable() {
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [editing, setEditing] = React.useState<SectionRow | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);

  const {
    data = [],
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR("jiangsu_section_rows", fetchJiangsuSectionRows, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const handleEdit = React.useCallback((row: SectionRow) => {
    setEditing(row);
  }, []);

  const columns = React.useMemo(() => createSectionColumns({ onEdit: handleEdit }), [handleEdit]);

  const columnVisibility = React.useMemo<ColumnVisibilityState>(() => ({ search: false, expressway: false }), []);

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    state: { columnFilters, grouping: GROUPING, expanded, columnVisibility },
    onColumnFiltersChange: setColumnFilters,
    onExpandedChange: setExpanded,
    getRowId: (row) => row.rowKey,
    enableSorting: false,
    groupedColumnMode: false,
    paginateExpandedRows: true,
    autoResetPageIndex: false,
    autoResetExpanded: false,
    initialState: {
      pagination: { pageIndex: 0, pageSize: Number.POSITIVE_INFINITY },
    },
  });

  const expresswayMeta = React.useMemo(() => {
    const map = new Map<string, { number: string | null; name: string | null }>();

    for (const row of data) {
      map.set(row.expressway_id, { number: row.expressway_number, name: row.expressway_name });
    }

    return map;
  }, [data]);

  const sectionTypeOptions = React.useMemo(
    () =>
      [...new Set(data.map((row) => row.section_type).filter((type): type is string => Boolean(type)))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [data],
  );

  const searchValue = (table.getColumn("search")?.getFilterValue() as string | undefined) ?? "";
  const directionFilter = (table.getColumn("direction")?.getFilterValue() as string | undefined) ?? ALL_FILTER;
  const typeFilter = (table.getColumn("section_type")?.getFilterValue() as string | undefined) ?? ALL_FILTER;

  const rows = table.getRowModel().rows;
  const leafRows = table.getFilteredRowModel().rows;
  const groupCount = rows.filter((row) => row.getIsGrouped()).length;
  const expresswayCount = new Set(leafRows.map((row) => row.original.expressway_id)).size;
  const columnCount = table.getVisibleLeafColumns().length;
  const hasFilter = Boolean(searchValue) || directionFilter !== ALL_FILTER || typeFilter !== ALL_FILTER;

  function resetFilters() {
    table.getColumn("search")?.setFilterValue(undefined);
    table.getColumn("direction")?.setFilterValue(undefined);
    table.getColumn("section_type")?.setFilterValue(undefined);
  }

  let tableBody: React.ReactNode;

  if (isLoading && data.length === 0) {
    tableBody = (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={columnCount} className="text-muted-foreground h-40 text-center">
          <span className="inline-flex items-center gap-2 text-sm">
            <Spinner className="size-4" /> 加载中…
          </span>
        </TableCell>
      </TableRow>
    );
  } else if (error) {
    tableBody = (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={columnCount} className="h-40 text-center">
          <div className="flex flex-col items-center gap-1">
            <p className="text-destructive text-sm font-medium">加载失败</p>
            <p className="text-muted-foreground text-sm">{error instanceof Error ? error.message : "未知错误"}</p>
          </div>
        </TableCell>
      </TableRow>
    );
  } else if (rows.length === 0) {
    tableBody = (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={columnCount} className="h-40 text-center">
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm font-medium">{hasFilter ? "没有匹配的路段" : "暂无路段数据"}</p>
            <p className="text-muted-foreground text-sm">
              {hasFilter
                ? "换个关键词，或者清空筛选条件试试。"
                : "已登录仍为空时，请检查 expressway_section 的读取权限。"}
            </p>
            <Button variant="outline" size="sm" onClick={() => void mutate()}>
              重新加载
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  } else {
    tableBody = rows.map((row) => {
      if (row.getIsGrouped()) {
        const groupValue = String(row.groupingValue ?? "");
        const meta = expresswayMeta.get(groupValue);
        const isExpanded = row.getIsExpanded();

        return (
          <TableRow key={row.id} className="bg-muted/40 hover:bg-muted/50 border-border/60">
            <TableCell colSpan={columnCount} className="py-2">
              <button
                type="button"
                aria-expanded={isExpanded}
                onClick={() => row.toggleExpanded()}
                className="flex w-full items-center gap-2 text-left"
              >
                <ChevronRight
                  className={cn(
                    "text-muted-foreground size-3.5 shrink-0 transition-transform",
                    isExpanded && "rotate-90",
                  )}
                />
                {meta?.number ? (
                  <Badge variant="outline" className="rounded-sm font-mono text-[11px]">
                    {meta.number}
                  </Badge>
                ) : null}
                <span className="text-sm font-medium">{meta?.name ?? "未知高速"}</span>
                <span className="text-muted-foreground text-xs tabular-nums">{row.getLeafRows().length} 个路段</span>
              </button>
            </TableCell>
          </TableRow>
        );
      }

      return (
        <TableRow key={row.id} className="border-border/60 hover:bg-muted/20">
          {row.getVisibleCells().map((cell) => (
            <TableCell key={cell.id} className="py-2.5 align-middle">
              {cell.getIsPlaceholder() ? null : <table.FlexRender cell={cell} />}
            </TableCell>
          ))}
        </TableRow>
      );
    });
  }

  return (
    <div className="border-border/70 bg-background overflow-hidden rounded-xl border">
      <div className="flex flex-col gap-3 border-b px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <InputGroup className="bg-background w-full sm:w-64">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              value={searchValue}
              onChange={(event) => {
                table.getColumn("search")?.setFilterValue(event.target.value || undefined);
              }}
              placeholder="搜索高速、起终点或类型"
            />
          </InputGroup>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "border-dashed",
                  directionFilter !== ALL_FILTER && "bg-muted text-foreground border-solid",
                )}
              >
                <ListFilter data-icon="inline-start" />
                {DIRECTION_FILTERS.find((item) => item.value === directionFilter)?.label ?? "全部方向"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36">
              <DropdownMenuRadioGroup
                value={directionFilter}
                onValueChange={(value) => {
                  table.getColumn("direction")?.setFilterValue(value === ALL_FILTER ? undefined : value);
                }}
              >
                {DIRECTION_FILTERS.map((item) => (
                  <DropdownMenuRadioItem key={item.value} value={item.value}>
                    {item.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={cn("border-dashed", typeFilter !== ALL_FILTER && "bg-muted text-foreground border-solid")}
              >
                <ListFilter data-icon="inline-start" />
                {typeFilter === ALL_FILTER ? "全部类型" : typeFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 w-48 overflow-y-auto">
              <DropdownMenuRadioGroup
                value={typeFilter}
                onValueChange={(value) => {
                  table.getColumn("section_type")?.setFilterValue(value === ALL_FILTER ? undefined : value);
                }}
              >
                <DropdownMenuRadioItem value={ALL_FILTER}>全部类型</DropdownMenuRadioItem>
                {sectionTypeOptions.map((type) => (
                  <DropdownMenuRadioItem key={type} value={type} className="font-mono">
                    {type}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Badge variant="outline" className="text-muted-foreground rounded-sm text-xs font-normal">
            仅江苏
          </Badge>

          {hasFilter ? (
            <Button variant="destructive" onClick={resetFilters}>
              <X data-icon="inline-start" />
              重置
            </Button>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 lg:justify-end">
          <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
            {isValidating && !isLoading && <Spinner className="size-3.5" />}
            <span>
              共 {leafRows.length} 条路段 · {expresswayCount} 条高速
            </span>
          </div>
          <Button size="sm" onClick={() => setIsCreating(true)}>
            <Plus data-icon="inline-start" />
            新增路段
          </Button>
        </div>
      </div>

      <Table className="**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} colSpan={header.colSpan} className="text-muted-foreground h-11 font-medium">
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>{tableBody}</TableBody>
      </Table>

      <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-muted-foreground text-sm">
          共 {leafRows.length} 条路段 · {expresswayCount} 条高速 · {groupCount} 个分组
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => table.toggleAllRowsExpanded(true)}>
            展开全部
          </Button>
          <Button variant="ghost" size="sm" onClick={() => table.toggleAllRowsExpanded(false)}>
            收起全部
          </Button>
        </div>
      </div>

      <SectionCreateDialog
        open={isCreating}
        onOpenChange={setIsCreating}
        onSaved={() => {
          void mutate();
        }}
      />

      <SectionEditDialog
        open={!!editing}
        section={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSaved={() => {
          void mutate();
        }}
      />
    </div>
  );
}
