export type PickingTarget = "origin" | "destination" | null;

export type Direction = "UP" | "DOWN";

/** 线路类型：主线只有起端，匝道需要起端 -> 终端 */
export type LineType = "mainline" | "ramp";

export type ExpresswayOption = {
  id: string;
  number: string | null;
  abbreviated_name: string | null;
  name: string | null;
  district: string[] | null;
};

export type RoutePoint = [number, number];

export type GeometryCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interchangeId: string;
  interchangeName?: string | null;
  /** 地图初始中心，用互通自身的坐标 */
  center?: { lat: number; lng: number } | null;
  /** 保存成功后刷新几何列表 */
  onSaved?: () => void;
};

export type CreateInterchangeGeometryInput = {
  interchangeId: string;
  routeCode: string;
  route: RoutePoint[];
};

export type NetworkInterchange = {
  id: string;
  node_name: string | null;
  inter_type: string | null;
  lat: number;
  lng: number;
};

export type NetworkSection = {
  id: string;
  /** 所属高速编号，来自 expressway_section_road 关联，可能多条 */
  expressway_numbers: string[];
  start_location: string | null;
  end_location: string | null;
  direction: string | null;
  section_type: string | null;
  /** GeoJSON LineString 坐标，顺序 [lng, lat] */
  coordinates: RoutePoint[];
};

export type JiangsuNetwork = {
  interchanges: NetworkInterchange[];
  sections: NetworkSection[];
};

/** 路段端点：收费站或互通 */
export type ExpresswayNodeKind = "toll_station" | "interchange";

export type ExpresswayNodeOption = {
  id: string;
  kind: ExpresswayNodeKind;
  name: string;
  subtype: string | null;
  stakeKm: number | null;
};

/** 路段列表行：一条 section 关联多条高速时会拆成多行 */
export type SectionRow = {
  rowKey: string;
  id: string;
  expressway_id: string;
  expressway_number: string | null;
  expressway_name: string | null;
  start_location: string | null;
  end_location: string | null;
  direction: string | null;
  section_type: string | null;
  entrance_ramp_status: number | null;
  exit_ramp_status: number | null;
  start_node_id: string | null;
  start_node_kind: ExpresswayNodeKind | null;
  end_node_id: string | null;
  end_node_kind: ExpresswayNodeKind | null;
};

export type SectionUpdateInput = {
  id: string;
  startNode: ExpresswayNodeOption | null;
  endNode: ExpresswayNodeOption | null;
  direction: string;
  sectionType: string;
  entranceRampStatus: number;
  exitRampStatus: number;
};

export type SectionCreateInput = {
  expresswayId: string;
  startNode: ExpresswayNodeOption;
  endNode: ExpresswayNodeOption;
  direction: string;
  sectionType: string;
  entranceRampStatus: number;
  exitRampStatus: number;
};
