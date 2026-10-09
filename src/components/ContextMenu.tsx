import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useUi } from '../store/ui';

export function ContextMenu() {
  const menu = useUi((s) => s.menu);
  const close = useUi((s) => s.closeMenu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!menu || !ref.current) {
      setPos(null);
      return;
    }
    const { width, height } = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = menu.anchor ? menu.anchor.right - width : menu.x;
    let top = menu.anchor ? menu.anchor.bottom + 4 : menu.y;
    if (left + width > vw - 8) left = vw - width - 8;
    if (left < 8) left = 8;
    if (top + height > vh - 8) top = menu.anchor ? Math.max(8, menu.anchor.top - height - 4) : Math.max(8, vh - height - 8);
    setPos({ left, top });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const t = setTimeout(() => {
      window.addEventListener('pointerdown', onDown, true);
      window.addEventListener('wheel', close, { passive: true });
      window.addEventListener('resize', close);
    });
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('wheel', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, close]);

  if (!menu) return null;
  return (
    <>
      <div className="menu-backdrop" onClick={close} />
      <div
        ref={ref}
        className="menu"
        role="menu"
        style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
      >
        {menu.header && <div className="menu__header">{menu.header}</div>}
        {menu.items.map((item, i) =>
          item === 'divider' ? (
            <div key={`d${i}`} className="menu__divider" />
          ) : (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`menu__item ${item.danger ? 'menu__item--danger' : ''}`}
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              <span className="menu__icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ),
        )}
      </div>
    </>
  );
}
