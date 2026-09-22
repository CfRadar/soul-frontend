/**
 * attackLibrary.js
 * Balanced bullet-hell attack routines for Cipher: The Null Overseer.
 * 
 * Tuned for fair readability, clear telegraphs, reachable safe corridors,
 * and rewarding counterplay with dash/focus.
 */

export const ATTACKS = [
  // 1. Horizontal Wave (Null Surge)
  {
    id: "horizontal_wave",
    name: "Null Surge",
    minPhase: 1,
    duration: 2.6,
    cooldown: 0.9,
    bossEyeState: "ATTACKING",
    execute: ({ projectileManager }, player, boss, w, h) => {
      // 4 alternating waves with generous 115px corridors
      const safeLanes = [h * 0.30, h * 0.70, h * 0.40, h * 0.60];
      for (let i = 0; i < 4; i++) {
        setTimeout(() => {
          projectileManager.spawnHorizontalWave({
            fromLeft: i % 2 === 0,
            safeY: safeLanes[i],
            arenaWidth: w,
            arenaHeight: h,
            speed: 420 + i * 15,
            rows: 8,
            safeHeight: 115,
            damage: 14
          });
        }, i * 400);
      }
    }
  },

  // 2. Dual Horizontal Pinch (Binary Compression)
  {
    id: "dual_horizontal_pinch",
    name: "Binary Compression",
    minPhase: 2,
    duration: 2.8,
    cooldown: 1.0,
    bossEyeState: "AIMING",
    execute: ({ projectileManager }, player, boss, w, h) => {
      // 3 paired waves with clear 115px safe lanes
      const safeLanes = [h * 0.35, h * 0.65, h * 0.50];
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          projectileManager.spawnHorizontalWave({
            fromBoth: true,
            safeY: safeLanes[i],
            arenaWidth: w,
            arenaHeight: h,
            speed: 410 + i * 15,
            rows: 8,
            safeHeight: 115,
            damage: 15
          });
        }, i * 550);
      }
    }
  },

  // 3. Vertical Columns (Abyssal Pillars)
  {
    id: "vertical_columns",
    name: "Abyssal Pillars",
    minPhase: 1,
    duration: 2.7,
    cooldown: 0.9,
    bossEyeState: "ATTACKING",
    execute: ({ projectileManager }, player, boss, w, h) => {
      // 4 descending column waves with wide 115px safe corridors
      const safeLanes = [w * 0.25, w * 0.50, w * 0.75, w * 0.40];
      for (let i = 0; i < 4; i++) {
        setTimeout(() => {
          projectileManager.spawnVerticalColumns({
            safeX: safeLanes[i],
            arenaWidth: w,
            arenaHeight: h,
            fromTop: i % 2 === 0,
            speed: 430,
            spacing: 58,
            safeWidth: 115,
            damage: 14
          });
        }, i * 420);
      }
    }
  },

  // 4. Cross Fire (Dimensional Crossfire)
  {
    id: "cross_fire",
    name: "Dimensional Crossfire",
    minPhase: 2,
    duration: 3.0,
    cooldown: 1.0,
    bossEyeState: "ATTACKING",
    execute: ({ projectileManager }, player, boss, w, h) => {
      // Interleaving Vertical & Horizontal waves with generous timing
      projectileManager.spawnVerticalColumns({
        safeX: w * 0.45,
        arenaWidth: w,
        arenaHeight: h,
        speed: 420,
        safeWidth: 120,
        damage: 14
      });

      setTimeout(() => {
        projectileManager.spawnHorizontalWave({
          fromLeft: true,
          safeY: h * 0.60,
          arenaWidth: w,
          arenaHeight: h,
          speed: 410,
          safeHeight: 120,
          damage: 14
        });
      }, 450);

      setTimeout(() => {
        projectileManager.spawnVerticalColumns({
          safeX: w * 0.70,
          arenaWidth: w,
          arenaHeight: h,
          fromTop: false,
          speed: 430,
          safeWidth: 120,
          damage: 14
        });
      }, 950);
    }
  },

  // 5. Tracking Darts (Ocular Lock)
  {
    id: "tracking_darts",
    name: "Ocular Lock",
    minPhase: 1,
    duration: 2.8,
    cooldown: 0.9,
    bossEyeState: "AIMING",
    execute: ({ projectileManager }, player, boss, w, h) => {
      // 6 single darts spaced by 340ms, clear aim line and moderate speed
      const count = 6;
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          if (!player) return;
          projectileManager.spawnTrackingDart({
            originX: boss.x + (i % 2 === 0 ? 40 : -40),
            originY: boss.y + 10,
            playerX: player.x,
            playerY: player.y,
            trackDuration: 0.45,
            lockDuration: 0.22,
            speed: 530,
            damage: 16
          });
        }, i * 340);
      }
    }
  },

  // 6. Delayed Quantum Mines (Singularity Cluster)
  {
    id: "delayed_mines",
    name: "Singularity Cluster",
    minPhase: 2,
    duration: 3.2,
    cooldown: 1.0,
    bossEyeState: "AIMING",
    execute: ({ projectileManager }, player, boss, w, h) => {
      // 5 mines scattered with clear fuse times
      for (let i = 0; i < 5; i++) {
        const mx = 100 + Math.random() * (w - 200);
        const my = 80 + Math.random() * (h - 160);
        projectileManager.spawnQuantumMine({
          x: mx,
          y: my,
          fuseTime: 1.5 + (i % 3) * 0.3,
          radius: 50,
          damage: 18
        });
      }
    }
  },

  // 7. Colossal Horizontal Beam (Event Horizon [H])
  {
    id: "colossal_beam_h",
    name: "Event Horizon [H]",
    minPhase: 2,
    duration: 2.8,
    cooldown: 1.0,
    bossEyeState: "OVERLOAD",
    execute: ({ beamManager, projectileManager }, player, boss, w, h) => {
      // Targets player's current Y with a generous 0.85s charge telegraph!
      const targetY = player ? Math.max(70, Math.min(h - 70, player.y)) : h / 2;

      beamManager.spawnColossalBeam({
        isHorizontal: true,
        pos: targetY,
        thickness: 95,
        telegraphTime: 0.85,
        fireTime: 0.9,
        damage: 20,
        arenaWidth: w,
        arenaHeight: h
      });
    }
  },

  // 8. Colossal Vertical Beam (Event Horizon [V])
  {
    id: "colossal_beam_v",
    name: "Event Horizon [V]",
    minPhase: 2,
    duration: 2.8,
    cooldown: 1.0,
    bossEyeState: "OVERLOAD",
    execute: ({ beamManager, projectileManager }, player, boss, w, h) => {
      // Targets player's current X with a generous 0.85s charge telegraph!
      const targetX = player ? Math.max(80, Math.min(w - 80, player.x)) : w / 2;

      beamManager.spawnColossalBeam({
        isHorizontal: false,
        pos: targetX,
        thickness: 95,
        telegraphTime: 0.85,
        fireTime: 0.9,
        damage: 20,
        arenaWidth: w,
        arenaHeight: h
      });
    }
  },

  // 9. Sequential Multi-Beams (Cascade Grid)
  {
    id: "sequential_multi_beams",
    name: "Cascade Grid",
    minPhase: 3,
    duration: 3.2,
    cooldown: 1.0,
    bossEyeState: "ATTACKING",
    execute: ({ beamManager }, player, boss, w, h) => {
      // 5 cascading lanes with 0.60s telegraph
      const lanes = [w * 0.16, w * 0.32, w * 0.50, w * 0.68, w * 0.84];
      if (Math.random() < 0.5) lanes.reverse();

      beamManager.spawnSequentialBeams({
        positions: lanes,
        isHorizontal: false,
        interval: 0.22,
        telegraphTime: 0.60,
        fireTime: 0.65,
        thickness: 68,
        damage: 18,
        arenaWidth: w,
        arenaHeight: h
      });
    }
  },

  // 10. Rotating Laser Blades (Vortex Sever)
  {
    id: "rotating_laser_twin",
    name: "Vortex Sever",
    minPhase: 3,
    duration: 4.2,
    cooldown: 1.1,
    bossEyeState: "OVERLOAD",
    execute: ({ beamManager, projectileManager }, player, boss, w, h) => {
      // 3 rotating laser blades at comfortable 1.15 rad/s with 0.85s telegraph
      beamManager.spawnRotatingLasers({
        originX: boss.x,
        originY: boss.y,
        rayCount: 3,
        angularVelocity: 1.15,
        telegraphTime: 0.85,
        duration: 3.5,
        thickness: 24,
        damage: 18
      });

      // Gentle 4-arm spiral
      setTimeout(() => {
        projectileManager.spawnLogarithmicSpiral({
          originX: boss.x,
          originY: boss.y,
          arms: 4,
          speed: 300,
          bulletsPerArm: 9,
          damage: 14
        });
      }, 900);
    }
  },

  // 11. Sweeping Reaper Scythe (Abyssal Scythe)
  {
    id: "sweeping_scythe",
    name: "Abyssal Scythe",
    minPhase: 2,
    duration: 2.8,
    cooldown: 0.9,
    bossEyeState: "ATTACKING",
    execute: ({ hazardManager }, player, boss, w, h) => {
      // Scythe cuts horizontally at 440 px/s with wide 115px safe gap
      const safe1 = h * 0.32;
      const safe2 = h * 0.68;
      const fromLeft = Math.random() < 0.5;

      hazardManager.spawnScythe({
        fromLeft,
        safeY: safe1,
        arenaWidth: w,
        arenaHeight: h,
        speed: 440,
        gapSize: 115
      });

      // Second return scythe after 900ms
      setTimeout(() => {
        hazardManager.spawnScythe({
          fromLeft: !fromLeft,
          safeY: safe2,
          arenaWidth: w,
          arenaHeight: h,
          speed: 440,
          gapSize: 115
        });
      }, 900);
    }
  },

  // 12. Arena Boundary Compression (Spatial Crunch)
  {
    id: "arena_compression_cross",
    name: "Spatial Crunch",
    minPhase: 3,
    duration: 4.0,
    cooldown: 1.1,
    bossEyeState: "AIMING",
    execute: ({ hazardManager, projectileManager }, player, boss, w, h) => {
      // Inset only 22% (leaves 56% open center) with 0.9s telegraph
      hazardManager.spawnArenaCompression({
        telegraphTime: 0.90,
        activeTime: 2.8,
        compressionRatio: 0.22,
        arenaWidth: w,
        arenaHeight: h
      });

      setTimeout(() => {
        projectileManager.spawnVerticalColumns({
          safeX: w * 0.50,
          arenaWidth: w,
          arenaHeight: h,
          speed: 420,
          safeWidth: 120,
          damage: 15
        });
      }, 1000);
    }
  },

  // 13. Moving Sanctuary Bubble (Sanctuary Haven)
  {
    id: "moving_sanctuary",
    name: "Sanctuary Haven",
    minPhase: 3,
    duration: 5.5,
    cooldown: 1.1,
    bossEyeState: "IDLE",
    execute: ({ hazardManager, projectileManager }, player, boss, w, h) => {
      hazardManager.spawnSanctuary({
        duration: 5.2,
        radius: 68,
        arenaWidth: w,
        arenaHeight: h
      });

      // Droplets falling outside
      setTimeout(() => {
        projectileManager.spawnProjectileRain({
          density: 26,
          arenaWidth: w,
          arenaHeight: h,
          speed: 440,
          playerX: player ? player.x : w / 2,
          damage: 14
        });
      }, 900);
    }
  },

  // 14. Fake-Out Spatial Deception (Null Paradox)
  {
    id: "fake_out_strike",
    name: "Null Paradox",
    minPhase: 3,
    duration: 2.8,
    cooldown: 0.9,
    bossEyeState: "AIMING",
    execute: ({ hazardManager, projectileManager }, player, boss, w, h) => {
      const fakeOnLeft = Math.random() < 0.5;
      hazardManager.spawnFakeOut({
        fakeOnLeft,
        arenaWidth: w,
        arenaHeight: h,
        onRealStrikeTrigger: (realOnLeft) => {
          projectileManager.spawnHorizontalWave({
            fromLeft: realOnLeft,
            safeY: h * 0.40,
            arenaWidth: w,
            arenaHeight: h,
            speed: 440,
            safeHeight: 120,
            damage: 16
          });
        }
      });
    }
  },

  // 15. Stardust Rain (Cosmic Fallout)
  {
    id: "stardust_rain",
    name: "Cosmic Fallout",
    minPhase: 1,
    duration: 2.8,
    cooldown: 0.9,
    bossEyeState: "ATTACKING",
    execute: ({ projectileManager }, player, boss, w, h) => {
      projectileManager.spawnProjectileRain({
        density: 28,
        arenaWidth: w,
        arenaHeight: h,
        speed: 450,
        playerX: player ? player.x : w / 2,
        safeGap: 110,
        damage: 14
      });
    }
  },

  // 16. Singularity Collapse (OMEGA: Singularity Collapse - Phase 4 Ultimate)
  {
    id: "singularity_collapse",
    name: "OMEGA: Singularity Collapse",
    minPhase: 4,
    duration: 5.5,
    cooldown: 1.2,
    bossEyeState: "OVERLOAD",
    execute: ({ projectileManager, beamManager, hazardManager }, player, boss, w, h) => {
      // 3 rotating laser blades
      beamManager.spawnRotatingLasers({
        originX: w / 2,
        originY: h / 2,
        rayCount: 3,
        angularVelocity: 1.10,
        telegraphTime: 0.85,
        duration: 4.8,
        thickness: 24,
        damage: 20
      });

      // 4 corner mines
      setTimeout(() => {
        projectileManager.spawnQuantumMine({ x: w * 0.16, y: h * 0.20, fuseTime: 1.6, radius: 46, damage: 18 });
        projectileManager.spawnQuantumMine({ x: w * 0.84, y: h * 0.20, fuseTime: 1.6, radius: 46, damage: 18 });
        projectileManager.spawnQuantumMine({ x: w * 0.16, y: h * 0.80, fuseTime: 2.0, radius: 46, damage: 18 });
        projectileManager.spawnQuantumMine({ x: w * 0.84, y: h * 0.80, fuseTime: 2.0, radius: 46, damage: 18 });
      }, 600);

      // Logarithmic spiral
      setTimeout(() => {
        projectileManager.spawnLogarithmicSpiral({
          originX: w / 2,
          originY: h / 2,
          arms: 5,
          speed: 320,
          bulletsPerArm: 10,
          damage: 14
        });
      }, 1600);
    }
  }
];
