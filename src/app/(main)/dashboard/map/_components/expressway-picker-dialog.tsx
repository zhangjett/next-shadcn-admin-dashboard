"use client";

import { useEffect, useMemo, useState } from "react";

import { cn } from "cn";
import { ChevronRight, Search } from "lucide-react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";

export type Expressway = {
  id: string;
  number: string;
  name: string;
  abbreviated_name: string | null;
  administrative_level: string | null;
  district: string[] | null;
};

/** 路段两端的节点：收费站或互通 */
export type SectionNode = {
  id: string;
  kind: "toll_station" | "interchange";
  name: string;
  /** 收费站 station_type（ramp / province_border / mainline）或互通 inter_type（hub / land） */
  subtype: string | null;
  district: string | null;
  /** 该节点在本条高速上的桩号（公里），用于排序与判断上/下行 */
  stakeKm: number | null;
};

/** 一条 section 的关联结果：高速 + 起点节点 + 终点节点 + 方向 */
export type SectionSelection = {
  expresswayId: string;
  expresswayNumber: string;
  expresswayName: string;
  startStation: SectionNode;
  endStation: SectionNode;
  direction: "UP" | "DOWN";
};

const EXPRESSWAY_COLUMNS = "id, number, name, abbreviated_name, administrative_level, district";
const PAGE_SIZE = 30;
const NODE_LIMIT = 2000;

/** 行政区划代码前两位 → 省级名称 */
const PROVINCES: Record<string, string> = {
  "11": "北京市",
  "12": "天津市",
  "13": "河北省",
  "14": "山西省",
  "15": "内蒙古自治区",
  "21": "辽宁省",
  "22": "吉林省",
  "23": "黑龙江省",
  "31": "上海市",
  "32": "江苏省",
  "33": "浙江省",
  "34": "安徽省",
  "35": "福建省",
  "36": "江西省",
  "37": "山东省",
  "41": "河南省",
  "42": "湖北省",
  "43": "湖南省",
  "44": "广东省",
  "45": "广西壮族自治区",
  "46": "海南省",
  "50": "重庆市",
  "51": "四川省",
  "52": "贵州省",
  "53": "云南省",
  "54": "西藏自治区",
  "61": "陕西省",
  "62": "甘肃省",
  "63": "青海省",
  "64": "宁夏回族自治区",
  "65": "新疆维吾尔自治区",
  "71": "台湾省",
  "81": "香港特别行政区",
  "82": "澳门特别行政区",
};

const DIRECTION_TEXT: Record<"UP" | "DOWN", string> = {
  UP: "上行",
  DOWN: "下行",
};

/** 行政区划代码转省级名称 */
function formatDistrict(district: string | string[] | null | undefined): string {
  if (!district) return "";

  const list = Array.isArray(district) ? district : [district];
  const names = list.map((code) => PROVINCES[code.slice(0, 2)]).filter(Boolean);
  return [...new Set(names)].join("、");
}

/** stake_km 可能缺失（null / ''），统一收敛成 number | null；0 视为未知 */
function toStake(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;

  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/** 245.475 → K245+475 */
function formatStake(km: number | null): string | null {
  if (km === null) return null;

  const meters = Math.round(km * 1000);
  return `K${Math.floor(meters / 1000)}+${String(meters % 1000).padStart(3, "0")}`;
}

/** 桩号递增即 DOWN（下行），递减即 UP（上行）；桩号缺失时返回 null 交给用户手选 */
function resolveDirection(start: SectionNode, end: SectionNode): "UP" | "DOWN" | null {
  if (start.stakeKm === null || end.stakeKm === null) return null;
  return end.stakeKm < start.stakeKm ? "UP" : "DOWN";
}

/** 节点小标签：站 / 省界 / 主线 / 枢纽 / 互通 */
function nodeChipText(node: SectionNode): string {
  if (node.kind === "toll_station") {
    if (node.subtype === "province_border") return "省界";
    if (node.subtype === "mainline") return "主线";
    return "站";
  }
  return node.subtype === "hub" ? "枢纽" : "互通";
}

function nodeChipClass(node: SectionNode): string {
  return node.kind === "interchange"
    ? "border-border bg-secondary text-secondary-foreground border"
    : "border-border text-muted-foreground border";
}

async function fetchExpressways(search: string): Promise<{ rows: Expressway[]; total: number }> {
  const supabase = createClient();

  let query = supabase
    .from("expressway")
    .select(EXPRESSWAY_COLUMNS, { count: "exact" })
    .order("number", { ascending: true })
    .limit(PAGE_SIZE);

  // 去掉会让 PostgREST 过滤语法出错的字符，避免搜索词破坏 or() 表达式
  const keyword = search.replace(/[%,()]/g, " ").trim();
  if (keyword) {
    query = query.or(`number.ilike.%${keyword}%,name.ilike.%${keyword}%,abbreviated_name.ilike.%${keyword}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data ?? []) as Expressway[], total: count ?? 0 };
}

type TollStationRoadRow = {
  stake_km: number | string | null;
  station: { id: string; name: string; station_type: string | null; district: string | null } | null;
};

type InterchangeRoadRow = {
  stake_km: number | string | null;
  node: { id: string; node_name: string; inter_type: string | null; district: string | null } | null;
};

/**
 * 取某条高速下的全部节点（收费站 + 互通）。
 * 关联在 expressway_toll_station_road / expressway_interchange_road 上，两张中间表都带 stake_km 桩号。
 */
async function fetchNodes(expresswayId: string): Promise<SectionNode[]> {
  const supabase = createClient();

  const [stations, interchanges] = await Promise.all([
    supabase
      .from("expressway_toll_station_road")
      .select("stake_km, station:expressway_toll_station(id, name, station_type, district)")
      .eq("expressway_id", expresswayId)
      .limit(NODE_LIMIT),
    supabase
      .from("expressway_interchange_road")
      .select("stake_km, node:expressway_interchange(id, node_name, inter_type, district)")
      .eq("expressway_id", expresswayId)
      .limit(NODE_LIMIT),
  ]);

  if (stations.error) throw stations.error;
  if (interchanges.error) throw interchanges.error;

  const nodes = new Map<string, SectionNode>();

  for (const row of (stations.data ?? []) as unknown as TollStationRoadRow[]) {
    const station = row.station;
    if (!station) continue;

    const item: SectionNode = {
      id: station.id,
      kind: "toll_station",
      name: station.name,
      subtype: station.station_type,
      district: station.district,
      stakeKm: toStake(row.stake_km),
    };

    // 同一节点在关联表里可能有多条记录，优先保留带桩号的那条
    const existing = nodes.get(item.id);
    if (!existing || (existing.stakeKm === null && item.stakeKm !== null)) nodes.set(item.id, item);
  }

  for (const row of (interchanges.data ?? []) as unknown as InterchangeRoadRow[]) {
    const node = row.node;
    if (!node) continue;

    const item: SectionNode = {
      id: node.id,
      kind: "interchange",
      name: node.node_name,
      subtype: node.inter_type,
      district: node.district,
      stakeKm: toStake(row.stake_km),
    };

    const existing = nodes.get(item.id);
    if (!existing || (existing.stakeKm === null && item.stakeKm !== null)) nodes.set(item.id, item);
  }

  // 按桩号升序（缺失的排最后），同桩号按名称
  return [...nodes.values()].sort(
    (a, b) =>
      (a.stakeKm ?? Number.POSITIVE_INFINITY) - (b.stakeKm ?? Number.POSITIVE_INFINITY) ||
      a.name.localeCompare(b.name, "zh"),
  );
}

type Draft = {
  id: string;
  number: string;
  name: string;
  start?: SectionNode;
  end?: SectionNode;
};

type KindFilter = "all" | "toll_station" | "interchange";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: SectionSelection | null;
  onConfirm: (selection: SectionSelection) => void;
}

export function ExpresswaySectionPicker({ open, onOpenChange, value, onConfirm }: Props) {
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Expressway | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [directionOverride, setDirectionOverride] = useState<"UP" | "DOWN" | null>(null);

  // 每次打开时用外部已关联的结果初始化草稿
  useEffect(() => {
    if (!open) return;

    setKeyword("");
    setSearch("");
    setKindFilter("all");
    setDirectionOverride(null);
    setDraft(
      value
        ? {
            id: value.expresswayId,
            number: value.expresswayNumber,
            name: value.expresswayName,
            start: value.startStation,
            end: value.endStation,
          }
        : null,
    );
  }, [open, value]);

  // 输入停顿 300ms 再查，避免每敲一个字都打一次请求
  useEffect(() => {
    const timer = setTimeout(() => setSearch(keyword.trim()), 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  const { data, isLoading } = useSWR<{ rows: Expressway[]; total: number }, Error, [string, string]>(
    ["expressway-picker", search],
    ([, word]) => fetchExpressways(word),
    { keepPreviousData: true },
  );

  const { data: nodes, isLoading: nodesLoading } = useSWR<SectionNode[], Error, [string, string] | null>(
    expanded ? ["expressway-nodes", expanded.id] : null,
    ([, id]) => fetchNodes(id),
    { keepPreviousData: true, revalidateOnFocus: false },
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const nodeRows = nodes ?? [];
  const visibleNodes = useMemo(
    () => (kindFilter === "all" ? nodeRows : nodeRows.filter((node) => node.kind === kindFilter)),
    [nodeRows, kindFilter],
  );

  const stationCount = nodeRows.filter((node) => node.kind === "toll_station").length;
  const interchangeCount = nodeRows.length - stationCount;

  function handleExpand(expressway: Expressway) {
    setExpanded((prev) => (prev?.id === expressway.id ? null : expressway));
    setKindFilter("all");
  }

  function handlePick(expressway: Expressway, node: SectionNode) {
    setDirectionOverride(null);
    setDraft((prev) => {
      // 换了一条高速：之前的起终点作废
      if (!prev || prev.number !== expressway.number) {
        return { id: expressway.id, number: expressway.number, name: expressway.name, start: node };
      }

      // 再点一次已选中的节点即取消；取消起点时把终点顶到起点
      if (prev.start?.id === node.id) {
        return { ...prev, start: prev.end, end: undefined };
      }

      if (prev.end?.id === node.id) {
        return { ...prev, end: undefined };
      }

      if (!prev.start) return { ...prev, start: node };
      if (!prev.end) return { ...prev, end: node };

      // 起终点都选好了再点第三个节点，从新起点重新开始
      return { ...prev, start: node, end: undefined };
    });
  }

  const complete = Boolean(draft?.start && draft.end);
  const derivedDirection = draft?.start && draft.end ? resolveDirection(draft.start, draft.end) : null;
  const direction = directionOverride ?? derivedDirection ?? "DOWN";

  let directionHint = "";
  if (directionOverride) directionHint = "（手选）";
  else if (!derivedDirection) directionHint = "（桩号缺失）";

  let summary: string;
  if (draft?.start && draft.end) {
    summary = `${draft.number} ${draft.name} · ${draft.start.name} → ${draft.end.name} · ${DIRECTION_TEXT[direction]}${directionHint}`;
  } else if (draft?.start) {
    summary = `起点：${draft.start.name}，再选终点`;
  } else if (total > 0) {
    summary = `共 ${total} 条高速${rows.length < total ? `，显示前 ${rows.length} 条` : ""}`;
  } else {
    summary = "输入关键字筛选线路";
  }

  function handleConfirm() {
    if (!draft?.start || !draft.end) return;

    onConfirm({
      expresswayId: draft.id,
      expresswayNumber: draft.number,
      expresswayName: draft.name,
      startStation: draft.start,
      endStation: draft.end,
      direction,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>关联线路</DialogTitle>
          <DialogDescription>
            展开高速后依次选择起点与终点（收费站或互通），保存时会写入这两点之间的路段。
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            className="ps-8"
            placeholder="搜索编号 / 名称 / 简称"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            autoFocus
          />
        </div>

        <div className="-mx-1 max-h-96 min-h-40 overflow-y-auto px-1">
          {rows.length === 0 && (
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
              {isLoading && <Spinner />}
              {isLoading ? "加载中…" : "没有匹配的线路"}
            </div>
          )}

          <div className="flex flex-col gap-0.5">
            {rows.map((row) => {
              const province = formatDistrict(row.district);
              const isExpanded = expanded?.id === row.id;
              const isCurrent = draft?.number === row.number;

              return (
                <div key={row.id}>
                  <button
                    type="button"
                    onClick={() => handleExpand(row)}
                    aria-expanded={isExpanded}
                    className={cn(
                      "hover:bg-accent focus-visible:ring-ring/50 flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors outline-none focus-visible:ring-3",
                      isExpanded && "bg-accent/60",
                    )}
                  >
                    <ChevronRight
                      className={cn(
                        "text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform",
                        isExpanded && "rotate-90",
                      )}
                    />
                    <span className="bg-muted text-muted-foreground mt-0.5 rounded px-1.5 py-0.5 font-mono text-[11px]">
                      {row.number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{row.abbreviated_name ?? row.name}</div>
                      <div className="text-muted-foreground truncate text-xs">
                        {row.name}
                        {province && ` · ${province}`}
                      </div>
                    </div>
                    {isCurrent && (draft?.start ?? draft?.end) && (
                      <span className="text-primary mt-0.5 max-w-40 shrink-0 truncate text-xs">
                        {draft?.start?.name ?? "—"}
                        {draft?.end ? ` → ${draft.end.name}` : "（选终点）"}
                      </span>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border-border/60 ms-5 mb-1 border-s ps-2">
                      <div className="mb-1 flex flex-wrap items-center gap-1 px-2 pt-1">
                        <FilterChip
                          active={kindFilter === "all"}
                          onClick={() => setKindFilter("all")}
                          label={`全部 ${nodeRows.length}`}
                        />
                        <FilterChip
                          active={kindFilter === "toll_station"}
                          onClick={() => setKindFilter("toll_station")}
                          label={`收费站 ${stationCount}`}
                        />
                        <FilterChip
                          active={kindFilter === "interchange"}
                          onClick={() => setKindFilter("interchange")}
                          label={`互通 ${interchangeCount}`}
                        />
                      </div>

                      {nodesLoading && (
                        <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-xs">
                          <Spinner /> 加载节点…
                        </div>
                      )}
                      {!nodesLoading && visibleNodes.length === 0 && (
                        <div className="text-muted-foreground py-6 text-center text-xs">该高速下没有节点</div>
                      )}
                      {!nodesLoading &&
                        visibleNodes.map((node) => {
                          const isStart = isCurrent && draft?.start?.id === node.id;
                          const isEnd = isCurrent && draft?.end?.id === node.id;
                          const stake = formatStake(node.stakeKm);

                          return (
                            <button
                              key={node.id}
                              type="button"
                              onClick={() => handlePick(row, node)}
                              className={cn(
                                "hover:bg-accent focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors outline-none focus-visible:ring-3",
                                (isStart || isEnd) && "bg-accent",
                              )}
                            >
                              <NodeChip isStart={isStart} isEnd={isEnd} node={node} />
                              <span className="truncate">{node.name}</span>
                              {stake && (
                                <span className="text-muted-foreground ms-auto shrink-0 font-mono text-xs">
                                  {stake}
                                </span>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col">
          <p className="text-muted-foreground min-w-0 truncate text-xs">{summary}</p>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-xs">方向</span>
            <FilterChip active={direction === "DOWN"} onClick={() => setDirectionOverride("DOWN")} label="下行" />
            <FilterChip active={direction === "UP"} onClick={() => setDirectionOverride("UP")} label="上行" />
            <div className="ms-auto flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="button" disabled={!complete} onClick={handleConfirm}>
                确认关联
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 节点左侧的小标签：选中时显示 起/终，否则显示类型 */
function NodeChip({ isStart, isEnd, node }: { isStart: boolean; isEnd: boolean; node: SectionNode }) {
  if (isStart || isEnd) {
    return (
      <span
        className={cn(
          "shrink-0 rounded px-1 text-[10px] leading-4",
          isStart ? "bg-primary text-primary-foreground" : "bg-destructive text-white",
        )}
      >
        {isStart ? "起" : "终"}
      </span>
    );
  }

  return (
    <span className={cn("shrink-0 rounded border px-1 text-[10px] leading-4", nodeChipClass(node))}>
      {nodeChipText(node)}
    </span>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-1.5 py-0.5 text-[11px] transition-colors",
        active
          ? "bg-primary text-primary-foreground border-transparent"
          : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}
