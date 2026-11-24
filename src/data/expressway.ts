import { createClient } from "@/lib/supabase/client";
import type { CreateInterchangeGeometryInput, ExpresswayOption } from "@/types/expressway";

export async function fetchExpresswayOptions(): Promise<ExpresswayOption[]> {
  const { data, error } = await createClient()
    .from("expressway")
    .select("id, number, abbreviated_name, name, district")
    // district 是 text[] 数组列，服务端过滤包含江苏省代码 320000 的记录
    .contains("district", ["320000"])
    .order("order_code");

  if (error) throw error;
  return data ?? [];
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
