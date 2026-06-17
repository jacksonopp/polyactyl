import { useCallback } from 'react';

interface ResizeHandleProps {
  onDrag: (delta: number) => void;
  vertical?: boolean;
}

export function ResizeHandle({ onDrag, vertical = false }: ResizeHandleProps) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      let lastPos = vertical ? e.clientY : e.clientX;

      const onMouseMove = (ev: MouseEvent) => {
        const pos = vertical ? ev.clientY : ev.clientX;
        const delta = pos - lastPos;
        lastPos = pos;
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
      document.body.style.cursor = vertical ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [onDrag, vertical]
  );

  return (
    <div
      className={`resize-handle ${vertical ? 'resize-handle-vertical' : ''}`}
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation={vertical ? 'horizontal' : 'vertical'}
    />
  );
}
