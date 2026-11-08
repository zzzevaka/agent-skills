import { Braces, LayoutDashboard, Plus } from "lucide-react";
import type { StageState } from "../domain/types";
import { usedBy } from "../domain/ops";
import { useFlowStore } from "@/store/flowStore";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { EditableTitle } from "./EditableTitle";
import { FileActions } from "./FileActions";
import { navigate, type Route } from "./route";
import { currentSchemaName, currentStage } from "./selection";
import { useSchemaActions } from "./schemaActions";
import { useStageActions } from "./stageActions";
import { SortableStageList } from "./SortableStageList";
import { STATE_BG } from "./states";
import { ThemeToggle } from "./ThemeToggle";

export function StatusDot({ state, className }: { state: StageState; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-state={state}
      className={cn("size-2 shrink-0 rounded-full", STATE_BG[state], className)}
    />
  );
}

const hideWhenCollapsed = "group-data-[collapsible=icon]:sr-only";

export function AppSidebar({ route }: { route: Route }) {
  const flow = useFlowStore((s) => s.draft);
  const revision = useFlowStore((s) => s.baseline.revision);
  const source = useFlowStore((s) => s.source);
  const stageActions = useStageActions();
  const schemaActions = useSchemaActions();

  const selectedStage = route.tab === "stages" ? currentStage(flow, route.item)?.stage.name : null;
  const selectedSchema = route.tab === "schemas" ? currentSchemaName(flow, route.item) : null;
  const schemaNames = Object.keys(flow.schemas);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-start justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="min-w-0 px-1 pt-1 group-data-[collapsible=icon]:hidden">
            <EditableTitle />
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {`rev ${revision}${source ? ` · ${source}` : ""}`}
            </p>
          </div>
          <SidebarTrigger className="shrink-0" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={route.tab === "overview"}
                aria-current={route.tab === "overview" ? "page" : undefined}
                tooltip="Overview"
                onClick={() => navigate({ tab: "overview", item: null })}
              >
                <LayoutDashboard />
                <span className={hideWhenCollapsed}>Overview</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Stages</SidebarGroupLabel>
          <SidebarGroupAction aria-label="Add stage" title="Add stage" onClick={() => stageActions.add()}>
            <Plus />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SortableStageList stages={flow.stages} selected={selectedStage ?? null} />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Schemas</SidebarGroupLabel>
          <SidebarGroupAction aria-label="Add schema" title="Add schema" onClick={() => schemaActions.add()}>
            <Plus />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu aria-label="Schemas">
              {schemaNames.map((name) => {
                const count = usedBy(flow, name).length;
                return (
                  <SidebarMenuItem key={name}>
                    <SidebarMenuButton
                      isActive={name === selectedSchema}
                      aria-current={name === selectedSchema ? "true" : undefined}
                      tooltip={name}
                      title={name}
                      onClick={() => navigate({ tab: "schemas", item: name }, { replace: true })}
                    >
                      <Braces />
                      <span className={cn("flex-1 truncate", hideWhenCollapsed)}>{name}</span>
                      <span className={cn("text-xs text-muted-foreground", hideWhenCollapsed)}>
                        {count === 0 ? "unused" : `${count} ${count === 1 ? "stage" : "stages"}`}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <FileActions />
        <ThemeToggle />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
