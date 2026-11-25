"use client";

import * as React from "react";

import { cn } from "cn";
import { ChevronsUpDown, Search, X } from "lucide-react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { fetchExpresswayNodes } from "@/data/expressway";
import type { ExpresswayNodeOption } from "@/types/expressway";

const KIND_LABEL: Record<ExpresswayNodeOption["kind"], string> = {
  toll_station: "收费站",
  interchange: "互通",
};

/** 桩号统一显示为 K12+345 */
export function formatStakeKm(value: number | null): string | null {
  if (value === null) return null;

  const meters = Math.round(value * 1000);
  return `K${Math.floor(meters / 1000)}+${String(meters % 1000).padStart(3, "0")}`;
}

type SectionNodeFieldProps = {
  id: string;
  label: string;
  expresswayId: string;
  value: ExpresswayNodeOption | null;
  onChange: (node: ExpresswayNodeOption | null) => void;
  disabled?: boolean;
};

/** 路段端点选择：只在所属高速的收费站/互通里挑，带桩号 */
export function SectionNodeField({
  id,
  label,
  expresswayId,
  value,
  onChange,
  disabled = false,
}: SectionNodeFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [keyword, setKeyword] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    function handleDocumentClick(event: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setKeyword("");
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const {
    data: nodes = [],
    isLoading,
    error,
  } = useSWR(expresswayId ? ["expressway_nodes", expresswayId] : null, () => fetchExpresswayNodes(expresswayId), {
    revalidateOnFocus: false,
  });

  const normalized = keyword.trim().toLowerCase();
  const filtered = normalized
    ? nodes.filter((node) => `${node.name} ${KIND_LABEL[node.kind]}`.toLowerCase().includes(normalized))
    : nodes;
  const placeholder = expresswayId ? "选择收费站或互通" : "请先选择所属高速";

  /** 按类型分组（收费站优先，保持各自的桩号排序） */
  const grouped = React.useMemo(() => {
    const tollStations = filtered.filter((node) => node.kind === "toll_station");
    const interchanges = filtered.filter((node) => node.kind === "interchange");

    return [
      { kind: "toll_station" as const, items: tollStations },
      { kind: "interchange" as const, items: interchanges },
    ].filter((group) => group.items.length > 0);
  }, [filtered]);

  function handleSelect(node: ExpresswayNodeOption) {
    onChange(node);
    setOpen(false);
    setKeyword("");
  }

  let listBody: React.ReactNode;

  if (error) {
    listBody = (
      <p className="text-destructive px-2 py-3 text-center text-xs">
        {error instanceof Error ? error.message : "节点加载失败"}
      </p>
    );
  } else if (isLoading) {
    listBody = (
      <p className="text-muted-foreground flex items-center justify-center gap-2 py-4 text-sm">
        <Spinner className="size-4" />
        加载节点
      </p>
    );
  } else if (filtered.length === 0) {
    const emptyText = normalized ? "没有匹配的节点" : "该高速下暂无收费站或互通";

    listBody = <p className="text-muted-foreground px-2 py-4 text-center text-sm">{emptyText}</p>;
  } else {
    listBody = grouped.map((group, groupIndex) => (
      <div key={group.kind} className={cn(groupIndex > 0 && "border-t")}>
        <div className="text-muted-foreground px-2 py-1 text-[11px] font-medium tracking-wide">
          {KIND_LABEL[group.kind]} · {group.items.length}
        </div>
        {group.items.map((node) => {
          const stake = formatStakeKm(node.stakeKm);

          return (
            <button
              key={node.id}
              type="button"
              onClick={() => handleSelect(node)}
              className={cn(
                "hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                value?.id === node.id && "bg-muted",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
              {stake ? (
                <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">{stake}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    ));
  }

  return (
    <div ref={rootRef} className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>

      <div className="relative">
        <div className="flex items-center gap-1.5">
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled || !expresswayId}
            onClick={() => setOpen((current) => !current)}
            className="h-8 flex-1 justify-between font-normal"
          >
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value ? value.name : placeholder}
            </span>
            <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
          </Button>

          {value ? (
            <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} onClick={() => onChange(null)}>
              <X />
              <span className="sr-only">清除{label}</span>
            </Button>
          ) : null}
        </div>

        {open ? (
          <div className="bg-popover absolute top-full z-20 mt-1 w-full overflow-hidden rounded-md border shadow-sm">
            <div className="border-b p-2">
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute inset-y-0 start-2.5 my-auto size-3.5" />
                <Input
                  autoFocus
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索收费站或互通"
                  className="h-8 ps-8 text-sm"
                />
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto p-1">{listBody}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
