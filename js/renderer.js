(function (root) {
  const NLC = (root.NLC = root.NLC || {});

  const easeOutCubic = (t) => 1 - Math.pow(1 - NLC.clamp(t, 0, 1), 3);
  const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  NLC.spawnParticles = function (x, y, color, count = 18, speed = 3.2) {
    if (!NLC.state.fxOn) return;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const spd = (0.4 + Math.random() * 0.85) * speed;
      NLC.state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1.0,
        decay: 0.022 + Math.random() * 0.018,
        size: 2.2 + Math.random() * 2.5,
        color
      });
    }
  };

  NLC.spawnFloatingText = function (x, y, text, subtext, color = "#a3e635") {
    if (!NLC.state.fxOn) return;
    NLC.state.floatingTexts.push({
      x,
      y,
      text,
      subtext: subtext || "",
      color,
      life: 1.0
    });
  };

  NLC.drawPitch = function (canvas) {
    if (!canvas || !canvas.offsetWidth || !canvas.offsetHeight) return;
    const {
      state,
      clamp,
      lerp,
      battingTeam,
      bowlingTeam,
      getActivePitchInfo,
      playTone,
      playSoundEffect
    } = NLC;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const styles = getComputedStyle(document.documentElement);
    const turfInner = styles.getPropertyValue("--turf-inner").trim() || "#157359";
    const turfOuter = styles.getPropertyValue("--turf-outer").trim() || "#093b2e";
    const pitchInfo = getActivePitchInfo();
    const pitchClay = pitchInfo.clayColor || styles.getPropertyValue("--pitch-clay").trim() || "#d4b07b";
    const accentColor = styles.getPropertyValue("--accent").trim() || "#a3e635";
    const secondaryColor = styles.getPropertyValue("--accent-secondary").trim() || "#f97316";
    const cyanColor = styles.getPropertyValue("--cyan").trim() || "#38bdf8";

    const now = performance.now();
    const sim = state.animation.sim;
    const animT = sim ? clamp((now - state.animation.started) / Math.max(state.animation.duration || 2200, 1), 0, 1) : 0;

    updateLiveFieldPositions(sim, animT);
    const ballState = sim ? computeBallState(sim, animT, playTone, playSoundEffect) : null;

    const cx = width * 0.5;
    const cy = height * 0.52;
    const rx = width * 0.43;
    const ry = height * 0.42;

    if (sim && !sim.particlesFired && animT >= 0.46) {
      sim.particlesFired = true;
      const ix = cx + sim.arrivalPos.nx * rx;
      const iy = cy + sim.arrivalPos.ny * ry;
      if (sim.outcome.kind === "wicket") {
        NLC.spawnParticles(ix, iy, "#f43f5e", 26, 3.8);
        NLC.spawnFloatingText(ix, iy - 16, `OUT! ${sim.outcome.dismissalType.toUpperCase()}`, `${sim.traj.ballKmh.toFixed(1)} KM/H`, "#f43f5e");
      } else if (sim.meta.contactQuality !== "miss" && !sim.isWide) {
        const pColor = sim.outcome.batRuns === 6 ? "#c084fc" : sim.outcome.runs >= 4 ? accentColor : cyanColor;
        NLC.spawnParticles(ix, iy, pColor, sim.outcome.runs >= 4 ? 24 : 12, sim.outcome.runs >= 4 ? 3.8 : 2.2);
        const qLabel = sim.meta.contactQuality.toUpperCase();
        const distTag = sim.traj.distanceMeters ? ` • ${sim.traj.distanceMeters}m` : "";
        NLC.spawnFloatingText(ix, iy - 16, `${qLabel} TIMING!`, `${sim.traj.exitKmh} KM/H${distTag}`, pColor);
      }
    }

    let targetZoom = 1.0;
    let targetFocusX = 0;
    let targetFocusY = 0;
    if (state.dynamicCamera && state.fxOn && sim) {
      if (animT < 0.46) {
        targetZoom = 1.30;
        targetFocusY = lerp(-ry * 0.12, ry * 0.16, clamp(animT / 0.45, 0, 1));
      } else {
        targetZoom = 1.05;
        targetFocusX = (ballState ? ballState.nx : 0) * rx * 0.22;
        targetFocusY = (ballState ? ballState.ny : 0) * ry * 0.22;
      }
    }
    state.camera.zoom = lerp(state.camera.zoom, targetZoom, 0.12);
    state.camera.focusX = lerp(state.camera.focusX, targetFocusX, 0.12);
    state.camera.focusY = lerp(state.camera.focusY, targetFocusY, 0.12);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(state.camera.zoom, state.camera.zoom);
    ctx.translate(-cx - state.camera.focusX, -cy - state.camera.focusY);

    drawOvalTurf(ctx, cx, cy, rx, ry, turfInner, turfOuter, accentColor, sim, animT, now);
    drawPitchStrip(ctx, cx, cy, rx, ry, pitchClay, accentColor, sim, animT);

    // STRICT ROLE-SEPARATED PRE-DELIVERY AIM OVERLAY:
    // Batter ONLY sees 360° Shot Aim Cone; Bowler ONLY sees Pitch Bounce Target & Swing/Turn Curve!
    if (!sim) {
      drawRoleSeparatedAimOverlay(ctx, cx, cy, rx, ry, accentColor, secondaryColor, cyanColor);
    }

    if (!sim && state.showHawkEye && state.lastHawkEye) {
      drawLastHawkEyeTrace(ctx, cx, cy, rx, ry, state.lastHawkEye, cyanColor);
    }

    const batColor = battingTeam() === 0 ? accentColor : secondaryColor;
    const bowlColor = bowlingTeam() === 0 ? accentColor : secondaryColor;
    drawFieldersAndKeeper(ctx, cx, cy, rx, ry, bowlColor, cyanColor, sim, animT, now);
    drawBowlerFigure(ctx, cx, cy, rx, ry, bowlColor, sim, animT);
    drawBattersLhbRhb(ctx, cx, cy, rx, ry, batColor, sim, animT);
    drawStumpsAndBails(ctx, cx, cy, rx, ry, sim, animT);

    if (sim && ballState) {
      drawBallAndTrail(ctx, cx, cy, rx, ry, sim, ballState, accentColor, secondaryColor);
    }

    drawParticlesAndCallouts(ctx);
    ctx.restore();
  };

  function updateLiveFieldPositions(sim, t) {
    const { state, clamp, lerp, resolveActiveFieldPreset, getTargetFielderPositions, currentInnings, getStriker } = NLC;
    const preset = sim ? sim.preset : resolveActiveFieldPreset();
    const targets = sim ? sim.fielders : getTargetFielderPositions(preset);
    const inn = currentInnings();
    const striker = inn ? getStriker(inn) : { hand: "RHB" };
    const handSign = striker.hand === "LHB" ? -1 : 1;

    if (state.liveFielders.length !== targets.length) {
      state.liveFielders = targets.map((f) => ({
        nx: f.targetNx,
        ny: f.targetNy,
        role: f.role,
        ring: f.ring,
        chasing: false
      }));
    }

    const keeperTargetNy = preset.keeperUp ? 0.415 : 0.525;
    const keeperTargetNx = 0.032 * handSign;
    state.liveKeeper.nx = lerp(state.liveKeeper.nx, keeperTargetNx, 0.16);
    state.liveKeeper.ny = lerp(state.liveKeeper.ny, keeperTargetNy, 0.16);

    const impactT = 0.46;
    const pickupT = 0.74;

    targets.forEach((target, idx) => {
      const lf = state.liveFielders[idx];
      lf.role = target.role;
      lf.chasing = false;
      let goalNx = target.targetNx;
      let goalNy = target.targetNy;

      if (sim && t >= impactT) {
        if (sim.catcherIndex === idx) {
          lf.chasing = true;
          const u = easeOutCubic(clamp((t - impactT) / (0.76 - impactT), 0, 1));
          goalNx = lerp(target.targetNx, sim.endBallPos.nx, u);
          goalNy = lerp(target.targetNy, sim.endBallPos.ny, u);
        } else if (sim.chaserIndices[0] === idx) {
          lf.chasing = true;
          const u = easeOutCubic(clamp((t - impactT) / (pickupT - impactT), 0, 1));
          const limit = sim.outcome.runs >= 4 ? 0.90 : 1.0;
          goalNx = lerp(target.targetNx, sim.endBallPos.nx * limit, u);
          goalNy = lerp(target.targetNy, sim.endBallPos.ny * limit, u);
        } else if (sim.chaserIndices[1] === idx) {
          lf.chasing = true;
          const u = easeOutCubic(clamp((t - impactT) / (pickupT - impactT), 0, 1));
          goalNx = lerp(target.targetNx, sim.endBallPos.nx * 0.78, u * 0.65);
          goalNy = lerp(target.targetNy, sim.endBallPos.ny * 0.78, u * 0.65);
        }
      }
      lf.nx = sim && t >= impactT ? goalNx : lerp(lf.nx, goalNx, 0.18);
      lf.ny = sim && t >= impactT ? goalNy : lerp(lf.ny, goalNy, 0.18);
    });
  }

  function computeBallState(sim, t, playTone, playSoundEffect) {
    const { clamp, lerp } = NLC;
    const releaseT = 0.25;
    const bounceT = 0.38;
    const impactT = 0.46;
    const pickupT = 0.74;

    if (!sim.soundTriggered.release && t >= releaseT) {
      sim.soundTriggered.release = true;
      if (sim.isNoBall) playSoundEffect("noball_siren");
      else playTone(260, 0.03, "sine", 0.04);
    }
    if (!sim.soundTriggered.bounce && t >= bounceT) {
      sim.soundTriggered.bounce = true;
      playTone(185, 0.03, "triangle", 0.05);
    }
    if (!sim.soundTriggered.impact && t >= impactT && !sim.isWide) {
      sim.soundTriggered.impact = true;
      if (sim.outcome.kind === "wicket" && ["bowled", "stumped"].includes(sim.outcome.dismissalType)) {
        playSoundEffect("wicket_shatter");
      } else if (sim.meta.contactQuality === "miss") {
        playTone(140, 0.04, "sine", 0.04);
      } else {
        playSoundEffect("bat_crack");
      }
    }
    if (!sim.soundTriggered.finish && t >= 0.70) {
      sim.soundTriggered.finish = true;
      if (sim.outcome.batRuns === 6 || sim.outcome.runs === 6) playSoundEffect("six_fanfare");
      else if (sim.outcome.runs >= 4) playSoundEffect("boundary_cheer");
      else if (sim.outcome.kind === "wicket") playSoundEffect("wicket_shatter");
    }

    let statePt = null;
    if (t < releaseT) {
      const u = easeInOutQuad(clamp(t / releaseT, 0, 1));
      statePt = {
        nx: lerp(sim.bowlerStart.nx, sim.releasePos.nx, u),
        ny: lerp(sim.bowlerStart.ny, sim.releasePos.ny, u),
        z: 10,
        phase: "runup"
      };
    } else if (t < bounceT) {
      const u = clamp((t - releaseT) / (bounceT - releaseT), 0, 1);
      statePt = {
        nx: lerp(sim.releasePos.nx, sim.pitchPos.nx, u),
        ny: lerp(sim.releasePos.ny, sim.pitchPos.ny, u),
        z: lerp(18, 0, u * u),
        phase: "flight"
      };
    } else if (t < impactT) {
      const u = clamp((t - bounceT) / (impactT - bounceT), 0, 1);
      statePt = {
        nx: lerp(sim.pitchPos.nx, sim.arrivalPos.nx, u),
        ny: lerp(sim.pitchPos.ny, sim.arrivalPos.ny, u),
        z: sim.arrivalPos.z * Math.sin(u * Math.PI * 0.65),
        phase: "bounce"
      };
    } else if (sim.throwTarget && t >= pickupT) {
      const u = clamp((t - pickupT) / (0.94 - pickupT), 0, 1);
      statePt = {
        nx: lerp(sim.endBallPos.nx, sim.throwTarget.nx, u),
        ny: lerp(sim.endBallPos.ny, sim.throwTarget.ny, u),
        z: Math.sin(u * Math.PI) * 14 + 3,
        phase: "throw"
      };
    } else {
      const postEndT = sim.throwTarget ? pickupT : 0.88;
      const u = clamp((t - impactT) / (postEndT - impactT), 0, 1);
      statePt = {
        nx: lerp(sim.arrivalPos.nx, sim.endBallPos.nx, easeOutCubic(u)),
        ny: lerp(sim.arrivalPos.ny, sim.endBallPos.ny, easeOutCubic(u)),
        z:
          sim.bounces === 0
            ? Math.sin(u * Math.PI) * sim.maxShotZ
            : Math.abs(Math.sin(u * Math.PI * 2.5)) * sim.maxShotZ * (1 - u * 0.7),
        phase: "shot"
      };
    }

    if (t >= releaseT) {
      sim.trailPoints.push({ nx: statePt.nx, ny: statePt.ny, z: statePt.z, phase: statePt.phase });
      if (sim.trailPoints.length > 26) sim.trailPoints.shift();
    }
    return statePt;
  }

  function drawOvalTurf(ctx, cx, cy, rx, ry, turfInner, turfOuter, accentColor, sim, animT, now) {
    const { currentInnings, getStriker } = NLC;
    ctx.save();

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 1.07, ry * 1.07, 0, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(cx, cy, ry * 0.08, cx, cy, Math.max(rx, ry) * 1.07);
    grad.addColorStop(0, turfInner);
    grad.addColorStop(1, turfOuter);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    for (let r = 0.18; r < 1.0; r += 0.16) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * r, ry * r, 0, 0, Math.PI * 2);
      ctx.lineWidth = rx * 0.075;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.032)";
      ctx.stroke();
    }
    const stripeCount = 12;
    const stripeW = (rx * 2) / stripeCount;
    for (let i = 0; i < stripeCount; i += 2) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.045)";
      ctx.fillRect(cx - rx + i * stripeW, cy - ry, stripeW, ry * 2);
    }
    ctx.restore();

    const corners = [
      { x: cx - rx * 0.92, y: cy - ry * 0.92 },
      { x: cx + rx * 0.92, y: cy - ry * 0.92 },
      { x: cx - rx * 0.92, y: cy + ry * 0.92 },
      { x: cx + rx * 0.92, y: cy + ry * 0.92 }
    ];
    corners.forEach((c) => {
      const beam = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, rx * 0.45);
      beam.addColorStop(0, "rgba(255, 255, 255, 0.15)");
      beam.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.arc(c.x, c.y, rx * 0.45, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
    ctx.fillRect(cx - 18, cy - ry * 1.045, 36, 4);
    ctx.fillRect(cx - 18, cy + ry * 1.02, 36, 4);

    const isBoundary = sim && sim.outcome.runs >= 4 && animT > 0.65;
    const pulse = isBoundary ? 1 + Math.sin(now * 0.02) * 0.35 : 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.lineWidth = isBoundary ? 4 * pulse : 2.4;
    ctx.strokeStyle = isBoundary ? accentColor : "rgba(255,255,255,0.85)";
    if (isBoundary) {
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 16;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.54, ry * 0.54, 0, 0, Math.PI * 2);
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = "rgba(255,255,255,0.48)";
    ctx.stroke();
    ctx.setLineDash([]);

    const inn = currentInnings();
    const striker = inn ? getStriker(inn) : { hand: "RHB" };
    const isLhb = striker.hand === "LHB";
    ctx.font = "800 9px Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.textAlign = "center";
    ctx.fillText(isLhb ? "OFF SIDE (LHB)" : "LEG SIDE (RHB)", cx - rx * 0.72, cy);
    ctx.fillText(isLhb ? "LEG SIDE (LHB)" : "OFF SIDE (RHB)", cx + rx * 0.72, cy);
    ctx.restore();
  }

  /**
   * STRICT ROLE-SEPARATED TACTICAL OVERLAY:
   * - When Human is BATTING: Draws ONLY the 360° Shot Aim Cone (Bowler's ball prediction is hidden!)
   * - When Human is BOWLING: Draws ONLY the Bowler's live Pitch Drop Reticle & Swing/Spin Flight Path (Batter's shot cone is hidden!)
   */
  function drawRoleSeparatedAimOverlay(ctx, cx, cy, rx, ry, accentColor, secondaryColor, cyanColor) {
    const { state, isHumanBattingTurn, rayRadiusDistance, computeBowlerPreviewTrajectory } = NLC;
    const isBatting = isHumanBattingTurn();

    ctx.save();
    if (isBatting) {
      const strikerX = cx;
      const strikerY = cy + ry * 0.34;
      const aimA = state.shotAngle;
      const coneSpread = 0.20;
      const tRope = rayRadiusDistance(aimA, 0.98);
      const endX = cx + Math.sin(aimA) * tRope * rx;
      const endY = strikerY - Math.cos(aimA) * tRope * ry;

      const leftA = aimA - coneSpread;
      const rightA = aimA + coneSpread;
      const tLeft = rayRadiusDistance(leftA, 0.95);
      const tRight = rayRadiusDistance(rightA, 0.95);

      ctx.beginPath();
      ctx.moveTo(strikerX, strikerY);
      ctx.lineTo(cx + Math.sin(leftA) * tLeft * rx, strikerY - Math.cos(leftA) * tLeft * ry);
      ctx.lineTo(endX, endY);
      ctx.lineTo(cx + Math.sin(rightA) * tRight * rx, strikerY - Math.cos(rightA) * tRight * ry);
      ctx.closePath();

      const coneGrad = ctx.createRadialGradient(strikerX, strikerY, 8, strikerX, strikerY, Math.max(rx, ry) * 0.95);
      coneGrad.addColorStop(0, "rgba(163, 230, 53, 0.28)");
      coneGrad.addColorStop(1, "rgba(163, 230, 53, 0.04)");
      ctx.fillStyle = coneGrad;
      ctx.fill();

      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.moveTo(strikerX, strikerY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(endX, endY, 4.8, 0, Math.PI * 2);
      ctx.fillStyle = accentColor;
      ctx.fill();
    } else {
      // BOWLER MODE: Live Pitch Drop Spot + Swing/Turn Trajectory Trace + Wide/Bouncer Alert
      const prev = computeBowlerPreviewTrajectory();
      const rx0 = cx + prev.releasePos.nx * rx;
      const ry0 = cy + prev.releasePos.ny * ry;
      const px = cx + prev.pitchPos.nx * rx;
      const py = cy + prev.pitchPos.ny * ry;
      const ax = cx + prev.arrivalPos.nx * rx;
      const ay = cy + prev.arrivalPos.ny * ry;

      const isIllegalWarning = prev.isProjectedWide || prev.isProjectedHighBouncer;
      const reticleColor = isIllegalWarning ? "#f43f5e" : accentColor;

      // Flight path from bowler release to pitch bounce spot
      ctx.beginPath();
      ctx.setLineDash([4, 3]);
      ctx.moveTo(rx0, ry0);
      ctx.lineTo(px, py);
      ctx.strokeStyle = cyanColor;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Post-bounce seam/spin deviation arrow to popping crease
      ctx.beginPath();
      ctx.setLineDash([]);
      ctx.moveTo(px, py);
      ctx.lineTo(ax, ay);
      ctx.strokeStyle = reticleColor;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // Target Bounce Ring on Pitch
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fillStyle = isIllegalWarning ? "rgba(244, 63, 94, 0.25)" : "rgba(163, 230, 53, 0.22)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = reticleColor;
      ctx.stroke();

      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(px - 12, py);
      ctx.lineTo(px + 12, py);
      ctx.moveTo(px, py - 12);
      ctx.lineTo(px, py + 12);
      ctx.stroke();

      // Live drop label next to reticle
      ctx.font = "900 8.5px Inter, sans-serif";
      ctx.fillStyle = isIllegalWarning ? "#f43f5e" : "#ffffff";
      ctx.textAlign = "left";
      const tag = prev.isProjectedWide
        ? "⚠ WIDE DANGER"
        : prev.isProjectedHighBouncer
        ? "⚠ HIGH BOUNCER"
        : prev.effectivePitchFrac > 0.85
        ? "YORKER ZONE"
        : prev.effectivePitchFrac < 0.52
        ? "SHORT BOUNCE"
        : "GOOD LENGTH";
      ctx.fillText(tag, px + 13, py + 3);
    }
    ctx.restore();
  }

  function drawPitchStrip(ctx, cx, cy, rx, ry, pitchClay, accentColor, sim, animT) {
    const pw = NLC.clamp(rx * 0.15, 38, 52);
    const pt = cy - ry * 0.39;
    const pb = cy + ry * 0.39;
    ctx.save();

    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.fillRect(cx - pw * 0.54, pt - 2, pw * 1.08, pb - pt + 4);

    ctx.fillStyle = pitchClay;
    ctx.fillRect(cx - pw * 0.5, pt, pw, pb - pt);

    // Stump-to-Stump Hawk-Eye Corridor Carpet
    const corridorW = rx * 0.036;
    ctx.fillStyle = "rgba(56, 189, 248, 0.20)";
    ctx.fillRect(cx - corridorW * 0.5, cy - ry * 0.34, corridorW, ry * 0.68);

    // Good Length Zone Highlight
    ctx.fillStyle = "rgba(163, 230, 53, 0.16)";
    ctx.fillRect(cx - pw * 0.46, cy + ry * 0.06, pw * 0.92, ry * 0.14);

    // Wide Tramlines at Striker's Crease
    const wideX = rx * 0.056;
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - wideX, cy + ry * 0.295);
    ctx.lineTo(cx - wideX, cy + ry * 0.34);
    ctx.moveTo(cx + wideX, cy + ry * 0.295);
    ctx.lineTo(cx + wideX, cy + ry * 0.34);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.88)";
    ctx.lineWidth = 1.3;
    const northPop = cy - ry * 0.295;
    const southPop = cy + ry * 0.295;
    const northBowl = cy - ry * 0.34;
    const southBowl = cy + ry * 0.34;

    ctx.beginPath();
    ctx.moveTo(cx - pw * 0.58, northPop);
    ctx.lineTo(cx + pw * 0.58, northPop);
    ctx.moveTo(cx - pw * 0.58, southPop);
    ctx.lineTo(cx + pw * 0.58, southPop);
    ctx.moveTo(cx - pw * 0.48, northBowl);
    ctx.lineTo(cx + pw * 0.48, northBowl);
    ctx.moveTo(cx - pw * 0.48, southBowl);
    ctx.lineTo(cx + pw * 0.48, southBowl);
    ctx.stroke();

    if (sim && animT >= 0.38) {
      const u = NLC.clamp((animT - 0.38) / 0.35, 0, 1);
      const px = cx + sim.pitchPos.nx * rx;
      const py = cy + sim.pitchPos.ny * ry;
      ctx.beginPath();
      ctx.arc(px, py, 3 + u * 11, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${1 - u})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = accentColor;
      ctx.fill();
    }

    ctx.restore();
  }

  function drawLastHawkEyeTrace(ctx, cx, cy, rx, ry, he, cyanColor) {
    ctx.save();
    const rx0 = cx + he.releasePos.nx * rx;
    const ry0 = cy + he.releasePos.ny * ry;
    const px = cx + he.pitchPos.nx * rx;
    const py = cy + he.pitchPos.ny * ry;
    const ax = cx + he.arrivalPos.nx * rx;
    const ay = cy + he.arrivalPos.ny * ry;

    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(rx0, ry0);
    ctx.lineTo(px, py);
    ctx.lineTo(ax, ay);
    ctx.strokeStyle = he.isWicket ? "#f43f5e" : cyanColor;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(px, py, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "#facc15";
    ctx.fill();
    ctx.restore();
  }

  function drawFieldersAndKeeper(ctx, cx, cy, rx, ry, color, cyanColor, sim, animT, now) {
    const { state } = NLC;
    state.liveFielders.forEach((f, idx) => {
      const fx = cx + f.nx * rx;
      const fy = cy + f.ny * ry;
      ctx.save();

      ctx.fillStyle = "rgba(0,0,0,0.38)";
      ctx.beginPath();
      ctx.ellipse(fx, fy + 3.5, 6.2, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();

      if (f.chasing && sim && animT >= 0.46 && animT <= 0.78) {
        const stride = Math.sin(now * 0.035 + idx) * 3.5;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(fx - 2, fy + 2);
        ctx.lineTo(fx - 2 + stride, fy + 5.5);
        ctx.moveTo(fx + 2, fy + 2);
        ctx.lineTo(fx + 2 - stride, fy + 5.5);
        ctx.stroke();
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(fx, fy, 6.0, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#06131c";
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.fillStyle = "#102430";
      ctx.beginPath();
      ctx.arc(fx, fy - 0.5, 2.8, 0, Math.PI * 2);
      ctx.fill();

      if (state.showFieldLabels) {
        ctx.font = "700 8px Inter, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.90)";
        ctx.textAlign = "center";
        ctx.fillText(f.role, fx, fy + 14);
      }
      ctx.restore();
    });

    const wkx = cx + state.liveKeeper.nx * rx;
    const wky = cy + state.liveKeeper.ny * ry;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.ellipse(wkx, wky + 3.5, 6.5, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = cyanColor;
    ctx.beginPath();
    ctx.ellipse(wkx, wky, 6.2, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#06131c";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(wkx - 4.5, wky - 2.5, 2.0, 0, Math.PI * 2);
    ctx.arc(wkx + 4.5, wky - 2.5, 2.0, 0, Math.PI * 2);
    ctx.fill();

    if (state.showFieldLabels) {
      ctx.font = "800 8px Inter, sans-serif";
      ctx.fillStyle = cyanColor;
      ctx.textAlign = "center";
      ctx.fillText("WK", wkx, wky + 14);
    }
    ctx.restore();
  }

  function drawBowlerFigure(ctx, cx, cy, rx, ry, color, sim, animT) {
    const { clamp, lerp } = NLC;
    let bx = cx + 0.026 * rx;
    let by = cy - 0.58 * ry;
    if (sim) {
      if (animT < 0.25) {
        const u = clamp(animT / 0.25, 0, 1);
        bx = cx + lerp(sim.bowlerStart.nx, sim.releasePos.nx, u) * rx;
        by = cy + lerp(sim.bowlerStart.ny, sim.releasePos.ny, u) * ry;
      } else {
        const followU = clamp((animT - 0.25) / 0.2, 0, 1);
        bx = cx + sim.releasePos.nx * rx;
        by = cy + lerp(sim.releasePos.ny, -0.27, followU) * ry;
      }
    }
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.beginPath();
    ctx.ellipse(bx, by + 3.5, 6.2, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(bx, by, 6.0, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#06131c";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = "#102430";
    ctx.beginPath();
    ctx.arc(bx, by, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBattersLhbRhb(ctx, cx, cy, rx, ry, color, sim, animT) {
    const { clamp, lerp, currentInnings, getStriker } = NLC;
    const inn = currentInnings();
    const striker = inn ? getStriker(inn) : { hand: "RHB" };
    const handSign = striker.hand === "LHB" ? -1 : 1;

    const northPopY = cy - ry * 0.295;
    const southPopY = cy + ry * 0.295;

    let sx = cx - rx * 0.015 * handSign;
    let sy = southPopY + 2;
    let nsx = cx - rx * 0.044 * handSign;
    let nsy = northPopY - 2;
    let batAngle = 0.55 * handSign;
    let isDiving = false;

    if (sim) {
      if (sim.shotFoot === "advance" && animT >= 0.20 && animT <= 0.55) {
        const advU = Math.sin(clamp((animT - 0.20) / 0.35, 0, 1) * Math.PI * 0.7);
        sy = southPopY - 16 * advU;
      }
      if (animT >= 0.28 && animT <= 0.58) {
        const u = easeOutCubic(clamp((animT - 0.28) / 0.22, 0, 1));
        batAngle = lerp(1.45 * handSign, -1.85 * handSign, u);
      }
      if (sim.runsToRun > 0 && animT > 0.48) {
        const runU = clamp((animT - 0.48) / 0.44, 0, 1) * sim.runsToRun;
        const leg = Math.min(sim.runsToRun - 1, Math.floor(runU));
        const p = runU - leg;
        const goingNorth = leg % 2 === 0;
        sy = goingNorth ? lerp(southPopY, northPopY, p) : lerp(northPopY, southPopY, p);
        nsy = goingNorth ? lerp(northPopY, southPopY, p) : lerp(southPopY, northPopY, p);
        if (sim.divedCrease && p > 0.65) isDiving = true;
      }
    }

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.beginPath();
    ctx.ellipse(nsx, nsy + 3.5, 5.8, 3.0, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(nsx, nsy, 5.5, 4.0, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#06131c";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(sx, sy);
    if (isDiving) ctx.scale(1.28, 0.82);

    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.beginPath();
    ctx.ellipse(0, 3.8, 6.5, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (sim && animT >= 0.34 && animT <= 0.52) {
      ctx.beginPath();
      ctx.arc(3.6 * handSign, 0, 14, -Math.PI * 0.85, Math.PI * 0.35);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.38)";
      ctx.lineWidth = 3.2;
      ctx.stroke();
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6.2, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#06131c";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = "#0c2230";
    ctx.beginPath();
    ctx.arc(0, -0.5, 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(4.0 * handSign, 0);
    ctx.rotate(batAngle);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-1.0, -4, 2.0, 4);
    ctx.fillStyle = "#e6bc7a";
    ctx.strokeStyle = "#7a5320";
    ctx.lineWidth = 0.8;
    ctx.fillRect(-1.9, -15, 3.8, 11.5);
    ctx.strokeRect(-1.9, -15, 3.8, 11.5);
    ctx.restore();

    ctx.restore();
  }

  function drawStumpsAndBails(ctx, cx, cy, rx, ry, sim, animT) {
    const northY = cy - ry * 0.34;
    const southY = cy + ry * 0.34;
    const southShattered =
      sim &&
      sim.outcome.kind === "wicket" &&
      ["bowled", "stumped", "runout"].includes(sim.outcome.dismissalType) &&
      animT >= (sim.outcome.dismissalType === "runout" ? 0.82 : 0.46);

    const shatterU = southShattered
      ? NLC.clamp((animT - (sim.outcome.dismissalType === "runout" ? 0.82 : 0.46)) / 0.35, 0, 1)
      : 0;

    [-4.5, 0, 4.5].forEach((dx, idx) => {
      ctx.fillStyle = "#fff6d6";
      ctx.fillRect(cx + dx - 0.9, northY - 3, 1.8, 6);

      ctx.save();
      const sx = cx + dx + (southShattered ? (dx + 1.5) * shatterU * 3.2 : 0);
      const sy = southY + (southShattered ? shatterU * (idx === 1 ? 14 : 7) : 0);
      ctx.translate(sx, sy);
      if (southShattered) {
        ctx.rotate(shatterU * (idx === 1 ? 2.4 : -1.5));
        ctx.fillStyle = "#f43f5e";
        ctx.shadowColor = "#f43f5e";
        ctx.shadowBlur = 10;
      } else {
        ctx.fillStyle = "#fff6d6";
      }
      ctx.fillRect(-0.9, -3, 1.8, 6);
      ctx.restore();
    });

    if (southShattered) {
      [-1, 1].forEach((dir) => {
        const bx = cx + dir * (4 + shatterU * 22);
        const by = southY - Math.sin(shatterU * Math.PI) * 18 + shatterU * 12;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(shatterU * dir * 6.0);
        ctx.fillStyle = "#ff2a55";
        ctx.shadowColor = "#ff2a55";
        ctx.shadowBlur = 12;
        ctx.fillRect(-2.5, -0.8, 5, 1.6);
        ctx.restore();
      });
    }
  }

  function drawBallAndTrail(ctx, cx, cy, rx, ry, sim, ballState, accentColor, secondaryColor) {
    if (sim.trailPoints.length > 1) {
      for (let i = 1; i < sim.trailPoints.length; i++) {
        const p0 = sim.trailPoints[i - 1];
        const p1 = sim.trailPoints[i];
        const alpha = (i / sim.trailPoints.length) * 0.78;
        const x0 = cx + p0.nx * rx;
        const y0 = cy + p0.ny * ry - p0.z * 0.65;
        const x1 = cx + p1.nx * rx;
        const y1 = cy + p1.ny * ry - p1.z * 0.65;

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.strokeStyle =
          p1.phase === "shot" ? (sim.outcome.batRuns === 6 || sim.outcome.runs === 6 ? "#c084fc" : accentColor) : secondaryColor;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1.2 + (i / sim.trailPoints.length) * 3.0;
        ctx.lineCap = "round";
        ctx.stroke();
      }
      ctx.globalAlpha = 1.0;
    }

    const shadowX = cx + ballState.nx * rx;
    const shadowY = cy + ballState.ny * ry;
    const shadowScale = NLC.clamp(1 - ballState.z / 85, 0.28, 1);
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${0.48 * shadowScale})`;
    ctx.beginPath();
    ctx.ellipse(shadowX, shadowY + 2, 4.2 * shadowScale, 2.4 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const bx = shadowX;
    const by = shadowY - ballState.z * 0.65;
    const ballRadius = 4.2 + NLC.clamp(ballState.z * 0.035, 0, 2.4);

    ctx.save();
    const bColor = (sim.outcome.batRuns === 6 || sim.outcome.runs === 6) && ballState.phase === "shot" ? "#e879f9" : accentColor;
    ctx.fillStyle = bColor;
    ctx.shadowColor = bColor;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(bx, by, ballRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(bx - ballRadius * 0.3, by - ballRadius * 0.3, ballRadius * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawParticlesAndCallouts(ctx) {
    const { state } = NLC;
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= p.decay;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
      const ft = state.floatingTexts[i];
      ft.y -= 0.55;
      ft.life -= 0.018;
      if (ft.life <= 0) {
        state.floatingTexts.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = NLC.clamp(ft.life * 1.2, 0, 1);
      ctx.font = "900 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = ft.color;
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = 6;
      ctx.fillText(ft.text, ft.x, ft.y);
      if (ft.subtext) {
        ctx.font = "700 8.5px Inter, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(ft.subtext, ft.x, ft.y + 11);
      }
      ctx.restore();
    }
  }

  NLC.drawWagonWheel = function (canvas, inn) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const r = Math.min(w, h) * 0.43;

    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#0d4a3e";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.54, 0, Math.PI * 2);
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#d4b07b";
    ctx.fillRect(cx - 5, cy - r * 0.34, 10, r * 0.68);

    const strikerY = cy + r * 0.24;
    if (inn && inn.wagonWheel) {
      inn.wagonWheel.forEach((shot) => {
        const tx = cx + NLC.clamp(shot.endNx, -1, 1) * r * 0.92;
        const ty = cy + NLC.clamp(shot.endNy, -1, 1) * r * 0.92;
        ctx.beginPath();
        ctx.moveTo(cx, strikerY);
        ctx.lineTo(tx, ty);
        ctx.lineWidth = shot.runs >= 4 ? 2.6 : 1.6;
        ctx.strokeStyle =
          shot.runs === 6
            ? "#c084fc"
            : shot.runs === 4
            ? "#a3e635"
            : shot.runs >= 2
            ? "#38bdf8"
            : "#facc15";
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(tx, ty, 3, 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
      });
    }
  };

  /**
   * Draws Manhattan Over-by-Over Bar Chart or Cumulative Worm Comparison Chart
   */
  NLC.drawAnalyticsChart = function (canvas, mode = "manhattan") {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const inn0 = NLC.state.innings[0];
    const inn1 = NLC.state.innings[1];
    const padL = 28;
    const padR = 12;
    const padT = 16;
    const padB = 22;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // Grid lines
    ctx.strokeStyle = "rgba(148,163,184,0.2)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = padT + (plotH * i) / 3;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
    }

    if (mode === "worm") {
      const maxBalls = Math.max(6, NLC.state.matchOversLimit * 6);
      const maxScore = Math.max(12, inn0?.score || 0, inn1?.score || 0);
      [
        { inn: inn0, color: "#a3e635" },
        { inn: inn1, color: "#f97316" }
      ].forEach(({ inn, color }) => {
        if (!inn || !inn.wormHistory || inn.wormHistory.length < 1) return;
        ctx.beginPath();
        inn.wormHistory.forEach((pt, idx) => {
          const x = padL + (pt.ball / maxBalls) * plotW;
          const y = padT + plotH - (pt.score / maxScore) * plotH;
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.4;
        ctx.stroke();

        inn.wormHistory.forEach((pt) => {
          if (!pt.wicket) return;
          const x = padL + (pt.ball / maxBalls) * plotW;
          const y = padT + plotH - (pt.score / maxScore) * plotH;
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = "#f43f5e";
          ctx.fill();
        });
      });
    } else {
      // Manhattan Over-by-Over Bar Chart
      const oversCount = Math.max(
        1,
        Math.min(20, Math.max(inn0?.overHistory?.length || 1, inn1?.overHistory?.length || 1, NLC.state.matchOversLimit))
      );
      let maxOverRuns = 12;
      [inn0, inn1].forEach((inn) => {
        inn?.overHistory?.forEach((o) => {
          if (o.runs > maxOverRuns) maxOverRuns = o.runs;
        });
      });

      const slotW = plotW / oversCount;
      const barW = Math.max(4, Math.min(14, slotW * 0.34));
      for (let i = 0; i < oversCount; i++) {
        const xCenter = padL + (i + 0.5) * slotW;
        const r0 = inn0?.overHistory?.[i]?.runs ?? 0;
        const r1 = inn1?.overHistory?.[i]?.runs ?? 0;
        const h0 = (r0 / maxOverRuns) * plotH;
        const h1 = (r1 / maxOverRuns) * plotH;

        ctx.fillStyle = "#a3e635";
        ctx.fillRect(xCenter - barW - 1, padT + plotH - h0, barW, h0);
        ctx.fillStyle = "#f97316";
        ctx.fillRect(xCenter + 1, padT + plotH - h1, barW, h1);

        ctx.fillStyle = "rgba(148,163,184,0.85)";
        ctx.font = "700 8px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${i + 1}`, xCenter, h - 6);
      }
    }
  };
})(window);