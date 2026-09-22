/**
 * hazardManager.js
 * Advanced spatial hazards for Cipher: The Null Overseer
 * 
 * Includes:
 * 1. Sweeping Reaper Scythe (with reachable safe Y-gap)
 * 2. Arena Boundary Compression (danger strip -> crushing void barriers)
 * 3. Moving Sanctuary Bubble (void miasma outside safe aura)
 * 4. Fake-Out Spatial Deception (glitch beacon redirects to real strike)
 */

export class HazardManager {
  constructor() {
    this.scythes = [];
    this.compressions = [];
    this.sanctuaries = [];
    this.fakeOuts = [];
    this.particles = [];
  }

  reset() {
    this.scythes = [];
    this.compressions = [];
    this.sanctuaries = [];
    this.fakeOuts = [];
    this.particles = [];
  }

  /**
   * Spawn a sweeping scythe cutting horizontally
   * @param {Object} opts
   * @param {boolean} opts.fromLeft
   * @param {number} opts.playerY
   * @param {number} opts.arenaWidth
   * @param {number} opts.arenaHeight
   * @param {number} [opts.speed=380]
   */
  spawnScythe({ fromLeft = true, playerY = 270, safeY: explicitSafeY, arenaWidth = 980, arenaHeight = 540, speed = 560, gapSize = 84 }) {
    const safeY = explicitSafeY !== undefined 
      ? Math.max(60, Math.min(arenaHeight - 60, explicitSafeY))
      : Math.max(80, Math.min(arenaHeight - 80, (playerY || 270) + (Math.random() - 0.5) * 100));

    this.scythes.push({
      x: fromLeft ? -40 : arenaWidth + 40,
      startX: fromLeft ? -40 : arenaWidth + 40,
      targetX: fromLeft ? arenaWidth + 100 : -100,
      fromLeft,
      safeY,
      gapSize,
      speed,
      width: 36,
      arenaHeight,
      phase: 0,
      rotation: 0
    });
  }

  /**
   * Spawn arena wall compression hazard
   */
  spawnArenaCompression({ telegraphTime = 1.0, activeTime = 3.5, compressionRatio = 0.28, arenaWidth = 980, arenaHeight = 540 }) {
    this.compressions.push({
      timer: 0,
      telegraphTime,
      activeTime,
      totalTime: telegraphTime + activeTime + 0.6,
      maxInsetX: arenaWidth * compressionRatio,
      currentInsetX: 0,
      arenaWidth,
      arenaHeight,
      damageCooldown: 0
    });
  }

  /**
   * Spawn moving sanctuary bubble
   */
  spawnSanctuary({ duration = 6.5, radius = 64, arenaWidth = 980, arenaHeight = 540 }) {
    const waypoints = [
      { x: arenaWidth * 0.2, y: arenaHeight * 0.5 },
      { x: arenaWidth * 0.5, y: arenaHeight * 0.35 },
      { x: arenaWidth * 0.8, y: arenaHeight * 0.5 },
      { x: arenaWidth * 0.5, y: arenaHeight * 0.65 },
      { x: arenaWidth * 0.2, y: arenaHeight * 0.5 }
    ];

    this.sanctuaries.push({
      waypoints,
      currentWpIndex: 0,
      x: waypoints[0].x,
      y: waypoints[0].y,
      radius,
      timer: 0,
      duration,
      pulse: 0,
      miasmaDmgTimer: 0
    });
  }

  /**
   * Spawn fake-out spatial deception
   */
  spawnFakeOut({ fakeOnLeft = true, arenaWidth = 980, arenaHeight = 540, onRealStrikeTrigger }) {
    this.fakeOuts.push({
      fakeOnLeft,
      arenaWidth,
      arenaHeight,
      timer: 0,
      fakeDuration: 0.65,
      realDelay: 0.35,
      realTriggered: false,
      onRealStrikeTrigger
    });
  }

  update(dt, player, onDamage) {
    // 1. Update Scythes
    for (let i = this.scythes.length - 1; i >= 0; i--) {
      const s = this.scythes[i];
      s.phase += dt * 6;
      s.rotation += (s.fromLeft ? 1 : -1) * dt * 9;

      if (s.fromLeft) {
        s.x += s.speed * dt;
        if (s.x > s.targetX) {
          this.scythes.splice(i, 1);
          continue;
        }
      } else {
        s.x -= s.speed * dt;
        if (s.x < s.targetX) {
          this.scythes.splice(i, 1);
          continue;
        }
      }

      // Check Scythe collision with player
      if (player && player.x !== undefined) {
        const inX = Math.abs(player.x - s.x) < 24;
        const inGap = player.y >= (s.safeY - s.gapSize / 2) && player.y <= (s.safeY + s.gapSize / 2);
        if (inX && !inGap) {
          onDamage && onDamage(24);
          this.createHitParticles(player.x, player.y, "#a855f7");
        }
      }
    }

    // 2. Update Compressions
    for (let i = this.compressions.length - 1; i >= 0; i--) {
      const c = this.compressions[i];
      c.timer += dt;
      c.damageCooldown = Math.max(0, c.damageCooldown - dt);

      if (c.timer < c.telegraphTime) {
        c.currentInsetX = 0;
      } else if (c.timer < c.telegraphTime + 0.5) {
        const p = (c.timer - c.telegraphTime) / 0.5;
        c.currentInsetX = c.maxInsetX * Math.sin((p * Math.PI) / 2);
      } else if (c.timer < c.telegraphTime + c.activeTime) {
        c.currentInsetX = c.maxInsetX;
      } else if (c.timer < c.totalTime) {
        const p = (c.timer - (c.telegraphTime + c.activeTime)) / 0.6;
        c.currentInsetX = c.maxInsetX * (1 - p);
      } else {
        this.compressions.splice(i, 1);
        continue;
      }

      // Collision if player touches the crushed zones
      if (c.currentInsetX > 5 && player && player.x !== undefined) {
        const inLeftCrush = player.x <= c.currentInsetX;
        const inRightCrush = player.x >= (c.arenaWidth - c.currentInsetX);
        if ((inLeftCrush || inRightCrush) && c.damageCooldown <= 0) {
          onDamage && onDamage(22);
          c.damageCooldown = 0.40;
          this.createHitParticles(player.x, player.y, "#ef4444");
        }
      }
    }

    // 3. Update Moving Sanctuary
    for (let i = this.sanctuaries.length - 1; i >= 0; i--) {
      const s = this.sanctuaries[i];
      s.timer += dt;
      s.pulse += dt * 4;
      s.miasmaDmgTimer = Math.max(0, s.miasmaDmgTimer - dt);

      if (s.timer >= s.duration) {
        this.sanctuaries.splice(i, 1);
        continue;
      }

      // Move toward next waypoint
      const currentWp = s.waypoints[s.currentWpIndex];
      const nextWp = s.waypoints[(s.currentWpIndex + 1) % s.waypoints.length];
      const speed = 135;
      const dx = nextWp.x - s.x;
      const dy = nextWp.y - s.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 10) {
        s.currentWpIndex = (s.currentWpIndex + 1) % s.waypoints.length;
      } else {
        s.x += (dx / dist) * speed * dt;
        s.y += (dy / dist) * speed * dt;
      }

      // Outside sanctuary damage check
      if (player && player.x !== undefined) {
        const pDist = Math.hypot(player.x - s.x, player.y - s.y);
        if (pDist > s.radius && s.miasmaDmgTimer <= 0) {
          onDamage && onDamage(16);
          s.miasmaDmgTimer = 0.35;
          this.createHitParticles(player.x, player.y, "#06b6d4");
        }
      }
    }

    // 4. Update Fake-Outs
    for (let i = this.fakeOuts.length - 1; i >= 0; i--) {
      const fo = this.fakeOuts[i];
      fo.timer += dt;

      if (!fo.realTriggered && fo.timer >= fo.fakeDuration) {
        fo.realTriggered = true;
        if (fo.onRealStrikeTrigger) {
          fo.onRealStrikeTrigger(!fo.fakeOnLeft);
        }
      }

      if (fo.timer >= fo.fakeDuration + fo.realDelay + 1.2) {
        this.fakeOuts.splice(i, 1);
      }
    }

    // 5. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  createHitParticles(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35,
        maxLife: 0.35,
        alpha: 1,
        color,
        size: 2.5 + Math.random() * 2.5
      });
    }
  }

  draw(ctx) {
    // 1. Draw Compressions
    for (const c of this.compressions) {
      if (c.timer < c.telegraphTime) {
        // Telegraph stripes on edges
        const flash = Math.sin(c.timer * 16) > 0;
        ctx.fillStyle = flash ? "rgba(239, 68, 68, 0.28)" : "rgba(239, 68, 68, 0.12)";
        // Left stripe
        ctx.fillRect(0, 0, c.maxInsetX, c.arenaHeight);
        // Right stripe
        ctx.fillRect(c.arenaWidth - c.maxInsetX, 0, c.maxInsetX, c.arenaHeight);

        // Warning hash lines
        ctx.strokeStyle = "rgba(255, 100, 100, 0.6)";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.strokeRect(0, 0, c.maxInsetX, c.arenaHeight);
        ctx.strokeRect(c.arenaWidth - c.maxInsetX, 0, c.maxInsetX, c.arenaHeight);
        ctx.setLineDash([]);
      } else if (c.currentInsetX > 1) {
        // Active void barriers
        ctx.fillStyle = "rgba(10, 4, 25, 0.95)";
        ctx.fillRect(0, 0, c.currentInsetX, c.arenaHeight);
        ctx.fillRect(c.arenaWidth - c.currentInsetX, 0, c.currentInsetX, c.arenaHeight);

        // Electric neon edges
        ctx.strokeStyle = "#a855f7";
        ctx.lineWidth = 4;
        ctx.shadowColor = "#c084fc";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(c.currentInsetX, 0);
        ctx.lineTo(c.currentInsetX, c.arenaHeight);
        ctx.moveTo(c.arenaWidth - c.currentInsetX, 0);
        ctx.lineTo(c.arenaWidth - c.currentInsetX, c.arenaHeight);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // 2. Draw Moving Sanctuary
    for (const s of this.sanctuaries) {
      // Draw miasma overlay outside sanctuary
      ctx.save();
      ctx.fillStyle = "rgba(15, 5, 30, 0.45)";
      ctx.fillRect(0, 0, 980, 540);

      // Cut out sanctuary hole
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Draw sanctuary protective ring
      ctx.save();
      const r = s.radius + Math.sin(s.pulse) * 3;
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.stroke();

      // Subtle safe rune circle
      ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r - 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 3. Draw Scythes
    for (const s of this.scythes) {
      ctx.save();
      // Top blade segment
      const topH = s.safeY - s.gapSize / 2;
      const btmY = s.safeY + s.gapSize / 2;
      const btmH = s.arenaHeight - btmY;

      // Glow
      ctx.shadowColor = "#d946ef";
      ctx.shadowBlur = 14;

      // Top segment
      ctx.fillStyle = "rgba(217, 70, 239, 0.85)";
      ctx.fillRect(s.x - 4, 0, 8, topH);
      // Bottom segment
      ctx.fillRect(s.x - 4, btmY, 8, btmH);

      // Neon core
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(s.x - 1.5, 0, 3, topH);
      ctx.fillRect(s.x - 1.5, btmY, 3, btmH);

      // Safe Gap markers (visual guides indicating safe portal/passage)
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 8;
      ctx.strokeRect(s.x - 16, s.safeY - s.gapSize / 2, 32, s.gapSize);

      ctx.fillStyle = "rgba(56, 189, 248, 0.25)";
      ctx.fillRect(s.x - 16, s.safeY - s.gapSize / 2, 32, s.gapSize);

      ctx.restore();
    }

    // 4. Draw Fake-Outs
    for (const fo of this.fakeOuts) {
      if (fo.timer < fo.fakeDuration) {
        // Draw glitchy deceptive indicator
        const isLeft = fo.fakeOnLeft;
        const x = isLeft ? 0 : fo.arenaWidth / 2;
        const w = fo.arenaWidth / 2;
        const glitch = (Math.random() - 0.5) * 8;

        ctx.save();
        ctx.fillStyle = "rgba(239, 68, 68, 0.25)";
        ctx.fillRect(x + glitch, 0, w, fo.arenaHeight);

        // Holographic warning text
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 18px 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.fillText("! INCOMING OVERLOAD !", x + w / 2, fo.arenaHeight / 2);

        // Faint scanlines
        ctx.strokeStyle = "rgba(255, 80, 80, 0.4)";
        ctx.lineWidth = 1;
        for (let y = 0; y < fo.arenaHeight; y += 12) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + w, y);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 5. Draw Particles
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
