(function (root) {
  const NLC = (root.NLC = root.NLC || {});
  const { SHOTS } = NLC;

  NLC.buildPlaySimulation = function (outcome, meta, traj) {
    const {
      state,
      clamp,
      currentInnings,
      getStriker,
      getBowlerArchetype,
      resolveActiveFieldPreset,
      getTargetFielderPositions,
      rayRadiusDistance
    } = NLC;

    const inn = currentInnings();
    const striker = getStriker(inn);
    const handSign = striker.hand === "LHB" ? -1 : 1;
    const arch = getBowlerArchetype(inn);
    const sInfo = SHOTS.find((s) => s.id === meta.shot) || SHOTS[1];
    const preset = resolveActiveFieldPreset();
    const fielders = getTargetFielderPositions(preset);

    const bowlerStart = { nx: 0.028 * handSign, ny: -0.62 };
    const releasePos = traj.releasePos;
    const strikerCrease = { nx: 0.0, ny: 0.34 };
    const pitchPos = traj.pitchPos;
    const arrivalPos = traj.arrivalPos;
    const shotAngle = traj.shotAngle ?? state.shotAngle;

    let endBallPos = { nx: arrivalPos.nx, ny: arrivalPos.ny + 0.15 };
    let maxShotZ = 4;
    let bounces = 2;
    let chaserIndices = [];
    let catcherIndex = -1;
    let throwTarget = null;
    let runsToRun = outcome.batRuns ?? (outcome.kind === "runs" ? outcome.runs : 0);

    const dirX = Math.sin(shotAngle);
    const dirY = -Math.cos(shotAngle);

    if (outcome.extraType === "wide") {
      endBallPos = { nx: arrivalPos.nx * 1.18, ny: preset.keeperUp ? 0.44 : 0.53 };
      bounces = 1;
    } else if (outcome.kind === "wicket") {
      if (outcome.dismissalType === "bowled" || outcome.dismissalType === "lbw") {
        endBallPos = { nx: arrivalPos.nx * 0.4, ny: 0.43 };
        bounces = 1;
      } else if (outcome.dismissalType === "stumped") {
        endBallPos = { nx: 0.025 * handSign, ny: 0.36 };
        bounces = 0;
      } else if (outcome.dismissalType === "caught_behind") {
        const slipIdx = fielders.findIndex((f) => f.role === outcome.catcherRole);
        if (slipIdx >= 0) {
          catcherIndex = slipIdx;
          endBallPos = { nx: fielders[slipIdx].targetNx, ny: fielders[slipIdx].targetNy };
        } else {
          endBallPos = { nx: 0.055 * handSign, ny: preset.keeperUp ? 0.43 : 0.53 };
        }
        maxShotZ = 10;
        bounces = 0;
      } else {
        let idx = fielders.findIndex((f) => f.role === outcome.catcherRole);
        if (idx < 0) idx = 3;
        catcherIndex = idx;
        endBallPos = { nx: fielders[idx].targetNx * 0.92, ny: fielders[idx].targetNy * 0.92 };
        maxShotZ = 48;
        bounces = 0;
        chaserIndices = [idx];
      }
    } else if (outcome.batRuns === 6 || outcome.runs === 6) {
      const tRope = rayRadiusDistance(shotAngle, 1.10);
      endBallPos = {
        nx: dirX * tRope,
        ny: strikerCrease.ny + dirY * tRope
      };
      maxShotZ = 72;
      bounces = 0;
      chaserIndices = findNearestFielders(fielders, endBallPos, 2);
    } else if (outcome.batRuns === 4 || outcome.runs === 4) {
      const tRope = rayRadiusDistance(shotAngle, 1.02);
      endBallPos = {
        nx: dirX * tRope,
        ny: strikerCrease.ny + dirY * tRope
      };
      maxShotZ = traj.isAerialLaunch ? 24 : 5;
      bounces = traj.isAerialLaunch ? 1 : 3;
      chaserIndices = findNearestFielders(fielders, endBallPos, 2);
    } else if (runsToRun >= 1) {
      const targetR = runsToRun >= 2 ? 0.78 : 0.52;
      const tDist = rayRadiusDistance(shotAngle, targetR);
      endBallPos = {
        nx: clamp(dirX * tDist, -0.88, 0.88),
        ny: clamp(strikerCrease.ny + dirY * tDist, -0.86, 0.86)
      };
      maxShotZ = traj.isAerialLaunch ? 16 : 4;
      bounces = 2;
      chaserIndices = findNearestFielders(fielders, endBallPos, 2);
      throwTarget = runsToRun % 2 === 1 ? { nx: 0, ny: -0.34, end: "bowler" } : { nx: 0, ny: 0.34, end: "keeper" };
    } else {
      if (meta.contactQuality === "miss") {
        endBallPos = { nx: arrivalPos.nx * 1.05, ny: preset.keeperUp ? 0.43 : 0.53 };
        bounces = 1;
      } else {
        const tRing = rayRadiusDistance(shotAngle, 0.44);
        const probePos = { nx: dirX * tRing, ny: strikerCrease.ny + dirY * tRing };
        chaserIndices = findNearestFielders(fielders, probePos, 1);
        const stopper = fielders[chaserIndices[0]] || fielders[2];
        endBallPos = { nx: stopper.targetNx * 0.88, ny: stopper.targetNy * 0.88 };
        bounces = 1;
        throwTarget = { nx: 0, ny: 0.34, end: "keeper" };
      }
    }

    state.telemetry = {
      speed: `${traj.ballKmh.toFixed(1)} KM/H`,
      delivery: `${arch.short}`,
      line: state.bowlAimLine < -0.22 ? "LEG CORRIDOR" : state.bowlAimLine > 0.22 ? "OFF CORRIDOR" : "STUMP LINE",
      shot: `${sInfo.label.toUpperCase()}`,
      impact: traj.exitKmh ? `EXIT ${traj.exitKmh} KM/H` : preset.name,
      distance: traj.distanceMeters ? `${traj.distanceMeters} M` : "-- M"
    };

    state.lastHawkEye = {
      releasePos,
      pitchPos,
      arrivalPos,
      endBallPos,
      hittingStumps: Boolean(traj.hittingStumps),
      pitchedInLineOrOff: Boolean(traj.pitchedInLineOrOff),
      impactInLine: Boolean(traj.impactInLine),
      ballKmh: traj.ballKmh,
      exitKmh: traj.exitKmh || 0,
      isWicket: outcome.kind === "wicket",
      dismissalType: outcome.dismissalType || null
    };

    if (outcome.batRuns > 0 && inn) {
      inn.wagonWheel.push({
        angle: shotAngle,
        runs: outcome.batRuns,
        endNx: endBallPos.nx,
        endNy: endBallPos.ny,
        batter: striker.name
      });
    }

    return {
      outcome,
      meta,
      traj,
      preset,
      fielders,
      handSign,
      bowlerStart,
      releasePos,
      strikerCrease,
      pitchPos,
      swingCtrlNx: (releasePos.nx + pitchPos.nx) * 0.5,
      arrivalPos,
      endBallPos,
      maxShotZ,
      bounces,
      chaserIndices,
      catcherIndex,
      throwTarget,
      runsToRun,
      pushedExtraRun: false,
      divedCrease: false,
      shotFoot: sInfo.foot,
      shotAngle,
      isWide: outcome.extraType === "wide",
      isNoBall: outcome.extraType === "noball",
      trailPoints: [],
      particlesFired: false,
      soundTriggered: { release: false, bounce: false, impact: false, finish: false }
    };
  };

  function findNearestFielders(fielders, targetPos, count = 2) {
    return fielders
      .map((f, idx) => ({ idx, dist: Math.hypot(f.targetNx - targetPos.nx, f.targetNy - targetPos.ny) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, count)
      .map((item) => item.idx);
  }
})(window);