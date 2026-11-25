"use client";

import * as React from "react";

import { cn } from "cn";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { createSection, fetchJiangsuExpresswayOptions, updateSection } from "@/data/expressway";
import type { ExpresswayNodeOption, SectionRow } from "@/types/expressway";

import { SectionNodeField } from "./section-node-field";

const DIRECTION_OPTIONS = [
  { value: "UP", label: "上行" },
  { value: "DOWN", label: "下行" },
] as const;

const STATUS_OPTIONS = [
  { value: "1", label: "通行" },
  { value: "0", label: "关闭" },
] as const;

/** 与数据库 section_type enum 保持一致 */
const SECTION_TYPE_OPTIONS = [
  { value: "road_section", label: "路段" },
  { value: "hub", label: "枢纽" },
  { value: "interchange", label: "互通" },
  { value: "bridge", label: "桥梁" },
  { value: "tunnel", label: "隧道" },
] as const;

export type SectionFormModeProps = { mode: "create" } | { mode: "edit"; section: SectionRow };

export type SectionFormActions = {
  onCancel?: () => void;
  onSaved?: () => void;
};

/** 列表行只带节点 id 与名称，桩号需要重新选择后才有 */
function toNodeOption(section: SectionRow, side: "start" | "end"): ExpresswayNodeOption | null {
  const kind = side === "start" ? section.start_node_kind : section.end_node_kind;
  const name = side === "start" ? section.start_location : section.end_location;

  if (!kind) return null;

  return {
    id: (side === "start" ? section.start_node_id : section.end_node_id) ?? "",
    kind,
    name: name ?? "",
    subtype: null,
    stakeKm: null,
  };
}

/** 路段表单主体，无头部/底部包装，由外部容器负责标题与按钮 */
export function SectionFormBody(props: SectionFormModeProps & SectionFormActions) {
  const isEdit = props.mode === "edit";
  const section = props.mode === "edit" ? props.section : null;
  const { onCancel, onSaved } = props;

  const [expresswayId, setExpresswayId] = React.useState("");
  const [startNode, setStartNode] = React.useState<ExpresswayNodeOption | null>(null);
  const [endNode, setEndNode] = React.useState<ExpresswayNodeOption | null>(null);
  const [direction, setDirection] = React.useState("UP");
  const [sectionType, setSectionType] = React.useState("road_section");
  const [entranceStatus, setEntranceStatus] = React.useState("1");
  const [exitStatus, setExitStatus] = React.useState("1");
  const [isSaving, setIsSaving] = React.useState(false);

  const { data: expressways = [], isLoading: isLoadingOptions } = useSWR(
    isEdit ? null : "jiangsu_expressway_options",
    fetchJiangsuExpresswayOptions,
    { revalidateOnFocus: false },
  );

  React.useEffect(() => {
    if (isEdit) return;

    setExpresswayId((current) => current || expressways[0]?.id || "");
  }, [isEdit, expressways]);

  React.useEffect(() => {
    if (!section) return;

    setExpresswayId(section.expressway_id);
    setStartNode(toNodeOption(section, "start"));
    setEndNode(toNodeOption(section, "end"));
    setDirection(section.direction ?? "UP");
    setSectionType(section.section_type ?? "road_section");
    setEntranceStatus(section.entrance_ramp_status === null ? "1" : String(section.entrance_ramp_status));
    setExitStatus(section.exit_ramp_status === null ? "1" : String(section.exit_ramp_status));
  }, [section]);

  React.useEffect(() => {
    if (!startNode || !endNode) return;
    if (startNode.stakeKm === null || endNode.stakeKm === null) return;

    setDirection(endNode.stakeKm < startNode.stakeKm ? "UP" : "DOWN");
  }, [startNode, endNode]);

  async function handleSubmit() {
    if (!expresswayId) {
      toast.warning("请选择所属高速");
      return;
    }

    if (!startNode || !endNode) {
      toast.warning("请选择起始节点和终止节点");
      return;
    }

    setIsSaving(true);

    try {
      if (section) {
        await updateSection({
          id: section.id,
          startNode,
          endNode,
          direction,
          sectionType,
          entranceRampStatus: Number(entranceStatus),
          exitRampStatus: Number(exitStatus),
        });
      } else {
        await createSection({
          expresswayId,
          startNode,
          endNode,
          direction,
          sectionType,
          entranceRampStatus: Number(entranceStatus),
          exitRampStatus: Number(exitStatus),
        });
      }

      toast.success(section ? "路段已保存" : "路段已新增");
      await mutate("jiangsu_section_rows");
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="section-expressway">所属高速</Label>
            {isEdit ? (
              <div className="bg-muted/60 flex h-8 items-center rounded-md border px-2.5 text-sm">
                <span className="font-mono">{section?.expressway_number ?? "未知编号"}</span>
                <span className="text-muted-foreground ms-1.5 truncate">{section?.expressway_name ?? ""}</span>
              </div>
            ) : (
              <Select
                value={expresswayId}
                onValueChange={(value) => {
                  setExpresswayId(value);
                  setStartNode(null);
                  setEndNode(null);
                }}
                disabled={isLoadingOptions}
              >
                <SelectTrigger id="section-expressway" className="w-full">
                  <SelectValue placeholder={isLoadingOptions ? "加载中…" : "选择高速"} />
                </SelectTrigger>
                <SelectContent>
                  {expressways.map((expressway) => (
                    <SelectItem key={expressway.id} value={expressway.id}>
                      <span className="font-mono">{expressway.number ?? "未知编号"}</span>
                      {expressway.name ? <span className="text-muted-foreground ml-1.5">{expressway.name}</span> : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="section-type">路段类型</Label>
            <Select value={sectionType} onValueChange={setSectionType} disabled={isSaving}>
              <SelectTrigger id="section-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTION_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SectionNodeField
            id="section-start"
            label="起始节点"
            expresswayId={expresswayId}
            value={startNode}
            onChange={setStartNode}
            disabled={isSaving}
          />

          <SectionNodeField
            id="section-end"
            label="终止节点"
            expresswayId={expresswayId}
            value={endNode}
            onChange={setEndNode}
            disabled={isSaving}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <span className="text-sm leading-none font-medium">方向</span>
            <fieldset className="bg-muted/60 m-0 grid h-8 grid-cols-2 gap-0.5 rounded-md border-0 p-0.5">
              <legend className="sr-only">方向</legend>
              {DIRECTION_OPTIONS.map((option) => {
                const active = direction === option.value;

                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={active ? "default" : "ghost"}
                    size="sm"
                    aria-pressed={active}
                    disabled={isSaving}
                    className={cn("h-7 px-0 text-xs", !active && "text-muted-foreground")}
                    onClick={() => setDirection(option.value)}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </fieldset>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="section-entrance">入口通行状态</Label>
            <Select value={entranceStatus} onValueChange={setEntranceStatus} disabled={isSaving}>
              <SelectTrigger id="section-entrance" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="section-exit">出口通行状态</Label>
            <Select value={exitStatus} onValueChange={setExitStatus} disabled={isSaving}>
              <SelectTrigger id="section-exit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          取消
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={isSaving}>
          {isSaving ? <Spinner className="size-4" /> : null}
          {isEdit ? "保存" : "新增"}
        </Button>
      </div>
    </>
  );
}
