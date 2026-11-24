"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "cn";
import { debounce } from "lodash";
import { Loader2, Plus, Route, Trash2 } from "lucide-react";
import { toast } from "sonner";
import useSWR from "swr";
import { BaseMap, MultiLabel, MultiMarker, MultiPolyline } from "tlbs-map-react";
import type { CustomLabelGeometry, CustomPointGeometry, CustomPolylineGeometry } from "tlbs-map-react/dist/interfaces";

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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createInterchangeGeometry, fetchExpresswayOptions } from "@/data/expressway";
import { fetchDrivingRoute } from "@/lib/tmap-driving";
import type { Direction, GeometryCreateDialogProps, PickingTarget, RoutePoint } from "@/types/expressway";

const DIRECTION_OPTIONS: { value: Direction; label: string }[] = [
  { value: "UP", label: "上行（UP）" },
  { value: "DOWN", label: "下行（DOWN）" },
];

const MAP_API_KEY = process.env.NEXT_PUBLIC_MAP_KEY ?? "";

const TIP_STYLES = {
  multiLabelStyle: {
    color: "#0a0a0a",
    size: 14,
    width: 180,
    height: 36,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderRadius: 8,
    borderColor: "#e5e5e5",
    offset: { x: 100, y: -36 },
  },
};

const MARKER_STYLES = {
  start: {
    width: 25,
    height: 35,
    anchor: { x: 16, y: 32 },
    src: "https://mapapi.qq.com/web/lbs/javascriptGL/demo/img/start.png",
  },
};

const END_MARKER_STYLES = {
  end: {
    width: 25,
    height: 35,
    anchor: { x: 16, y: 32 },
    src: "https://mapapi.qq.com/web/lbs/javascriptGL/demo/img/end.png",
  },
};

const POLYLINE_STYLES = {
  polyline: {
    color: "#3777FF",
    width: 8,
    borderWidth: 5,
    borderColor: "#FFF",
    lineCap: "round" as const,
  },
};

function RouteStatus({ route }: { route?: RoutePoint[] | null }) {
  if (!route) return <span>尚未规划路线</span>;

  return (
    <>
      <Route className="size-3.5" />
      规划出 {route.length} 个坐标点
    </>
  );
}

function CoordinateField({
  label,
  tone,
  value,
  active,
  disabled,
  onToggle,
}: {
  label: string;
  tone: "origin" | "destination";
  value: string;
  active: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className={cn("size-2 shrink-0 rounded-full", tone === "origin" ? "bg-emerald-500" : "bg-rose-500")} />
        <span className="text-muted-foreground text-xs">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={value}
          aria-label={`${label}坐标`}
          className="text-muted-foreground font-mono text-xs tabular-nums"
        />
        <Button
          type="button"
          size="sm"
          variant={active ? "default" : "outline"}
          className="shrink-0"
          aria-pressed={active}
          disabled={disabled}
          onClick={onToggle}
        >
          {active ? "取消" : "选取"}
        </Button>
      </div>
    </div>
  );
}

export function GeometryCreateDialog({
  open,
  onOpenChange,
  interchangeId,
  interchangeName,
  center,
  onSaved,
}: GeometryCreateDialogProps) {
  const mapRef = useRef<TMap.Map>(null);

  const [picking, setPicking] = useState<PickingTarget>(null);
  const pickingRef = useRef<PickingTarget>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [fromGeometries, setFromGeometries] = useState<CustomPointGeometry[]>([]);
  const [toGeometries, setToGeometries] = useState<CustomPointGeometry[]>([]);
  const [tipGeometries, setTipGeometries] = useState<CustomLabelGeometry[]>([]);
  const [polylineGeometries, setPolylineGeometries] = useState<CustomPolylineGeometry[]>([]);
  // 点选起终点后不自动规划，点「路线规划」按钮才发起请求
  const [routeRequest, setRouteRequest] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 线路编码 = 所选高速公路编号 - 方向，如 G2-UP
  const { data: expresswayOptions = [] } = useSWR("expressway_options", fetchExpresswayOptions);
  const [expresswayId, setExpresswayId] = useState("");
  const [direction, setDirection] = useState<Direction | "">("");

  const selectedExpressway = expresswayOptions.find((item) => item.id === expresswayId);
  const expresswayCode = selectedExpressway
    ? (selectedExpressway.number ?? selectedExpressway.abbreviated_name ?? "")
    : "";
  const routeCode = expresswayCode && direction ? `${expresswayCode}-${direction}` : "";

  useEffect(() => {
    pickingRef.current = picking;
  }, [picking]);

  const { data: route, isLoading: planning, error: routeError } = useSWR(routeRequest, fetchDrivingRoute);

  function planRoute() {
    if (!origin || !destination) {
      toast.warning("请先选取起点和终点");
      return;
    }
    setRouteRequest(`/api/map/driving?origin=${origin}&destination=${destination}`);
  }

  // 规划结果回来后画到地图上并缩放到线路范围
  React.useEffect(() => {
    if (!route || route.length === 0) return;

    const bounds = new TMap.LatLngBounds();

    for (const [lat, lng] of route) {
      bounds.extend(new TMap.LatLng(lat, lng));
    }

    mapRef.current?.fitBounds(bounds, { padding: 60 });
    setPolylineGeometries([{ styleId: "polyline", paths: route.map(([lat, lng]) => new TMap.LatLng(lat, lng)) }]);
    setPicking(null);
    setTipGeometries([]);
  }, [route]);

  const clickHandler = useCallback((event: TMap.MapEvent) => {
    const lat = Number(event.latLng.getLat().toFixed(6));
    const lng = Number(event.latLng.getLng().toFixed(6));
    const target = pickingRef.current;

    if (target === "origin") {
      setOrigin(`${lat},${lng}`);
      setFromGeometries([{ styleId: "start", position: { lat, lng } }]);
    }

    if (target === "destination") {
      setDestination(`${lat},${lng}`);
      setToGeometries([{ styleId: "end", position: { lat, lng } }]);
    }

    // 改动起终点后旧路线作废，需重新点「路线规划」
    if (target) {
      setRouteRequest(null);
      setPolylineGeometries([]);
      setPicking(null);
      setTipGeometries([]);
    }
  }, []);

  const mouseMove = useMemo(
    () =>
      debounce((event: TMap.MapEvent) => {
        if (pickingRef.current) {
          const lat = event.latLng.getLat().toFixed(6);
          const lng = event.latLng.getLng().toFixed(6);
          setTipGeometries([
            {
              styleId: "multiLabelStyle",
              position: { lat: Number(lat), lng: Number(lng) },
              content: `${lat},${lng}`,
            },
          ]);
        }
      }, 1),
    [],
  );

  function togglePick(target: Exclude<PickingTarget, null>) {
    if (picking === target) {
      setPicking(null);
      setTipGeometries([]);
      return;
    }

    setPicking(target);
  }

  function resetAll() {
    setPicking(null);
    setTipGeometries([]);
    setOrigin(null);
    setDestination(null);
    setFromGeometries([]);
    setToGeometries([]);
    setPolylineGeometries([]);
    setRouteRequest(null);
    setExpresswayId("");
    setDirection("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetAll();
    onOpenChange(next);
  }

  async function save() {
    if (!route || route.length === 0) {
      toast.warning("请先选取起终点并完成路线规划");
      return;
    }

    if (!routeCode) {
      toast.warning("请选择线路所属高速公路和方向");
      return;
    }

    setSaving(true);

    try {
      await createInterchangeGeometry({ interchangeId, routeCode, route });

      toast.success("匝道几何已保存");
      onSaved?.();
      handleOpenChange(false);
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const originLabel = origin ?? "点击「选取」后在地图上点选";
  const destinationLabel = destination ?? "点击「选取」后在地图上点选";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>新建匝道几何{interchangeName ? ` · ${interchangeName}` : ""}</DialogTitle>
          <DialogDescription>
            点「选取」后在地图上点选起终点，再「路线规划」生成折线坐标；选择高速公路与方向后保存，线路编码按「高速编号-方向」自动生成。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="relative min-h-[320px] overflow-hidden rounded-lg border lg:min-h-[440px]">
            {open ? (
              <BaseMap
                ref={mapRef}
                apiKey={MAP_API_KEY}
                options={{ center: center ?? { lat: 32.06161, lng: 118.763495 }, zoom: 12 }}
                onClick={clickHandler}
                onMousemove={mouseMove}
              >
                <MultiLabel styles={TIP_STYLES} geometries={tipGeometries} />
                <MultiMarker styles={MARKER_STYLES} geometries={fromGeometries} />
                <MultiMarker styles={END_MARKER_STYLES} geometries={toGeometries} />
                <MultiPolyline styles={POLYLINE_STYLES} geometries={polylineGeometries} />
              </BaseMap>
            ) : null}

            {picking ? (
              <div className="bg-background/90 absolute top-2 left-2 z-[1000] rounded-md border px-3 py-1.5 text-xs shadow-sm">
                正在拾取{picking === "origin" ? "起点" : "终点"}，点击地图完成
              </div>
            ) : null}

            {!picking && route && route.length > 0 ? (
              <div className="bg-background/90 absolute bottom-2 left-2 z-[1000] rounded-md border px-3 py-1.5 text-xs shadow-sm">
                已规划 {route.length} 个坐标点
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3">
            <section className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">起终点</span>
                <span className="text-muted-foreground text-xs">GCJ02 坐标</span>
              </div>
              <CoordinateField
                label="起点"
                tone="origin"
                value={originLabel}
                active={picking === "origin"}
                disabled={saving}
                onToggle={() => togglePick("origin")}
              />
              <CoordinateField
                label="终点"
                tone="destination"
                value={destinationLabel}
                active={picking === "destination"}
                disabled={saving}
                onToggle={() => togglePick("destination")}
              />
            </section>

            <section className="flex flex-col gap-3 rounded-lg border p-3">
              <span className="text-sm font-medium">线路编码</span>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="geometry-expressway">高速公路</Label>
                <Select value={expresswayId} onValueChange={setExpresswayId}>
                  <SelectTrigger id="geometry-expressway" className="w-full">
                    <SelectValue placeholder="选择高速公路" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {expresswayOptions.map((item) => {
                      const code = item.number ?? item.abbreviated_name ?? "";
                      return (
                        <SelectItem key={item.id} value={item.id} disabled={!code}>
                          {code ? `${code}${item.name ? ` · ${item.name}` : ""}` : (item.name ?? item.id)}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="geometry-direction">方向</Label>
                <Select value={direction} onValueChange={(value) => setDirection(value as Direction)}>
                  <SelectTrigger id="geometry-direction" className="w-full">
                    <SelectValue placeholder="选择方向" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIRECTION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-muted/40 flex items-center justify-between gap-2 rounded-md px-3 py-2">
                <span className="text-muted-foreground text-xs">编码预览</span>
                <span
                  className={cn("font-mono text-xs font-medium", !routeCode && "text-muted-foreground font-normal")}
                >
                  {routeCode || "待选择"}
                </span>
              </div>
            </section>

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                className="w-full"
                onClick={planRoute}
                disabled={!origin || !destination || planning || saving}
              >
                {planning ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Route data-icon="inline-start" />
                )}
                {planning ? "规划中…" : "路线规划"}
              </Button>
              <div className="text-muted-foreground flex items-center justify-center gap-2 text-xs">
                <RouteStatus route={route} />
              </div>
            </div>

            {routeError ? (
              <p className="text-destructive text-xs">
                路线规划失败：{routeError instanceof Error ? routeError.message : "未知错误"}
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={resetAll} disabled={saving}>
            <Trash2 data-icon="inline-start" />
            清除
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || planning || !route || !routeCode}>
            {saving ? (
              <>
                <Loader2 className="animate-spin" /> 保存中…
              </>
            ) : (
              <>
                <Plus data-icon="inline-start" />
                保存
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
