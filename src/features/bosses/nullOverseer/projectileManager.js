/**
 * CIPHER: THE NULL OVERSEER - Projectile Manager
 * 
 * Handles all bullet and projectile patterns tailored for the wide arena:
 * - Horizontal waves (left -> right, right -> left, dual pinch)
 * - Vertical columns (descending / ascending with moving safe corridors)
 * - Spirals (expanding logarithmic patterns)
 * - Tracking darts (track -> lock trajectory line -> pause -> fire)
 * - Delayed quantum mines (stationary matrix -> danger pulse -> simultaneous trigger)
 * - Projectile rain (falling droplets with guaranteed reachable gap near player)
 */

export class ProjectileManager {
  constructor() {
    this.projectiles = [];
    this.delayedMines = [];
    this.trackingDarts = [];
    this.hitParticles = [];
  }

  reset() {
    this.projectiles = [];
    this.delayedMines = [];
    this.trackingDarts = [];
    this.hitParticles = [];
  }

  /**
   * 1. Spawn Horizontal Waves across wide arena
   */
  spawnHorizontalWave(opts = {}, hArg, configArg, pYArg, rngArg) {
    let fromLeft = true;
    let fromBoth = false;
    let playerY = 270;
    let w = 980;
    let h = 540;
    let speed = 430; // balanced wave speed
    let rows = 8;
    let damage = 14;
    let explicitSafeY = undefined;

    if (typeof opts === "number") {
      w = opts;
      h = hArg || 540;
      if (configArg) {
        fromLeft = configArg.fromLeft ?? fromLeft;
        fromBoth = configArg.fromBoth ?? fromBoth;
        speed = configArg.speed ?? speed;
        rows = configArg.rows ?? rows;
        damage = configArg.damage ?? damage;
        explicitSafeY = configArg.safeY;
      }
      playerY = pYArg ?? playerY;
    } else {
      fromLeft = opts.fromLeft ?? fromLeft;
      fromBoth = opts.fromBoth ?? fromBoth;
      playerY = opts.playerY ?? playerY;
      w = opts.arenaWidth ?? w;
      h = opts.arenaHeight ?? h;
      speed = opts.speed ?? speed;
      rows = opts.rows ?? rows;
      damage = opts.damage ?? damage;
      explicitSafeY = opts.safeY;
    }

    const safeHeight = opts.safeHeight ?? 115; // generous, fair corridor
    let safeY;
    if (explicitSafeY !== undefined) {
      safeY = Math.max(60, Math.min(h - 60, explicitSafeY));
    } else {
      const randLane = Math.random() < 0.5 ? h * 0.32 : h * 0.68;
      safeY = Math.max(60, Math.min(h - 60, randLane + (Math.random() - 0.5) * 60));
    }
    const stepY = (h - 60) / Math.max(1, rows);

    for (let r = 0; r < rows; r++) {
      const curY = 30 + r * stepY;
      if (Math.abs(curY - safeY) < safeHeight / 2) continue;

      if (fromBoth || fromLeft) {
        this.projectiles.push({
          x: 10,
          y: curY,
          vx: speed,
          vy: 0,
          r: 6,
          color: "#00f0ff",
          life: 4.5,
          damage,
          trail: [],
        });
      }
      if (fromBoth || !fromLeft) {
        this.projectiles.push({
          x: w - 10,
          y: curY,
          vx: -speed,
          vy: 0,
          r: 6,
          color: "#ff0055",
          life: 4.5,
          damage,
          trail: [],
        });
      }
    }
  }

  /**
   * 2. Spawn Vertical Projectile Columns
   */
  spawnVerticalColumns(opts = {}, hArg, configArg, pXArg, rngArg) {
    let playerX = 490;
    let w = 980;
    let h = 540;
    let speed = 440; // balanced descent speed
    let spacing = 58;
    let fromTop = true;
    let damage = 14;
    let explicitSafeX = undefined;

    if (typeof opts === "number") {
      w = opts;
      h = hArg || 540;
      if (configArg) {
        speed = configArg.speed ?? speed;
        spacing = configArg.spacing ?? spacing;
        fromTop = configArg.fromTop ?? fromTop;
        damage = configArg.damage ?? damage;
        explicitSafeX = configArg.safeX;
      }
      playerX = pXArg ?? playerX;
    } else {
      playerX = opts.playerX ?? playerX;
      w = opts.arenaWidth ?? w;
      h = opts.arenaHeight ?? h;
      speed = opts.speed ?? speed;
      spacing = opts.spacing ?? spacing;
      fromTop = opts.fromTop ?? fromTop;
      damage = opts.damage ?? damage;
      explicitSafeX = opts.safeX;
    }

    const safeWidth = opts.safeWidth ?? 115; // generous, fair corridor
    let safeX;
    if (explicitSafeX !== undefined) {
      safeX = Math.max(70, Math.min(w - 70, explicitSafeX));
    } else {
      const lanes = [w * 0.25, w * 0.50, w * 0.75];
      const validLanes = lanes.filter(l => Math.abs(l - playerX) > 100);
      safeX = validLanes[Math.floor(Math.random() * validLanes.length)] || w * 0.5;
    }

    for (let cx = 30; cx <= w - 30; cx += spacing) {
      if (Math.abs(cx - safeX) < safeWidth / 2) continue;

      this.projectiles.push({
        x: cx,
        y: fromTop ? 10 : h - 10,
        vx: 0,
        vy: fromTop ? speed : -speed,
        r: 6.5,
        color: "#a855f7",
        life: 3.5,
        damage,
        trail: [],
      });
    }
  }

  /**
   * 3. Spawn Tracking Dart (Tracks -> Locks Line -> Fires)
   */
  spawnTrackingDart(opts = {}) {
    const x = opts.originX ?? (opts.x ?? 490);
    const y = opts.originY ?? (opts.y ?? 120);
    const targetX = opts.playerX ?? (opts.player ? opts.player.x : 490);
    const targetY = opts.playerY ?? (opts.player ? opts.player.y : 380);
    const speed = opts.speed ?? 530;
    const trackDuration = opts.trackDuration ?? 0.45;
    const lockDuration = opts.lockDuration ?? 0.22;
    const damage = opts.damage ?? 15;

    const angle = Math.atan2(targetY - y, targetX - x);

    this.trackingDarts.push({
      x,
      y,
      r: 7,
      targetX,
      targetY,
      lockedAngle: angle,
      speed,
      trackDuration,
      lockDuration,
      timer: 0,
      state: "TRACKING",
      damage,
      trail: [],
    });
  }

  spawnTrackingDarts(cx, cy, config = {}, player) {
    this.spawnTrackingDart({
      x: cx,
      y: cy,
      player,
      ...config
    });
  }

  /**
   * 4. Spawn Delayed Quantum Mine
   */
  spawnQuantumMine(opts = {}) {
    const {
      x = 490,
      y = 270,
      fuseTime = 1.3,
      radius = 60,
      damage = 28
    } = opts;

    this.delayedMines.push({
      x,
      y,
      radius,
      detonateRadius: radius + 20,
      state: "CHARGING",
      timer: 0,
      chargeTime: fuseTime,
      damage,
      explodeTimer: 0,
      hasHitPlayer: false,
    });
  }

  spawnDelayedMines(w, h, config = {}, player, rng = Math.random) {
    const count = config.count || 6;
    const delay = config.delay || 1.3;
    const damage = config.damage || 28;

    for (let i = 0; i < count; i++) {
      const mx = 70 + rng() * (w - 140);
      const my = 60 + rng() * (h - 120);
      this.spawnQuantumMine({ x: mx, y: my, fuseTime: delay + (i % 3) * 0.25, radius: 52, damage });
    }
  }

  /**
   * 5. Spawn Logarithmic Spiral
   */
  spawnLogarithmicSpiral(opts = {}) {
    const cx = opts.originX ?? (opts.cx ?? 490);
    const cy = opts.originY ?? (opts.cy ?? 130);
    const arms = opts.arms ?? 6;
    const speed = opts.speed ?? 360;
    const bulletsPerArm = opts.bulletsPerArm ?? 14;
    const damage = opts.damage ?? 18;

    for (let a = 0; a < arms; a++) {
      const armAngle = (a * Math.PI * 2) / arms;
      for (let b = 0; b < bulletsPerArm; b++) {
        const ang = armAngle + b * 0.16;
        const spd = speed + b * 20;
        this.projectiles.push({
          x: cx + Math.cos(ang) * (14 + b * 8),
          y: cy + Math.sin(ang) * (14 + b * 8),
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          r: 5.5,
          color: a % 2 === 0 ? "#00ffff" : "#d946ef",
          life: 4.0,
          damage,
          trail: [],
        });
      }
    }
  }

  spawnSpiral(cx, cy, config = {}) {
    this.spawnLogarithmicSpiral({
      cx,
      cy,
      arms: 6,
      speed: config.baseSpeed || 360,
      bulletsPerArm: Math.floor((config.count || 24) / 6),
      damage: config.damage || 18
    });
  }

  /**
   * 6. Spawn Projectile Rain
   */
  spawnProjectileRain(opts = {}) {
    const count = opts.density ?? (opts.count ?? 36);
    const speed = opts.speed ?? 530;
    const damage = opts.damage ?? 18;
    const arenaWidth = opts.arenaWidth ?? 980;
    const playerX = opts.playerX ?? 490;

    const safeGap = opts.safeGap ?? 84;
    // Do not place safe gap directly over player; place it across the arena
    const safeX = Math.max(70, Math.min(arenaWidth - 70, (playerX + 240) % (arenaWidth - 140) + 70));
    const step = (arenaWidth - 60) / Math.max(1, count);

    for (let i = 0; i < count; i++) {
      const rx = 30 + i * step + (Math.random() - 0.5) * 16;
      if (Math.abs(rx - safeX) < safeGap / 2) continue;

      this.projectiles.push({
        x: rx,
        y: -10,
        vx: (Math.random() - 0.5) * 45,
        vy: speed + Math.random() * 90,
        r: 5.5,
        color: "#c084fc",
        life: 3.5,
        damage,
        trail: [],
      });
    }
  }

  /**
   * Update all projectiles and check collision with player
   */
  update(dt, player, onDamage, w = 980, h = 540, now = Date.now()) {
    const p = player && player.x !== undefined ? player : null;

    // 1. Standard Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.life -= dt;

      // Trail
      proj.trail.push({ x: proj.x, y: proj.y });
      if (proj.trail.length > 5) proj.trail.shift();

      // Check collision
      if (p) {
        const dist = Math.hypot(p.x - proj.x, p.y - proj.y);
        if (dist < p.r + proj.r - 2) {
          onDamage && onDamage(proj.damage || 18);
          this.createHitParticles(proj.x, proj.y, proj.color);
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      if (proj.life <= 0 || proj.x < -60 || proj.x > w + 60 || proj.y < -60 || proj.y > h + 60) {
        this.projectiles.splice(i, 1);
      }
    }

    // 2. Tracking Darts
    for (let i = this.trackingDarts.length - 1; i >= 0; i--) {
      const d = this.trackingDarts[i];
      d.timer += dt;

      if (d.state === "TRACKING") {
        if (p) {
          d.targetX = p.x;
          d.targetY = p.y;
          d.lockedAngle = Math.atan2(d.targetY - d.y, d.targetX - d.x);
        }
        if (d.timer >= d.trackDuration) {
          d.state = "LOCKED";
          d.timer = 0;
        }
      } else if (d.state === "LOCKED") {
        if (d.timer >= d.lockDuration) {
          d.state = "FIRED";
          d.vx = Math.cos(d.lockedAngle) * d.speed;
          d.vy = Math.sin(d.lockedAngle) * d.speed;
        }
      } else if (d.state === "FIRED") {
        d.x += d.vx * dt;
        d.y += d.vy * dt;

        d.trail.push({ x: d.x, y: d.y });
        if (d.trail.length > 7) d.trail.shift();

        if (p) {
          const dist = Math.hypot(p.x - d.x, p.y - d.y);
          if (dist < p.r + d.r - 2) {
            onDamage && onDamage(d.damage || 20);
            this.createHitParticles(d.x, d.y, "#ff0055");
            this.trackingDarts.splice(i, 1);
            continue;
          }
        }

        if (d.x < -80 || d.x > w + 80 || d.y < -80 || d.y > h + 80) {
          this.trackingDarts.splice(i, 1);
        }
      }
    }

    // 3. Delayed Quantum Mines
    for (let i = this.delayedMines.length - 1; i >= 0; i--) {
      const m = this.delayedMines[i];
      m.timer += dt;

      if (m.state === "CHARGING") {
        if (m.timer >= m.chargeTime) {
          m.state = "EXPLODED";
          m.explodeTimer = 0.28;
        }
      } else if (m.state === "EXPLODED") {
        m.explodeTimer -= dt;

        if (p && !m.hasHitPlayer) {
          const dist = Math.hypot(p.x - m.x, p.y - m.y);
          if (dist < m.detonateRadius + p.r) {
            m.hasHitPlayer = true;
            onDamage && onDamage(m.damage || 26);
            this.createHitParticles(m.x, m.y, "#ff0055");
          }
        }

        if (m.explodeTimer <= 0) {
          this.delayedMines.splice(i, 1);
        }
      }
    }

    // 4. Hit Particles
    for (let i = this.hitParticles.length - 1; i >= 0; i--) {
      const pt = this.hitParticles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) {
        this.hitParticles.splice(i, 1);
      }
    }
  }

  createHitParticles(x, y, color = "#00f0ff") {
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 80;
      this.hitParticles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.25,
        color
      });
    }
  }

  /**
   * Primary draw entrypoint
   */
  draw(ctx, now = Date.now()) {
    this.render(ctx, now);
  }

  /**
   * Render all projectiles & indicators
   */
  render(ctx, now = Date.now()) {
    // 1. Delayed Mines (Telegraph glyphs & blast)
    for (const m of this.delayedMines) {
      if (m.state === "CHARGING") {
        const ratio = Math.min(1, m.timer / m.chargeTime);
        ctx.save();
        ctx.strokeStyle = `rgba(255, 0, 85, ${0.35 + ratio * 0.65})`;
        ctx.lineWidth = 1.5 + ratio * 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Core pulsating glyph
        ctx.fillStyle = `rgba(255, 215, 0, ${0.3 + 0.4 * Math.sin(now / 70)})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 4 + ratio * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (m.state === "EXPLODED") {
        ctx.save();
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.strokeStyle = "#ff0055";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#ff0055";
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.detonateRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // 2. Tracking Darts
    for (const d of this.trackingDarts) {
      if (d.state === "TRACKING" || d.state === "LOCKED") {
        ctx.save();
        // Visible locked trajectory line
        ctx.strokeStyle = d.state === "LOCKED" ? "rgba(255, 0, 85, 0.9)" : "rgba(0, 240, 255, 0.5)";
        ctx.lineWidth = d.state === "LOCKED" ? 2 : 1;
        ctx.setLineDash(d.state === "LOCKED" ? [] : [6, 4]);
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + Math.cos(d.lockedAngle) * 900, d.y + Math.sin(d.lockedAngle) * 900);
        ctx.stroke();
        ctx.setLineDash([]);

        // Dart body
        ctx.fillStyle = d.state === "LOCKED" ? "#ff0055" : "#00f0ff";
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (d.state === "FIRED") {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 0, 85, 0.4)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let j = 0; j < d.trail.length; j++) {
          const pt = d.trail[j];
          if (j === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#ff0055";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // 3. Standard Projectiles
    ctx.save();
    for (const p of this.projectiles) {
      if (p.trail.length > 1) {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let j = 0; j < p.trail.length; j++) {
          const pt = p.trail[j];
          if (j === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // 4. Hit Particles
    if (this.hitParticles.length > 0) {
      ctx.save();
      for (const pt of this.hitParticles) {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
