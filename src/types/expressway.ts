export type PickingTarget = "origin" | "destination" | null;

export type Direction = "UP" | "DOWN";

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
