import { useCallback } from 'react';

interface ResizeHandleProps {
  onDrag: (delta: number) => void;
}

export function ResizeHandle({ onDrag }: ResizeHandleProps) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      let lastX = e.clientX;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - lastX;
        lastX = ev.clientX;
        onDrag(delta);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [onDrag]
  );

  return (
    <div
      className="resize-handle"
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="vertical"
    />
  );
}
