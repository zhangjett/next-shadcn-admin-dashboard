"use client";

import Link from "next/link";

import { ArrowLeft } from "lucide-react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { fetchSectionRow } from "@/data/expressway";
import type { SectionRow } from "@/types/expressway";

import { SectionFormBody } from "../../../_components/section-form-body";

type SectionEditLoaderProps = { id: string };

export function SectionEditLoader({ id }: SectionEditLoaderProps) {
  const { data, error, isLoading } = useSWR(["section_row", id], () => fetchSectionRow(id), {
    revalidateOnFocus: false,
  });

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex h-40 items-center justify-center gap-2 text-sm">
        <Spinner className="size-4" />
        加载路段
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive text-sm">{error instanceof Error ? error.message : "路段加载失败"}</p>;
  }

  if (!data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm">路段不存在，或没有查看权限。</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/expressway/section">
            <ArrowLeft data-icon="inline-start" />
            返回列表
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-3xl leading-none font-normal tracking-tight">编辑路段</h1>
      <p className="text-muted-foreground mb-6 text-sm">修改路段基础信息；起终点只能选所属高速上的收费站或互通。</p>
      <SectionFormBody mode="edit" section={data as SectionRow} />
    </div>
  );
}
