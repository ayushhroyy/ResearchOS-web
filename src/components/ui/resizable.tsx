"use client";

import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type PanelProps,
  type SeparatorProps,
} from "react-resizable-panels";
import { cn } from "@/lib/utils";

/** Coerce a plain number (treated as px by v4) into a "%"-string. */
function pct(v: number | string | undefined): string | number | undefined {
  if (v === undefined) return undefined;
  return typeof v === "number" ? `${v}%` : v;
}

function ResizablePanelGroup({ className, ...props }: GroupProps) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

function ResizablePanel({
  className,
  defaultSize,
  minSize,
  maxSize,
  ...props
}: PanelProps) {
  return (
    <Panel
      data-slot="resizable-panel"
      className={cn("min-w-0", className)}
      defaultSize={pct(defaultSize)}
      minSize={pct(minSize)}
      maxSize={pct(maxSize)}
      {...props}
    />
  );
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: SeparatorProps & { withHandle?: boolean }) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        "relative flex w-px items-center justify-center bg-border ring-offset-background focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=horizontal]:after:left-0 data-[orientation=horizontal]:after:h-1 data-[orientation=horizontal]:after:w-full data-[orientation=horizontal]:after:translate-x-0 data-[orientation=horizontal]:after:-translate-y-1/2",
        className,
      )}
      {...props}
    >
      {withHandle ? (
        <div className="bg-border z-10 flex h-6 w-1 shrink-0 rounded-lg" />
      ) : null}
    </Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
