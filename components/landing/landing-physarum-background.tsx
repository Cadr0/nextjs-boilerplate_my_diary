"use client";

import { useEffect, useRef } from "react";

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

export function LandingPhysarumBackground() {
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
    const ctx: CanvasRenderingContext2D = context;

    const simCanvas = document.createElement("canvas");
    const simContext = simCanvas.getContext("2d");

    if (!simContext) {
      return;
    }
    const simCtx: CanvasRenderingContext2D = simContext;

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

    const config = {
      agentCount: 2800,
      speed: 1.06,
      sensorDistance: 10,
      sensorAngle: Math.PI / 5.2,
      turnAngle: Math.PI / 7.4,
      noise: 0.06,
      attract: 0.02,
      attractRadius: 240,
      decay: 0.973,
      diffuse: 0.15,
      foodStrength: 1.9,
      obstacleAvoidance: 1.2,
      lineBoost: 0.16,
    };

    function worldToSimX(value: number) {
      return clamp(Math.floor(value / simScale), 0, simWidth - 1);
    }

    function worldToSimY(value: number) {
      return clamp(Math.floor(value / simScale), 0, simHeight - 1);
    }

    function getAnchorPoints(): Point[] {
      const centerX = width * 0.5;
      const centerY = height * 0.56;
      const orbitX = width * 0.24;
      const orbitY = height * 0.18;

      return [
        { x: centerX, y: centerY - orbitY * 1.08, strength: 1.28 },
        { x: centerX, y: centerY + orbitY * 1.02, strength: 1.08 },
        { x: centerX - orbitX, y: centerY - orbitY * 0.55, strength: 0.94 },
        { x: centerX + orbitX, y: centerY - orbitY * 0.4, strength: 0.98 },
        { x: centerX - orbitX * 0.88, y: centerY + orbitY * 0.52, strength: 0.88 },
        { x: centerX + orbitX * 0.86, y: centerY + orbitY * 0.5, strength: 0.92 },
        ...(mouse.active ? [{ x: mouse.x, y: mouse.y, strength: 0.72 }] : []),
      ];
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
      const points = getAnchorPoints();
      const centerX = simWidth * 0.5;
      const centerY = simHeight * 0.56;
      agents = new Array(config.agentCount);

      for (let index = 0; index < config.agentCount; index += 1) {
        const point = points[(Math.random() * points.length) | 0];
        const px = worldToSimX(point.x);
        const py = worldToSimY(point.y);
        const radius = Math.random() < 0.78 ? rand(4, 24) : rand(12, Math.min(simWidth, simHeight) * 0.14);
        const angle = Math.random() * Math.PI * 2;

        agents[index] = {
          x: Math.random() < 0.82 ? px + Math.cos(angle) * radius : centerX + Math.cos(angle) * radius,
          y: Math.random() < 0.82 ? py + Math.sin(angle) * radius : centerY + Math.sin(angle) * radius,
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
      ctx.imageSmoothingEnabled = true;

      simCanvas.width = simWidth;
      simCanvas.height = simHeight;
      simCtx.imageSmoothingEnabled = true;

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
      const phase = smoothstep(60, 760, tick);

      for (const point of points) {
        const pointX = worldToSimX(point.x);
        const pointY = worldToSimY(point.y);
        const radius = (mouse.active && point === points[points.length - 1] ? 16 : 13) / simScale;
        const radiusSquared = radius * radius;
        const localStrength = config.foodStrength * point.strength * (1.26 - phase * 0.46);
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

    function pushFromObstacle(agent: Agent, obstacles: Obstacle[]) {
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

          if (nearest === left) {
            agent.x -= config.obstacleAvoidance;
          } else if (nearest === right) {
            agent.x += config.obstacleAvoidance;
          } else if (nearest === top) {
            agent.y -= config.obstacleAvoidance;
          } else {
            agent.y += config.obstacleAvoidance;
          }

          agent.angle += (Math.random() - 0.5) * 0.7 + Math.PI * 0.16;
          break;
        }
      }
    }

    function stepAgents(points: Point[], obstacles: Obstacle[]) {
      const phase = smoothstep(120, 920, tick);
      const speed = (config.speed / simScale) * (1.04 - phase * 0.18);
      const sensorDistance = (config.sensorDistance / simScale) * (1 + phase * 0.12);
      const sensorAngle = config.sensorAngle * (1.08 - phase * 0.12);
      const turnAngle = config.turnAngle * (1.08 - phase * 0.08);
      const noise = config.noise * (1.2 - phase * 0.7);
      const attractRadiusSquared = Math.pow(config.attractRadius / simScale, 2);

      for (const agent of agents) {
        const fx = agent.x + Math.cos(agent.angle) * sensorDistance;
        const fy = agent.y + Math.sin(agent.angle) * sensorDistance;
        const lx = agent.x + Math.cos(agent.angle - sensorAngle) * sensorDistance;
        const ly = agent.y + Math.sin(agent.angle - sensorAngle) * sensorDistance;
        const rx = agent.x + Math.cos(agent.angle + sensorAngle) * sensorDistance;
        const ry = agent.y + Math.sin(agent.angle + sensorAngle) * sensorDistance;

        const forward = sampleField(fx, fy);
        const left = sampleField(lx, ly);
        const right = sampleField(rx, ry);

        if (forward < left && forward < right) {
          agent.angle += (Math.random() < 0.5 ? -1 : 1) * turnAngle;
        } else if (left > right) {
          agent.angle -= turnAngle;
        } else if (right > left) {
          agent.angle += turnAngle;
        } else {
          agent.angle += (Math.random() - 0.5) * noise;
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

          agent.angle += diff * config.attract * nearestPoint.strength;
        }

        agent.x += Math.cos(agent.angle) * speed;
        agent.y += Math.sin(agent.angle) * speed;

        pushFromObstacle(agent, obstacles);

        if (agent.x < 1 || agent.x >= simWidth - 1 || agent.y < 1 || agent.y >= simHeight - 1) {
          agent.x = clamp(agent.x, 2, simWidth - 3);
          agent.y = clamp(agent.y, 2, simHeight - 3);
          agent.angle += Math.PI * (0.7 + Math.random() * 0.6);
        }

        const ix = agent.x | 0;
        const iy = agent.y | 0;
        const index = iy * simWidth + ix;

        trail[index] += 1.06;
        if (ix > 0) trail[index - 1] += config.lineBoost;
        if (ix < simWidth - 1) trail[index + 1] += config.lineBoost;
        if (iy > 0) trail[index - simWidth] += config.lineBoost;
        if (iy < simHeight - 1) trail[index + simWidth] += config.lineBoost;
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
            (trail[index] * (1 - config.diffuse) + average * config.diffuse) * config.decay,
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
        const normalized = Math.min(1, value * 0.042 + 0.018);
        const shaped = Math.pow(normalized, 1.26);
        const glow = smoothstep(0.03, 0.92, shaped);
        const pixel = index * 4;

        data[pixel] = Math.min(255, 178 + glow * 18);
        data[pixel + 1] = Math.min(255, 206 + glow * 34);
        data[pixel + 2] = Math.min(255, 192 + glow * 48);
        data[pixel + 3] = Math.min(255, 8 + glow * 118);
      }

      simCtx.putImageData(imageData, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(simCanvas, 0, 0, simWidth, simHeight, 0, 0, width, height);

      for (const point of points) {
        const radius = point.strength > 1.2 ? 26 : 18;
        const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
        gradient.addColorStop(0, "rgba(126, 184, 214, 0.22)");
        gradient.addColorStop(0.45, "rgba(103, 185, 141, 0.12)");
        gradient.addColorStop(1, "rgba(103, 185, 141, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function frame() {
      const points = getAnchorPoints();
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
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-screen w-screen opacity-[0.88]"
    />
  );
}
