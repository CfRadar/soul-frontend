import { useEffect, useRef, useState } from "react";

export default function CursorTrail({ enabled = true }) {
  const canvasRef = useRef(null);
  const pointsRef = useRef([]);
  const animRef = useRef(null);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    // Check for touch device
    if ("ontouchstart" in window) {
      setIsTouch(true);
      return;
    }

    if (!enabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;

    // Set canvas size
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    resize();
    window.addEventListener("resize", resize);

    // Track mouse position
    const onMouseMove = (e) => {
      pointsRef.current.push({
        x: e.clientX,
        y: e.clientY,
        age: 0,
      });

      // Limit number of points
      if (pointsRef.current.length > 40) {
        pointsRef.current.shift();
      }
    };
    window.addEventListener("mousemove", onMouseMove);

    // Animation loop
    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      const points = pointsRef.current;

      // Update age and remove old points
      for (let i = points.length - 1; i >= 0; i--) {
        points[i].age += 1;
        if (points[i].age > 40) {
          points.splice(i, 1);
        }
      }

      // Draw trail
      if (points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
          const p = points[i];
          const prev = points[i - 1];
          
          // Quadratic curve for smoother trail
          const midX = (prev.x + p.x) / 2;
          const midY = (prev.y + p.y) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
        }

        // Style: white with fade
        ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }

      // Draw dots at each point
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const alpha = 1 - p.age / 40;
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, [enabled]);

  // Don't render on touch devices
  if (isTouch) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[5]"
      style={{ background: "transparent" }}
    />
  );
}

