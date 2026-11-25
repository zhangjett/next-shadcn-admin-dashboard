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
import { ChevronRight, ListFilter, Search, X } from "lucide-react";
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
import { dataTableFeatures } from "@/lib/data-table-features";
import { createClient } from "@/lib/supabase/client";

import { createInterchangeColumns } from "./interchange-columns";
import { InterTypeBadge } from "./interchange-type-badge";

const COLUMNS = "id, node_code, node_name, inter_type, district, lat, lng, crs";

const FETCH_PAGE_SIZE = 1000;

/** 目前只展示江苏（行政区划代码 32 开头）的互通，放开限制把这里改成 null 即可 */
const DISTRICT_PREFIX: string | null = "32";

const GROUPING_OPTIONS = [
  { value: "none", label: "不分组" },
  { value: "inter_type", label: "按类型分组" },
  { value: "district", label: "按行政区分组" },
  { value: "expressway", label: "按高速公路分组" },
] as const;

const NUMERIC_COLUMN_IDS = new Set(["stake_km"]);

export type Interchange = {
  id: string;
  node_code: string | null;
  node_name: string | null;
  inter_type: string | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
  crs: string | null;
};

/**
 * 表格行。按高速公路分组时，一个互通会拆成多条（它可能同时属于多条高速），
 * 所以行键必须带上 expressway_id；其余分组方式下行键就是互通 id。
 */
export type InterchangeRow = Interchange & {
  rowKey: string;
  expressway_id: string | null;
  expressway_label: string | null;
  expressway_number: string | null;
  expressway_name: string | null;
  /** 该互通在所属高速上的桩号，只有按高速公路分组时才有值 */
  stake_km: number | null;
};

type ExpresswayLink = {
  expressway_id: string;
  number: string | null;
  label: string;
  name: string | null;
  stake_km: number | null;
};

type InterchangeLinks = {
  byInterchange: Record<string, ExpresswayLink[]>;
  /** expressway_id → 头部展示用的编号与名称 */
  meta: Record<string, { number: string | null; label: string; name: string | null }>;
};

function toPlainRow(row: Interchange): InterchangeRow {
  return {
    ...row,
    rowKey: row.id,
    expressway_id: null,
    expressway_label: null,
    expressway_number: null,
    expressway_name: null,
    stake_km: null,
  };
}

/** 分组在客户端做，所以一次性把范围内的数据全拉下来（按 1000 一批翻页兜底） */
async function fetchInterchanges(): Promise<Interchange[]> {
  const supabase = createClient();
  const rows: Interchange[] = [];
  let from = 0;
  let done = false;

  while (!done) {
    let query = supabase.from("expressway_interchange").select(COLUMNS);

    if (DISTRICT_PREFIX) {
      query = query.like("district", `${DISTRICT_PREFIX}%`);
    }

    const { data, error } = await query
      .order("node_name", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (data ?? []) as Interchange[];
    rows.push(...batch);
    done = batch.length < FETCH_PAGE_SIZE;
    from += FETCH_PAGE_SIZE;
  }

  return rows;
}

/** 互通 ↔ 高速的关联关系，用来按高速公路分组 */
async function fetchInterchangeLinks(): Promise<InterchangeLinks> {
  const supabase = createClient();
  const byInterchange: Record<string, ExpresswayLink[]> = {};
  const meta: InterchangeLinks["meta"] = {};
  const pageSize = 1000;
  let from = 0;
  let done = false;

  while (!done) {
    const { data, error } = await supabase
      .from("expressway_interchange_road")
      .select("interchange_id, expressway_id, stake_km, expressway:expressway(number, abbreviated_name, name)")
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as unknown as {
      interchange_id: string;
      expressway_id: string;
      stake_km: number | null;
      expressway: { number: string | null; abbreviated_name: string | null; name: string | null } | null;
    }[];

    for (const link of batch) {
      const expressway = link.expressway;
      const number = expressway?.number ?? null;
      const label = expressway?.abbreviated_name ?? expressway?.name ?? number ?? "未知高速";

      meta[link.expressway_id] = { number, label, name: expressway?.name ?? null };

      let list = byInterchange[link.interchange_id];

      if (!list) {
        list = [];
        byInterchange[link.interchange_id] = list;
      }

      list.push({
        expressway_id: link.expressway_id,
        number,
        label,
        name: expressway?.name ?? null,
        stake_km: link.stake_km,
      });
    }

    done = batch.length < pageSize;
    from += pageSize;
  }

  for (const list of Object.values(byInterchange)) {
    list.sort((a, b) => (a.stake_km ?? Number.POSITIVE_INFINITY) - (b.stake_km ?? Number.POSITIVE_INFINITY));
  }

  return { byInterchange, meta };
}

/** 行政区代码 → 名称，按 80 个一批查询避免 URL 过长 */
async function fetchDistrictNames(codes: string[]): Promise<Record<string, string>> {
  if (codes.length === 0) return {};

  const supabase = createClient();
  const chunks: string[][] = [];

  for (let index = 0; index < codes.length; index += 80) {
    chunks.push(codes.slice(index, index + 80));
  }

  const responses = await Promise.all(
    chunks.map((chunk) => supabase.from("district").select("code, full_name, name").in("code", chunk)),
  );

  const names: Record<string, string> = {};

  for (const { data, error } of responses) {
    if (error) throw error;

    for (const row of data ?? []) {
      names[row.code as string] = (row.full_name ?? row.name ?? row.code) as string;
    }
  }

  return names;
}

function ExpresswayGroupLabel({
  expresswayId,
  meta,
}: {
  expresswayId: string;
  meta?: { number: string | null; label: string; name: string | null };
}) {
  if (!expresswayId) {
    return <span className="text-muted-foreground text-sm font-medium">未关联高速</span>;
  }

  return (
    <span className="flex items-center gap-2">
      {meta?.number ? (
        <Badge variant="outline" className="rounded-sm font-mono text-[11px]">
          {meta.number}
        </Badge>
      ) : null}
      <span className="text-sm font-medium">{meta?.label ?? "未知高速"}</span>
    </span>
  );
}

export function InterchangeTable() {
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [grouping, setGrouping] = React.useState<GroupingState>(["expressway"]);
  const [expanded, setExpanded] = React.useState<ExpandedState>({});

  const {
    data = [],
    error,
    isLoading,
    isValidating,
  } = useSWR(["expressway_interchange_all"], fetchInterchanges, {
    revalidateOnFocus: false,
  });

  const districtCodes = React.useMemo(
    () => [...new Set(data.map((row) => row.district).filter((code): code is string => Boolean(code)))].sort(),
    [data],
  );

  const { data: districtNames } = useSWR(
    districtCodes.length > 0 ? ["district_map", districtCodes.join(",")] : null,
    () => fetchDistrictNames(districtCodes),
    { revalidateOnFocus: false },
  );

  const { data: links, isLoading: linksLoading } = useSWR(["expressway_interchange_links"], fetchInterchangeLinks, {
    revalidateOnFocus: false,
  });

  const columns = React.useMemo(() => createInterchangeColumns(districtNames ?? {}), [districtNames]);

  const groupBy = grouping[0] ?? "none";

  // 按高速公路分组时，一个互通会按它所属的每条高速各出现一次
  const tableData = React.useMemo<InterchangeRow[]>(() => {
    if (groupBy !== "expressway" || !links) return data.map(toPlainRow);

    const rows: InterchangeRow[] = [];

    for (const row of data) {
      const list = links.byInterchange[row.id];

      if (!list || list.length === 0) {
        rows.push(toPlainRow(row));
        continue;
      }

      for (const link of list) {
        rows.push({
          ...row,
          rowKey: `${row.id}:${link.expressway_id}`,
          expressway_id: link.expressway_id,
          expressway_label: link.label,
          expressway_number: link.number,
          expressway_name: link.name,
          stake_km: link.stake_km,
        });
      }
    }

    // 让同一组高速的行连续出现，组顺序即高速编号顺序；未关联的排在最后
    rows.sort((a, b) => {
      const an = a.expressway_number ?? "\uffff";
      const bn = b.expressway_number ?? "\uffff";

      if (an !== bn) return an < bn ? -1 : 1;

      const aid = a.expressway_id ?? "";
      const bid = b.expressway_id ?? "";

      if (aid !== bid) return aid < bid ? -1 : 1;

      // 同一条高速内按桩号顺着线路排，缺桩号的排最后
      const as = a.stake_km ?? Number.POSITIVE_INFINITY;
      const bs = b.stake_km ?? Number.POSITIVE_INFINITY;

      if (as !== bs) return as - bs;

      return (a.node_name ?? "").localeCompare(b.node_name ?? "", "zh-Hans-CN");
    });

    return rows;
  }, [data, links, groupBy]);

  // 桩号是「互通-高速」关联上的属性，只有按高速公路分组时才有意义
  const columnVisibility = React.useMemo<ColumnVisibilityState>(
    () => ({ search: false, expressway: false, stake_km: groupBy === "expressway" }),
    [groupBy],
  );

  const table = useTable({
    features: dataTableFeatures,
    data: tableData,
    columns,
    state: { columnFilters, grouping, expanded, columnVisibility },
    onColumnFiltersChange: setColumnFilters,
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    getRowId: (row) => row.rowKey,
    enableSorting: false,
    groupedColumnMode: false,
    // v9 里两个都为 false 时展开行模型不会真正展开子行
    paginateExpandedRows: true,
    autoResetPageIndex: false,
    // 数据异步加载会触发行结构变化，别把展开状态重置掉
    autoResetExpanded: false,
    initialState: {
      // 分组行会占用 pageSize，这里干脆不分页，直接渲染全部行
      pagination: { pageIndex: 0, pageSize: Number.POSITIVE_INFINITY },
    },
  });

  const searchValue = (table.getColumn("search")?.getFilterValue() as string | undefined) ?? "";
  const groupByLabel = GROUPING_OPTIONS.find((option) => option.value === groupBy)?.label ?? "不分组";
  const rows = table.getRowModel().rows;
  const leafRows = table.getFilteredRowModel().rows;
  const uniqueCount = new Set(leafRows.map((row) => row.original.id)).size;
  // 未关联高速的互通只是单独成组，不计入关联条数
  const linkCount = leafRows.filter((row) => row.original.expressway_id).length;
  const groupCount = rows.filter((row) => row.getIsGrouped()).length;
  const columnCount = table.getVisibleLeafColumns().length;
  const isExpresswayGrouping = groupBy === "expressway";
  const isLoadingRows = (isLoading && data.length === 0) || (isExpresswayGrouping && linksLoading && !links);

  function districtLabel(code: string) {
    return districtNames?.[code] ?? (code || "未知行政区");
  }

  function changeGrouping(value: string) {
    table.setGrouping(value === "none" ? [] : [value]);
    table.toggleAllRowsExpanded(false);
  }

  let tableBody: React.ReactNode;

  if (isLoadingRows) {
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
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-medium">没有匹配的互通</p>
            <p className="text-muted-foreground text-sm">换个关键词，或者清空筛选条件试试。</p>
          </div>
        </TableCell>
      </TableRow>
    );
  } else {
    tableBody = rows.map((row) => {
      if (row.getIsGrouped()) {
        const isExpanded = row.getIsExpanded();
        const count = row.getLeafRows().length;
        const groupColumnId = row.groupingColumnId;
        const groupingValue = String(row.groupingValue ?? "");

        let groupLabel: React.ReactNode;

        if (groupColumnId === "expressway") {
          groupLabel = <ExpresswayGroupLabel expresswayId={groupingValue} meta={links?.meta[groupingValue]} />;
        } else if (groupColumnId === "inter_type") {
          groupLabel = <InterTypeBadge type={typeof row.groupingValue === "string" ? row.groupingValue : null} />;
        } else {
          groupLabel = <span className="text-sm font-medium">{districtLabel(groupingValue)}</span>;
        }

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
                {groupLabel}
                <span className="text-muted-foreground text-xs tabular-nums">{count} 个互通</span>
              </button>
            </TableCell>
          </TableRow>
        );
      }

      return (
        <TableRow key={row.id} className="border-border/60 hover:bg-muted/20">
          {row.getVisibleCells().map((cell) => (
            <TableCell
              key={cell.id}
              className={cn("py-3 align-middle", NUMERIC_COLUMN_IDS.has(cell.column.id) && "text-right")}
            >
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
              placeholder="搜索互通名称、编码或高速"
            />
          </InputGroup>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={cn("border-dashed", groupBy !== "none" && "bg-muted text-foreground border-solid")}
              >
                <ListFilter data-icon="inline-start" />
                {groupByLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuRadioGroup
                value={groupBy}
                onValueChange={(value) => {
                  changeGrouping(value);
                }}
              >
                {GROUPING_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {DISTRICT_PREFIX ? (
            <Badge variant="outline" className="text-muted-foreground rounded-sm text-xs font-normal">
              仅江苏（{DISTRICT_PREFIX} 开头）
            </Badge>
          ) : null}
          {searchValue ? (
            <Button
              variant="destructive"
              onClick={() => {
                table.getColumn("search")?.setFilterValue(undefined);
              }}
            >
              <X data-icon="inline-start" />
              重置
            </Button>
          ) : null}
        </div>
        <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
          {isValidating && !isLoading && <Spinner className="size-3.5" />}
          <span>
            共 {uniqueCount} 个互通
            {isExpresswayGrouping ? ` · ${linkCount} 条线路关联` : ""}
          </span>
        </div>
      </div>

      <Table className="**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  colSpan={header.colSpan}
                  className={cn(
                    "text-muted-foreground h-11 font-medium",
                    NUMERIC_COLUMN_IDS.has(header.column.id) && "text-right",
                  )}
                >
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
          共 {uniqueCount} 个互通
          {isExpresswayGrouping ? ` · ${linkCount} 条线路关联` : ""}
          {grouping.length > 0 ? ` · ${groupCount} 个分组` : ""}
        </div>
        {grouping.length > 0 ? (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => table.toggleAllRowsExpanded(true)}>
              展开全部
            </Button>
            <Button variant="ghost" size="sm" onClick={() => table.toggleAllRowsExpanded(false)}>
              收起全部
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
