import { createClient } from "@/lib/supabase/client";

export type InterchangeDetail = {
  id: string;
  node_name: string | null;
  node_code: string | null;
  inter_type: string | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
  crs: string | null;
};

export type RelatedExpressway = {
  expressway_id: string;
  number: string | null;
  abbreviated_name: string | null;
  name: string | null;
  stake_km: number | null;
  link_role: string | null;
};

/** 非法 ID 直接判未找到，避免拿着乱串去查 PostgREST 报 400 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 互通详情页各子页面共用：查互通主记录 */
export async function fetchInterchange(id: string): Promise<InterchangeDetail | null> {
  const { data, error } = await createClient()
    .from("expressway_interchange")
    .select("id, node_name, node_code, inter_type, district, lat, lng, crs")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;

  return (data ?? null) as InterchangeDetail | null;
}

/** 互通详情页各子页面共用：查行政区名称 */
export async function fetchDistrictName(code: string): Promise<string | null> {
  const { data, error } = await createClient()
    .from("district")
    .select("code, full_name, name")
    .eq("code", code)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return (data.full_name ?? data.name ?? data.code) as string;
}

/** 互通详情页各子页面共用：查该互通关联的高速（含桩号与关联方式） */
export async function fetchRelatedExpressways(interchangeId: string): Promise<RelatedExpressway[]> {
  const { data, error } = await createClient()
    .from("expressway_interchange_road")
    .select("expressway_id, stake_km, link_role, expressway:expressway(id, number, abbreviated_name, name)")
    .eq("interchange_id", interchangeId);

  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    expressway_id: string;
    stake_km: number | null;
    link_role: string | null;
    expressway: { number: string | null; abbreviated_name: string | null; name: string | null } | null;
  }[];

  return rows
    .map((row) => ({
      expressway_id: row.expressway_id,
      number: row.expressway?.number ?? null,
      abbreviated_name: row.expressway?.abbreviated_name ?? null,
      name: row.expressway?.name ?? null,
      stake_km: row.stake_km,
      link_role: row.link_role,
    }))
    .sort((a, b) => (a.stake_km ?? Number.POSITIVE_INFINITY) - (b.stake_km ?? Number.POSITIVE_INFINITY));
}
