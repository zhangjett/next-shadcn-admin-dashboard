"use client";

import * as React from "react";

import { Copy, Maximize2, Plus } from "lucide-react";
import useSWR, { mutate } from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { copyToClipboard } from "@/lib/clipboard";
import { createClient } from "@/lib/supabase/client";

import { GeometryPreview } from "../../_components/geometry-preview";
import { GeometryCreateDialog } from "./geometry-create-dialog";
import { fetchInterchange, UUID_RE } from "./interchange-detail";

type Position = [number, number];

type Geometry = {
  type: string;
  crs?: { type?: string; properties?: { name?: string } };
  coordinates: Position[];
};

type GeometryRow = {
  id: string;
  interchange_id: string;
  route_code: string | null;
  geometry: Geometry | null;
};

type GeometrySummary = {
  count: number;
  pathType: string;
  crs: string;
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
  start: Position;
  end: Position;
};

async function fetchGeometries(interchangeId: string): Promise<GeometryRow[]> {
  const { data, error } = await createClient()
    .from("expressway_interchange_geometry")
    .select("id, interchange_id, route_code, geometry")
    .eq("interchange_id", interchangeId)
    .order("route_code", { ascending: true, nullsFirst: false });

  if (error) throw error;

  return (data ?? []) as GeometryRow[];
}

function summarize(geometry: Geometry | null): GeometrySummary | null {
  const coordinates = geometry?.coordinates ?? [];
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  if (!first || !last) return null;

  const lngs = coordinates.map(([lng]) => lng);
  const lats = coordinates.map(([, lat]) => lat);

  return {
    count: coordinates.length,
    pathType: geometry?.type ?? "—",
    crs: geometry?.crs?.properties?.name ?? "—",
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    start: first,
    end: last,
  };
}

function formatRange(min: number, max: number) {
  return `${min.toFixed(5)} – ${max.toFixed(5)}`;
}

function formatPoint(point: Position) {
  return `${point[0].toFixed(6)}, ${point[1].toFixed(6)}`;
}

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate font-mono text-sm">{value}</dd>
    </div>
  );
}

export function InterchangeGeometry({ interchangeId }: { interchangeId: string }) {
  const [selected, setSelected] = React.useState<GeometryRow | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  const validId = UUID_RE.test(interchangeId);

  const { data: interchange } = useSWR(
    validId ? ["expressway_interchange", interchangeId] : null,
    () => fetchInterchange(interchangeId),
    {
      revalidateOnFocus: false,
    },
  );

  const {
    data: rows = [],
    error,
    isLoading,
  } = useSWR(
    validId ? ["expressway_interchange_geometry", interchangeId] : null,
    () => fetchGeometries(interchangeId),
    { revalidateOnFocus: false },
  );

  const selectedSummary = selected ? summarize(selected.geometry) : null;
  const selectedCoordinates = selected?.geometry?.coordinates ?? [];

  function copyAll(collection: unknown) {
    void copyToClipboard(JSON.stringify(collection, null, 2), "已复制 FeatureCollection");
  }

  const featureCollection = {
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature",
      properties: {
        interchange_id: row.interchange_id,
        node_name: interchange?.node_name ?? null,
        route_code: row.route_code,
      },
      geometry: row.geometry,
    })),
  };

  let tableBody: React.ReactNode;

  if (isLoading) {
    tableBody = (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={7} className="text-muted-foreground h-40 text-center">
          <span className="inline-flex items-center gap-2 text-sm">
            <Spinner className="size-4" /> 加载中…
          </span>
        </TableCell>
      </TableRow>
    );
  } else if (error) {
    tableBody = (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={7} className="h-40 text-center">
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
        <TableCell colSpan={7} className="h-40 text-center">
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-medium">该互通暂无几何数据</p>
            <p className="text-muted-foreground text-sm">
              expressway_interchange_geometry 里还没有这个互通的匝道折线。
            </p>
          </div>
        </TableCell>
      </TableRow>
    );
  } else {
    tableBody = rows.map((row) => {
      const summary = summarize(row.geometry);

      return (
        <TableRow
          key={row.id}
          className="border-border/60 hover:bg-muted/20 cursor-pointer"
          onClick={() => setSelected(row)}
        >
          <TableCell className="py-3 align-middle">
            <div className="bg-muted/30 flex size-14 items-center justify-center rounded-md border">
              <GeometryPreview coordinates={row.geometry?.coordinates ?? []} className="size-12" />
            </div>
          </TableCell>
          <TableCell className="py-3 align-middle">
            {row.route_code ? (
              <Badge variant="outline" className="rounded-sm font-mono text-[11px]">
                {row.route_code}
              </Badge>
            ) : (
              <span className="text-muted-foreground text-sm">—</span>
            )}
          </TableCell>
          <TableCell className="py-3 align-middle">
            <span className="text-sm tabular-nums">{summary?.count ?? "—"}</span>
          </TableCell>
          <TableCell className="text-muted-foreground py-3 align-middle font-mono text-xs tabular-nums">
            {summary ? formatRange(summary.minLng, summary.maxLng) : "—"}
          </TableCell>
          <TableCell className="text-muted-foreground py-3 align-middle font-mono text-xs tabular-nums">
            {summary ? formatRange(summary.minLat, summary.maxLat) : "—"}
          </TableCell>
          <TableCell className="py-3 align-middle">
            <Badge variant="outline" className="text-muted-foreground rounded-sm font-mono text-[11px]">
              {summary?.crs ?? "—"}
            </Badge>
          </TableCell>
          <TableCell className="py-3 text-right align-middle">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={(event) => {
                event.stopPropagation();
                setSelected(row);
              }}
            >
              <Maximize2 />
              <span className="sr-only">查看几何</span>
            </Button>
          </TableCell>
        </TableRow>
      );
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="border-border/70 bg-background overflow-hidden rounded-xl border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium">匝道几何</span>
            <span className="text-muted-foreground text-xs">共 {rows.length} 条 · 坐标为 WGS84（EPSG:4326）</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-muted-foreground flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" />
                起点
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-rose-500" />
                终点
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCreateOpen(true);
              }}
            >
              <Plus data-icon="inline-start" />
              新建
            </Button>
            <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={() => copyAll(featureCollection)}>
              <Copy data-icon="inline-start" />
              复制全部几何
            </Button>
          </div>
        </div>

        <Table className="**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-muted-foreground h-11 w-20 font-medium">预览</TableHead>
              <TableHead className="text-muted-foreground h-11 font-medium">线路编码</TableHead>
              <TableHead className="text-muted-foreground h-11 font-medium">节点数</TableHead>
              <TableHead className="text-muted-foreground h-11 font-medium">经度范围</TableHead>
              <TableHead className="text-muted-foreground h-11 font-medium">纬度范围</TableHead>
              <TableHead className="text-muted-foreground h-11 font-medium">坐标系</TableHead>
              <TableHead className="h-11 w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>{tableBody}</TableBody>
        </Table>
      </div>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {interchange?.node_name ?? "未知互通"}
              {selected?.route_code ? (
                <Badge variant="outline" className="rounded-sm font-mono text-[11px]">
                  {selected.route_code}
                </Badge>
              ) : null}
            </DialogTitle>
            <DialogDescription>
              {interchange?.node_code ?? "—"} · 匝道几何 {selectedSummary?.pathType ?? "—"}
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted/20 flex items-center justify-center rounded-lg border p-4">
            <GeometryPreview coordinates={selectedCoordinates} className="h-56 w-full" />
          </div>

          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetaItem label="节点数" value={selectedSummary?.count ?? "—"} />
            <MetaItem label="几何类型" value={selectedSummary?.pathType ?? "—"} />
            <MetaItem label="坐标系" value={selectedSummary?.crs ?? "—"} />
            <MetaItem label="线路编码" value={selected?.route_code ?? "—"} />
            <MetaItem
              label="经度范围"
              value={selectedSummary ? formatRange(selectedSummary.minLng, selectedSummary.maxLng) : "—"}
            />
            <MetaItem
              label="纬度范围"
              value={selectedSummary ? formatRange(selectedSummary.minLat, selectedSummary.maxLat) : "—"}
            />
            <MetaItem label="起点" value={selectedSummary ? formatPoint(selectedSummary.start) : "—"} />
            <MetaItem label="终点" value={selectedSummary ? formatPoint(selectedSummary.end) : "—"} />
          </dl>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={!selected?.geometry}
              onClick={() => {
                if (selected?.geometry)
                  void copyToClipboard(JSON.stringify(selected.geometry, null, 2), "已复制 GeoJSON");
              }}
            >
              <Copy data-icon="inline-start" />
              复制 GeoJSON
            </Button>
            <DialogClose asChild>
              <Button>关闭</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GeometryCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        interchangeId={interchangeId}
        interchangeName={interchange?.node_name}
        center={
          typeof interchange?.lat === "number" && typeof interchange.lng === "number"
            ? { lat: interchange.lat, lng: interchange.lng }
            : null
        }
        onSaved={() => {
          void mutate(["expressway_interchange_geometry", interchangeId]);
        }}
      />
    </div>
  );
}
