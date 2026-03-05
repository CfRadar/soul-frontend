import { useEffect, useRef, useCallback } from "react";

export default function MenuBackground() {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const starsRef = useRef([]);
  const shootingStarRef = useRef(null);
  const nextShootingStarRef = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0 });

  // Initialize stars
  const initStars = useCallback((width, height) => {
    const starCount = Math.floor(140 + Math.random() * 80); // 140-220 stars
    const stars = [];
    
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: 0.6 + Math.random() * 1.2, // 0.6-1.8
        baseAlpha: 0.08 + Math.random() * 0.27, // 0.08-0.35
        speed: 0.6 + Math.random() * 1.9, // 0.6-2.5
        phase: Math.random() * Math.PI * 2,
      });
    }
    starsRef.current = stars;
  }, []);

  // Spawn shooting star
  const spawnShootingStar = useCallback((width, height) => {
    // Random edge: 0=top, 1=right, 2=bottom, 3=left
    const edge = Math.floor(Math.random() * 4);
    let startX, startY, velocityX, velocityY;
    
    const padding = 50;
    
    switch (edge) {
      case 0: // top
        startX = Math.random() * width;
        startY = -padding;
        velocityX = (Math.random() - 0.3) * 3 + 1;
        velocityY = Math.random() * 2 + 1;
        break;
      case 1: // right
        startX = width + padding;
        startY = Math.random() * height;
        velocityX = -(Math.random() * 2 + 1);
        velocityY = (Math.random() - 0.3) * 2 + 0.5;
        break;
      case 2: // bottom
        startX = Math.random() * width;
        startY = height + padding;
        velocityX = (Math.random() - 0.3) * 3 + 1;
        velocityY = -(Math.random() * 2 + 1);
        break;
      case 3: // left
      default:
        startX = -padding;
        startY = Math.random() * height;
        velocityX = Math.random() * 2 + 1;
        velocityY = (Math.random() - 0.3) * 2 + 0.5;
        break;
    }

    shootingStarRef.current = {
      x: startX,
      y: startY,
      velocityX,
      velocityY,
      life: 0.6 + Math.random() * 0.6, // 0.6-1.2 seconds
      maxLife: 0.6 + Math.random() * 0.6,
      headSize: 2 + Math.random() * 1.5,
    };
  }, []);

  // Main render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    const time = performance.now() * 0.001;
    const mouse = mouseRef.current;
    
    // Parallax offset (max 6px)
    const parallaxX = (mouse.x / width - 0.5) * 12;
    const parallaxY = (mouse.y / height - 0.5) * 12;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw subtle scanlines
    const scanlineSpacing = 10 + Math.random() * 4; // 10-14px
    const scanlineOffset = (time * 20) % scanlineSpacing;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.02 + Math.random() * 0.03})`;
    
    for (let y = scanlineOffset; y < height; y += scanlineSpacing) {
      ctx.fillRect(0, y, width, 1);
    }

    // Draw stars with flicker and parallax
    starsRef.current.forEach((star) => {
      const flicker = 0.6 + 0.4 * Math.sin(time * star.speed + star.phase);
      const alpha = star.baseAlpha * flicker;
      
      // Apply parallax
      const px = star.x + parallaxX;
      const py = star.y + parallaxY;
      
      ctx.beginPath();
      ctx.arc(px, py, star.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();
    });

    // Update and draw shooting star
    const shootingStar = shootingStarRef.current;
    if (shootingStar) {
      shootingStar.x += shootingStar.velocityX;
      shootingStar.y += shootingStar.velocityY;
      shootingStar.life -= 0.016; // Approximate 60fps

      if (shootingStar.life <= 0) {
        shootingStarRef.current = null;
      } else {
        const lifeRatio = shootingStar.life / shootingStar.maxLife;
        const headAlpha = lifeRatio * 0.9;
        
        // Draw tail (multiple segments with fading alpha)
        const tailLength = 40;
        const tailSegments = 8;
        
        for (let i = 0; i < tailSegments; i++) {
          const t = i / tailSegments;
          const tailX = shootingStar.x - shootingStar.velocityX * (tailLength * t);
          const tailY = shootingStar.y - shootingStar.velocityY * (tailLength * t);
          const tailAlpha = (1 - t) * lifeRatio * 0.6;
          const tailSize = shootingStar.headSize * (1 - t * 0.7);
          
          ctx.beginPath();
          ctx.arc(tailX, tailY, tailSize, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 80, 120, ${tailAlpha})`;
          ctx.fill();
        }
        
        // Draw bright head
        ctx.beginPath();
        ctx.arc(shootingStar.x, shootingStar.y, shootingStar.headSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 200, 220, ${headAlpha})`;
        ctx.fill();
      }
    }

    // Check if we should spawn a new shooting star
    if (!shootingStarRef.current && time > nextShootingStarRef.current) {
      spawnShootingStar(width, height);
      nextShootingStarRef.current = time + 7 + Math.random() * 9; // 7-16 seconds
    }

    animationRef.current = requestAnimationFrame(render);
  }, [spawnShootingStar]);

  // Handle resize
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const parent = canvas.parentElement;
    if (!parent) return;
    
    const dpr = window.devicePixelRatio || 1;
    const rect = parent.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    
    // Reinitialize stars for new dimensions
    initStars(rect.width, rect.height);
  }, [initStars]);

  // Handle mouse move
  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    mouseRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  // Setup effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initial resize
    handleResize();

    // Create ResizeObserver
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(canvas.parentElement);

    // Add mouse listener
    const mouseTarget = canvas.parentElement;
    mouseTarget.addEventListener("mousemove", handleMouseMove);

    // Start animation
    animationRef.current = requestAnimationFrame(render);

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      resizeObserver.disconnect();
      mouseTarget.removeEventListener("mousemove", handleMouseMove);
    };
  }, [handleResize, handleMouseMove, render]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

