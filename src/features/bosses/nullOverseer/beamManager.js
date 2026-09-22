/**
 * CIPHER: THE NULL OVERSEER - Beam Manager
 * 
 * Handles all high-energy laser beam attacks:
 * - Colossal Event Horizon Beam (Horizontal or Vertical with danger corridor telegraph)
 * - Multiple Sequential Beams (Descending photon lances cascading across arena)
 * - Rotating Laser Blades (Orbital rotating energy blades with moving safe sectors)
 */

export class BeamManager {
  constructor() {
    this.largeBeams = [];
    this.sequentialBeams = [];
    this.rotatingBeams = [];
  }

  reset() {
    this.largeBeams = [];
    this.sequentialBeams = [];
    this.rotatingBeams = [];
  }

  /**
   * Spawn Colossal Beam Attack
   */
  spawnColossalBeam(opts = {}) {
    const isHorizontal = opts.isHorizontal ?? true;
    const y = opts.pos !== undefined && isHorizontal ? opts.pos : (opts.y ?? 270);
    const x = opts.pos !== undefined && !isHorizontal ? opts.pos : (opts.x ?? 490);
    const chargeTime = opts.telegraphTime ?? (opts.chargeTime ?? 0.70);
    const activeTime = opts.fireTime ?? (opts.activeTime ?? 1.1);
    const thickness = opts.thickness ?? 95;
    const damage = opts.damage ?? 28;
    const arenaWidth = opts.arenaWidth ?? 980;
    const arenaHeight = opts.arenaHeight ?? 540;

    this.largeBeams.push({
      x,
      y,
      isHorizontal,
      thickness,
      state: "CHARGE", // CHARGE -> ACTIVE -> DONE
      chargeTime,
      activeTime,
      timer: 0,
      damage,
      arenaWidth,
      arenaHeight,
      hasHitPlayer: false,
    });
  }

  // Alias for backward compatibility
  spawnLargeBeam(originX, originY, isHorizontal, config = {}) {
    this.spawnColossalBeam({
      x: originX,
      y: originY,
      isHorizontal,
      ...config
    });
  }

  /**
   * Spawn Multiple Sequential Beams across wide arena
   */
  spawnSequentialBeams(opts = {}, hArg, configArg) {
    let positions = opts.positions;
    let beamCount = positions ? positions.length : 4;
    let stepDelay = opts.interval ?? 0.25;
    let chargeTime = opts.telegraphTime ?? (opts.chargeTime ?? 0.55);
    let activeTime = opts.fireTime ?? (opts.activeTime ?? 0.65);
    let thickness = opts.thickness ?? 60;
    let damage = opts.damage ?? 24;
    let w = 980;
    let h = 540;

    if (typeof opts === "number") {
      w = opts;
      h = hArg || 540;
      if (configArg) {
        beamCount = configArg.beamCount ?? beamCount;
        stepDelay = configArg.stepDelay ?? stepDelay;
        chargeTime = configArg.chargeTime ?? chargeTime;
        activeTime = configArg.activeTime ?? activeTime;
        thickness = configArg.thickness ?? thickness;
        damage = configArg.damage ?? damage;
      }
    } else {
      beamCount = opts.beamCount ?? beamCount;
      stepDelay = opts.stepDelay ?? stepDelay;
      w = opts.arenaWidth ?? w;
      h = opts.arenaHeight ?? h;
    }

    const margin = 110;
    const stepX = (w - margin * 2) / Math.max(1, beamCount - 1);

    for (let i = 0; i < beamCount; i++) {
      const posX = positions ? positions[i] : (margin + i * stepX);
      this.sequentialBeams.push({
        x: posX,
        y: 0,
        thickness,
        state: "PENDING", // PENDING -> CHARGE -> ACTIVE -> DONE
        delay: i * stepDelay,
        chargeTime,
        activeTime,
        timer: 0,
        damage,
        arenaWidth: w,
        arenaHeight: h,
        hasHitPlayer: false,
      });
    }
  }

  /**
   * Spawn Rotating Laser Beams
   */
  spawnRotatingLasers(opts = {}) {
    const cx = opts.originX ?? (opts.cx ?? 490);
    const cy = opts.originY ?? (opts.cy ?? 270);
    const laserCount = opts.rayCount ?? (opts.laserCount ?? 2);
    const rotSpeed = opts.angularVelocity ?? (opts.rotSpeed ?? 1.45);
    const duration = opts.duration ?? 4.0;
    const chargeTime = opts.telegraphTime ?? (opts.chargeTime ?? 0.75);
    const thickness = opts.thickness ?? 24;
    const damage = opts.damage ?? 26;

    for (let i = 0; i < laserCount; i++) {
      this.rotatingBeams.push({
        cx,
        cy,
        angle: (i * Math.PI * 2) / laserCount,
        rotSpeed,
        length: 1200,
        thickness,
        chargeTime,
        activeTime: duration,
        elapsed: 0,
        damage,
        hasHitPlayer: false,
      });
    }
  }

  // Alias
  spawnRotatingBeams(cx, cy, config = {}) {
    this.spawnRotatingLasers({
      cx,
      cy,
      laserCount: config.beamCount || 3,
      rotSpeed: config.rotSpeed || 1.3,
      chargeTime: config.chargeTime || 0.85,
      duration: config.activeTime || 2.4,
      thickness: config.thickness || 32,
      damage: config.damage || 26
    });
  }

  /**
   * Update active beams and check collision with player
   */
  update(dt, player, onDamage, w = 980, h = 540) {
    const p = player && player.x !== undefined ? player : null;

    // 1. Large Beams
    for (let i = this.largeBeams.length - 1; i >= 0; i--) {
      const b = this.largeBeams[i];
      b.timer += dt;
      b.hitCooldown = Math.max(0, (b.hitCooldown || 0) - dt);

      if (b.state === "CHARGE") {
        if (b.timer >= b.chargeTime) {
          b.state = "ACTIVE";
          b.timer = 0;
        }
      } else if (b.state === "ACTIVE") {
        if (p && b.hitCooldown <= 0) {
          if (b.isHorizontal) {
            if (Math.abs(p.y - b.y) < b.thickness / 2 + p.r - 2) {
              b.hitCooldown = 0.42;
              onDamage && onDamage(b.damage || 28);
            }
          } else {
            if (Math.abs(p.x - b.x) < b.thickness / 2 + p.r - 2) {
              b.hitCooldown = 0.42;
              onDamage && onDamage(b.damage || 28);
            }
          }
        }

        if (b.timer >= b.activeTime) {
          this.largeBeams.splice(i, 1);
        }
      }
    }

    // 2. Sequential Beams
    for (let i = this.sequentialBeams.length - 1; i >= 0; i--) {
      const b = this.sequentialBeams[i];
      b.timer += dt;
      b.hitCooldown = Math.max(0, (b.hitCooldown || 0) - dt);

      if (b.state === "PENDING") {
        if (b.timer >= b.delay) {
          b.state = "CHARGE";
          b.timer = 0;
        }
      } else if (b.state === "CHARGE") {
        if (b.timer >= b.chargeTime) {
          b.state = "ACTIVE";
          b.timer = 0;
        }
      } else if (b.state === "ACTIVE") {
        if (p && b.hitCooldown <= 0) {
          if (Math.abs(p.x - b.x) < b.thickness / 2 + p.r - 2) {
            b.hitCooldown = 0.42;
            onDamage && onDamage(b.damage || 24);
          }
        }

        if (b.timer >= b.activeTime) {
          this.sequentialBeams.splice(i, 1);
        }
      }
    }

    // 3. Rotating Beams
    for (let i = this.rotatingBeams.length - 1; i >= 0; i--) {
      const b = this.rotatingBeams[i];
      b.elapsed += dt;
      b.hitCooldown = Math.max(0, (b.hitCooldown || 0) - dt);

      if (b.elapsed >= b.chargeTime + b.activeTime) {
        this.rotatingBeams.splice(i, 1);
      } else if (b.elapsed >= b.chargeTime) {
        b.angle += b.rotSpeed * dt;

        // Check collision along line segment
        if (p && b.hitCooldown <= 0) {
          const dx = p.x - b.cx;
          const dy = p.y - b.cy;
          const dist = Math.hypot(dx, dy);
          if (dist > 5 && dist < b.length) {
            const pAngle = Math.atan2(dy, dx);
            let diff = Math.abs(pAngle - b.angle);
            while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
            const perpDist = dist * Math.sin(diff);
            if (perpDist < b.thickness / 2 + p.r - 2) {
              b.hitCooldown = 0.38;
              onDamage && onDamage(b.damage || 26);
            }
          }
        }
      }
    }
  }

  /**
   * Primary draw entrypoint
   */
  draw(ctx, w = 980, h = 540, now = Date.now()) {
    this.render(ctx, w, h, now);
  }

  /**
   * Render all beams with high-contrast telegraphs
   */
  render(ctx, w = 980, h = 540, now = Date.now()) {
    // 1. Large Beams
    for (const b of this.largeBeams) {
      const bw = b.arenaWidth || w;
      const bh = b.arenaHeight || h;

      ctx.save();
      if (b.state === "CHARGE") {
        const ratio = Math.min(1, b.timer / b.chargeTime);
        ctx.strokeStyle = `rgba(255, 0, 85, ${0.4 + ratio * 0.6})`;
        ctx.lineWidth = 2 + ratio * 3;
        ctx.beginPath();
        if (b.isHorizontal) {
          ctx.moveTo(0, b.y);
          ctx.lineTo(bw, b.y);
        } else {
          ctx.moveTo(b.x, 0);
          ctx.lineTo(b.x, bh);
        }
        ctx.stroke();

        // Pulsing warning corridor band
        ctx.fillStyle = `rgba(255, 0, 85, ${0.08 + ratio * 0.16})`;
        if (b.isHorizontal) {
          ctx.fillRect(0, b.y - b.thickness / 2, bw, b.thickness);
        } else {
          ctx.fillRect(b.x - b.thickness / 2, 0, b.thickness, bh);
        }
      } else if (b.state === "ACTIVE") {
        // High-energy searing beam
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#ff0055";
        ctx.lineWidth = 4;
        ctx.shadowColor = "#ff0055";
        ctx.shadowBlur = 18;

        if (b.isHorizontal) {
          ctx.fillRect(0, b.y - b.thickness / 2, bw, b.thickness);
          ctx.strokeRect(0, b.y - b.thickness / 2, bw, b.thickness);
        } else {
          ctx.fillRect(b.x - b.thickness / 2, 0, b.thickness, bh);
          ctx.strokeRect(b.x - b.thickness / 2, 0, b.thickness, bh);
        }
      }
      ctx.restore();
    }

    // 2. Sequential Beams
    for (const b of this.sequentialBeams) {
      const bh = b.arenaHeight || h;

      ctx.save();
      if (b.state === "CHARGE") {
        const ratio = Math.min(1, b.timer / b.chargeTime);
        ctx.strokeStyle = `rgba(0, 240, 255, ${0.4 + ratio * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x, 0);
        ctx.lineTo(b.x, bh);
        ctx.stroke();

        // Emitter node at ceiling
        ctx.fillStyle = "#00f0ff";
        ctx.beginPath();
        ctx.arc(b.x, 15, 6 + ratio * 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.state === "ACTIVE") {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#00f0ff";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#00f0ff";
        ctx.shadowBlur = 16;
        ctx.fillRect(b.x - b.thickness / 2, 0, b.thickness, bh);
        ctx.strokeRect(b.x - b.thickness / 2, 0, b.thickness, bh);
      }
      ctx.restore();
    }

    // 3. Rotating Beams
    for (const b of this.rotatingBeams) {
      ctx.save();
      ctx.translate(b.cx, b.cy);
      ctx.rotate(b.angle);

      if (b.elapsed < b.chargeTime) {
        // Pre-fire aiming line
        const ratio = Math.min(1, b.elapsed / b.chargeTime);
        ctx.strokeStyle = `rgba(168, 85, 247, ${0.35 + ratio * 0.65})`;
        ctx.lineWidth = 1.5 + ratio * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(b.length, 0);
        ctx.stroke();
      } else {
        // Full rotating laser blade
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.strokeStyle = "#a855f7";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#a855f7";
        ctx.shadowBlur = 14;
        ctx.fillRect(0, -b.thickness / 2, b.length, b.thickness);
        ctx.strokeRect(0, -b.thickness / 2, b.length, b.thickness);
      }
      ctx.restore();
    }
  }
}
