import { type NextRequest, NextResponse } from "next/server";

import type { ServiceSuggestionResult } from "tmap-gl-types/types/packages/service/types/suggestion";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const keyword = request.nextUrl.searchParams.get("keyword") ?? "";

  if (!keyword) return NextResponse.json([], { status: 400 });

  const base = "https://apis.map.qq.com/ws/place/v1/suggestion";
  const params = new URLSearchParams({
    key: process.env.NEXT_PUBLIC_MAP_KEY!,
    region: "江苏",
    keyword: keyword,
  });
  const url = `${base}?${encodeURIComponent(params.toString())}`;
  const suggestionResult: ServiceSuggestionResult = await fetch(url).then((d) => d.json());
  if (suggestionResult.status !== 0) return NextResponse.json([], { status: 500 });

  return NextResponse.json(suggestionResult.data);
}
