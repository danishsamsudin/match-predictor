"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Side = "top" | "bottom";

let activePinnedTooltipId: string | null = null;
const pinnedCloseHandlers = new Map<string, () => void>();

function closeOtherPinnedTooltips(exceptId: string) {
  for (const [id, close] of pinnedCloseHandlers) {
    if (id !== exceptId) close();
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function prefersHoverInteraction() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function Tooltip({
  label,
  content,
  side = "top",
  clickToPin = true,
  children,
}: {
  label: string;
  content: ReactNode;
  side?: Side;
  /** When false, tooltips show on hover/focus only (for buttons that already handle click). */
  clickToPin?: boolean;
  children: ReactElement<{
    ref?: React.Ref<HTMLElement>;
    onMouseEnter?: React.MouseEventHandler;
    onMouseLeave?: React.MouseEventHandler;
    onFocus?: React.FocusEventHandler;
    onBlur?: React.FocusEventHandler;
    onClick?: React.MouseEventHandler;
    "aria-describedby"?: string;
  }>;
}) {
  const id = useId();
  const anchorRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const [positioned, setPositioned] = useState(false);

  const visible = hovered || pinned;
  const hoverEnabled = prefersHoverInteraction();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!pinned) {
      if (activePinnedTooltipId === id) activePinnedTooltipId = null;
      pinnedCloseHandlers.delete(id);
      return;
    }
    activePinnedTooltipId = id;
    pinnedCloseHandlers.set(id, () => setPinned(false));
    return () => {
      pinnedCloseHandlers.delete(id);
      if (activePinnedTooltipId === id) activePinnedTooltipId = null;
    };
  }, [pinned, id]);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const tooltipWidth = tooltip?.offsetWidth ?? 288;
    const tooltipHeight = tooltip?.offsetHeight ?? 80;
    const margin = 8;

    const centerX = rect.left + rect.width / 2;
    const left = clamp(
      centerX,
      margin + tooltipWidth / 2,
      window.innerWidth - margin - tooltipWidth / 2
    );

    let top =
      side === "top"
        ? rect.top - margin
        : rect.bottom + margin;

    if (side === "top") {
      top = clamp(top, margin + tooltipHeight, window.innerHeight - margin);
    } else {
      top = clamp(top, margin, window.innerHeight - margin - tooltipHeight);
    }

    setCoords({ top, left });
  }, [side]);

  useLayoutEffect(() => {
    if (!visible) {
      setPositioned(false);
      return;
    }
    updatePosition();
    setPositioned(true);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [visible, updatePosition, content]);

  useEffect(() => {
    if (!pinned) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (
        anchorRef.current?.contains(target) ||
        tooltipRef.current?.contains(target)
      ) {
        return;
      }
      setPinned(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [pinned]);

  if (!isValidElement(children)) {
    return children;
  }

  const childRef = (children as ReactElement & { ref?: React.Ref<HTMLElement> }).ref;

  const trigger = cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      anchorRef.current = node;
      if (typeof childRef === "function") childRef(node);
      else if (childRef && typeof childRef === "object") {
        (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    onMouseEnter: (event: React.MouseEvent) => {
      children.props.onMouseEnter?.(event);
      if (hoverEnabled) setHovered(true);
    },
    onMouseLeave: (event: React.MouseEvent) => {
      children.props.onMouseLeave?.(event);
      if (hoverEnabled) setHovered(false);
    },
    onFocus: (event: React.FocusEvent) => {
      children.props.onFocus?.(event);
      if (hoverEnabled) setHovered(true);
    },
    onBlur: (event: React.FocusEvent) => {
      children.props.onBlur?.(event);
      if (hoverEnabled) setHovered(false);
    },
    onClick: (event: React.MouseEvent) => {
      children.props.onClick?.(event);
      if (!clickToPin) return;
      setPinned((wasPinned) => {
        const next = !wasPinned;
        if (next) closeOtherPinnedTooltips(id);
        return next;
      });
    },
    "aria-describedby": visible ? id : undefined,
  });

  const transform =
    side === "top" ? "translate(-50%, -100%)" : "translate(-50%, 0)";

  const tooltip =
    visible && mounted ? (
      <div
        id={id}
        ref={tooltipRef}
        role="tooltip"
        style={{
          position: "fixed",
          top: coords.top,
          left: coords.left,
          transform,
          zIndex: 10000,
        }}
        className={`pointer-events-auto w-[min(18rem,calc(100vw-1rem))] rounded-2xl border border-glass-border bg-[color:var(--glass-bg)] p-3 text-left text-xs font-medium leading-relaxed text-foreground shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-opacity ${
          positioned ? "opacity-100" : "opacity-0"
        }`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {content}
      </div>
    ) : null;

  return (
    <>
      {trigger}
      {mounted && tooltip ? createPortal(tooltip, document.body) : null}
    </>
  );
}
