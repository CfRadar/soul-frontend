/**
 * CIPHER: THE NULL OVERSEER - Procedural Boss Renderer
 * 
 * 100% Procedural Canvas2D rendering. Zero sprite sheets or external images.
 * Features an intelligent, intimidating dark void entity with:
 * - Central reactive ocular core ("The Null Eye") with dynamic emotional states
 * - Orbiting floating obsidian geometric shards that react to boss combat states
 * - Chromatic aberration and ethereal void auras (deep violet, neon cyan, warning crimson)
 * - Directional telegraph laser line & targeting reticle
 * - Procedural teleportation rift and singularity death collapse
 */

export const BOSS_EXPRESSION = {
  IDLE: "IDLE",
  TRACKING: "TRACKING",
  AIMING: "AIMING",
  ATTACKING: "ATTACKING",
  TELEPORT_OUT: "TELEPORT_OUT",
  TELEPORT_IN: "TELEPORT_IN",
  HIT: "HIT",
  OVERLOAD: "OVERLOAD",
  DEFEATED: "DEFEATED",
};

export class BossRenderer {
  constructor() {
    this.floatTimer = 0;
    this.eyeBlinkTimer = 0;
    this.eyeBlinkRatio = 0;
    this.irisAngle = 0;
    this.shardRotation = 0;
    this.auraPulse = 0;
    this.hitFlashUntil = 0;
    this.phase = 1;
    this.expression = BOSS_EXPRESSION.IDLE;
    this.defeated = false;
    this.defeatProgress = 0;
    this.defeatDuration = 4.0;
    this.defeatTimer = 0;
    this.lastX = 490;
    this.lastY = 120;
    this.lastPlayer = null;
  }

  setPhase(phase) {
    this.phase = phase || 1;
  }

  setEyeState(state) {
    this.expression = state || BOSS_EXPRESSION.IDLE;
  }

  triggerHitFlash(durationMs = 250) {
    this.hitFlashUntil = Date.now() + durationMs;
  }

  triggerDefeatImplosion(x, y) {
    this.defeated = true;
    this.defeatTimer = 0;
    this.defeatProgress = 0;
    this.lastX = x || this.lastX;
    this.lastY = y || this.lastY;
    this.expression = BOSS_EXPRESSION.DEFEATED;
  }

  /**
   * Update internal animation timers
   * @param {number} dt Delta time in seconds
   * @param {number} [x] Boss X position
   * @param {number} [y] Boss Y position
   * @param {object} [player] Player object
   * @param {number} [now] Timestamp
   */
  update(dt, x = 490, y = 120, player = null, now = Date.now()) {
    this.lastX = x;
    this.lastY = y;
    if (player) this.lastPlayer = player;

    this.floatTimer += dt * 2.2;
    this.shardRotation += dt * 1.4;
    this.auraPulse = (this.auraPulse + dt * 3.5) % (Math.PI * 2);

    // Natural occasional eye blink
    this.eyeBlinkTimer += dt;
    if (this.eyeBlinkTimer > 3.8) {
      this.eyeBlinkRatio = Math.sin((this.eyeBlinkTimer - 3.8) * Math.PI * 5);
      if (this.eyeBlinkTimer > 4.0) {
        this.eyeBlinkTimer = 0;
        this.eyeBlinkRatio = 0;
      }
    }

    if (this.defeated) {
      this.defeatTimer += dt;
      this.defeatProgress = Math.min(1.0, this.defeatTimer / this.defeatDuration);
    }
  }

  /**
   * Primary draw entrypoint
   */
  draw(ctx, x = this.lastX, y = this.lastY, player = this.lastPlayer, now = Date.now()) {
    const p = player || this.lastPlayer || { x: 490, y: 400 };
    const bossState = {
      x,
      y,
      phase: this.phase,
      expression: this.expression,
      hitFlashUntil: this.hitFlashUntil,
      defeated: this.defeated,
      defeatProgress: this.defeatProgress,
      targetAim: (this.expression === BOSS_EXPRESSION.AIMING || this.expression === BOSS_EXPRESSION.TRACKING)
        ? { x: p.x, y: p.y }
        : null,
    };
    this.render(ctx, bossState, p, now);
  }

  /**
   * Render the complete procedural boss
   * @param {CanvasRenderingContext2D} ctx 
   * @param {object} bossState Boss runtime state
   * @param {object} player Player position {x, y}
   * @param {number} now Current timestamp ms
   */
  render(ctx, bossState, player, now = Date.now()) {
    const {
      x = 490,
      y = 120,
      phase = 1,
      expression = BOSS_EXPRESSION.IDLE,
      hitFlashUntil = 0,
      defeated = false,
      defeatProgress = 0,
      teleportAlpha = 1.0,
      targetAim = null,
    } = bossState || {};

    const p = player || { x: 490, y: 400 };

    ctx.save();

    // Floating bobbing motion
    const hoverOffsetY = Math.sin(this.floatTimer) * 8;
    const drawX = x;
    const drawY = y + hoverOffsetY;

    // Apply teleport opacity if fading in/out
    if (teleportAlpha < 0.99) {
      ctx.globalAlpha = Math.max(0, teleportAlpha);
    }

    // Hit flash override (stark white silhouette)
    const isHit = now < hitFlashUntil;

    // ── 1. AMBIENT VOID AURA (Screen composite for dark aesthetics) ──
    const auraRadius = phase >= 3 ? 75 : 55;
    const auraColor = phase === 4 ? "rgba(255, 0, 80, 0.22)" :
                      phase === 3 ? "rgba(168, 85, 247, 0.25)" :
                      "rgba(0, 240, 255, 0.20)";

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const auraGrad = ctx.createRadialGradient(drawX, drawY, 10, drawX, drawY, auraRadius * (1 + 0.12 * Math.sin(this.auraPulse)));
    auraGrad.addColorStop(0, auraColor);
    auraGrad.addColorStop(0.6, auraColor.replace(/[\d\.]+\)$/, "0.08)"));
    auraGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(drawX, drawY, auraRadius * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── 2. AIMING TELEGRAPH LASER LINE (When Aiming at Player) ──
    if (targetAim && (expression === BOSS_EXPRESSION.AIMING || expression === BOSS_EXPRESSION.TRACKING)) {
      ctx.save();
      const aimAng = Math.atan2(targetAim.y - drawY, targetAim.x - drawX);
      const beamLength = 1200;
      const endX = drawX + Math.cos(aimAng) * beamLength;
      const endY = drawY + Math.sin(aimAng) * beamLength;

      // Telegraph dashed line
      ctx.strokeStyle = phase >= 3 ? "rgba(255, 0, 80, 0.7)" : "rgba(0, 240, 255, 0.65)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(drawX, drawY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Targeting reticle at player
      ctx.strokeStyle = phase >= 3 ? "#ff0055" : "#00f0ff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(targetAim.x, targetAim.y, 16 + Math.sin(now / 80) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── 3. ORBITAL OBSIDIAN SHARDS (Procedural Geometries) ──
    const shardCount = phase >= 3 ? 8 : 6;
    const orbitRadius = (phase >= 3 ? 46 : 38) + Math.sin(this.floatTimer * 1.5) * 4;

    for (let i = 0; i < shardCount; i++) {
      const angle = this.shardRotation + (i * Math.PI * 2) / shardCount;
      const shardX = drawX + Math.cos(angle) * orbitRadius;
      const shardY = drawY + Math.sin(angle) * (orbitRadius * 0.7); // elliptical tilt

      ctx.save();
      ctx.translate(shardX, shardY);
      ctx.rotate(angle + Math.PI / 4);

      if (isHit) {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#ffffff";
      } else {
        ctx.fillStyle = "#0a0a14"; // obsidian black
        ctx.strokeStyle = phase === 4 ? "#ff0055" : phase === 3 ? "#a855f7" : "#00f0ff";
      }

      ctx.lineWidth = 1.5;

      // Draw diamond obsidian shard
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(5, 0);
      ctx.lineTo(0, 9);
      ctx.lineTo(-5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Energy core inside each shard
      if (!isHit) {
        ctx.fillStyle = phase === 4 ? "#ff0055" : phase === 3 ? "#c084fc" : "#00ffff";
        ctx.beginPath();
        ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // ── 4. CENTRAL VOID SHELL (Main Body) ──
    ctx.save();
    ctx.translate(drawX, drawY);

    if (isHit) {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#ffffff";
    } else {
      ctx.fillStyle = "#06060c";
      ctx.strokeStyle = phase === 4 ? "#ff0055" : phase === 3 ? "#a855f7" : "#00f0ff";
    }

    ctx.lineWidth = 2.5;

    // Draw imposing octagonal void armor chassis
    const bodySize = 24;
    ctx.beginPath();
    for (let j = 0; j < 8; j++) {
      const ang = (j * Math.PI) / 4 + Math.PI / 8;
      const rad = j % 2 === 0 ? bodySize : bodySize * 0.85;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── 5. THE NULL EYE (Reactive Ocular Core) ──
    // Determine iris tracking offset toward player
    const angleToPlayer = Math.atan2(p.y - drawY, p.x - drawX);
    const maxLookDist = 6;
    const lookX = Math.cos(angleToPlayer) * maxLookDist;
    const lookY = Math.sin(angleToPlayer) * maxLookDist;

    // Eye socket
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 9 * Math.max(0.08, 1 - this.eyeBlinkRatio), 0, 0, Math.PI * 2);
    ctx.fill();

    // Iris & Pupil (Changes color & shape based on expression)
    if (this.eyeBlinkRatio < 0.85) {
      let irisColor = "#00f0ff";
      let pupilColor = "#ffffff";

      if (phase === 4 || expression === BOSS_EXPRESSION.ATTACKING) {
        irisColor = "#ff0055";
        pupilColor = "#ffffaa";
      } else if (phase === 3 || expression === BOSS_EXPRESSION.OVERLOAD) {
        irisColor = "#a855f7";
        pupilColor = "#f5d0fe";
      } else if (expression === BOSS_EXPRESSION.AIMING) {
        irisColor = "#ff3366";
      }

      // Outer Iris Glow
      ctx.fillStyle = irisColor;
      ctx.beginPath();
      ctx.arc(lookX, lookY, 6.5, 0, Math.PI * 2);
      ctx.fill();

      // Slit or Aperture Pupil
      ctx.fillStyle = pupilColor;
      ctx.beginPath();
      if (expression === BOSS_EXPRESSION.ATTACKING || phase >= 3) {
        // Narrow predatory slit
        ctx.ellipse(lookX, lookY, 1.8, 5.5, 0, 0, Math.PI * 2);
      } else {
        // Curious circular core
        ctx.arc(lookX, lookY, 2.5, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // ── 6. PHASE 3/4 VOID ENERGY WINGS ──
    if (phase >= 3) {
      ctx.save();
      ctx.strokeStyle = phase === 4 ? "rgba(255, 0, 80, 0.75)" : "rgba(168, 85, 247, 0.65)";
      ctx.lineWidth = 2;

      const wingFlap = Math.sin(this.floatTimer * 3) * 8;
      // Left Wing
      ctx.beginPath();
      ctx.moveTo(-20, -5);
      ctx.lineTo(-65, -30 + wingFlap);
      ctx.lineTo(-45, 5 + wingFlap * 0.5);
      ctx.lineTo(-80, 15 + wingFlap);
      ctx.lineTo(-24, 12);
      ctx.stroke();

      // Right Wing
      ctx.beginPath();
      ctx.moveTo(20, -5);
      ctx.lineTo(65, -30 + wingFlap);
      ctx.lineTo(45, 5 + wingFlap * 0.5);
      ctx.lineTo(80, 15 + wingFlap);
      ctx.lineTo(24, 12);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // Restore boss center

    // ── 7. PROCEDURAL DEFEAT SINGULARITY IMPLOSION ──
    if (defeated && defeatProgress > 0) {
      this.renderDefeatSequence(ctx, drawX, drawY, defeatProgress);
    }

    ctx.restore(); // Restore global
  }

  /**
   * Render procedural collapse animation on defeat
   */
  renderDefeatSequence(ctx, x, y, progress) {
    ctx.save();
    ctx.translate(x, y);

    // Collapsing black hole disk
    const radius = Math.max(0, 120 * (1 - progress));
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // Expanding shockwave ring
    const ringRadius = progress * 400;
    ctx.strokeStyle = `rgba(0, 240, 255, ${Math.max(0, 1 - progress)})`;
    ctx.lineWidth = 4 * (1 - progress);
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}
