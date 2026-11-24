"use client";

import * as React from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "cn";
import { ChevronLeft } from "lucide-react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { InterTypeBadge } from "../_components/interchange-type-badge";
import { fetchInterchange, type InterchangeDetail, UUID_RE } from "./_components/interchange-detail";

const TABS = [
  { label: "概览", suffix: "" },
  { label: "匝道几何", suffix: "/geometry" },
] as const;

export default function InterchangeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const pathname = usePathname();
  const base = `/dashboard/expressway/interchange/${id}`;

  const validId = UUID_RE.test(id);

  const {
    data: interchange,
    error,
    isLoading,
  } = useSWR<InterchangeDetail | null>(validId ? ["expressway_interchange", id] : null, () => fetchInterchange(id), {
    revalidateOnFocus: false,
  });

  if (!validId || error || (!isLoading && !interchange)) {
    return (
      <div className="border-border/70 bg-background flex flex-col items-center gap-3 rounded-xl border p-10 text-center">
        <p className="text-sm font-medium">未找到该互通</p>
        <p className="text-muted-foreground text-sm">
          {error instanceof Error ? error.message : "这个 ID 在 expressway_interchange 表里不存在。"}
        </p>
        <Button variant="outline" asChild>
          <Link href="/dashboard/expressway/interchange">返回互通列表</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Link
          href="/dashboard/expressway/interchange"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ChevronLeft className="size-3.5" />
          互通
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={cn("text-3xl leading-none font-normal tracking-tight", isLoading && "text-muted-foreground")}>
            {isLoading ? "加载中…" : (interchange?.node_name ?? "未命名互通")}
          </h1>
          {interchange ? <InterTypeBadge type={interchange.inter_type} /> : null}
          {interchange?.node_code ? (
            <span className="text-muted-foreground font-mono text-sm">{interchange.node_code}</span>
          ) : null}
        </div>
      </div>

      <nav className="border-border/70 -mb-px flex items-center gap-6 border-b">
        {TABS.map((tab) => {
          const href = `${base}${tab.suffix}`;
          // 概览要精确匹配，避免子页面也高亮它
          const active = tab.suffix === "" ? pathname === base : pathname.startsWith(href);

          return (
            <Link
              key={tab.label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "border-b-2 px-1 pb-2.5 text-sm transition-colors",
                active
                  ? "border-primary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
        {isLoading ? <Spinner className="text-muted-foreground size-3.5" /> : null}
      </nav>

      {children}
    </div>
  );
}
