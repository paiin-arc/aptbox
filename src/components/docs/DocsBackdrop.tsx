"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animated backdrop for /docs: a drifting starfield that reacts to the cursor,
 * light rays, and an optional hero image.
 *
 * Canvas rather than DOM nodes — a few hundred animated elements as divs would
 * thrash layout on every frame. One canvas draws them all with no layout cost.
 *
 * Motion is fully opt-out: with `prefers-reduced-motion: reduce` the particles
 * are painted once, statically, and no animation loop ever starts.
 */

/** Hero artwork behind the page. See public/HERO-BG.md. */
const HERO_IMAGE = "/hero-bg.jpg";

type Particle = {
  x: number;
  y: number;
  z: number; // 0..1 depth — drives size, brightness, and parallax strength
  vx: number;
  vy: number;
  r: number;
};

const COUNT_DESKTOP = 160;
const COUNT_MOBILE = 70;
/** Cursor influence radius, in px. */
const POINTER_RADIUS = 190;

export function DocsBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasHero, setHasHero] = useState(false);

  // Only paint the image layer if the file actually exists, so the page still
  // looks deliberate before anyone adds one.
  useEffect(() => {
    const img = new Image();
    img.onload = () => setHasHero(true);
    img.onerror = () => setHasHero(false);
    img.src = HERO_IMAGE;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles: Particle[] = [];
    let raf = 0;

    // Pointer state. `tx/ty` is the raw target; `x/y` eases toward it so the
    // parallax glides instead of snapping.
    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, active: false };

    function seed() {
      const count = width < 640 ? COUNT_MOBILE : COUNT_DESKTOP;
      particles = Array.from({ length: count }, () => {
        const z = Math.random();
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          z,
          // Nearer particles drift faster — cheap depth cue.
          vx: (Math.random() - 0.5) * (0.06 + z * 0.16),
          vy: (Math.random() - 0.5) * (0.06 + z * 0.16),
          r: 0.4 + z * 1.5,
        };
      });
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2); // cap: 3x costs a lot for stars
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      if (reduceMotion) draw();
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height);

      for (const p of particles) {
        // Parallax: deeper particles shift less, which reads as 3D.
        let dx = 0;
        let dy = 0;
        let glow = 0;

        if (pointer.active) {
          const px = p.x - pointer.x;
          const py = p.y - pointer.y;
          const dist = Math.hypot(px, py);
          if (dist < POINTER_RADIUS) {
            // Push outward, strongest at the centre, scaled by depth.
            const force = (1 - dist / POINTER_RADIUS) * (0.35 + p.z * 0.65);
            dx = (px / (dist || 1)) * force * 26;
            dy = (py / (dist || 1)) * force * 26;
            glow = force;
          }
        }

        const x = p.x + dx;
        const y = p.y + dy;

        const alpha = 0.18 + p.z * 0.5 + glow * 0.45;
        ctx!.beginPath();
        ctx!.arc(x, y, p.r + glow * 1.3, 0, Math.PI * 2);
        // Inverted for a light page: the particles are the dark element now, so
        // they read as steel drifting to royal under the pointer rather than
        // cool white drifting to violet.
        ctx!.fillStyle =
          glow > 0.15
            ? `rgba(36, 68, 149, ${Math.min(1, alpha)})`
            : `rgba(115, 122, 176, ${Math.min(1, alpha)})`;
        ctx!.fill();

        if (glow > 0.35) {
          ctx!.beginPath();
          ctx!.arc(x, y, (p.r + 1) * 3.2, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(36, 68, 149, ${glow * 0.09})`;
          ctx!.fill();
        }
      }
    }

    function step() {
      // Ease the pointer toward its target for smooth parallax.
      pointer.x += (pointer.tx - pointer.x) * 0.12;
      pointer.y += (pointer.ty - pointer.y) * 0.12;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        // Wrap rather than bounce — no visible edges.
        if (p.x < -5) p.x = width + 5;
        else if (p.x > width + 5) p.x = -5;
        if (p.y < -5) p.y = height + 5;
        else if (p.y > height + 5) p.y = -5;
      }

      draw();
      raf = requestAnimationFrame(step);
    }

    function onPointerMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      pointer.tx = e.clientX - rect.left;
      pointer.ty = e.clientY - rect.top;
      if (!pointer.active) {
        // Avoid a swoop from off-screen on the first move.
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
        pointer.active = true;
      }
    }

    function onPointerLeave() {
      pointer.active = false;
      pointer.tx = -9999;
      pointer.ty = -9999;
    }

    resize();
    window.addEventListener("resize", resize);
    // Listen on the window: the canvas is pointer-events:none so it can't
    // receive events itself without stealing clicks from the page.
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);

    if (!reduceMotion) raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* Base wash so the page reads the same with or without a hero image */}
      <div className="absolute inset-0 bg-surface" />

      {hasHero && (
        <div
          className="ax-hero-image absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${HERO_IMAGE})` }}
        />
      )}

      {/* Light rays sweeping from the upper right, matching the artwork */}
      <div className="ax-ray ax-ray-1" />
      <div className="ax-ray ax-ray-2" />
      <div className="ax-ray ax-ray-3" />

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Ambient brand blooms */}
      <div className="ax-anim-blob absolute -top-40 right-[-15%] h-[32rem] w-[32rem] rounded-full bg-royal/10 blur-3xl" />
      <div
        className="ax-anim-blob absolute bottom-[-20%] left-[-10%] h-[28rem] w-[28rem] rounded-full bg-royal/10 blur-3xl"
        style={{ animationDelay: "2.5s", animationDuration: "10s" }}
      />

      {/* Vignette keeps body copy readable over the artwork. On the dark page
          this was a near-opaque black at the edges and clear in the middle; on
          the light page it has to carry a wash across the *whole* field, since
          there is nothing else holding the artwork back behind the text. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 60% 40%, rgba(250,244,248,0.55) 20%, rgba(200,204,210,0.62) 78%)",
        }}
      />
    </div>
  );
}
