"use client";

import { type FC, type Ref, useCallback, useEffect, useImperativeHandle, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import * as turf from "@turf/turf";
import { saveAs } from "file-saver";
import { ChevronDown, ClipboardCopy, Download, MapPin } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import useSWR from "swr";
import { z } from "zod";

import {
  ExpresswaySectionPicker,
  type SectionSelection,
} from "@/app/(main)/dashboard/map/_components/expressway-picker-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { fetchDrivingRoute } from "@/lib/tmap-driving";

export type FormHandle = {
  setOrigin: (location: string) => void;
  setDestination: (location: string) => void;
};

type PickingTarget = "origin" | "destination" | null;

interface Props {
  ref?: Ref<FormHandle>;
  renderMap: (coors: TMap.LatLngData[] | null) => void;
  /** 当前正在地图上拾取的目标 */
  editingType?: PickingTarget;
  onPickOrigin?: () => void;
  onPickDestination?: () => void;
  /** 清除表单时同时清理地图上的标记与线路 */
  onClearMap?: () => void;
}

const formSchema = z.object({
  origin: z.string(),
  destination: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

/** 解码压缩坐标与路线规划接口已抽到 @/lib/tmap-driving，地图页和互通几何新建共用 */

export const ActionForm: FC<Props> = ({
  ref,
  renderMap,
  editingType = null,
  onPickOrigin,
  onPickDestination,
  onClearMap,
}) => {
  const [driving, setDriving] = useState<{ origin: string; destination: string } | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [linkedSection, setLinkedSection] = useState<SectionSelection | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      origin: "",
      destination: "",
    },
  });

  const drivingKey = driving
    ? `http://localhost:3000/api/map/driving?origin=${driving.origin}&destination=${driving.destination}`
    : null;

  const { data, isLoading } = useSWR(drivingKey, fetchDrivingRoute);

  useImperativeHandle(ref, () => ({
    setOrigin(location: string) {
      form.setValue("origin", location);
    },
    setDestination(location: string) {
      form.setValue("destination", location);
    },
  }));

  const onSubmit = useCallback(async () => {
    setIsSaving(true);

    try {
      if (!data || data.length === 0) {
        toast.warning("请先规划路径！", { position: "top-center" });
        return;
      }

      if (!linkedSection) {
        toast.warning("请先关联线路！", { position: "top-center" });
        return;
      }

      const { expresswayNumber, startStation, endStation, direction } = linkedSection;

      // section 的端点分两套外键：收费站写 *_station_id，互通写 *_interchange_id，不能混用
      const startIsTollStation = startStation.kind === "toll_station";
      const endIsTollStation = endStation.kind === "toll_station";

      // road_geometry 是 jsonb（带 crs），坐标顺序为 [lng, lat]
      const payload = {
        expressway_number: expresswayNumber,
        start_station_id: startIsTollStation ? startStation.id : null,
        start_interchange_id: startIsTollStation ? null : startStation.id,
        end_station_id: endIsTollStation ? endStation.id : null,
        end_interchange_id: endIsTollStation ? null : endStation.id,
        start_location: startStation.name,
        end_location: endStation.name,
        direction,
        section_type: "road_section",
        road_geometry: {
          type: "LineString",
          crs: { type: "name", properties: { name: "EPSG:4326" } },
          coordinates: data.map((point): [number, number] => [point[1], point[0]]),
        },
        entrance_ramp_status: 1,
        exit_ramp_status: 1,
      };

      const { error } = await createClient().from("expressway_section").insert(payload);
      if (error) throw error;

      toast.success(`已保存 ${expresswayNumber} ${startStation.name} → ${endStation.name}`, {
        position: "top-center",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败", { position: "top-center" });
    } finally {
      setIsSaving(false);
    }
  }, [data, linkedSection]);

  const plan = useCallback(() => {
    const origin = form.getValues("origin");
    const destination = form.getValues("destination");

    if (!origin || !destination) {
      toast.warning("起点坐标和终点坐标不能为空！", { position: "top-center" });
      return;
    }

    setDriving({ origin, destination });
  }, [form]);

  function onReset() {
    form.reset();
    form.clearErrors();
    onClearMap?.();
  }

  /** 下载和复制共用：把规划出的坐标转成 GeoJSON LineString 字符串（[lng, lat]） */
  const routeGeoJSON = useCallback(() => {
    if (!data) {
      toast.warning("请先规划路径！", { position: "top-center" });
      return null;
    }

    return JSON.stringify(
      turf.lineString(
        data.map((point): [number, number] => [point[1], point[0]]),
        {},
      ).geometry,
    );
  }, [data]);

  const download = useCallback(() => {
    const json = routeGeoJSON();
    if (json === null) return;

    saveAs(new Blob([json], { type: "application/json" }), "route.json");
  }, [routeGeoJSON]);

  const copyRoute = useCallback(async () => {
    const json = routeGeoJSON();
    if (json === null) return;

    try {
      await navigator.clipboard.writeText(json);
      toast.success("线路 GeoJSON 已复制到剪贴板", { position: "top-center" });
    } catch {
      toast.error("复制失败，浏览器可能未授权剪贴板权限", { position: "top-center" });
    }
  }, [routeGeoJSON]);

  useEffect(() => {
    if (data && data.length > 0) {
      const path = data.map((point) => new TMap.LatLng(point[0], point[1]));
      renderMap(path);
    }
  }, [data, renderMap]);

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} onReset={onReset} className="space-y-4">
      <div className="flex flex-col gap-4">
        <Controller
          control={form.control}
          name="origin"
          render={({ field, fieldState }) => (
            <Field className="gap-2" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="route-origin">起点坐标</FieldLabel>
              <div className="flex items-center gap-2">
                <div className="relative w-full">
                  <Input
                    {...field}
                    id="route-origin"
                    type="text"
                    placeholder="点击「选取」在地图上点选"
                    readOnly
                    className="ps-9"
                    aria-invalid={fieldState.invalid}
                  />
                  <div className="text-muted-foreground pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3">
                    <MapPin className="size-4" strokeWidth={2} />
                  </div>
                </div>
                <Button
                  type="button"
                  variant={editingType === "origin" ? "default" : "outline"}
                  className="shrink-0"
                  aria-pressed={editingType === "origin"}
                  onClick={onPickOrigin}
                >
                  {editingType === "origin" ? "取消" : "选取"}
                </Button>
              </div>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="destination"
          render={({ field, fieldState }) => (
            <Field className="gap-2" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="route-destination">终点坐标</FieldLabel>
              <div className="flex items-center gap-2">
                <div className="relative w-full">
                  <Input
                    {...field}
                    id="route-destination"
                    type="text"
                    placeholder="点击「选取」在地图上点选"
                    readOnly
                    className="ps-9"
                    aria-invalid={fieldState.invalid}
                  />
                  <div className="text-muted-foreground pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3">
                    <MapPin className="size-4" strokeWidth={2} />
                  </div>
                </div>
                <Button
                  type="button"
                  variant={editingType === "destination" ? "default" : "outline"}
                  className="shrink-0"
                  aria-pressed={editingType === "destination"}
                  onClick={onPickDestination}
                >
                  {editingType === "destination" ? "取消" : "选取"}
                </Button>
              </div>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={plan}>
            {isLoading ? "规划中..." : "路径规划"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="w-full">
                <Download className="size-4" />
                导出线路
                <ChevronDown className="text-muted-foreground ml-auto size-4" />
              </Button>
            </DropdownMenuTrigger>
            {/* 卡片浮层是 z-[2000]，Portal 到 body 的菜单默认 z-50 会被压在卡片下面，必须更高 */}
            <DropdownMenuContent align="start" className="z-[3000]">
              <DropdownMenuItem onClick={download}>
                <Download className="size-4" />
                下载 JSON 文件
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyRoute}>
                <ClipboardCopy className="size-4" />
                复制到剪贴板
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="col-span-2 flex flex-col gap-1">
            <Button type="button" variant="outline" className="w-full" onClick={() => setPickerOpen(true)}>
              关联线路
            </Button>
            <p className="text-muted-foreground truncate text-xs">
              {linkedSection
                ? `已关联：${linkedSection.expresswayNumber} ${linkedSection.expresswayName} · ${
                    linkedSection.startStation.name
                  } → ${linkedSection.endStation.name}（${linkedSection.direction === "UP" ? "上行" : "下行"}）`
                : "未关联线路"}
            </p>
          </div>
          <Button type="submit">{isSaving ? "保存中..." : "保存"}</Button>
          <Button type="reset" variant="outline">
            清除
          </Button>
        </div>
        <ExpresswaySectionPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          value={linkedSection}
          onConfirm={setLinkedSection}
        />
      </div>
    </form>
  );
};
