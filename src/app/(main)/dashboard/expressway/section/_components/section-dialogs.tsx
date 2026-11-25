"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SectionRow } from "@/types/expressway";

import { SectionFormBody } from "./section-form-body";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function SectionCreateDialog({ open, onOpenChange, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>新增路段</DialogTitle>
          <DialogDescription>新增后会同步写入 expressway_section_road，按所属高速归组展示。</DialogDescription>
        </DialogHeader>
        <SectionFormBody
          mode="create"
          onCancel={() => onOpenChange(false)}
          onSaved={() => {
            onSaved();
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

type EditProps = {
  open: boolean;
  section: SectionRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function SectionEditDialog({ open, section, onOpenChange, onSaved }: EditProps) {
  return (
    <Dialog open={open && !!section} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>编辑路段</DialogTitle>
          <DialogDescription>修改路段基础信息；起终点只能选所属高速上的收费站或互通。</DialogDescription>
        </DialogHeader>
        {section ? (
          <SectionFormBody
            mode="edit"
            section={section}
            onCancel={() => onOpenChange(false)}
            onSaved={() => {
              onSaved();
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
