"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import _, { debounce } from "lodash";
import { BaseMap, MultiLabel, MultiMarker, MultiPolyline } from "tlbs-map-react";
import type { CustomLabelGeometry, CustomPointGeometry, CustomPolylineGeometry } from "tlbs-map-react/dist/interfaces";

import { ActionForm, type FormHandle } from "@/app/(main)/dashboard/map/_components/action-form";
import { Card, CardContent } from "@/components/ui/card";

export default function Page() {
  // 获取地图实例 mapRef.current
  const mapRef = useRef<TMap.Map>(null);
  const [center, setCenter] = useState({ lat: 32.06161, lng: 118.763495 });
  const polylineRef = useRef<TMap.MultiPolyline>(null);
  // 获取点标记图层实例 markerRef.current
  const markerRef = useRef<TMap.MultiMarker>(null);

  const [tipGeometries, setTipGeometries] = useState<CustomLabelGeometry[]>([]);
  const [fromGeometries, setFromGeometries] = useState<CustomPointGeometry[]>([]);
  const [toGeometries, setToGeometries] = useState<CustomPointGeometry[]>([]);
  const [polylineGeometries, setPolylineGeometries] = useState<CustomPolylineGeometry[]>([]);

  const [editingType, setEditingType] = useState<"origin" | "destination" | null>(null);
  const editingTypeRef = useRef<"origin" | "destination" | null>(null);

  // 同步状态到ref
  useEffect(() => {
    editingTypeRef.current = editingType;
  }, [editingType]);

  const clickHandler = useCallback((event: TMap.MapEvent) => {
    console.log("🚀🚀🚀 点标记图层点击事件", event);
    const lat = event.latLng.getLat().toFixed(6);
    const lng = event.latLng.getLng().toFixed(6);
    const location = `${lat},${lng}`;
    const currentType = editingTypeRef.current; // 通过ref获取最新值
    if (currentType === "origin") {
      formRef.current?.setOrigin(location);
      setFromGeometries([
        {
          styleId: "start",
          position: { lat: Number(lat), lng: Number(lng) },
        },
      ]);
    }

    if (currentType === "destination") {
      formRef.current?.setDestination(location);
      setToGeometries([
        {
          styleId: "end",
          position: { lat: Number(lat), lng: Number(lng) },
        },
      ]);
    }

    // 选完一次即退出拾取模式，避免坐标提示框一直跟随鼠标
    if (currentType) {
      setEditingType(null);
      setTipGeometries([]);
    }
    console.log(event.latLng);
    // setGeometries(geometriesData2);
    // markerRef.current?.updateGeometries([
    //   {
    //     id: "tips",
    //     position: new TMap.LatLng(39.994104, 116.287503),
    //   },
    // ]);
    // console.log(markerRef.current.getGeometries());
  }, []);

  const onMapInited = useCallback(() => {
    console.log("🚀🚀🚀 地图加载完成", mapRef.current);
  }, []);

  const renderMap = useCallback((path: TMap.LatLngData[] | null) => {
    if (path && path.length > 0) {
      const latLngBounds = new TMap.LatLngBounds();
      path.forEach((point) => {
        latLngBounds.extend(new TMap.LatLng(point.lat, point.lng));
      });

      mapRef.current?.fitBounds(latLngBounds, { padding: 100 });

      setEditingType(null);

      setPolylineGeometries([
        {
          styleId: "polyline",
          paths: path,
        },
      ]);
    }
  }, []);

  const mouseMove = useMemo(
    () =>
      debounce((event: TMap.MapEvent) => {
        const lat = event.latLng.getLat().toFixed(6);
        const lng = event.latLng.getLng().toFixed(6);
        if (editingTypeRef.current === "origin" || editingTypeRef.current === "destination") {
          setTipGeometries([
            {
              styleId: "multiLabelStyle",
              position: { lat: Number(lat), lng: Number(lng) },
              content: lat + "," + lng,
            },
          ]);
        }
      }, 1),
    [],
  );

  const formRef = useRef<FormHandle>(null);

  const handlePickOrigin = useCallback(() => {
    if (editingType === "origin") {
      console.log(editingType);
      setEditingType(null);
      setTipGeometries([]);
      return;
    }
    setEditingType("origin");
  }, [editingType]);

  const handlePickDestination = useCallback(() => {
    if (editingType === "destination") {
      setEditingType(null);
      setTipGeometries([]);
      return;
    }
    setEditingType("destination");
  }, [editingType]);

  const onReset = useCallback(() => {
    setEditingType(null);
    setTipGeometries([]);
    setFromGeometries([]);
    setToGeometries([]);
    setPolylineGeometries([]);
  }, []);

  return (
    <div className="relative h-full w-full">
      <div
        id="container"
        className={"h-full w-full"}
        // style={{ height: "calc(100% - 200px)", padding: 0, margin: 0, width: "100%" }}
      >
        <BaseMap
          ref={mapRef}
          apiKey="OB4BZ-D4W3U-B7VVO-4PJWW-6TKDJ-WPB77"
          options={{ center }}
          onClick={clickHandler}
          onMousemove={mouseMove}
          onMapInited={onMapInited}
        >
          <MultiLabel
            ref={markerRef}
            styles={{
              multiLabelStyle: {
                color: "#0a0a0a", // 颜色属性
                size: 14, // 文字大小属性
                width: 180, // 文字背景框宽度
                height: 36, // 文字背景框高度
                backgroundColor: "#ffffff", // 文字背景框颜色属性
                borderWidth: 1, // 文字背景框边线宽度
                borderRadius: 8, // 文字背景框圆角
                borderColor: "#e5e5e5", // 文字背景框边线颜色
                offset: {
                  x: 100,
                  y: -36,
                },
              },
            }}
            geometries={tipGeometries}
            onClick={clickHandler}
          />
          <MultiMarker
            styles={{
              start: {
                width: 25,
                height: 35,
                anchor: { x: 16, y: 32 },
                src: "https://mapapi.qq.com/web/lbs/javascriptGL/demo/img/start.png",
              },
            }}
            geometries={fromGeometries}
          />
          <MultiMarker
            styles={{
              end: {
                width: 25,
                height: 35,
                anchor: { x: 16, y: 32 },
                src: "https://mapapi.qq.com/web/lbs/javascriptGL/demo/img/end.png",
              },
            }}
            geometries={toGeometries}
          />
          <MultiPolyline
            ref={polylineRef}
            styles={{
              polyline: {
                color: "#3777FF", // 线填充色
                width: 8, // 折线宽度
                borderWidth: 5, // 边线宽度
                borderColor: "#FFF", // 边线颜色
                lineCap: "round", // 线端头方式
              },
            }}
            geometries={polylineGeometries}
            onClick={clickHandler}
          />
        </BaseMap>
      </div>
      <Card className="absolute top-4 left-4 z-[2000] max-h-[calc(100%-2rem)] w-80 max-w-[calc(100%-2rem)] shadow-lg">
        <CardContent className="min-h-0 overflow-y-auto">
          <ActionForm
            ref={formRef}
            renderMap={renderMap}
            editingType={editingType}
            onPickOrigin={handlePickOrigin}
            onPickDestination={handlePickDestination}
            onClearMap={onReset}
          />
        </CardContent>
      </Card>
    </div>
  );
}
