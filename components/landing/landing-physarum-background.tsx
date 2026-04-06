"use client";

import { useEffect, useRef } from "react";

export type PhysarumSettings = {
  agentCount: number;
  speed: number;
  sensorDistance: number;
  sensorAngle: number;
  turnAngle: number;
  decay: number;
  diffuse: number;
  foodStrength: number;
  lineBoost: number;
  noise: number;
  opacity: number;
  ambientDots: number;
};

type Agent = {
  x: number;
  y: number;
  angle: number;
};

type Point = {
  x: number;
  y: number;
  strength: number;
};

type Obstacle = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type LandingPhysarumBackgroundProps = {
  settings: PhysarumSettings;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const next = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
  return next * next * (3 - 2 * next);
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function LandingPhysarumBackground({ settings }: LandingPhysarumBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const rootCanvas = canvasRef.current;
    if (!rootCanvas) {
      return;
    }
    const canvasEl: HTMLCanvasElement = rootCanvas;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const context = canvasEl.getContext("2d", {
      alpha: true,
      desynchronized: true,
    });

    if (!context) {
      return;
    }

    const ctx = context;
    const simCanvas = document.createElement("canvas");
    const simContext = simCanvas.getContext("2d");

    if (!simContext) {
      return;
    }

    const simCtx = simContext;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let simScale = 2;
    let simWidth = 0;
    let simHeight = 0;
    let imageData = new ImageData(1, 1);
    let trail = new Float32Array(1);
    let blur = new Float32Array(1);
    let agents: Agent[] = [];
    let animationFrame = 0;
    let tick = 0;

    const mouse = {
      x: 0,
      y: 0,
      active: false,
    };

    function worldToSimX(value: number) {
      return clamp(Math.floor(value / simScale), 0, simWidth - 1);
    }

    function worldToSimY(value: number) {
      return clamp(Math.floor(value / simScale), 0, simHeight - 1);
    }

    function getPoints(): Point[] {
      const centerX = width * 0.5;
      const centerY = height * 0.55;
      const ringX = width * 0.34;
      const ringY = height * 0.28;
      const count = Math.max(2, settings.ambientDots);
      const points: Point[] = [];

      for (let index = 0; index < count; index += 1) {
        const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
        const wobbleX = Math.sin(tick * 0.004 + index * 1.7) * 18;
        const wobbleY = Math.cos(tick * 0.003 + index * 1.3) * 16;

        points.push({
          x: centerX + Math.cos(angle) * ringX + wobbleX,
          y: centerY + Math.sin(angle) * ringY + wobbleY,
          strength: 0.8 + ((index % 3) + 1) * 0.13,
        });
      }

      points.push({ x: centerX, y: centerY, strength: 1.48 });

      if (mouse.active) {
        points.push({ x: mouse.x, y: mouse.y, strength: 0.9 });
      }

      return points;
    }

    function getObstacles(): Obstacle[] {
      return [...document.querySelectorAll("[data-physarum-block]")]
        .map((node) => {
          if (!(node instanceof HTMLElement)) {
            return null;
          }

          const rect = node.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) {
            return null;
          }

          return {
            x1: Math.max(0, rect.left - 18),
            y1: Math.max(0, rect.top - 18),
            x2: Math.min(width, rect.right + 18),
            y2: Math.min(height, rect.bottom + 18),
          } satisfies Obstacle;
        })
        .filter((item): item is Obstacle => Boolean(item));
    }

    function seedAgents() {
      const points = getPoints();
      const centerX = simWidth * 0.5;
      const centerY = simHeight * 0.55;
      agents = new Array(settings.agentCount);

      for (let index = 0; index < settings.agentCount; index += 1) {
        const point = points[(Math.random() * points.length) | 0];
        const px = worldToSimX(point.x);
        const py = worldToSimY(point.y);
        const radius = Math.random() < 0.8 ? rand(4, 24) : rand(18, Math.min(simWidth, simHeight) * 0.18);
        const angle = Math.random() * Math.PI * 2;

        agents[index] = {
          x: Math.random() < 0.85 ? px + Math.cos(angle) * radius : centerX + Math.cos(angle) * radius,
          y: Math.random() < 0.85 ? py + Math.sin(angle) * radius : centerY + Math.sin(angle) * radius,
          angle,
        };
      }

      tick = 0;
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      simScale = width * height > 1_800_000 ? 3 : 2;
      simWidth = Math.max(1, Math.floor(width / simScale));
      simHeight = Math.max(1, Math.floor(height / simScale));

      canvasEl.width = Math.floor(width * dpr);
      canvasEl.height = Math.floor(height * dpr);
      canvasEl.style.width = `${width}px`;
      canvasEl.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      simCanvas.width = simWidth;
      simCanvas.height = simHeight;
      imageData = new ImageData(simWidth, simHeight);
      trail = new Float32Array(simWidth * simHeight);
      blur = new Float32Array(simWidth * simHeight);
      mouse.x = width * 0.5;
      mouse.y = height * 0.5;
      seedAgents();
    }

    function sampleField(x: number, y: number) {
      const ix = clamp(x | 0, 0, simWidth - 1);
      const iy = clamp(y | 0, 0, simHeight - 1);
      return trail[iy * simWidth + ix];
    }

    function addFood(points: Point[]) {
      for (const point of points) {
        const pointX = worldToSimX(point.x);
        const pointY = worldToSimY(point.y);
        const radius = (mouse.active && point === points[points.length - 1] ? 18 : 15) / simScale;
        const radiusSquared = radius * radius;
        const localStrength = settings.foodStrength * point.strength;
        const minX = Math.max(0, Math.floor(pointX - radius));
        const maxX = Math.min(simWidth - 1, Math.ceil(pointX + radius));
        const minY = Math.max(0, Math.floor(pointY - radius));
        const maxY = Math.min(simHeight - 1, Math.ceil(pointY + radius));

        for (let y = minY; y <= maxY; y += 1) {
          const dy = y - pointY;
          const row = y * simWidth;

          for (let x = minX; x <= maxX; x += 1) {
            const dx = x - pointX;
            const distanceSquared = dx * dx + dy * dy;

            if (distanceSquared <= radiusSquared) {
              const falloff = 1 - distanceSquared / radiusSquared;
              trail[row + x] += localStrength * falloff * falloff;
            }
          }
        }
      }
    }

    function repelFromObstacle(agent: Agent, obstacles: Obstacle[]) {
      const worldX = agent.x * simScale;
      const worldY = agent.y * simScale;

      for (const obstacle of obstacles) {
        if (
          worldX > obstacle.x1 &&
          worldX < obstacle.x2 &&
          worldY > obstacle.y1 &&
          worldY < obstacle.y2
        ) {
          const left = Math.abs(worldX - obstacle.x1);
          const right = Math.abs(obstacle.x2 - worldX);
          const top = Math.abs(worldY - obstacle.y1);
          const bottom = Math.abs(obstacle.y2 - worldY);
          const nearest = Math.min(left, right, top, bottom);

          if (nearest === left) agent.x -= 1.3;
          else if (nearest === right) agent.x += 1.3;
          else if (nearest === top) agent.y -= 1.3;
          else agent.y += 1.3;

          agent.angle += (Math.random() - 0.5) * 0.7 + Math.PI * 0.18;
          break;
        }
      }
    }

    function stepAgents(points: Point[], obstacles: Obstacle[]) {
      const attractRadiusSquared = Math.pow(260 / simScale, 2);

      for (const agent of agents) {
        const fx = agent.x + Math.cos(agent.angle) * (settings.sensorDistance / simScale);
        const fy = agent.y + Math.sin(agent.angle) * (settings.sensorDistance / simScale);
        const lx = agent.x + Math.cos(agent.angle - settings.sensorAngle) * (settings.sensorDistance / simScale);
        const ly = agent.y + Math.sin(agent.angle - settings.sensorAngle) * (settings.sensorDistance / simScale);
        const rx = agent.x + Math.cos(agent.angle + settings.sensorAngle) * (settings.sensorDistance / simScale);
        const ry = agent.y + Math.sin(agent.angle + settings.sensorAngle) * (settings.sensorDistance / simScale);

        const forward = sampleField(fx, fy);
        const left = sampleField(lx, ly);
        const right = sampleField(rx, ry);

        if (forward < left && forward < right) {
          agent.angle += (Math.random() < 0.5 ? -1 : 1) * settings.turnAngle;
        } else if (left > right) {
          agent.angle -= settings.turnAngle;
        } else if (right > left) {
          agent.angle += settings.turnAngle;
        } else {
          agent.angle += (Math.random() - 0.5) * settings.noise;
        }

        let nearestPoint: Point | null = null;
        let nearestDistanceSquared = Infinity;

        for (const point of points) {
          const dx = worldToSimX(point.x) - agent.x;
          const dy = worldToSimY(point.y) - agent.y;
          const distanceSquared = dx * dx + dy * dy;

          if (distanceSquared < nearestDistanceSquared) {
            nearestDistanceSquared = distanceSquared;
            nearestPoint = point;
          }
        }

        if (nearestPoint && nearestDistanceSquared < attractRadiusSquared) {
          const targetAngle = Math.atan2(
            worldToSimY(nearestPoint.y) - agent.y,
            worldToSimX(nearestPoint.x) - agent.x,
          );
          let diff = targetAngle - agent.angle;

          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;

          agent.angle += diff * 0.018 * nearestPoint.strength;
        }

        agent.x += Math.cos(agent.angle) * (settings.speed / simScale);
        agent.y += Math.sin(agent.angle) * (settings.speed / simScale);

        repelFromObstacle(agent, obstacles);

        if (agent.x < 1 || agent.x >= simWidth - 1 || agent.y < 1 || agent.y >= simHeight - 1) {
          agent.x = clamp(agent.x, 2, simWidth - 3);
          agent.y = clamp(agent.y, 2, simHeight - 3);
          agent.angle += Math.PI * (0.7 + Math.random() * 0.6);
        }

        const ix = agent.x | 0;
        const iy = agent.y | 0;
        const index = iy * simWidth + ix;

        trail[index] += 1.08;
        if (ix > 0) trail[index - 1] += settings.lineBoost;
        if (ix < simWidth - 1) trail[index + 1] += settings.lineBoost;
        if (iy > 0) trail[index - simWidth] += settings.lineBoost;
        if (iy < simHeight - 1) trail[index + simWidth] += settings.lineBoost;
      }
    }

    function diffuseAndDecay() {
      for (let y = 1; y < simHeight - 1; y += 1) {
        const row = y * simWidth;

        for (let x = 1; x < simWidth - 1; x += 1) {
          const index = row + x;
          const average =
            (
              trail[index] +
              trail[index - 1] +
              trail[index + 1] +
              trail[index - simWidth] +
              trail[index + simWidth] +
              trail[index - simWidth - 1] +
              trail[index - simWidth + 1] +
              trail[index + simWidth - 1] +
              trail[index + simWidth + 1]
            ) / 9;

          blur[index] = Math.max(
            0,
            (trail[index] * (1 - settings.diffuse) + average * settings.diffuse) * settings.decay,
          );
        }
      }

      const next = trail;
      trail = blur;
      blur = next;
    }

    function render(points: Point[]) {
      const data = imageData.data;

      for (let index = 0; index < trail.length; index += 1) {
        const value = trail[index];
        const normalized = Math.min(1, value * 0.045);
        const shaped = Math.pow(normalized, 1.08);
        const glow = smoothstep(0.01, 0.9, shaped);
        const pixel = index * 4;

        data[pixel] = Math.min(255, 26 + glow * 72);
        data[pixel + 1] = Math.min(255, 86 + glow * 255);
        data[pixel + 2] = Math.min(255, 44 + glow * 68);
        data[pixel + 3] = Math.min(255, 2 + glow * 255 * settings.opacity);
      }

      simCtx.putImageData(imageData, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(simCanvas, 0, 0, simWidth, simHeight, 0, 0, width, height);

      for (const point of points) {
        const radius = point.strength > 1.2 ? 28 : 20;
        const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
        gradient.addColorStop(0, "rgba(109, 255, 140, 0.3)");
        gradient.addColorStop(0.4, "rgba(62, 255, 120, 0.11)");
        gradient.addColorStop(1, "rgba(62, 255, 120, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function frame() {
      const points = getPoints();
      const obstacles = getObstacles();

      addFood(points);

      for (let step = 0; step < 3; step += 1) {
        stepAgents(points, obstacles);
      }

      diffuseAndDecay();
      render(points);
      tick += 1;
      animationFrame = window.requestAnimationFrame(frame);
    }

    function handleMouseMove(event: MouseEvent) {
      mouse.x = event.clientX;
      mouse.y = event.clientY;
      mouse.active = true;
    }

    function handleMouseLeave() {
      mouse.active = false;
    }

    resize();
    animationFrame = window.requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [settings]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-screen w-screen"
    />
  );
}
