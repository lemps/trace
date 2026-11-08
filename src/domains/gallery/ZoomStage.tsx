import { type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from "react";

// Where the viewer draws images: fit to the box, or at a scale, panned. Wheel (and
// a trackpad pinch, which arrives as a wheel with Ctrl) zooms around the pointer;
// dragging pans. Several layers share one view, so two images in a comparison zoom
// and pan together; a layer can be clipped from the left (the swipe comparison).

export interface ZoomView {
  /** Fit each image to the box (never past 1:1); otherwise `scale`. */
  fit: boolean;
  scale: number;
  x: number;
  y: number;
}

export const FIT: ZoomView = { fit: true, scale: 1, x: 0, y: 0 };
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 32;

export interface Layer {
  src: string;
  alt: string;
  /** Hide this much of the image from the left, in percent of its width. */
  clipLeft?: number;
}

interface ZoomStageProps {
  layers: Layer[];
  view: ZoomView;
  onView: (v: ZoomView) => void;
  /** The first layer's scale as drawn (for the viewer's "100%"). */
  onScale?: (scale: number) => void;
}

type Size = { w: number; h: number };

const clamp = (n: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));

function fitScale(img: Size | undefined, box: Size): number {
  if (!img || img.w === 0 || img.h === 0 || box.w === 0) return 1;
  return Math.min(box.w / img.w, box.h / img.h, 1);
}

export function ZoomStage({ layers, view, onView, onScale }: ZoomStageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Size>({ w: 0, h: 0 });
  const [natural, setNatural] = useState<Record<string, Size>>({});
  const drag = useRef<{ id: number; x: number; y: number; vx: number; vy: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scaleOf = (src: string) => (view.fit ? fitScale(natural[src], box) : view.scale);
  const lead = layers[0] ? scaleOf(layers[0].src) : 1;
  useLayoutEffect(() => onScale?.(lead), [lead, onScale]);

  // Not React's onWheel, which is passive: the page mustn't scroll or zoom too.
  const wheel = useRef<(e: globalThis.WheelEvent) => void>(() => {});
  wheel.current = (e) => {
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const px = e.clientX - (r.left + r.width / 2);
    const py = e.clientY - (r.top + r.height / 2);
    const x = view.fit ? 0 : view.x;
    const y = view.fit ? 0 : view.y;
    const next = clamp(lead * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)));
    const k = next / lead;
    onView({ fit: false, scale: next, x: px - (px - x) * k, y: py - (py - y) * k });
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = (e: globalThis.WheelEvent) => wheel.current(e);
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  }, []);
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const vx = view.fit ? 0 : view.x;
    const vy = view.fit ? 0 : view.y;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, vx, vy };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (view.fit && Math.abs(dx) + Math.abs(dy) < 3) return;
    onView({ fit: false, scale: lead, x: d.vx + dx, y: d.vy + dy });
  };
  const onPointerUp = (e: PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  return (
    <div
      ref={ref}
      className="gv-stage"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {layers.map((layer) => {
        const size = natural[layer.src];
        const s = scaleOf(layer.src);
        const x = view.fit ? 0 : view.x;
        const y = view.fit ? 0 : view.y;
        return (
          <div key={layer.src} className="gv-layer">
            <img
              src={layer.src}
              alt={layer.alt}
              decoding="async"
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                const w = img.naturalWidth || box.w;
                const h = img.naturalHeight || box.h;
                setNatural((n) => ({ ...n, [layer.src]: { w, h } }));
              }}
              style={{
                width: size ? size.w * s : undefined,
                height: size ? size.h * s : undefined,
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                visibility: size ? "visible" : "hidden",
                // Up close, pixels stay sharp rather than smeared.
                imageRendering: s >= 3 ? "pixelated" : "auto",
                clipPath:
                  layer.clipLeft !== undefined ? `inset(0 0 0 ${layer.clipLeft}%)` : undefined,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
