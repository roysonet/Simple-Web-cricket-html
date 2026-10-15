(function (root) {
  const NLC = (root.NLC = root.NLC || {});
  const { SHOTS } = NLC;

  NLC.rayRadiusDistance = function (shotAngle, R = 1.0) {
    const y0 = 0.34;
    const dx = Math.sin(shotAngle);
    const dy = -Math.cos(shotAngle);
    const b = y0 * dy;
    const c = y0 * y0 - R * R;
    const disc = Math.max(0, b * b - c);
    return -b + Math.sqrt(disc);
  };

  /**
   * Computes exact preview coordinates for the Bowler's live pitch target reticle
   * and swing/spin deviation curve on the 22-yard strip.
   */
  NLC.computeBowlerPreviewTrajectory = function () {
    const { state, clamp, lerp, currentInnings, getStriker, getBowlerArchetype, getActivePitchInfo } = NLC;
    const inn = currentInnings();
    const striker = inn ? getStriker(inn) : { hand: "RHB" };
    const handSign = striker.hand === "LHB" ? -1 : 1;
    const arch = inn ? getBowlerArchetype(inn) : NLC.BOWLER_ARCHETYPES.pace;
    const dInfo = arch.deliveries.find((d) => d.id === state.selectedDelivery) || arch.deliveries[0];
    const pitchInfo = getActivePitchInfo();

    const releasePos = { nx: 0.026 * handSign, ny: -0.345 };
    const strikerCreaseNy = 0.34;
    const effectivePitchFrac = clamp(dInfo.pitchFrac + (state.bowlLengthOffset || 0), 0.32, 0.98);

    const targetLineNx = state.bowlAimLine * 0.075 * handSign;
    const isSpin = arch.id === "legspin" || arch.id === "offspin";
    const swingVal = dInfo.swing * pitchInfo.swingMult;
    const seamOrTurnVal = dInfo.seam * (isSpin ? pitchInfo.spinMult : pitchInfo.seamMult);

    const pitchNy = lerp(releasePos.ny, strikerCreaseNy, effectivePitchFrac);
    const pitchNx = lerp(releasePos.nx, targetLineNx, effectivePitchFrac) + swingVal * 0.45 * handSign;
    const arrivalNx = targetLineNx + (swingVal + seamOrTurnVal) * handSign;

    const offDist = arrivalNx * handSign;
    const isProjectedWide = offDist > 0.055 || offDist < -0.035;
    const isProjectedHighBouncer = effectivePitchFrac < 0.39 && dInfo.bounce * pitchInfo.bounceMult > 14.5;

    return {
      releasePos,
      pitchPos: { nx: pitchNx, ny: pitchNy },
      arrivalPos: { nx: arrivalNx, ny: strikerCreaseNy },
      effectivePitchFrac,
      isProjectedWide,
      isProjectedHighBouncer,
      dInfo,
      arch,
      handSign
    };
  };

  NLC.evaluateDeliveryOutcome = function (shotId, deliveryId, contactQuality, releaseQuality) {
    const {
      state,
      clamp,
      lerp,
      pick,
      currentInnings,
      getStriker,
      getCurrentBowler,
      getBowlerArchetype,
      getActivePitchInfo,
      resolveActiveFieldPreset,
      getTargetFielderPositions
    } = NLC;

    const inn = currentInnings();
    const striker = getStriker(inn);
    const bowler = getCurrentBowler(inn);
    const handSign = striker.hand === "LHB" ? -1 : 1;
    const arch = getBowlerArchetype(inn);
    const dInfo = arch.deliveries.find((d) => d.id === deliveryId) || arch.deliveries[0];
    const sInfo = SHOTS.find((s) => s.id === shotId) || SHOTS[1];
    const pitchInfo = getActivePitchInfo();
    const preset = resolveActiveFieldPreset();
    const fielders = getTargetFielderPositions(preset);

    // 1. Calculate Ball Speed (km/h) from Bowler Archetype + Effort Meter + Release Timing
    const effortFactor = clamp((state.bowlEffortPct - 50) / 50, 0, 1);
    const timingBonus =
      releaseQuality === "perfect"
        ? 3.2
        : releaseQuality === "good"
        ? 0.5
        : releaseQuality === "noball_overstep"
        ? 2.0
        : -4.0;
    const ballKmh = clamp(
      lerp(dInfo.speed[0], dInfo.speed[1], effortFactor) + timingBonus + (Math.random() - 0.5) * 1.6,
      72,
      159
    );

    // 2. Calculate Pitch Bounce Coordinates & Crease Arrival with Pitch Surface Physics
    const releaseErrorX =
      releaseQuality === "perfect"
        ? (Math.random() - 0.5) * 0.002
        : releaseQuality === "good"
        ? (Math.random() - 0.5) * 0.007
        : releaseQuality === "noball_overstep"
        ? (Math.random() - 0.5) * 0.014
        : (Math.random() - 0.5) * 0.032;

    const targetLineNx = state.bowlAimLine * 0.075 * handSign + releaseErrorX;
    const releasePos = { nx: 0.026 * handSign, ny: -0.345 };
    const strikerCreaseNy = 0.34;
    const lenError = releaseQuality === "miss" ? (Math.random() - 0.5) * 0.10 : 0;
    const effectivePitchFrac = clamp(dInfo.pitchFrac + (state.bowlLengthOffset || 0) + lenError, 0.32, 0.98);

    const isSpin = arch.id === "legspin" || arch.id === "offspin";
    const swingVal = dInfo.swing * pitchInfo.swingMult;
    const seamOrTurnVal = dInfo.seam * (isSpin ? pitchInfo.spinMult : pitchInfo.seamMult);

    const pitchNy = lerp(releasePos.ny, strikerCreaseNy, effectivePitchFrac);
    const pitchNx = lerp(releasePos.nx, targetLineNx, effectivePitchFrac) + swingVal * 0.45 * handSign;
    const arrivalNx = targetLineNx + (swingVal + seamOrTurnVal) * handSign;
    const arrivalZ =
      dInfo.bounce *
      pitchInfo.bounceMult *
      (0.9 + effortFactor * 0.2) *
      (1.0 - (effectivePitchFrac - dInfo.pitchFrac) * 0.65);

    const stumpProjectedNx = arrivalNx + seamOrTurnVal * 0.20 * handSign;
    const hittingStumps = Math.abs(stumpProjectedNx) <= 0.022 && arrivalZ >= 0.8 && arrivalZ <= 9.8;
    const pitchedInLineOrOff = pitchNx * handSign >= -0.020;
    const impactInLine = Math.abs(arrivalNx) <= 0.022;

    // 3. Check No-Ball (Red Overstep Zone on Meter, Over-Head Bouncer, or 2nd Bouncer in Over) & Wide Rules
    const isBouncer = dInfo.id.includes("bouncer") || effectivePitchFrac < 0.48;
    if (isBouncer) inn.bouncersThisOver += 1;
    const isOverHeadBouncer = arrivalZ > 16.2;

    const isOverstepMeter = releaseQuality === "noball_overstep";
    const randomOverstep = effortFactor > 0.92 && releaseQuality === "miss" && Math.random() < 0.22;
    const isNoBall = isOverstepMeter || randomOverstep || isOverHeadBouncer || (isBouncer && inn.bouncersThisOver > 1);

    // Wide check: outside off-side wide tramline (> 0.055) or down leg-side (< -0.035) when untouched or defended
    const offDist = arrivalNx * handSign;
    const isWideLine = offDist > 0.055 || offDist < -0.035;

    if (isWideLine && (contactQuality === "miss" || sInfo.id === "defend" || Math.abs(offDist) > 0.066) && !isNoBall) {
      state.speedMeters = { ballKmh: Number(ballKmh.toFixed(1)), batKmh: 0, exitKmh: 0 };
      return {
        outcome: {
          runs: 1,
          batRuns: 0,
          kind: "extra",
          extraType: "wide",
          display: "Wd",
          legal: false,
          freeHitNext: inn.freeHit,
          text:
            offDist < 0
              ? "WIDE BALL! Drifted down the leg side — umpire stretches both arms wide."
              : "WIDE BALL! Sprayed outside the off-stump white tramline."
        },
        traj: {
          releasePos,
          pitchPos: { nx: pitchNx, ny: pitchNy },
          arrivalPos: { nx: arrivalNx, ny: strikerCreaseNy, z: arrivalZ },
          ballKmh,
          hittingStumps: false,
          pitchedInLineOrOff,
          impactInLine
        }
      };
    }

    // 4. Biomechanical Shot-Length Synergy & Bat/Exit Speed Calculation
    const [minIdeal, maxIdeal] = sInfo.idealLength || [0.5, 0.9];
    const isLengthMatched = effectivePitchFrac >= minIdeal && effectivePitchFrac <= maxIdeal;
    const lengthFit = isLengthMatched ? 1.12 : 0.90;

    const timingMult =
      contactQuality === "perfect"
        ? 1.16
        : contactQuality === "good"
        ? 1.01
        : contactQuality === "early" || contactQuality === "late"
        ? 0.80
        : 0;

    const batKmh =
      contactQuality === "miss"
        ? Number((65 + Math.random() * 15).toFixed(1))
        : Number(
            clamp(
              lerp(68, 142, (state.batPowerPct / 100) * sInfo.powerMult) * lengthFit * pitchInfo.batPowerMult * timingMult,
              52,
              154
            ).toFixed(1)
          );

    // 5. Evaluate Missed Contact -> Clean Bowled, Stumped, LBW, or Byes/Dot/No-Ball
    if (contactQuality === "miss") {
      state.speedMeters = { ballKmh: Number(ballKmh.toFixed(1)), batKmh, exitKmh: 0 };

      if (!isNoBall && !inn.freeHit) {
        if ((preset.keeperUp || sInfo.foot === "advance") && (sInfo.foot === "advance" || (sInfo.id === "sweep" && Math.random() < 0.52))) {
          return {
            outcome: {
              runs: 0,
              batRuns: 0,
              kind: "wicket",
              dismissalType: "stumped",
              catcherRole: "Wicketkeeper",
              bowlerCredited: true,
              scorecardText: `st WK b ${bowler.name}`,
              display: "W",
              legal: true,
              text: `STUMPED! ${striker.name} is stranded out of the crease and beaten in flight — keeper whips the bails off in a flash!`
            },
            traj: {
              releasePos,
              pitchPos: { nx: pitchNx, ny: pitchNy },
              arrivalPos: { nx: arrivalNx, ny: strikerCreaseNy, z: arrivalZ },
              ballKmh,
              hittingStumps,
              pitchedInLineOrOff,
              impactInLine
            }
          };
        }

        if (hittingStumps && Math.random() < (dInfo.id.includes("yorker") ? 0.88 : 0.72)) {
          return {
            outcome: {
              runs: 0,
              batRuns: 0,
              kind: "wicket",
              dismissalType: "bowled",
              catcherRole: null,
              bowlerCredited: true,
              scorecardText: `b ${bowler.name}`,
              display: "W",
              legal: true,
              text: `CLEAN BOWLED! ${dInfo.label} (${ballKmh.toFixed(1)} km/h) beats ${striker.name} and sends the LED Zing bails flying!`
            },
            traj: {
              releasePos,
              pitchPos: { nx: pitchNx, ny: pitchNy },
              arrivalPos: { nx: arrivalNx, ny: strikerCreaseNy, z: arrivalZ },
              ballKmh,
              hittingStumps: true,
              pitchedInLineOrOff,
              impactInLine
            }
          };
        }

        if (hittingStumps && pitchedInLineOrOff && impactInLine && sInfo.foot !== "advance") {
          return {
            outcome: {
              runs: 0,
              batRuns: 0,
              kind: "wicket",
              dismissalType: "lbw",
              catcherRole: null,
              bowlerCredited: true,
              scorecardText: `lbw b ${bowler.name}`,
              display: "W",
              legal: true,
              text: `PLUMB LBW! Hawk-Eye 3-Reds: pitched in line, impact middle stump, crashing into the timber!`
            },
            traj: {
              releasePos,
              pitchPos: { nx: pitchNx, ny: pitchNy },
              arrivalPos: { nx: arrivalNx, ny: strikerCreaseNy, z: arrivalZ },
              ballKmh,
              hittingStumps: true,
              pitchedInLineOrOff: true,
              impactInLine: true
            }
          };
        }
      }

      const nbReason = isOverstepMeter
        ? "NO-BALL! Bowler overstepped into the Red Zone — FREE HIT next ball!"
        : isOverHeadBouncer
        ? "NO-BALL! Bouncer flies dangerously over head height — FREE HIT next ball!"
        : "NO-BALL! Second bouncer of the over — FREE HIT on the next delivery!";

      return {
        outcome: {
          runs: isNoBall ? 1 : 0,
          batRuns: 0,
          kind: isNoBall ? "extra" : "dot",
          extraType: isNoBall ? "noball" : null,
          freeHitNext: isNoBall || inn.freeHit && isNoBall,
          display: isNoBall ? "Nb" : "0",
          legal: !isNoBall,
          text: isNoBall ? nbReason : `Play and a miss! ${dInfo.label} zips past the edge at ${ballKmh.toFixed(1)} km/h.`
        },
        traj: {
          releasePos,
          pitchPos: { nx: pitchNx, ny: pitchNy },
          arrivalPos: { nx: arrivalNx, ny: strikerCreaseNy, z: arrivalZ },
          ballKmh,
          hittingStumps,
          pitchedInLineOrOff,
          impactInLine
        }
      };
    }

    // 6. Ball Contact Made: Calculate 360° Shot Angle Deviation & Exit Velocity
    const timingAngleShift = contactQuality === "early" ? -0.22 * handSign : contactQuality === "late" ? 0.25 * handSign : 0;
    const actualShotAngle = state.shotAngle + timingAngleShift;

    const exitKmh = Number(
      clamp((ballKmh * 0.34 + batKmh * 0.82) * pitchInfo.outfieldSpeed, 48, 158).toFixed(1)
    );
    state.speedMeters = { ballKmh: Number(ballKmh.toFixed(1)), batKmh, exitKmh };

    // 7. Logical Wicket Checks on Contact
    if (!isNoBall && !inn.freeHit) {
      if (
        hittingStumps &&
        (contactQuality === "late" || contactQuality === "early") &&
        !isLengthMatched &&
        sInfo.id !== "defend" &&
        Math.random() < 0.28
      ) {
        return {
          outcome: {
            runs: 0,
            batRuns: 0,
            kind: "wicket",
            dismissalType: "bowled",
            catcherRole: null,
            bowlerCredited: true,
            scorecardText: `b ${bowler.name}`,
            display: "W",
            legal: true,
            text: `BOWLED HIM! Mistimed ${sInfo.label.toLowerCase()} against the ${dInfo.label.toLowerCase()} — inside edge cannons into the stumps!`
          },
          traj: {
            releasePos,
            pitchPos: { nx: pitchNx, ny: pitchNy },
            arrivalPos: { nx: arrivalNx, ny: strikerCreaseNy, z: arrivalZ },
            ballKmh,
            exitKmh: exitKmh * 0.5,
            shotAngle: actualShotAngle,
            hittingStumps: true,
            pitchedInLineOrOff,
            impactInLine
          }
        };
      }

      const lineMismatch = Math.abs(Math.sin(actualShotAngle) * 0.03 - arrivalNx);
      const edgeChance =
        contactQuality === "late" || contactQuality === "early"
          ? (0.14 + sInfo.risk + lineMismatch * 1.1) * (isLengthMatched ? 0.82 : 1.25)
          : sInfo.risk * 0.18;

      if (Math.random() < edgeChance) {
        if (contactQuality === "late" && Math.abs(actualShotAngle) < 1.8) {
          const slipFielder = fielders.find((f) => f.ring === "slip");
          const catcher = slipFielder && Math.random() < 0.58 ? slipFielder.role : "Wicketkeeper";
          return {
            outcome: {
              runs: 0,
              batRuns: 0,
              kind: "wicket",
              dismissalType: "caught_behind",
              catcherRole: catcher,
              bowlerCredited: true,
              scorecardText: catcher === "Wicketkeeper" ? `c WK b ${bowler.name}` : `c ${catcher} b ${bowler.name}`,
              display: "W",
              legal: true,
              text: `EDGED AND TAKEN! Late on the ${sInfo.label.toLowerCase()} — nicked straight into the gloves of ${catcher}!`
            },
            traj: {
              releasePos,
              pitchPos: { nx: pitchNx, ny: pitchNy },
              arrivalPos: { nx: arrivalNx, ny: strikerCreaseNy, z: arrivalZ },
              ballKmh,
              exitKmh,
              shotAngle: 2.55 * handSign,
              hittingStumps,
              pitchedInLineOrOff,
              impactInLine
            }
          };
        }

        if (sInfo.elevation !== "ground" || contactQuality === "early" || !isLengthMatched) {
          const strikerY = 0.34;
          const sectorFielders = fielders.filter((f) => {
            const fAngle = Math.atan2(f.targetNx, -(f.targetNy - strikerY));
            const diff = Math.abs(Math.atan2(Math.sin(fAngle - actualShotAngle), Math.cos(fAngle - actualShotAngle)));
            return diff < 0.55 && f.ring !== "slip";
          });
          const catcher = sectorFielders.length ? pick(sectorFielders) : pick(fielders);
          return {
            outcome: {
              runs: 0,
              batRuns: 0,
              kind: "wicket",
              dismissalType: "caught_field",
              catcherRole: catcher.role,
              bowlerCredited: true,
              scorecardText: `c ${catcher.role} b ${bowler.name}`,
              display: "W",
              legal: true,
              text: `CAUGHT! Mistimed ${sInfo.label.toLowerCase()} spoons up toward ${catcher.role}, who pouches a sharp catch!`
            },
            traj: {
              releasePos,
              pitchPos: { nx: pitchNx, ny: pitchNy },
              arrivalPos: { nx: arrivalNx, ny: strikerCreaseNy, z: arrivalZ },
              ballKmh,
              exitKmh,
              shotAngle: actualShotAngle,
              hittingStumps,
              pitchedInLineOrOff,
              impactInLine
            }
          };
        }
      }
    }

    // 8. Algorithmic Six, Four & Field Interception Engine
    const strikerY = 0.34;
    let minAngleDiff = 99;
    let nearestRingFielder = null;
    let nearestDeepFielder = null;

    fielders.forEach((f) => {
      const fAngle = Math.atan2(f.targetNx, -(f.targetNy - strikerY));
      const diff = Math.abs(Math.atan2(Math.sin(fAngle - actualShotAngle), Math.cos(fAngle - actualShotAngle)));
      const distFromCenter = Math.hypot(f.targetNx, f.targetNy);
      if (distFromCenter <= 0.60 && diff < minAngleDiff) {
        minAngleDiff = diff;
        nearestRingFielder = { f, diff };
      }
      if (distFromCenter > 0.60 && (!nearestDeepFielder || diff < nearestDeepFielder.diff)) {
        nearestDeepFielder = { f, diff };
      }
    });

    const isAerialLaunch =
      sInfo.elevation === "aerial" ||
      (sInfo.sixCapable &&
        ((contactQuality === "perfect" && state.batPowerPct >= 72) ||
          (contactQuality === "perfect" && isLengthMatched && state.batPowerPct >= 64) ||
          (contactQuality === "good" && isLengthMatched && state.batPowerPct >= 88)));

    const sixPowerScore =
      exitKmh *
      (contactQuality === "perfect" ? 1.12 : contactQuality === "good" ? 0.96 : 0.75) *
      (isLengthMatched ? 1.08 : 0.94);

    let runs = 0;
    if (sInfo.id === "defend") {
      runs = minAngleDiff > 0.34 && contactQuality === "perfect" ? 1 : 0;
    } else if (
      isAerialLaunch &&
      sInfo.sixCapable &&
      (sixPowerScore >= 108 ||
        (contactQuality === "perfect" && (sInfo.id === "loft" || sInfo.id === "charge") && state.batPowerPct >= 58) ||
        (contactQuality === "perfect" && isLengthMatched && state.batPowerPct >= 74))
    ) {
      if (
        !isNoBall &&
        !inn.freeHit &&
        sixPowerScore < 110 &&
        nearestDeepFielder &&
        nearestDeepFielder.diff < 0.12 &&
        contactQuality !== "perfect"
      ) {
        return {
          outcome: {
            runs: 0,
            batRuns: 0,
            kind: "wicket",
            dismissalType: "caught_field",
            catcherRole: nearestDeepFielder.f.role,
            bowlerCredited: true,
            scorecardText: `c ${nearestDeepFielder.f.role} b ${bowler.name}`,
            display: "W",
            legal: true,
            text: `CAUGHT ON THE ROPE! ${nearestDeepFielder.f.role} judges the high ${sInfo.label.toLowerCase()} right on the boundary edge!`
          },
          traj: {
            releasePos,
            pitchPos: { nx: pitchNx, ny: pitchNy },
            arrivalPos: { nx: arrivalNx, ny: strikerCreaseNy, z: arrivalZ },
            ballKmh,
            exitKmh,
            shotAngle: actualShotAngle,
            hittingStumps,
            pitchedInLineOrOff,
            impactInLine
          }
        };
      }
      runs = 6;
    } else {
      if (!isAerialLaunch && nearestRingFielder && nearestRingFielder.diff < 0.15) {
        runs = exitKmh > 112 ? 1 : 0;
      } else if (nearestDeepFielder && nearestDeepFielder.diff < 0.21) {
        runs = exitKmh > 106 ? 2 : 1;
      } else if (exitKmh >= 92 && (contactQuality === "perfect" || contactQuality === "good")) {
        runs = 4;
      } else {
        runs = exitKmh >= 82 ? 2 : 1;
      }
    }

    const distanceMeters =
      runs === 6
        ? Math.round(lerp(76, 116, clamp((exitKmh - 92) / 56, 0, 1)))
        : runs === 4
        ? Math.round(lerp(64, 75, Math.random()))
        : runs >= 1
        ? Math.round(lerp(18, 54, runs / 3))
        : Math.round(lerp(6, 22, Math.random()));

    const totalRuns = runs + (isNoBall ? 1 : 0);
    return {
      outcome: {
        runs: totalRuns,
        batRuns: runs,
        distanceMeters,
        isAerialLaunch,
        kind: isNoBall && runs < 4 ? "extra" : runs >= 4 ? "boundary" : runs === 0 ? "dot" : "runs",
        extraType: isNoBall ? "noball" : null,
        freeHitNext: isNoBall,
        display: isNoBall ? (runs > 0 ? `Nb+${runs}` : "Nb") : String(runs),
        legal: !isNoBall,
        text: buildRunCommentary(runs, sInfo.label, exitKmh, distanceMeters, isNoBall, striker.name)
      },
      traj: {
        releasePos,
        pitchPos: { nx: pitchNx, ny: pitchNy },
        arrivalPos: { nx: arrivalNx, ny: strikerCreaseNy, z: arrivalZ },
        ballKmh,
        exitKmh,
        distanceMeters,
        isAerialLaunch,
        shotAngle: actualShotAngle,
        hittingStumps,
        pitchedInLineOrOff,
        impactInLine
      }
    };
  };

  function buildRunCommentary(runs, shotName, exitKmh, distM, isNoBall, batterName) {
    const prefix = isNoBall ? "NO-BALL + " : "";
    if (runs === 6) return `${prefix}MONSTER SIX (${distM}m)! ${batterName} middled the ${shotName.toLowerCase()} at ${exitKmh} km/h high into the night sky!`;
    if (runs === 4) return `${prefix}CRACKING FOUR! ${batterName} threads the ${shotName.toLowerCase()} (${exitKmh} km/h) through the gap to the fence!`;
    if (runs >= 2) return `${prefix}Driven into the deep pocket (${distM}m) — batters push hard for ${runs} runs.`;
    if (runs === 1) return `${prefix}Guided into the gap with soft hands for a quick single.`;
    return `${prefix}Solid contact (${exitKmh} km/h), but cut off sharply inside the 30-yard circle.`;
  }
})(window);