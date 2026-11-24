import { type NextRequest, NextResponse } from "next/server";

import type { ServiceDrivingSearchResult } from "tmap-gl-types/types/packages/service/types/driving";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = request.nextUrl.searchParams.get("origin") ?? "";
  const destination = request.nextUrl.searchParams.get("destination") ?? "";
  const base = "https://apis.map.qq.com/ws/direction/v1/driving";

  const params = new URLSearchParams({
    key: process.env.NEXT_PUBLIC_MAP_KEY!,
    from: origin,
    to: destination,
    road_type: "3",
    policy: "LEAST_TIME,HIGHWAY_FIRST",
    waypoints: "",
  });
  const url = `${base}?${params}`;
  const data = await fetch(url);
  const driving: ServiceDrivingSearchResult = await data.json();
  console.log(driving);
  console.log(driving.result.routes[0].polyline);

  return NextResponse.json(driving.result);
}
