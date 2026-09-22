/**
 * NullOverseerController.js
 * Core state machine and orchestrator for CIPHER: THE NULL OVERSEER
 */

import { BossRenderer } from "./bossRenderer.js";
import { ProjectileManager } from "./projectileManager.js";
import { BeamManager } from "./beamManager.js";
import { HazardManager } from "./hazardManager.js";
import { ATTACKS } from "./attackLibrary.js";

export class NullOverseerController {
  constructor() {
    this.bossRenderer = new BossRenderer();
    this.projectileManager = new ProjectileManager();
    this.beamManager = new BeamManager();
    this.hazardManager = new HazardManager();

    this.active = false;
    this.defeated = false;
    this.hp = 200;
    this.maxHp = 200;
    this.currentPhase = 1;
    this.passiveDartTimer = 0;

    this.x = 490;
    this.y = 120;
    this.baseX = 490;
    this.baseY = 120;

    // Movement / Hover
    this.hoverTimer = 0;
    this.teleportTimer = 0;
    this.teleportCooldown = 4.2;

    // Combat & Attack Scheduling
    this.isAttacking = false;
    this.currentAttack = null;
    this.attackTimer = 0;
    this.cooldownTimer = 0.5;
    this.lastAttackId = null;

    // Player Counterattack Orbs
    this.collectibleOrb = null;
    this.orbCharge = 0;
    this.orbChargeMax = 5;

    // Atmospheric dialogue / banner
    this.bannerText = "OBSERVE: ZERO DEVIATION PERMITTED.";
    this.bannerAlpha = 1.0;
    this.bannerTimer = 3.5;

    // Defeat sequence
    this.defeatTimer = 0;
    this.deathDuration = 4.0;

    // Hit flash
    this.hitFlashTimer = 0;
  }

  init(arenaWidth = 980, arenaHeight = 540) {
    const w = Number.isFinite(arenaWidth) && arenaWidth > 0 ? arenaWidth : 980;
    const h = Number.isFinite(arenaHeight) && arenaHeight > 0 ? arenaHeight : 540;

    this.active = true;
    this.defeated = false;
    this.hp = 200;
    this.maxHp = 200;
    this.currentPhase = 1;
    this.passiveDartTimer = 0;

    this.x = w / 2;
    this.y = 130;
    this.baseX = w / 2;
    this.baseY = 130;

    this.projectileManager.reset();
    this.beamManager.reset();
    this.hazardManager.reset();

    this.bossRenderer.setPhase(1);
    this.bossRenderer.setEyeState("IDLE");

    this.cooldownTimer = 0.5;
    this.teleportCooldown = 4.2;
    this.isAttacking = false;
    this.currentAttack = null;

    this.orbCharge = 0;
    this.spawnOrb(w, h);

    this.bannerText = "OBSERVE: ZERO DEVIATION PERMITTED.";
    this.bannerAlpha = 1.0;
    this.bannerTimer = 3.5;
  }

  spawnOrb(arenaWidth = 980, arenaHeight = 540) {
    const w = Number.isFinite(arenaWidth) && arenaWidth > 0 ? arenaWidth : 980;
    const h = Number.isFinite(arenaHeight) && arenaHeight > 0 ? arenaHeight : 540;

    this.collectibleOrb = {
      x: 80 + Math.random() * (w - 160),
      y: 90 + Math.random() * (h - 170),
      r: 12,
      pulse: 0
    };
  }

  updatePhase() {
    let newPhase = 1;
    if (this.hp <= 50) {
      newPhase = 4;
    } else if (this.hp <= 100) {
      newPhase = 3;
    } else if (this.hp <= 150) {
      newPhase = 2;
    }

    if (newPhase !== this.currentPhase) {
      this.currentPhase = newPhase;
      this.bossRenderer.setPhase(newPhase);

      // Trigger phase transition atmospheric dialogue
      if (newPhase === 2) {
        this.setBanner("RECALIBRATING SPATIAL PARAMETERS.");
      } else if (newPhase === 3) {
        this.setBanner("VOID WINGS ONLINE. PROTOCOL OVERLOAD.");
      } else if (newPhase === 4) {
        this.setBanner("CRITICAL SINGULARITY IMMINENT. SURVIVE.");
      }
    }
  }

  setBanner(text) {
    this.bannerText = text;
    this.bannerAlpha = 1.0;
    this.bannerTimer = 3.2;
  }

  takeDamage(amount) {
    if (this.defeated || !this.active) return;
    this.hp = Math.max(0, this.hp - amount);
    this.hitFlashTimer = 0.25;
    this.bossRenderer.triggerHitFlash();
    this.updatePhase();

    if (this.hp <= 0) {
      this.triggerDefeat();
    }
  }

  triggerDefeat() {
    this.defeated = true;
    this.isAttacking = false;
    this.currentAttack = null;
    this.collectibleOrb = null;
    this.setBanner("NULL VECTOR REACHED. CALCULATIONS TERMINATED.");
    this.bossRenderer.triggerDefeatImplosion(this.x, this.y);
  }

  update(dt, player, onPlayerDamage, arenaWidth = 980, arenaHeight = 540, onShake, onHealPlayer) {
    if (!this.active) return;

    const w = Number.isFinite(arenaWidth) && arenaWidth > 0 ? arenaWidth : 980;
    const h = Number.isFinite(arenaHeight) && arenaHeight > 0 ? arenaHeight : 540;

    // 1. Defeat Sequence
    if (this.defeated) {
      this.defeatTimer += dt;
      try {
        this.bossRenderer.update(dt, this.x, this.y, player);
      } catch (err) {
        console.error("[NullOverseer] BossRenderer update error during defeat:", err);
      }
      if (this.defeatTimer < this.deathDuration) {
        onShake && onShake(Math.min(35, this.defeatTimer * 8), 100);
      }
      return;
    }

    // 2. Banner Fade
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer < 1.0) {
        this.bannerAlpha = Math.max(0, this.bannerTimer);
      }
    }

    // 3. Boss Floating & Teleport Mechanics
    this.hoverTimer += dt * 2.2;
    this.y = this.baseY + Math.sin(this.hoverTimer) * 14;

    this.teleportTimer += dt;
    if (this.teleportTimer >= this.teleportCooldown && !this.isAttacking) {
      this.teleportTimer = 0;
      const spots = [w * 0.22, w * 0.5, w * 0.78];
      const validSpots = spots.filter(s => Math.abs(s - this.baseX) > 100);
      const newX = validSpots[Math.floor(Math.random() * validSpots.length)] || w * 0.5;

      this.baseX = newX;
      this.x = newX;
      onShake && onShake(10, 220);
    }

    // 4. Hit Flash
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
    }

    // 5. Update Managers (Safe protected execution)
    try {
      this.projectileManager.update(dt, player, onPlayerDamage, w, h);
    } catch (err) {
      console.error("[NullOverseer] ProjectileManager update error:", err);
    }

    try {
      this.beamManager.update(dt, player, onPlayerDamage, w, h);
    } catch (err) {
      console.error("[NullOverseer] BeamManager update error:", err);
    }

    try {
      this.hazardManager.update(dt, player, onPlayerDamage);
    } catch (err) {
      console.error("[NullOverseer] HazardManager update error:", err);
    }

    // 6. Update Boss Renderer
    try {
      this.bossRenderer.update(dt, this.x, this.y, player);
    } catch (err) {
      console.error("[NullOverseer] BossRenderer update error:", err);
    }

    // 6.5. Gentle Passive Shard Needle Fire (only in Phase 3 & 4)
    if (this.active && !this.defeated && player && this.currentPhase >= 3) {
      this.passiveDartTimer = (this.passiveDartTimer || 0) + dt;
      const dartInterval = this.currentPhase === 4 ? 2.6 : 3.6;
      if (this.passiveDartTimer >= dartInterval) {
        this.passiveDartTimer = 0;
        this.projectileManager.spawnTrackingDart({
          originX: this.x + (Math.random() - 0.5) * 60,
          originY: this.y + 10,
          playerX: player.x,
          playerY: player.y,
          trackDuration: 0.45,
          lockDuration: 0.22,
          speed: 480,
          damage: 14
        });
      }
    }

    // 7. Check Player Collision with Collectible Orb
    if (this.collectibleOrb && player) {
      this.collectibleOrb.pulse += dt * 6;
      const dist = Math.hypot(player.x - this.collectibleOrb.x, player.y - this.collectibleOrb.y);
      if (dist < player.r + this.collectibleOrb.r + 4) {
        // Player picked up orb
        this.orbCharge++;
        this.collectibleOrb = null;

        // If charged 5 orbs, counterattack boss for 20 damage and heal player!
        if (this.orbCharge >= this.orbChargeMax) {
          this.orbCharge = 0;
          this.takeDamage(20);
          onShake && onShake(24, 600);
          onHealPlayer && onHealPlayer(20);
          this.setBanner("QUANTUM RESONANCE COUNTER-STRIKE! -20 HP");
        }

        // Spawn next orb after brief delay
        setTimeout(() => {
          if (!this.defeated && this.active) {
            this.spawnOrb(w, h);
          }
        }, 1200);
      }
    }

    // 8. Attack Scheduler (Strict Mutual Exclusion with Generous Breathing Room)
    if (this.isAttacking) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        // Attack finished
        this.isAttacking = false;
        this.bossRenderer.setEyeState("IDLE");
        const tempoMultiplier = this.currentPhase === 4 ? 0.70 : this.currentPhase === 3 ? 0.80 : this.currentPhase === 2 ? 0.90 : 1.0;
        this.cooldownTimer = (this.currentAttack?.cooldown || 1.0) * tempoMultiplier;
      }
    } else {
      this.cooldownTimer -= dt;
      if (this.cooldownTimer <= 0) {
        this.selectAndLaunchAttack(player, w, h);
      }
    }
  }

  selectAndLaunchAttack(player, arenaWidth, arenaHeight) {
    const w = arenaWidth || 980;
    const h = arenaHeight || 540;

    let pool = ATTACKS.filter(a => a.minPhase <= this.currentPhase);

    if (pool.length > 1 && this.lastAttackId) {
      const filtered = pool.filter(a => a.id !== this.lastAttackId);
      if (filtered.length > 0) pool = filtered;
    }

    if (pool.length === 0) return;

    let attack;
    if (this.currentPhase === 4 && Math.random() < 0.40 && this.lastAttackId !== "singularity_collapse") {
      attack = pool.find(a => a.id === "singularity_collapse") || pool[Math.floor(Math.random() * pool.length)];
    } else {
      attack = pool[Math.floor(Math.random() * pool.length)];
    }

    this.currentAttack = attack;
    this.lastAttackId = attack.id;
    this.isAttacking = true;
    const phaseSpeedFactor = this.currentPhase === 4 ? 0.75 : this.currentPhase === 3 ? 0.85 : 0.95;
    this.attackTimer = attack.duration * phaseSpeedFactor;

    if (attack.bossEyeState) {
      this.bossRenderer.setEyeState(attack.bossEyeState);
    }

    // Execute attack safely
    const managers = {
      projectileManager: this.projectileManager,
      beamManager: this.beamManager,
      hazardManager: this.hazardManager
    };

    try {
      attack.execute(managers, player, this, w, h);
    } catch (err) {
      console.error(`[NullOverseer] Attack '${attack.id}' execute error:`, err);
    }
  }

  draw(ctx, arenaWidth = 980, arenaHeight = 540) {
    if (!this.active) return;

    const w = Number.isFinite(arenaWidth) && arenaWidth > 0 ? arenaWidth : 980;
    const h = Number.isFinite(arenaHeight) && arenaHeight > 0 ? arenaHeight : 540;

    // 1. Subtle Retro CRT Scanlines & Void Arena Atmosphere
    ctx.save();
    ctx.fillStyle = "rgba(10, 4, 20, 0.4)";
    ctx.fillRect(0, 0, w, h);

    // Thin horizontal scanline grid
    ctx.strokeStyle = "rgba(168, 85, 247, 0.04)";
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 6) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Draw Hazards, Beams, and Projectiles (Safe execution)
    try {
      this.hazardManager.draw(ctx);
    } catch (err) {
      console.error("[NullOverseer] HazardManager draw error:", err);
    }

    try {
      this.beamManager.draw(ctx, w, h);
    } catch (err) {
      console.error("[NullOverseer] BeamManager draw error:", err);
    }

    try {
      this.projectileManager.draw(ctx);
    } catch (err) {
      console.error("[NullOverseer] ProjectileManager draw error:", err);
    }

    // 3. Draw Collectible Quantum Resonance Orb
    if (this.collectibleOrb) {
      const orb = this.collectibleOrb;
      const pulseR = orb.r + Math.sin(orb.pulse) * 2.5;

      ctx.save();
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 18;

      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, Math.max(1, pulseR), 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, Math.max(1, pulseR * 0.5), 0, Math.PI * 2);
      ctx.fill();

      const sparkAng = orb.pulse * 1.5;
      const sx = orb.x + Math.cos(sparkAng) * (pulseR + 6);
      const sy = orb.y + Math.sin(sparkAng) * (pulseR + 6);
      ctx.fillStyle = "#a855f7";
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // 4. Draw Boss Chassis, Core & Orbiting Shards
    try {
      this.bossRenderer.draw(ctx, this.x, this.y);
    } catch (err) {
      console.error("[NullOverseer] BossRenderer draw error:", err);
    }

    // 5. Draw Atmospheric Dialogue Banner
    if (this.bannerText && this.bannerAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.bannerAlpha;
      ctx.fillStyle = "#c084fc";
      ctx.shadowColor = "#a855f7";
      ctx.shadowBlur = 12;
      ctx.font = "900 15px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`[ ${this.bannerText} ]`, w / 2, 42);
      ctx.restore();
    }

    // 6. Draw HUD Boss Health & Counterattack Charge Bar
    try {
      this.drawHUD(ctx, w, h);
    } catch (err) {
      console.error("[NullOverseer] HUD draw error:", err);
    }
  }

  drawHUD(ctx, arenaWidth = 980, arenaHeight = 540) {
    if (this.defeated) return;

    const w = Number.isFinite(arenaWidth) && arenaWidth > 0 ? arenaWidth : 980;

    ctx.save();
    const barW = Math.max(120, Math.min(460, w - 120));
    const barH = 14;
    const barX = (w - barW) / 2;
    const barY = 16;

    // Boss Name & Phase Indicator
    ctx.font = "bold 13px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "#e2e8f0";
    ctx.shadowColor = "#a855f7";
    ctx.shadowBlur = 8;
    ctx.fillText("CIPHER // NULL OVERSEER", barX, barY - 4);

    ctx.textAlign = "right";
    const phaseLabel = this.currentPhase === 4 ? "OMEGA SINGULARITY" : `PHASE ${this.currentPhase} / 4`;
    ctx.fillStyle = this.currentPhase === 4 ? "#ef4444" : "#38bdf8";
    ctx.fillText(phaseLabel, barX + barW, barY - 4);

    // Background bar
    ctx.fillStyle = "rgba(15, 8, 30, 0.85)";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = "rgba(168, 85, 247, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(barX, barY, barW, barH);

    // Health Fill (Vibrant void gradient)
    const hpRatio = Math.max(0, Math.min(1, this.hp / this.maxHp));
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    if (this.currentPhase === 4) {
      grad.addColorStop(0, "#ef4444");
      grad.addColorStop(1, "#f97316");
    } else {
      grad.addColorStop(0, "#8b5cf6");
      grad.addColorStop(1, "#d946ef");
    }

    ctx.fillStyle = grad;
    ctx.fillRect(barX + 2, barY + 2, Math.max(0, (barW - 4) * hpRatio), barH - 4);

    // Quantum Resonance Charge Pips
    const pipsY = barY + barH + 6;
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("RESONANCE CHARGE:", barX, pipsY + 8);

    const pipStartX = barX + 130;
    const pipSize = 10;
    const pipGap = 6;
    for (let i = 0; i < this.orbChargeMax; i++) {
      const px = pipStartX + i * (pipSize + pipGap);
      ctx.fillStyle = i < this.orbCharge ? "#38bdf8" : "rgba(255, 255, 255, 0.15)";
      ctx.fillRect(px, pipsY, pipSize, pipSize);
      ctx.strokeStyle = i < this.orbCharge ? "#0284c7" : "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px, pipsY, pipSize, pipSize);
    }

    ctx.restore();
  }
}
