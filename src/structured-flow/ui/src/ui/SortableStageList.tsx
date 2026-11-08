import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useMemo, useState } from "react";
import type { Stage } from "../domain/types";
import { cn } from "@/lib/utils";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { StatusDot } from "./AppSidebar";
import { navigate } from "./route";
import { announce, resolveDrop, uniqueIds } from "./sortable";
import { useStageActions } from "./stageActions";

const hideWhenCollapsed = "group-data-[collapsible=icon]:sr-only";

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

interface RowProps {
  id: string;
  index: number;
  stage: Stage;
  selected: boolean;
}

function SortableRow({ id, index, stage, selected }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      data-row={index}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "z-10 opacity-40")}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Drag to reorder ${stage.name}`}
        {...attributes}
        {...listeners}
        className="absolute left-0.5 top-1.5 z-10 grid size-5 cursor-grab touch-none place-items-center rounded text-sidebar-foreground/60 outline-none ring-sidebar-ring hover:text-sidebar-foreground focus-visible:opacity-100 focus-visible:ring-2 active:cursor-grabbing group-hover/menu-item:opacity-100 max-md:opacity-100 md:opacity-0 group-data-[collapsible=icon]:hidden"
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <SidebarMenuButton
        isActive={selected}
        aria-current={selected ? "true" : undefined}
        tooltip={stage.name}
        title={stage.name}
        className="pl-6 group-data-[collapsible=icon]:pl-2"
        onClick={() => navigate({ tab: "stages", item: stage.name }, { replace: true })}
      >
        <StatusDot state={stage.state} />
        <span className={cn("flex-1 truncate", hideWhenCollapsed)}>{stage.name}</span>
        <span className={cn("font-mono text-[11px] text-muted-foreground", hideWhenCollapsed)}>
          {String(index + 1).padStart(2, "0")}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** The stage list of the sidebar: select a stage, or drag its handle to reorder. */
export function SortableStageList({ stages, selected }: { stages: Stage[]; selected: string | null }) {
  const actions = useStageActions();
  const ids = useMemo(() => uniqueIds(stages.map((s) => s.name)), [stages]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const nameOf = (id: string | number) => stages[ids.indexOf(String(id))]?.name ?? String(id);
  const positionOf = (id: string | number) => ids.indexOf(String(id)) + 1;
  const total = ids.length;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    const drop = resolveDrop(ids, String(active.id), over ? String(over.id) : null);
    if (drop) actions.move(drop.from, drop.to);
  };

  const dragged = activeId === null ? null : stages[ids.indexOf(activeId)];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "To reorder this stage, press Space. Move it with the up and down arrow keys, press Space to drop it, or Escape to cancel.",
        },
        announcements: {
          onDragStart: ({ active }) => announce("start", nameOf(active.id), positionOf(active.id), total),
          onDragOver: ({ active, over }) =>
            over ? announce("over", nameOf(active.id), positionOf(over.id), total) : undefined,
          onDragEnd: ({ active, over }) =>
            announce("end", nameOf(active.id), positionOf(over ? over.id : active.id), total),
          onDragCancel: ({ active }) => announce("cancel", nameOf(active.id), positionOf(active.id), total),
        },
      }}
    >
      <SidebarMenu aria-label="Stages">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {stages.map((stage, index) => (
            <SortableRow
              key={ids[index]}
              id={ids[index]}
              index={index}
              stage={stage}
              selected={stage.name === selected}
            />
          ))}
        </SortableContext>
      </SidebarMenu>
      <DragOverlay dropAnimation={{ duration: 150 }}>
        {dragged && (
          <div className="flex h-8 items-center gap-2 rounded-md border bg-sidebar px-2 text-sm text-sidebar-foreground shadow-lg">
            <StatusDot state={dragged.state} />
            <span className="truncate">{dragged.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
