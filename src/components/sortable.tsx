import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';
import { restrictToVerticalAxis } from './dndModifiers';

/** 끌기 상태: 끌어서 놓은 직후의 클릭(=곡 재생)과 길게 누를 때의 메뉴를 막는 데 쓴다 */
const drag = { active: false, endedAt: 0 };
export const justDragged = () => drag.active || Date.now() - drag.endedAt < 250;

export function useDragSensors() {
  return useSensors(
    // 마우스: 6px 이상 움직이면 끌기 시작 (그냥 클릭은 그대로 동작)
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // 터치: 길게 누르면 끌기 시작 (그냥 쓸어 넘기면 스크롤)
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );
}

/** 세로 목록 끌어서 순서 바꾸기 */
export function SortableList({ ids, onMove, children }: { ids: string[]; onMove: (from: number, to: number) => void; children: ReactNode }) {
  const sensors = useDragSensors();
  const end = () => {
    drag.active = false;
    drag.endedAt = Date.now();
  };
  const onDragEnd = (e: DragEndEvent) => {
    end();
    if (!e.over || e.active.id === e.over.id) return;
    onMove(ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => (drag.active = true)}
      onDragEnd={onDragEnd}
      onDragCancel={end}
      modifiers={[restrictToVerticalAxis]}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/** 줄 어디를 잡아도 끌 수 있는 항목. 끌고 난 직후의 클릭은 무시한다 */
export function SortableItem({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`sortable-item ${isDragging ? 'sortable-item--dragging' : ''} ${className}`}
      onClickCapture={(e) => {
        if (justDragged()) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      onContextMenuCapture={(e) => {
        if (justDragged()) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      {...attributes}
      {...listeners}
      role="listitem"
    >
      {children}
    </div>
  );
}
