import { useEffect, useRef } from 'react';

export default function usePointerReorder(containerRef, itemsArray, onSave) {
  // Use a ref for the latest array so the pointer events closure always has fresh data
  const itemsRef = useRef(itemsArray);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    itemsRef.current = itemsArray;
    onSaveRef.current = onSave;
  }, [itemsArray, onSave]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Small delay to ensure DOM cards are fully rendered before binding
    const bindTimeout = setTimeout(() => {
      const cards = Array.from(container.children).filter(el => el.classList.contains('card'));
      if (cards.length < 2) return;

      const cleanupHandlers = [];

      cards.forEach((card) => {
        const handle = card.querySelector('.card-drag-handle');
        if (!handle) return;

        const onPointerDown = (e) => {
          if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
          e.preventDefault();
          e.stopPropagation();

          const startY = e.clientY;
          const allCards = Array.from(container.children).filter(el => el.classList.contains('card'));
          const fromIndex = allCards.indexOf(card);
          if (fromIndex === -1) return;

          const containerRect = container.getBoundingClientRect();
          const initialTops = allCards.map(c => c.getBoundingClientRect().top - containerRect.top);
          const cardHeights = allCards.map(c => c.offsetHeight);
          const gap = 10;

          let targetIndex = fromIndex;

          try { handle.setPointerCapture(e.pointerId); } catch(err){}

          card.classList.add('is-dragging');
          allCards.forEach((c, i) => {
            if (i !== fromIndex) {
              c.classList.add('is-shifting');
            }
          });

          const onPointerMove = (moveEv) => {
            const deltaY = moveEv.clientY - startY;
            card.style.transform = `translate3d(0, ${deltaY}px, 0) scale(1.02)`;

            const draggedCenter = initialTops[fromIndex] + (cardHeights[fromIndex] / 2) + deltaY;

            let newTargetIndex = fromIndex;
            for (let i = 0; i < allCards.length; i++) {
              if (i === fromIndex) continue;
              const otherCenter = initialTops[i] + (cardHeights[i] / 2);
              if (i < fromIndex && draggedCenter < otherCenter) {
                newTargetIndex = Math.min(newTargetIndex, i);
              } else if (i > fromIndex && draggedCenter > otherCenter) {
                newTargetIndex = Math.max(newTargetIndex, i);
              }
            }

            targetIndex = Math.max(0, Math.min(allCards.length - 1, newTargetIndex));
            const draggedShiftHeight = cardHeights[fromIndex] + gap;

            allCards.forEach((c, i) => {
              if (i === fromIndex) return;
              if (fromIndex < targetIndex && i > fromIndex && i <= targetIndex) {
                c.style.transform = `translate3d(0, -${draggedShiftHeight}px, 0)`;
              } else if (fromIndex > targetIndex && i < fromIndex && i >= targetIndex) {
                c.style.transform = `translate3d(0, ${draggedShiftHeight}px, 0)`;
              } else {
                c.style.transform = 'translate3d(0, 0, 0)';
              }
            });
          };

          const onPointerUp = (upEv) => {
            try { handle.releasePointerCapture(upEv.pointerId); } catch(err){}
            handle.removeEventListener('pointermove', onPointerMove);
            handle.removeEventListener('pointerup', onPointerUp);
            handle.removeEventListener('pointercancel', onPointerUp);

            let finalDelta = 0;
            if (targetIndex !== fromIndex) {
              finalDelta = initialTops[targetIndex] - initialTops[fromIndex];
            }

            card.style.transition = 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)';
            card.style.transform = `translate3d(0, ${finalDelta}px, 0)`;

            setTimeout(() => {
              allCards.forEach(c => {
                c.classList.remove('is-dragging', 'is-shifting');
                c.style.transform = '';
                c.style.transition = '';
              });

              if (targetIndex !== fromIndex) {
                const reordered = [...itemsRef.current];
                const [moved] = reordered.splice(fromIndex, 1);
                reordered.splice(targetIndex, 0, moved);
                onSaveRef.current(reordered);
              }
            }, 220);
          };

          handle.addEventListener('pointermove', onPointerMove);
          handle.addEventListener('pointerup', onPointerUp);
          handle.addEventListener('pointercancel', onPointerUp);
        };

        handle.addEventListener('pointerdown', onPointerDown);
        
        cleanupHandlers.push(() => {
          handle.removeEventListener('pointerdown', onPointerDown);
          // Failsafe cleanup in case component unmounts mid-drag
          card.classList.remove('is-dragging', 'is-shifting');
          card.style.transform = '';
          card.style.transition = '';
        });
      });

      return () => {
        cleanupHandlers.forEach(cleanup => cleanup());
      };
    }, 50);

    return () => clearTimeout(bindTimeout);
  }, [itemsArray]); // Re-bind if array length/identity changes dramatically
}
