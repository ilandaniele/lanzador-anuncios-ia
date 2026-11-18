import { useState, type DragEvent } from "react";

export function useDragReorder(onMove: (from: number, to: number) => void) {
  const [dragged, setDragged] = useState<number | null>(null);

  const handleProps = (index: number) => ({
    draggable: true,
    onDragStart: () => setDragged(index),
    onDragEnd: () => setDragged(null),
  });

  const targetProps = (index: number) => ({
    onDragOver: (event: DragEvent) => event.preventDefault(),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      if (dragged !== null) onMove(dragged, index);
      setDragged(null);
    },
  });

  return { handleProps, targetProps };
}
