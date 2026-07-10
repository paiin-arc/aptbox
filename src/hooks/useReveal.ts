"use client";

import { useEffect, useRef, useState } from "react";

/**
 * IntersectionObserver-backed reveal. Returns a ref to attach to any element
 * and a `revealed` boolean that flips to true the first time the element
 * enters the viewport.
 *
 * Pair with `data-revealed={revealed}` + the `[data-revealed="true"]:…`
 * selectors in `globals.css` so the animation runs once on scroll and stays.
 */
export function useReveal<T extends HTMLElement>(options?: {
  threshold?: number;
  rootMargin?: string;
}) {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof IntersectionObserver === "undefined") {
      // Old browser — show everything immediately.
      setRevealed(true);
      return;
    }
    if (revealed || !ref.current) return;

    const target = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setRevealed(true);
            io.unobserve(e.target);
          }
        }
      },
      {
        threshold: options?.threshold ?? 0.18,
        rootMargin: options?.rootMargin ?? "0px 0px -10% 0px",
      }
    );
    io.observe(target);
    return () => io.disconnect();
  }, [revealed, options?.threshold, options?.rootMargin]);

  return { ref, revealed };
}
