/**
 * SlotBook changes to Skiper UI's skiper39 (licence and credits at the bottom of this file):
 * - the canvas is decorative, so it is hidden from screen readers
 * - with prefers-reduced-motion it draws one still frame instead of animating
 * - it stops drawing while scrolled out of view, to save battery
 * - typed throughout (the original used `any`), with the same behaviour
 * - people are scaled to the canvas height (the sprites are 324 px tall), so the crowd fits any hero
 * - the demo wrapper is replaced by LandingHero (src/components/LandingHero.tsx)
 */

import { gsap } from 'gsap';
import { useEffect, useRef } from 'react';

interface CrowdCanvasProps {
  src: string;
  rows?: number;
  cols?: number;
}

/** One walking person: a tile cut from the sprite sheet, moved by its own GSAP timeline. */
interface Peep {
  image: HTMLImageElement;
  rect: [number, number, number, number];
  width: number;
  height: number;
  x: number;
  y: number;
  anchorY: number;
  scaleX: number;
  walk: gsap.core.Timeline | null;
  render: (ctx: CanvasRenderingContext2D) => void;
}

interface Stage {
  width: number;
  height: number;
}

interface WalkProps {
  startY: number;
  endX: number;
}

const randomRange = (min: number, max: number) => min + Math.random() * (max - min);
const randomIndex = (array: readonly unknown[]) => Math.floor(randomRange(0, array.length));
const removeAt = <T,>(array: T[], i: number): T => array.splice(i, 1)[0];
const removeItem = <T,>(array: T[], item: T) => {
  const i = array.indexOf(item);
  if (i >= 0) array.splice(i, 1);
};

/** Places a peep just off one edge of the stage and returns where its walk starts and ends. */
function resetPeep(peep: Peep, stage: Stage): WalkProps {
  const direction = Math.random() > 0.5 ? 1 : -1;
  const offsetY = 100 - 250 * gsap.parseEase('power2.in')(Math.random());
  const startY = stage.height - peep.height + offsetY;
  let startX: number;
  let endX: number;

  if (direction === 1) {
    startX = -peep.width;
    endX = stage.width;
    peep.scaleX = 1;
  } else {
    startX = stage.width + peep.width;
    endX = 0;
    peep.scaleX = -1;
  }

  peep.x = startX;
  peep.y = startY;
  peep.anchorY = startY;
  return { startY, endX };
}

/** Walks a peep across the stage with a little bounce. */
function normalWalk(peep: Peep, { startY, endX }: WalkProps): gsap.core.Timeline {
  const xDuration = 10;
  const yDuration = 0.25;

  const tl = gsap.timeline();
  tl.timeScale(randomRange(0.5, 1.5));
  tl.to(peep, { duration: xDuration, x: endX, ease: 'none' }, 0);
  tl.to(peep, { duration: yDuration, repeat: xDuration / yDuration, yoyo: true, y: startY - 10 }, 0);
  return tl;
}

function createPeep(image: HTMLImageElement, rect: [number, number, number, number]): Peep {
  const peep: Peep = {
    image,
    rect,
    width: rect[2],
    height: rect[3],
    x: 0,
    y: 0,
    anchorY: 0,
    scaleX: 1,
    walk: null,
    render: (ctx) => {
      ctx.save();
      ctx.translate(peep.x, peep.y);
      ctx.scale(peep.scaleX, 1);
      ctx.drawImage(peep.image, ...peep.rect, 0, 0, peep.width, peep.height);
      ctx.restore();
    },
  };
  return peep;
}

const CrowdCanvas = ({ src, rows = 15, cols = 7 }: CrowdCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = document.createElement('img');
    const stage: Stage = { width: 0, height: 0 };
    const allPeeps: Peep[] = [];
    const availablePeeps: Peep[] = [];
    const crowd: Peep[] = [];

    const createPeeps = () => {
      const rectWidth = img.naturalWidth / rows;
      const rectHeight = img.naturalHeight / cols;
      for (let i = 0; i < rows * cols; i++) {
        allPeeps.push(
          createPeep(img, [(i % rows) * rectWidth, Math.floor(i / rows) * rectHeight, rectWidth, rectHeight]),
        );
      }
    };

    const removePeepFromCrowd = (peep: Peep) => {
      removeItem(crowd, peep);
      availablePeeps.push(peep);
    };

    const addPeepToCrowd = (): Peep => {
      const peep = removeAt(availablePeeps, randomIndex(availablePeeps));
      peep.walk = normalWalk(peep, resetPeep(peep, stage)).eventCallback('onComplete', () => {
        removePeepFromCrowd(peep);
        addPeepToCrowd();
      });
      crowd.push(peep);
      // Draw back to front, so people lower on the screen appear in front.
      crowd.sort((a, b) => a.anchorY - b.anchorY);
      return peep;
    };

    const initCrowd = () => {
      while (availablePeeps.length) {
        addPeepToCrowd().walk?.progress(Math.random());
      }
    };

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(devicePixelRatio, devicePixelRatio);
      crowd.forEach((peep) => {
        peep.render(ctx);
      });
      ctx.restore();
    };

    const resize = () => {
      stage.width = canvas.clientWidth;
      stage.height = canvas.clientHeight;
      // People stand about two thirds of the canvas tall, never larger than the sprite itself,
      // and narrow screens still fit about four side by side.
      const scale = Math.min(
        1,
        (stage.height * 0.66) / (img.naturalHeight / cols),
        stage.width / 4 / (img.naturalWidth / rows),
      );
      allPeeps.forEach((peep) => {
        peep.width = peep.rect[2] * scale;
        peep.height = peep.rect[3] * scale;
      });
      canvas.width = stage.width * devicePixelRatio;
      canvas.height = stage.height * devicePixelRatio;

      crowd.forEach((peep) => {
        peep.walk?.kill();
      });
      crowd.length = 0;
      availablePeeps.length = 0;
      availablePeeps.push(...allPeeps);
      initCrowd();
    };

    const reduceMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const showStillFrame = () => {
      crowd.forEach((peep) => {
        peep.walk?.pause();
      });
      render();
    };

    let ticking = false;
    const setRunning = (run: boolean) => {
      if (run === ticking) return;
      ticking = run;
      crowd.forEach((peep) => {
        if (run) peep.walk?.resume();
        else peep.walk?.pause();
      });
      if (run) gsap.ticker.add(render);
      else gsap.ticker.remove(render);
    };

    const init = () => {
      createPeeps();
      resize();
      if (reduceMotion) showStillFrame();
      else setRunning(true);
    };

    // Only animate while the hero is on screen.
    const visibility =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            if (!reduceMotion && allPeeps.length > 0) setRunning(entry.isIntersecting);
          });
    visibility?.observe(canvas);

    img.onload = init;
    img.src = src;

    const handleResize = () => {
      if (allPeeps.length === 0) return;
      resize();
      if (reduceMotion) showStillFrame();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      img.onload = null;
      window.removeEventListener('resize', handleResize);
      visibility?.disconnect();
      gsap.ticker.remove(render);
      crowd.forEach((peep) => {
        peep.walk?.kill();
      });
    };
  }, [src, rows, cols]);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute bottom-0 h-full w-full" />;
};

export { CrowdCanvas };

/**
 * Skiper 39 Canvas_Landing_004 — React + Canvas
 * Inspired by and adapted from https://codepen.io/zadvorsky/pen/xxwbBQV
 * illustration by https://www.openpeeps.com/
 * We respect the original creators. This is an inspired rebuild with our own taste and does not claim any ownership.
 * These animations aren’t associated with the codepen.io . They’re independent recreations meant to study interaction design
 *
 * License & Usage:
 * - Free to use and modify in both personal and commercial projects.
 * - Attribution to Skiper UI is required when using the free version.
 * - No attribution required with Skiper UI Pro.
 *
 * Feedback and contributions are welcome.
 *
 * Author: @gurvinder-singh02
 * Website: https://gxuri.me
 * Twitter: https://x.com/Gur__vi
 */
