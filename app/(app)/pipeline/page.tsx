"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AvatarInitials } from "@/components/patterns/avatar-initials";
import { PageHeader } from "@/components/patterns/page-header";
import { useListLeadsByState } from "@/hooks/pipeline/useListLeadsByState";
import { useUpdateLeadState } from "@/hooks/pipeline/useUpdateLeadState";
import type { Lead } from "@/types/leads/lead";
import type { LeadState } from "@/types/leads/leadState";
import type { PipelineBoardColumn } from "@/types/pipeline/pipelineBoardColumn";
import { cn, getInitials } from "@/lib/utils";

// PointerSensor fires on all pointer types including touch, conflicting with
// TouchSensor and causing a releasePointerCapture error. Restrict it to mouse only.
class MouseSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent }: React.PointerEvent): boolean =>
        nativeEvent.pointerType === "mouse",
    },
  ];
}

// #region HELPERS
const COLUMN_LABELS: Record<LeadState, string> = {
  new_enquiry: "New Enquiry",
  needs_response: "Needs Response",
  proposal_sent: "Proposal Sent",
  follow_up: "Follow Up",
  active: "Active",
  overdue: "Overdue",
  won: "Won",
};

// #endregion

// #region TYPES
type CardData = { card: Lead; colState: LeadState };
// #endregion

// #region CARD CONTENT
function CardContent({ card }: { card: Lead }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <AvatarInitials initials={getInitials(card.name)} size="sm" />
        <span className="text-foreground text-[13px] font-semibold">
          {card.name ?? "Unnamed lead"}
        </span>
      </div>
      {card.company && (
        <div className="text-text-secondary mt-1.5 text-[11px]">
          {card.company}
        </div>
      )}
    </>
  );
}
// #endregion

// #region DRAGGABLE CARD
function DraggableCard({
  card,
  colState,
  onNavigate,
}: {
  card: Lead;
  colState: LeadState;
  onNavigate: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${colState}::${card.id}`,
    data: { card, colState } satisfies CardData,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onNavigate(card.id)}
      className={cn(
        "border-border bg-surface cursor-grab rounded-md border p-3 text-left shadow-xs transition-shadow hover:shadow-sm active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
      {...listeners}
      {...attributes}>
      <CardContent card={card} />
    </button>
  );
}
// #endregion

// #region DROPPABLE LANE
function DroppableLane({
  col,
  children,
}: {
  col: PipelineBoardColumn;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.state });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "border-border-subtle flex min-h-80 flex-col gap-2.5 rounded-lg border bg-neutral-50 p-3 transition-colors dark:bg-white/2",
        isOver && "border-primary/30 bg-neutral-100 dark:bg-white/5"
      )}>
      {children}
    </div>
  );
}
// #endregion

export default function PipelinePage() {
  // #region STATE
  // null = no in-flight drag; set to the optimistic layout during a mutation
  const [optimisticColumns, setOptimisticColumns] =
    useState<PipelineBoardColumn[] | null>(null);
  const [activeCard, setActiveCard] = useState<Lead | null>(null);
  const didDragRef = useRef(false);
  // #endregion

  // #region HOOKS
  const router = useRouter();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    })
  );

  const [boardQuery, boardAction] = useListLeadsByState();
  const [updateLeadState] = useUpdateLeadState();

  // Derive server columns directly — no sync effect needed
  const serverColumns: PipelineBoardColumn[] =
    boardQuery.data && "data" in boardQuery.data && boardQuery.data.data
      ? boardQuery.data.data.columns
      : [];

  // Optimistic overlay takes precedence while a drag mutation is in-flight
  const columns = optimisticColumns ?? serverColumns;
  // #endregion

  // #region EFFECTS
useEffect(() => {
  boardAction({
    params: {},
    callbacks: { onSuccess: () => setOptimisticColumns(null) },
  });
}, [boardAction]);
  // #endregion

  // #region HANDLERS
  function handleNavigate(id: string) {
    if (didDragRef.current) return;
    router.push(`/leads/${id}`);
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveCard((active.data.current as CardData).card);
    didDragRef.current = true;
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveCard(null);
    setTimeout(() => {
      didDragRef.current = false;
    }, 0);

    if (!over) return;

    const { card, colState: sourceState } = active.data.current as CardData;
    const targetState = over.id as LeadState;

    if (sourceState === targetState) return;

    // Apply optimistic layout while the mutation is in-flight
    const nextColumns = columns.map(col => {
      if (col.state === sourceState) {
        const items = col.items.filter(c => c.id !== card.id);
        return { ...col, items, total: items.length };
      }
      if (col.state === targetState) {
        const items = [
          ...col.items.filter(c => c.id !== card.id),
          { ...card, state: targetState },
        ];
        return { ...col, items, total: items.length };
      }
      return col;
    });
    setOptimisticColumns(nextColumns);

    updateLeadState(
      { leadId: card.id, state: targetState },
      {
        onError: () => setOptimisticColumns(null),
      }
    );
  }

  function handleDragCancel() {
    setActiveCard(null);
    setTimeout(() => {
      didDragRef.current = false;
    }, 0);
  }
  // #endregion

  // #region VIEW
  return (
    <div className="px-4 py-6 sm:px-8 sm:py-7">
      <PageHeader
        title="Pipeline"
        subtitle="Drag a lead between stages to update it."
      />

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <DndContext
          id="pipeline-dnd"
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}>
          <div className="grid min-w-215 grid-cols-5 items-start gap-3">
            {columns.map(col => (
              <DroppableLane key={col.state} col={col}>
                <div className="flex items-center justify-between px-1 py-0.5">
                  <span className="text-text-secondary text-xs font-semibold">
                    {COLUMN_LABELS[col.state]}
                  </span>
                  <span className="dark:text-text-secondary inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-200 px-1.5 text-[11px] font-semibold text-neutral-600 dark:bg-white/10">
                    {col.total}
                  </span>
                </div>
                {col.items.map(card => (
                  <DraggableCard
                    key={`${col.state}-${card.id}`}
                    card={card}
                    colState={col.state}
                    onNavigate={handleNavigate}
                  />
                ))}
              </DroppableLane>
            ))}
          </div>

          <DragOverlay>
            {activeCard && (
              <div className="border-border bg-surface cursor-grabbing rounded-md border p-3 text-left shadow-md">
                <CardContent card={activeCard} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
  // #endregion
}
