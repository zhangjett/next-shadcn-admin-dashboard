"use client";

import * as React from "react";

import { cn } from "cn";
import { AlertCircle, MapPin, Route as RouteIcon, Search } from "lucide-react";
import useSWR from "swr";
import { BaseMap, MultiMarker, MultiPolyline } from "tlbs-map-react";
import type { CustomPointGeometry, CustomPolylineGeometry } from "tlbs-map-react/dist/interfaces";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchJiangsuNetwork } from "@/data/expressway";
import type { NetworkInterchange, NetworkSection } from "@/types/expressway";

import { InterTypeBadge } from "../../interchange/_components/interchange-type-badge";

const MAP_API_KEY = process.env.NEXT_PUBLIC_MAP_KEY ?? "";

/** 全省路段一次性渲染，列表只截取前 N 条避免 DOM 过大 */
const MAX_RENDERED_ROWS = 300;

const ROUTE_STYLES = {
  route: {
    color: "#3777FF",
    width: 2,
    borderWidth: 0.5,
    borderColor: "#FFFFFF",
    lineCap: "round" as const,
  },
};

const SELECTED_ROUTE_STYLES = {
  selected: {
    color: "#F97316",
    width: 5,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    lineCap: "round" as const,
  },
};

type Selection = { kind: "section"; id: string } | { kind: "interchange"; id: string } | null;

function directionText(direction: string | null): string {
  if (direction === "UP") return "上行";
  if (direction === "DOWN") return "下行";
  return "方向未知";
}

function sectionTitle(section: NetworkSection): string {
  return `${section.start_location ?? "—"} → ${section.end_location ?? "—"}`;
}

function matchesSection(section: NetworkSection, keyword: string): boolean {
  if (!keyword) return true;

  const text = [
    ...section.expressway_numbers,
    section.start_location ?? "",
    section.end_location ?? "",
    section.section_type ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return text.includes(keyword);
}

function matchesInterchange(interchange: NetworkInterchange, keyword: string): boolean {
  if (!keyword) return true;

  return `${interchange.node_name ?? ""} ${interchange.inter_type ?? ""}`.toLowerCase().includes(keyword);
}

function RowButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "hover:bg-muted/50 flex w-full items-start gap-2 border-b px-3 py-2 text-left transition-colors last:border-b-0",
        active && "bg-muted/70 hover:bg-muted/70",
      )}
    >
      {children}
    </button>
  );
}

export function NetworkMap() {
  const { data, error, isLoading } = useSWR("jiangsu_network", fetchJiangsuNetwork, {
    revalidateOnFocus: false,
  });

  const sections = React.useMemo(() => data?.sections ?? [], [data]);
  const interchanges = React.useMemo(() => data?.interchanges ?? [], [data]);

  const [selection, setSelection] = React.useState<Selection>(null);
  const [keyword, setKeyword] = React.useState("");
  const [mapReady, setMapReady] = React.useState(false);
  const mapRef = React.useRef<TMap.Map | null>(null);

  const normalizedKeyword = keyword.trim().toLowerCase();

  const filteredSections = React.useMemo(
    () => sections.filter((section) => matchesSection(section, normalizedKeyword)).slice(0, MAX_RENDERED_ROWS),
    [sections, normalizedKeyword],
  );

  const filteredInterchanges = React.useMemo(
    () =>
      interchanges
        .filter((interchange) => matchesInterchange(interchange, normalizedKeyword))
        .slice(0, MAX_RENDERED_ROWS),
    [interchanges, normalizedKeyword],
  );

  const selectedSection = selection?.kind === "section" ? sections.find((item) => item.id === selection.id) : undefined;
  const selectedInterchange =
    selection?.kind === "interchange" ? interchanges.find((item) => item.id === selection.id) : undefined;

  // 未选中时把视野框到全省
  React.useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || selection) return;

    const points = [
      ...sections.flatMap((section) => section.coordinates),
      ...interchanges.map((interchange): [number, number] => [interchange.lng, interchange.lat]),
    ];

    if (points.length === 0) return;

    const bounds = new TMap.LatLngBounds();
    for (const [lng, lat] of points) {
      bounds.extend(new TMap.LatLng(lat, lng));
    }
    map.fitBounds(bounds, { padding: 40 });
  }, [mapReady, sections, interchanges, selection]);

  // 选中路段框住整条线，选中互通则放大到该点
  React.useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    if (selectedSection) {
      const bounds = new TMap.LatLngBounds();
      for (const [lng, lat] of selectedSection.coordinates) {
        bounds.extend(new TMap.LatLng(lat, lng));
      }
      map.fitBounds(bounds, { padding: 120 });
      return;
    }

    if (selectedInterchange) {
      map.setCenter(new TMap.LatLng(selectedInterchange.lat, selectedInterchange.lng));
      map.setZoom(13);
    }
  }, [mapReady, selectedSection, selectedInterchange]);

  const routeGeometries = React.useMemo<CustomPolylineGeometry[]>(
    () =>
      mapReady
        ? sections.map((section) => ({
            id: section.id,
            styleId: "route",
            paths: section.coordinates.map(([lng, lat]) => new TMap.LatLng(lat, lng)),
          }))
        : [],
    [mapReady, sections],
  );

  const selectedRouteGeometries = React.useMemo<CustomPolylineGeometry[]>(
    () =>
      mapReady && selectedSection
        ? [
            {
              id: selectedSection.id,
              styleId: "selected",
              paths: selectedSection.coordinates.map(([lng, lat]) => new TMap.LatLng(lat, lng)),
            },
          ]
        : [],
    [mapReady, selectedSection],
  );

  const markerGeometries = React.useMemo<CustomPointGeometry[]>(
    () =>
      mapReady
        ? interchanges.map((interchange) => ({
            id: interchange.id,
            position: { lat: interchange.lat, lng: interchange.lng },
          }))
        : [],
    [mapReady, interchanges],
  );

  let body: React.ReactNode;

  if (isLoading) {
    body = (
      <div className="text-muted-foreground flex h-40 items-center justify-center gap-2 text-sm">
        <Spinner />
        正在加载江苏路网数据
      </div>
    );
  } else if (error) {
    body = (
      <div className="text-destructive flex h-40 items-center justify-center gap-2 px-4 text-sm">
        <AlertCircle className="size-4 shrink-0" />
        {error instanceof Error ? error.message : "加载失败"}
      </div>
    );
  } else {
    body = (
      <Tabs defaultValue="sections" className="min-h-0 flex-1 gap-0">
        <div className="border-b px-3 py-2">
          <TabsList className="w-full">
            <TabsTrigger value="sections" className="flex-1">
              路段 · {sections.length}
            </TabsTrigger>
            <TabsTrigger value="interchanges" className="flex-1">
              互通 · {interchanges.length}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="border-b px-3 py-2">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute inset-y-0 start-2.5 my-auto size-3.5" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索编号、起终点或名称"
              className="h-8 ps-8 text-sm"
            />
          </div>
        </div>

        <TabsContent value="sections" className="mt-0 min-h-0 flex-1 overflow-y-auto">
          {filteredSections.length === 0 ? (
            <p className="text-muted-foreground px-3 py-8 text-center text-sm">没有匹配的路段</p>
          ) : (
            filteredSections.map((section) => (
              <RowButton
                key={section.id}
                active={selection?.kind === "section" && selection.id === section.id}
                onClick={() => setSelection({ kind: "section", id: section.id })}
              >
                <RouteIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {section.expressway_numbers.map((number) => (
                      <Badge key={number} variant="outline" className="rounded-sm font-mono text-[11px]">
                        {number}
                      </Badge>
                    ))}
                    <span className="text-muted-foreground text-xs">{directionText(section.direction)}</span>
                  </div>
                  <p className="text-foreground/90 mt-0.5 truncate text-sm">{sectionTitle(section)}</p>
                </div>
              </RowButton>
            ))
          )}
        </TabsContent>

        <TabsContent value="interchanges" className="mt-0 min-h-0 flex-1 overflow-y-auto">
          {filteredInterchanges.length === 0 ? (
            <p className="text-muted-foreground px-3 py-8 text-center text-sm">没有匹配的互通</p>
          ) : (
            filteredInterchanges.map((interchange) => (
              <RowButton
                key={interchange.id}
                active={selection?.kind === "interchange" && selection.id === interchange.id}
                onClick={() => setSelection({ kind: "interchange", id: interchange.id })}
              >
                <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{interchange.node_name ?? "未命名互通"}</p>
                  <p className="text-muted-foreground mt-0.5 font-mono text-[11px] tabular-nums">
                    {interchange.lng.toFixed(5)}, {interchange.lat.toFixed(5)}
                  </p>
                </div>
                <InterTypeBadge type={interchange.inter_type} />
              </RowButton>
            ))
          )}
        </TabsContent>
      </Tabs>
    );
  }

  const rowCount = keyword
    ? `${filteredSections.length + filteredInterchanges.length} / ${sections.length + interchanges.length}`
    : `${sections.length + interchanges.length}`;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="border-border/70 bg-background overflow-hidden rounded-xl border">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium">江苏路网地图</span>
            <span className="text-muted-foreground text-xs">点击右侧列表定位</span>
          </div>
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
            <span className="size-2 rounded-full bg-orange-500" />
            当前选中
          </span>
        </div>
        <div className="h-[520px] xl:h-[680px]">
          <BaseMap
            ref={mapRef}
            apiKey={MAP_API_KEY}
            options={{ center: { lat: 33.0, lng: 119.5 }, zoom: 7 }}
            onMapInited={() => {
              setMapReady(true);
            }}
          >
            <MultiPolyline styles={ROUTE_STYLES} geometries={routeGeometries} />
            <MultiPolyline styles={SELECTED_ROUTE_STYLES} geometries={selectedRouteGeometries} />
            <MultiMarker geometries={markerGeometries} />
          </BaseMap>
        </div>
      </div>

      <div className="border-border/70 bg-background flex max-h-[520px] flex-col overflow-hidden rounded-xl border xl:max-h-[680px]">
        <div className="flex items-baseline justify-between gap-2 border-b px-4 py-3">
          <span className="text-sm font-medium">路网列表</span>
          <span className="text-muted-foreground text-xs">
            共 {rowCount} 条{keyword ? "，已筛选" : ""}
          </span>
        </div>
        {body}
      </div>
    </div>
  );
}
