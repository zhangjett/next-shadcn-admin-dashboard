import { createClient } from "@/lib/supabase/client";
import type {
  CreateInterchangeGeometryInput,
  ExpresswayNodeKind,
  ExpresswayNodeOption,
  ExpresswayOption,
  JiangsuNetwork,
  NetworkSection,
  RoutePoint,
  SectionCreateInput,
  SectionRow,
  SectionUpdateInput,
} from "@/types/expressway";

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

/** 江苏省级行政区划代码，高速的 district 数组里含它即视为江苏高速 */
const JIANGSU_CODE = "320000";
/** 互通 district 为单个行政区代码，32 开头即江苏 */
const JIANGSU_PREFIX = "32";
/** uuid 每批数量，避免 in 查询把 URL 撑爆 */
const SECTION_BATCH_SIZE = 80;

type ExpresswayMeta = { number: string | null; name: string | null };

type NetworkSectionQueryRow = {
  id: string;
  start_location: string | null;
  end_location: string | null;
  direction: string | null;
  section_type: string | null;
  road_geometry: { type?: string; coordinates?: RoutePoint[] } | null;
};

type SectionListQueryRow = {
  id: string;
  start_location: string | null;
  end_location: string | null;
  direction: string | null;
  section_type: string | null;
  entrance_ramp_status: number | null;
  exit_ramp_status: number | null;
  start_station_id: string | null;
  start_interchange_id: string | null;
  end_station_id: string | null;
  end_interchange_id: string | null;
};

function chunkItems<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

/** 江苏高速 id → 编号/名称，以及 section → 所属江苏高速 id 的映射 */
async function fetchJiangsuExpresswayLinks(): Promise<{
  meta: Map<string, ExpresswayMeta>;
  expresswayIdsBySection: Map<string, string[]>;
}> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("expressway")
    .select("id, number, name")
    .contains("district", [JIANGSU_CODE]);

  if (error) throw error;

  const expressways = (data ?? []) as { id: string; number: string | null; name: string | null }[];
  const meta = new Map(expressways.map((item) => [item.id, { number: item.number, name: item.name }]));
  const expresswayIdsBySection = new Map<string, string[]>();

  if (expressways.length === 0) return { meta, expresswayIdsBySection };

  const { data: links, error: linkError } = await supabase
    .from("expressway_section_road")
    .select("section_id, expressway_id")
    .in(
      "expressway_id",
      expressways.map((item) => item.id),
    );

  if (linkError) throw linkError;

  for (const link of (links ?? []) as { section_id: string; expressway_id: string }[]) {
    const ids = expresswayIdsBySection.get(link.section_id) ?? [];
    if (!ids.includes(link.expressway_id)) ids.push(link.expressway_id);
    expresswayIdsBySection.set(link.section_id, ids);
  }

  return { meta, expresswayIdsBySection };
}

/** uuid 数量多时 URL 会超长，按批并发查 section */
async function fetchSectionsInBatches<Row>(ids: string[], columns: string): Promise<Row[]> {
  const supabase = createClient();

  const results = await Promise.all(
    chunkItems(ids, SECTION_BATCH_SIZE).map(async (batch) => {
      const { data, error } = await supabase.from("expressway_section").select(columns).in("id", batch);

      if (error) throw error;
      return (data ?? []) as Row[];
    }),
  );

  return results.flat();
}

/**
 * 江苏路网：全省互通点位 + 经 expressway_section_road 关联到江苏高速的路段。
 * 路段几何存在 road_geometry（GeoJSON LineString），坐标顺序 [lng, lat]。
 */
export async function fetchJiangsuNetwork(): Promise<JiangsuNetwork> {
  const [interchangeResult, links] = await Promise.all([
    createClient()
      .from("expressway_interchange")
      .select("id, node_name, inter_type, lat, lng")
      .like("district", `${JIANGSU_PREFIX}%`)
      .not("lat", "is", null)
      .not("lng", "is", null),
    fetchJiangsuExpresswayLinks(),
  ]);

  if (interchangeResult.error) throw interchangeResult.error;

  const interchanges = (interchangeResult.data ?? []) as JiangsuNetwork["interchanges"];
  const { meta, expresswayIdsBySection } = links;

  if (expresswayIdsBySection.size === 0) return { interchanges, sections: [] };

  const numbersBySection = new Map<string, string[]>();

  for (const [sectionId, expresswayIds] of expresswayIdsBySection) {
    const numbers = expresswayIds
      .map((id) => meta.get(id)?.number)
      .filter((number): number is string => Boolean(number));
    numbersBySection.set(sectionId, numbers);
  }

  const rows = await fetchSectionsInBatches<NetworkSectionQueryRow>(
    [...expresswayIdsBySection.keys()],
    "id, start_location, end_location, direction, section_type, road_geometry",
  );

  const sections: NetworkSection[] = rows
    .map((row) => ({
      id: row.id,
      expressway_numbers: numbersBySection.get(row.id) ?? [],
      start_location: row.start_location,
      end_location: row.end_location,
      direction: row.direction,
      section_type: row.section_type,
      coordinates: Array.isArray(row.road_geometry?.coordinates) ? row.road_geometry.coordinates : [],
    }))
    .filter((section) => section.coordinates.length > 1);

  return { interchanges, sections };
}

/** 路段列表：一条 section 关联多条高速时展开成多行，便于按高速分组 */
export async function fetchJiangsuSectionRows(): Promise<SectionRow[]> {
  const { meta, expresswayIdsBySection } = await fetchJiangsuExpresswayLinks();

  if (expresswayIdsBySection.size === 0) return [];

  const rows = await fetchSectionsInBatches<SectionListQueryRow>(
    [...expresswayIdsBySection.keys()],
    "id, start_location, end_location, direction, section_type, entrance_ramp_status, exit_ramp_status, start_station_id, start_interchange_id, end_station_id, end_interchange_id",
  );

  const result: SectionRow[] = [];

  for (const row of rows) {
    const expresswayIds = expresswayIdsBySection.get(row.id);

    if (!expresswayIds || expresswayIds.length === 0) continue;

    for (const expresswayId of expresswayIds) {
      const expressway = meta.get(expresswayId);

      result.push({
        rowKey: `${row.id}:${expresswayId}`,
        id: row.id,
        start_location: row.start_location,
        end_location: row.end_location,
        direction: row.direction,
        section_type: row.section_type,
        entrance_ramp_status: row.entrance_ramp_status,
        exit_ramp_status: row.exit_ramp_status,
        start_node_id: row.start_interchange_id ?? row.start_station_id,
        start_node_kind: resolveNodeKind(row.start_interchange_id, row.start_station_id),
        end_node_id: row.end_interchange_id ?? row.end_station_id,
        end_node_kind: resolveNodeKind(row.end_interchange_id, row.end_station_id),
        expressway_id: expresswayId,
        expressway_number: expressway?.number ?? null,
        expressway_name: expressway?.name ?? null,
      });
    }
  }

  return result;
}

/** 单条路段详情，供编辑页使用 */
export async function fetchSectionRow(id: string): Promise<SectionRow | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("expressway_section")
    .select(
      "id, start_location, end_location, direction, section_type, entrance_ramp_status, exit_ramp_status, start_station_id, start_interchange_id, end_station_id, end_interchange_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as SectionListQueryRow;

  const { data: link, error: linkError } = await supabase
    .from("expressway_section_road")
    .select("expressway_id")
    .eq("section_id", id)
    .limit(1)
    .maybeSingle();

  if (linkError) throw linkError;

  const expresswayId = (link as { expressway_id: string } | null)?.expressway_id ?? "";
  const { data: expressway, error: expresswayError } = expresswayId
    ? await supabase.from("expressway").select("number, name").eq("id", expresswayId).maybeSingle()
    : { data: null, error: null };

  if (expresswayError) throw expresswayError;

  const meta = expressway as { number: string | null; name: string | null } | null;

  return {
    rowKey: `${row.id}:${expresswayId}`,
    id: row.id,
    expressway_id: expresswayId,
    expressway_number: meta?.number ?? null,
    expressway_name: meta?.name ?? null,
    start_location: row.start_location,
    end_location: row.end_location,
    direction: row.direction,
    section_type: row.section_type,
    entrance_ramp_status: row.entrance_ramp_status,
    exit_ramp_status: row.exit_ramp_status,
    start_node_id: row.start_interchange_id ?? row.start_station_id,
    start_node_kind: resolveNodeKind(row.start_interchange_id, row.start_station_id),
    end_node_id: row.end_interchange_id ?? row.end_station_id,
    end_node_kind: resolveNodeKind(row.end_interchange_id, row.end_station_id),
  };
}

/** 路段基础字段编辑；RLS 拦截时更新 0 行，需要显式报错 */
export async function updateSection({
  id,
  startNode,
  endNode,
  direction,
  sectionType,
  entranceRampStatus,
  exitRampStatus,
}: SectionUpdateInput): Promise<void> {
  const start = sectionNodeColumns(startNode);
  const end = sectionNodeColumns(endNode);

  const { data, error } = await createClient()
    .from("expressway_section")
    .update({
      start_location: start.name,
      start_station_id: start.stationId,
      start_interchange_id: start.interchangeId,
      end_location: end.name,
      end_station_id: end.stationId,
      end_interchange_id: end.interchangeId,
      direction: direction || null,
      section_type: sectionType.trim() || null,
      entrance_ramp_status: entranceRampStatus,
      exit_ramp_status: exitRampStatus,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("路段不存在或没有编辑权限");
}

/** 节点写库：收费站与互通分属两套外键，不能混用 */
function resolveNodeKind(interchangeId: string | null, stationId: string | null): ExpresswayNodeKind | null {
  if (interchangeId) return "interchange";
  if (stationId) return "toll_station";
  return null;
}

function sectionNodeColumns(node: ExpresswayNodeOption | null) {
  if (!node) {
    return { name: null, stationId: null, interchangeId: null };
  }

  return {
    name: node.name,
    stationId: node.kind === "toll_station" ? node.id || null : null,
    interchangeId: node.kind === "interchange" ? node.id || null : null,
  };
}

/** 某条高速下的全部节点：收费站 + 互通，带桩号并按桩号升序 */
export async function fetchExpresswayNodes(expresswayId: string): Promise<ExpresswayNodeOption[]> {
  const supabase = createClient();

  const [stations, interchanges] = await Promise.all([
    supabase
      .from("expressway_toll_station_road")
      .select("stake_km, station:expressway_toll_station(id, name, station_type)")
      .eq("expressway_id", expresswayId),
    supabase
      .from("expressway_interchange_road")
      .select("stake_km, node:expressway_interchange(id, node_name, inter_type)")
      .eq("expressway_id", expresswayId),
  ]);

  if (stations.error) throw stations.error;
  if (interchanges.error) throw interchanges.error;

  const nodes = new Map<string, ExpresswayNodeOption>();

  for (const row of (stations.data ?? []) as unknown as {
    stake_km: number | string | null;
    station: { id: string; name: string; station_type: string | null } | null;
  }[]) {
    const station = row.station;
    if (!station) continue;

    const node: ExpresswayNodeOption = {
      id: station.id,
      kind: "toll_station",
      name: station.name,
      subtype: station.station_type,
      stakeKm: toStakeKm(row.stake_km),
    };

    const existing = nodes.get(node.id);
    if (!existing || (existing.stakeKm === null && node.stakeKm !== null)) nodes.set(node.id, node);
  }

  for (const row of (interchanges.data ?? []) as unknown as {
    stake_km: number | string | null;
    node: { id: string; node_name: string; inter_type: string | null } | null;
  }[]) {
    const interchange = row.node;
    if (!interchange) continue;

    const node: ExpresswayNodeOption = {
      id: interchange.id,
      kind: "interchange",
      name: interchange.node_name,
      subtype: interchange.inter_type,
      stakeKm: toStakeKm(row.stake_km),
    };

    const existing = nodes.get(node.id);
    if (!existing || (existing.stakeKm === null && node.stakeKm !== null)) nodes.set(node.id, node);
  }

  return [...nodes.values()].sort(
    (a, b) =>
      (a.stakeKm ?? Number.POSITIVE_INFINITY) - (b.stakeKm ?? Number.POSITIVE_INFINITY) ||
      a.name.localeCompare(b.name, "zh"),
  );
}

function toStakeKm(value: number | string | null): number | null {
  if (value === null || value === "") return null;

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 江苏高速下拉选项，供新增路段选择归属 */
export async function fetchJiangsuExpresswayOptions(): Promise<ExpresswayOption[]> {
  const { data, error } = await createClient()
    .from("expressway")
    .select("id, number, name, abbreviated_name, district")
    .contains("district", [JIANGSU_CODE])
    .order("number", { ascending: true });

  if (error) throw error;

  return (data ?? []) as ExpresswayOption[];
}

/** 新增路段：先写 section，再写 expressway_section_road 关联，关联失败时回滚 */
export async function createSection({
  expresswayId,
  startNode,
  endNode,
  direction,
  sectionType,
  entranceRampStatus,
  exitRampStatus,
}: SectionCreateInput): Promise<void> {
  const supabase = createClient();

  const { data: expressway, error: expresswayError } = await supabase
    .from("expressway")
    .select("id, number")
    .eq("id", expresswayId)
    .maybeSingle();

  if (expresswayError) throw expresswayError;
  if (!expressway) throw new Error("所属高速不存在");

  const id = crypto.randomUUID();
  const start = sectionNodeColumns(startNode);
  const end = sectionNodeColumns(endNode);

  const { error } = await supabase.from("expressway_section").insert({
    id,
    expressway_number: expressway.number,
    start_location: start.name,
    start_station_id: start.stationId,
    start_interchange_id: start.interchangeId,
    end_location: end.name,
    end_station_id: end.stationId,
    end_interchange_id: end.interchangeId,
    direction: direction || null,
    section_type: sectionType.trim() || null,
    entrance_ramp_status: entranceRampStatus,
    exit_ramp_status: exitRampStatus,
    road_geometry: null,
  });

  if (error) throw error;

  const { error: linkError } = await supabase.from("expressway_section_road").insert({
    section_id: id,
    expressway_id: expresswayId,
  });

  if (linkError) {
    await supabase.from("expressway_section").delete().eq("id", id);
    throw linkError;
  }
}
