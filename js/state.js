(function (root) {
  const NLC = (root.NLC = root.NLC || {});
  const { FRANCHISE_TEAMS, BOWLER_ARCHETYPES, FIELD_PRESETS, PITCH_TYPES } = NLC;

  NLC.clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  NLC.lerp = (a, b, t) => a + (b - a) * t;
  NLC.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  NLC.state = {
    screen: "setup",
    theme: "night",
    settings: {
      mode: "ai",          // "ai" (1v1 Solo), "tournament" (Cup Edition vs AI), "local" (2P Pass & Play)
      overs: 3,            // 1 to 50 overs
      difficulty: "pro",   // "rookie", "pro", "elite"
      pitchChoice: "random",
      activePitch: "flat",
      teams: ["Harbor Hawks", "Metro Foxes"],
      teamIndices: [0, 1]
    },
    playerTeam: 0,
    tossCall: "heads",
    tossResultFace: "heads",
    tossWinner: 0,
    battingFirst: 0,
    currentInnings: 0,
    innings: [null, null],
    target: null,
    isSuperOver: false,
    superOverRound: 0,
    matchOversLimit: 3,
    matchWicketsLimit: 10,

    // Active Tactic & Selection State
    selectedShot: "drive",
    shotAngle: 0.45,
    batPowerPct: 82,
    selectedDelivery: null,
    bowlAimLine: 0.0,         // -1.0 (Wide Leg) to +1.0 (Wide Off)
    bowlLengthOffset: 0.0,    // -0.18 (Short) to +0.18 (Full)
    bowlEffortPct: 85,
    bowlerReleaseQuality: "good",

    fieldPresetMode: "auto",
    showFieldLabels: true,
    dynamicCamera: true,
    showHawkEye: true,
    fxOn: true,
    soundOn: true,
    liveFielders: [],
    liveKeeper: { nx: 0.035, ny: 0.53 },
    camera: { zoom: 1, focusX: 0, focusY: 0 },
    lastHawkEye: null,
    particles: [],
    floatingTexts: [],

    speedMeters: { ballKmh: 0, batKmh: 0, exitKmh: 0 },
    telemetry: {
      speed: "READY",
      delivery: "AWAITING BOWLER",
      line: "MIDDLE STUMP",
      shot: "360° AIM READY",
      impact: "30-YD RING",
      distance: "-- M"
    },

    // Tournament State (Solo Career vs AI)
    tournament: {
      active: false,
      teamIds: [0, 1, 2, 3],
      userTeamId: 0,
      fixtures: [],
      currentFixtureIdx: 0,
      standings: {},
      playerStats: {},
      champion: null
    },

    lastMatchAwards: null,
    localStage: "delivery",
    timing: null,
    actionLocked: false,
    timers: [],
    animation: { sim: null, started: 0, duration: 0 },
    commentary: [],
    matchHistory: []
  };

  try {
    const saved = localStorage.getItem("nlc_match_history_v3");
    if (saved) NLC.state.matchHistory = JSON.parse(saved);
  } catch (_) {}

  NLC.saveMatchHistory = function (summaryText) {
    NLC.state.matchHistory.unshift({ text: summaryText, ts: Date.now() });
    NLC.state.matchHistory = NLC.state.matchHistory.slice(0, 12);
    try {
      localStorage.setItem("nlc_match_history_v3", JSON.stringify(NLC.state.matchHistory));
    } catch (_) {}
  };

  NLC.getActivePitchInfo = function () {
    return PITCH_TYPES[NLC.state.settings.activePitch] || PITCH_TYPES.flat;
  };

  NLC.resolvePitchForMatch = function () {
    const choice = NLC.state.settings.pitchChoice;
    const keys = Object.keys(PITCH_TYPES);
    NLC.state.settings.activePitch = choice === "random" || !PITCH_TYPES[choice] ? NLC.pick(keys) : choice;
    return NLC.getActivePitchInfo();
  };

  NLC.getRosterForMatchTeam = function (matchTeamSlot) {
    const fIdx = NLC.state.settings.teamIndices?.[matchTeamSlot] ?? matchTeamSlot;
    return (FRANCHISE_TEAMS[fIdx] || FRANCHISE_TEAMS[matchTeamSlot % FRANCHISE_TEAMS.length]).roster;
  };

  NLC.createInnings = function (battingTeamIdx, bowlingTeamIdx) {
    const batSource = NLC.getRosterForMatchTeam(battingTeamIdx);
    const bowlSource = NLC.getRosterForMatchTeam(bowlingTeamIdx);

    const batRoster = batSource.map((p, idx) => ({
      ...p,
      id: `bat_${battingTeamIdx}_${idx}`,
      teamSlot: battingTeamIdx,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      out: false,
      dismissalText: "not out"
    }));
    const bowlRoster = bowlSource
      .filter((p) => p.bowlType)
      .map((p, idx) => ({
        ...p,
        id: `bowl_${bowlingTeamIdx}_${idx}`,
        teamSlot: bowlingTeamIdx,
        oversBowled: 0,
        ballsBowled: 0,
        runsConceded: 0,
        wickets: 0
      }));

    return {
      battingTeamIdx,
      bowlingTeamIdx,
      score: 0,
      wickets: 0,
      extras: 0,
      legalBalls: 0,
      totalBalls: 0,
      currentOver: [],
      overHistory: [],
      wormHistory: [{ ball: 0, score: 0, wicket: false }],
      wagonWheel: [],
      partnership: 0,
      partnershipBalls: 0,
      freeHit: false,
      bouncersThisOver: 0,
      batRoster,
      strikerIdx: 0,
      nonStrikerIdx: 1,
      nextBatterIdx: 2,
      bowlRoster,
      currentBowlerIdx: 0,
      lastBowlerIdx: -1,
      needsBowlerSelection: true
    };
  };

  NLC.currentInnings = function () {
    return NLC.state.innings[NLC.state.currentInnings];
  };

  NLC.battingTeam = function () {
    const inn = NLC.currentInnings();
    if (inn) return inn.battingTeamIdx;
    return NLC.state.currentInnings === 0 ? NLC.state.battingFirst : 1 - NLC.state.battingFirst;
  };

  NLC.bowlingTeam = function () {
    return 1 - NLC.battingTeam();
  };

  NLC.isHumanBattingTurn = function () {
    const { state } = NLC;
    if (state.settings.mode === "local") {
      return state.localStage === "shot";
    }
    return NLC.battingTeam() === state.playerTeam;
  };

  NLC.getTeamInnings = function (teamIdx) {
    return (
      NLC.state.innings.find((inn) => inn && inn.battingTeamIdx === teamIdx) || {
        score: 0,
        wickets: 0,
        legalBalls: 0,
        overHistory: [],
        wormHistory: []
      }
    );
  };

  NLC.getStriker = function (inn = NLC.currentInnings()) {
    if (!inn) return FRANCHISE_TEAMS[0].roster[0];
    return inn.batRoster[NLC.clamp(inn.strikerIdx, 0, inn.batRoster.length - 1)];
  };

  NLC.getNonStriker = function (inn = NLC.currentInnings()) {
    if (!inn) return FRANCHISE_TEAMS[0].roster[1];
    return inn.batRoster[NLC.clamp(inn.nonStrikerIdx, 0, inn.batRoster.length - 1)];
  };

  NLC.getCurrentBowler = function (inn = NLC.currentInnings()) {
    if (!inn) return FRANCHISE_TEAMS[1].roster[7];
    return inn.bowlRoster[inn.currentBowlerIdx] || inn.bowlRoster[0];
  };

  NLC.getBowlerArchetype = function (inn = NLC.currentInnings()) {
    const bowler = NLC.getCurrentBowler(inn);
    return BOWLER_ARCHETYPES[bowler?.bowlType || "pace"];
  };

  NLC.resolveActiveFieldPreset = function () {
    const inn = NLC.currentInnings();
    if (!inn) return { ...FIELD_PRESETS.powerplay, keeperUp: false };
    const arch = NLC.getBowlerArchetype(inn);
    if (NLC.state.fieldPresetMode !== "auto" && FIELD_PRESETS[NLC.state.fieldPresetMode]) {
      return { ...FIELD_PRESETS[NLC.state.fieldPresetMode], keeperUp: arch.keeperUp };
    }
    const overIndex = Math.floor(inn.legalBalls / 6);
    const remBalls = Math.max(0, NLC.state.matchOversLimit * 6 - inn.legalBalls);
    if (arch.id === "legspin" || arch.id === "offspin") {
      return { ...FIELD_PRESETS.spin, keeperUp: true };
    }
    if (remBalls <= 6 && NLC.state.matchOversLimit >= 2) {
      return { ...FIELD_PRESETS.death, keeperUp: false };
    }
    if (overIndex < Math.max(1, Math.floor(NLC.state.matchOversLimit * 0.3))) {
      return { ...(inn.wickets >= 2 ? FIELD_PRESETS.attacking : FIELD_PRESETS.powerplay), keeperUp: false };
    }
    return { ...FIELD_PRESETS.balanced, keeperUp: false };
  };

  NLC.getTargetFielderPositions = function (preset = NLC.resolveActiveFieldPreset()) {
    const inn = NLC.currentInnings();
    const striker = inn ? NLC.getStriker(inn) : { hand: "RHB" };
    const handSign = striker.hand === "LHB" ? -1 : 1;

    return preset.fielders.map((f) => ({
      ...f,
      targetNx: NLC.clamp(f.nx * handSign, -0.94, 0.94),
      targetNy: NLC.clamp(f.ny, -0.92, 0.92)
    }));
  };

  /**
   * Computes Man of the Match, Best Batter, and Best Bowler at match end
   */
  NLC.computeMatchAwards = function () {
    const allBatters = [];
    const allBowlers = [];
    NLC.state.innings.forEach((inn) => {
      if (!inn) return;
      const tName = NLC.state.settings.teams[inn.battingTeamIdx];
      const bTeamName = NLC.state.settings.teams[inn.bowlingTeamIdx];
      inn.batRoster.forEach((b) => {
        if (b.balls > 0 || b.runs > 0 || b.out) {
          allBatters.push({ ...b, teamName: tName });
        }
      });
      inn.bowlRoster.forEach((bw) => {
        if (bw.ballsBowled > 0) {
          allBowlers.push({ ...bw, teamName: bTeamName });
        }
      });
    });

    allBatters.sort((a, b) => b.runs - a.runs || a.balls - b.balls);
    allBowlers.sort((a, b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded);

    const bestBatter = allBatters[0] || { name: "R. Sharma", teamName: NLC.state.settings.teams[0], runs: 0, balls: 0, fours: 0, sixes: 0 };
    const bestBowler = allBowlers[0] || { name: "M. Starc", teamName: NLC.state.settings.teams[1], wickets: 0, runsConceded: 0, ballsBowled: 0 };

    // Combine impact points by player name
    const impactMap = {};
    allBatters.forEach((b) => {
      const sr = b.balls > 0 ? (b.runs / b.balls) * 100 : 0;
      const pts = b.runs * 1.4 + b.fours * 2 + b.sixes * 4 + (sr >= 150 && b.runs >= 10 ? 10 : 0);
      impactMap[b.name] = impactMap[b.name] || { name: b.name, teamName: b.teamName, pts: 0, summary: [] };
      impactMap[b.name].pts += pts;
      if (b.runs > 0 || b.balls > 0) impactMap[b.name].summary.push(`${b.runs}(${b.balls})`);
    });
    allBowlers.forEach((bw) => {
      const econ = bw.ballsBowled > 0 ? (bw.runsConceded / bw.ballsBowled) * 6 : 9;
      const pts = bw.wickets * 24 + (econ <= 6.5 && bw.ballsBowled >= 6 ? 12 : 0) - bw.runsConceded * 0.4;
      impactMap[bw.name] = impactMap[bw.name] || { name: bw.name, teamName: bw.teamName, pts: 0, summary: [] };
      impactMap[bw.name].pts += pts;
      impactMap[bw.name].summary.push(`${bw.wickets}/${bw.runsConceded}`);
    });

    const motmList = Object.values(impactMap).sort((a, b) => b.pts - a.pts);
    const motm = motmList[0] || { name: bestBatter.name, teamName: bestBatter.teamName, pts: 25, summary: ["Match Winner"] };

    return {
      motm: {
        name: motm.name,
        teamName: motm.teamName,
        detail: motm.summary.join(" & ") || "All-round impact",
        pts: Math.max(10, Math.round(motm.pts))
      },
      bestBatter: {
        name: bestBatter.name,
        teamName: bestBatter.teamName,
        detail: `${bestBatter.runs} runs (${bestBatter.balls}b • ${bestBatter.fours}x4, ${bestBatter.sixes}x6)`
      },
      bestBowler: {
        name: bestBowler.name,
        teamName: bestBowler.teamName,
        detail: `${bestBowler.wickets}/${bestBowler.runsConceded} (${Math.floor(bestBowler.ballsBowled / 6)}.${bestBowler.ballsBowled % 6} ov)`
      }
    };
  };
})(window);