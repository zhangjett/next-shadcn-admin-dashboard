"use client";

import type { ElementType } from "react";

import { cn } from "cn";
import { CornerDownRight, Network } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const typeStyles: Record<string, { label: string; icon: ElementType; className: string }> = {
  hub: {
    label: "枢纽",
    icon: Network,
    className: "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  land: {
    label: "落地互通",
    icon: CornerDownRight,
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
};

export function InterTypeBadge({ type }: { type: string | null }) {
  const style = type ? typeStyles[type] : undefined;

  if (!style) {
    return (
      <Badge variant="outline" className="text-muted-foreground rounded-sm border font-medium">
        未知
      </Badge>
    );
  }

  const Icon = style.icon;

  return (
    <Badge className={cn("gap-1.5 rounded-sm border font-medium", style.className)} variant="outline">
      <Icon className="size-3.5" />
      {style.label}
    </Badge>
  );
}
