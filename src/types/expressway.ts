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
