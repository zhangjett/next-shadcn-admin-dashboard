import type MapTypes from "tmap-gl-types";

declare global {
  interface Window {
    _AMapSecurityConfig: object;
    TMap: MapTypes;
  }
}
