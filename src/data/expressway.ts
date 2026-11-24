import { createClient } from "@/lib/supabase/client";
import type { CreateInterchangeGeometryInput, ExpresswayOption } from "@/types/expressway";

/** 只返回该互通关联的高速，供新建匝道几何时选择线路 */
export async function fetchInterchangeExpresswayOptions(interchangeId: string): Promise<ExpresswayOption[]> {
  const { data, error } = await createClient()
    .from("expressway_interchange_road")
    .select("expressway:expressway(id, number, abbreviated_name, name, district)")
    .eq("interchange_id", interchangeId);

  if (error) throw error;

  const rows = (data ?? []) as unknown as { expressway: ExpresswayOption | null }[];

  return rows
    .map((row) => row.expressway)
    .filter((item): item is ExpresswayOption => item !== null)
    .sort((a, b) => (a.number ?? a.abbreviated_name ?? "").localeCompare(b.number ?? b.abbreviated_name ?? ""));
}

export async function createInterchangeGeometry({
  interchangeId,
  routeCode,
  route,
}: CreateInterchangeGeometryInput): Promise<void> {
  const { error } = await createClient().rpc("create_interchange_geometry", {
    p_interchange_id: interchangeId,
    p_route_code: routeCode,
    p_geojson: {
      type: "LineString",
      // GeoJSON 坐标顺序固定为 [lng, lat]，SRID 4326 在 RPC 内指定
      coordinates: route.map(([lat, lng]) => [lng, lat]),
    },
  });

  if (error) throw error;
}
