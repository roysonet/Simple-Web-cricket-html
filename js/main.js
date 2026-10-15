(function (root) {
  const NLC = (root.NLC = root.NLC || {});
  const {
    BOWLER_ARCHETYPES,
    SHOTS,
    SECTOR_PRESETS,
    FRANCHISE_TEAMS,
    PITCH_TYPES,
    FIELD_PRESETS,
    state,
    clamp,
    pick,
    createInnings,
    currentInnings,
    battingTeam,
    bowlingTeam,
    isHumanBattingTurn,
    getTeamInnings,
    getStriker,
    getNonStriker,
    getCurrentBowler,
    getBowlerArchetype,
    getActivePitchInfo,
    resolvePitchForMatch,
    resolveActiveFieldPreset,
    getTargetFielderPositions,
    computeMatchAwards,
    evaluateDeliveryOutcome,
    buildPlaySimulation,
    drawPitch,
    drawWagonWheel,
    drawAnalyticsChart,
    playTone,
    playSoundEffect,
    triggerHaptic,
    saveMatchHistory
  } = NLC;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let rafId = 0;
  let scorecardInningsTab = 0;
  let activeChartMode = "manhattan";

  function clearPlayTimers() {
    while (state.timers.length) {
      clearTimeout(state.timers.pop());
    }
  }

  function showScreen(name) {
    ["setup", "tournament", "toss", "match", "innings", "result"].forEach((k) => {
      const el = $(`#${k}Screen`);
      if (el) el.hidden = k !== name;
    });
    state.screen = name;
    updateTopbarStatus();
    if (name === "match" && !rafId) {
      const loop = () => {
        drawPitch($("#pitchCanvas"));
        rafId = state.screen === "match" ? requestAnimationFrame(loop) : 0;
      };
      rafId = requestAnimationFrame(loop);
    }
  }

  function updateTopbarStatus() {
    const el = $("#topbarStatus");
    if (!el) return;
    if (state.screen === "setup") el.textContent = "READY TO PLAY";
    else if (state.screen === "tournament") el.textContent = "TOURNAMENT HUB";
    else if (state.screen === "toss") el.textContent = "COIN TOSS";
    else if (state.screen === "match") {
      el.textContent = state.isSuperOver ? "⚡ SUPER OVER • LIVE" : `INNINGS ${state.currentInnings + 1} • LIVE`;
    } else if (state.screen === "innings") el.textContent = "INNINGS BREAK";
    else if (state.screen === "result") el.textContent = "MATCH COMPLETE";
  }

  function renderHistoryPreview() {
    const el = $("#historyPreview");
    if (!el) return;
    if (!state.matchHistory.length) {
      el.innerHTML = `<span class="history-dot"></span><span>No matches logged yet</span>`;
    } else {
      el.innerHTML = `<span class="history-dot"></span><span>Last: ${state.matchHistory[0].text}</span>`;
    }
  }

  function setTheme(themeKey) {
    state.theme = themeKey;
    document.documentElement.setAttribute("data-theme", themeKey);
    $$("[data-theme-pick]").forEach((b) => b.classList.toggle("is-selected", b.dataset.themePick === themeKey));
    $$("[data-theme-btn]").forEach((b) => b.classList.toggle("is-selected", b.dataset.themeBtn === themeKey));
  }

  function updateOversUI(oversVal) {
    const v = clamp(Number(oversVal) || 3, 1, 50);
    state.settings.overs = v;
    const slider = $("#oversSlider");
    if (slider) slider.value = String(v);
    const lbl = $("#oversLabel");
    if (lbl) lbl.textContent = `${v} ${v === 1 ? "Over" : "Overs"} (${v * 6} balls)`;
    $$("[data-over-pill]").forEach((b) => b.classList.toggle("is-selected", Number(b.dataset.overPill) === v));
  }

  // ============================================================================
  // TOURNAMENT EDITION ENGINE (Solo Career vs AI)
  // ============================================================================
  function initTournament() {
    const userTeamIdx = Number($("#tourneyUserTeam")?.value || 0);
    const otherIndices = FRANCHISE_TEAMS.map((_, i) => i).filter((i) => i !== userTeamIdx).slice(0, 3);
    const teamIds = [userTeamIdx, ...otherIndices];

    const standings = {};
    teamIds.forEach((id) => {
      standings[id] = {
        id,
        name: FRANCHISE_TEAMS[id].name,
        code: FRANCHISE_TEAMS[id].code,
        played: 0,
        won: 0,
        lost: 0,
        pts: 0,
        runsFor: 0,
        oversFor: 0,
        runsAgainst: 0,
        oversAgainst: 0,
        nrr: 0
      };
    });

    // 3 Round-Robin Rounds (Each round has 1 User match + 1 AI vs AI match) + Grand Final
    const [u, a, b, c] = teamIds;
    const fixtures = [
      { round: "Group Match 1", t1: u, t2: a, ai1: b, ai2: c, played: false, resultText: "" },
      { round: "Group Match 2", t1: u, t2: b, ai1: a, ai2: c, played: false, resultText: "" },
      { round: "Group Match 3", t1: u, t2: c, ai1: a, ai2: b, played: false, resultText: "" }
    ];

    state.tournament = {
      active: true,
      teamIds,
      userTeamId: u,
      fixtures,
      currentFixtureIdx: 0,
      standings,
      playerStats: {},
      champion: null
    };

    renderTournamentHub();
    showScreen("tournament");
  }

  function recordTournamentPlayerStat(name, teamName, runs, balls, wickets, runsConceded) {
    const ps = state.tournament.playerStats;
    if (!ps[name]) {
      ps[name] = { name, teamName, runs: 0, balls: 0, wickets: 0, runsConceded: 0, mvpPts: 0 };
    }
    ps[name].runs += runs;
    ps[name].balls += balls;
    ps[name].wickets += wickets;
    ps[name].runsConceded += runsConceded;
    ps[name].mvpPts = Math.round(ps[name].runs * 1.4 + ps[name].wickets * 24);
  }

  function updateTeamStanding(teamId, runsFor, oversFor, runsAgainst, oversAgainst, won) {
    const st = state.tournament.standings[teamId];
    if (!st) return;
    st.played += 1;
    if (won) {
      st.won += 1;
      st.pts += 2;
    } else {
      st.lost += 1;
    }
    st.runsFor += runsFor;
    st.oversFor += Math.max(0.5, oversFor);
    st.runsAgainst += runsAgainst;
    st.oversAgainst += Math.max(0.5, oversAgainst);
    st.nrr = Number((st.runsFor / st.oversFor - st.runsAgainst / st.oversAgainst).toFixed(2));
  }

  function simulateAiVsAiMatch(tA, tB) {
    const overs = state.settings.overs;
    const rA = Math.round(overs * (7.2 + Math.random() * 4.5));
    const rB = Math.round(overs * (7.0 + Math.random() * 4.6)) + (rA === 0 ? 1 : 0);
    const finalB = rB === rA ? rB + 1 : rB;
    const aWon = rA > finalB;
    updateTeamStanding(tA, rA, overs, finalB, overs, aWon);
    updateTeamStanding(tB, finalB, overs, rA, overs, !aWon);

    // Credit star players from AI rosters so Man of the Series / Orange / Purple Cap is rich
    const rosterA = FRANCHISE_TEAMS[tA].roster;
    const rosterB = FRANCHISE_TEAMS[tB].roster;
    recordTournamentPlayerStat(rosterA[0].name, FRANCHISE_TEAMS[tA].name, Math.round(rA * 0.45), Math.round(overs * 2.5), 0, 0);
    recordTournamentPlayerStat(rosterB[0].name, FRANCHISE_TEAMS[tB].name, Math.round(finalB * 0.48), Math.round(overs * 2.5), 0, 0);
    recordTournamentPlayerStat(rosterA[8].name, FRANCHISE_TEAMS[tA].name, 0, 0, aWon ? 2 : 1, Math.round(finalB * 0.3));
    recordTournamentPlayerStat(rosterB[8].name, FRANCHISE_TEAMS[tB].name, 0, 0, !aWon ? 2 : 1, Math.round(rA * 0.3));
  }

  function renderTournamentHub() {
    const t = state.tournament;
    if (!t.active) return;

    const sortedTeams = Object.values(t.standings).sort((a, b) => b.pts - a.pts || b.nrr - a.nrr);
    $("#tourneyStandingsBody").innerHTML = sortedTeams
      .map(
        (st, idx) => `<tr class="${st.id === t.userTeamId ? "is-active-batter" : ""}">
          <td>${idx + 1}. <strong>${st.name}</strong></td>
          <td>${st.played}</td>
          <td>${st.won}</td>
          <td>${st.lost}</td>
          <td><strong>${st.pts}</strong></td>
          <td>${st.nrr >= 0 ? `+${st.nrr}` : st.nrr}</td>
        </tr>`
      )
      .join("");

    const allPlayers = Object.values(t.playerStats);
    const topMvp = [...allPlayers].sort((a, b) => b.mvpPts - a.mvpPts)[0];
    const topBatter = [...allPlayers].sort((a, b) => b.runs - a.runs)[0];
    const topBowler = [...allPlayers].sort((a, b) => b.wickets - a.wickets)[0];

    $("#tourneyMvpCard").innerHTML = topMvp
      ? `<strong>${topMvp.name} (${topMvp.teamName})</strong><span>${topMvp.mvpPts} MVP Pts • ${topMvp.runs}r & ${topMvp.wickets}w</span>`
      : `<strong>Awaiting Opening Match</strong><span>Play matches to populate Series MVP</span>`;
    $("#tourneyOrangeCard").innerHTML = topBatter
      ? `<strong>${topBatter.name} (${topBatter.teamName})</strong><span>${topBatter.runs} Runs (${topBatter.balls}b)</span>`
      : `<strong>--</strong><span>Most Runs Leader</span>`;
    $("#tourneyPurpleCard").innerHTML = topBowler
      ? `<strong>${topBowler.name} (${topBowler.teamName})</strong><span>${topBowler.wickets} Wickets</span>`
      : `<strong>--</strong><span>Most Wickets Leader</span>`;

    const nextFix = t.fixtures[t.currentFixtureIdx];
    const actionBtn = $("#playNextTourneyMatchBtn");
    if (t.champion !== null) {
      $("#tourneyStageBanner").textContent = `🏆 TOURNAMENT CHAMPION: ${FRANCHISE_TEAMS[t.champion].name.toUpperCase()}!`;
      actionBtn.querySelector("span").textContent = "NEW TOURNAMENT / SETUP";
    } else if (nextFix) {
      $("#tourneyStageBanner").textContent = `NEXT UP — ${nextFix.round.toUpperCase()}: ${FRANCHISE_TEAMS[nextFix.t1].name} vs ${FRANCHISE_TEAMS[nextFix.t2].name}`;
      actionBtn.querySelector("span").textContent = `PLAY ${nextFix.round.toUpperCase()} 🏏`;
    }
  }

  // ============================================================================
  // MATCH INITIALIZATION & COIN TOSS
  // ============================================================================
  function startNewMatch() {
    clearPlayTimers();
    if (state.settings.mode === "tournament" && state.screen === "setup") {
      initTournament();
      return;
    }

    if (state.settings.mode === "tournament" && state.tournament.active) {
      const t = state.tournament;
      if (t.champion !== null) {
        state.tournament.active = false;
        showScreen("setup");
        return;
      }
      const fix = t.fixtures[t.currentFixtureIdx];
      state.settings.teamIndices = [fix.t1, fix.t2];
      state.settings.teams = [FRANCHISE_TEAMS[fix.t1].name, FRANCHISE_TEAMS[fix.t2].name];
      state.playerTeam = 0;
    } else {
      const t1Name = ($("#teamOne")?.value || "").trim() || "Harbor Hawks";
      const t2Name = ($("#teamTwo")?.value || "").trim() || "Metro Foxes";
      state.settings.teams = [t1Name, t2Name];
      state.settings.teamIndices = [0, 1];
      state.playerTeam = 0;
    }

    state.isSuperOver = false;
    state.matchOversLimit = state.settings.overs;
    state.matchWicketsLimit = 10;
    state.currentInnings = 0;
    state.innings = [null, null];
    state.target = null;
    state.commentary = [];
    state.lastHawkEye = null;

    const pitchInfo = resolvePitchForMatch();
    if ($("#tossSubtitle")) {
      $("#tossSubtitle").textContent = `Pitch Report: ${pitchInfo.badge} — ${pitchInfo.desc}.`;
    }
    const coin3d = $("#coin3d");
    if (coin3d) coin3d.style.transform = "rotateY(0deg)";

    showScreen("toss");
    $("#tossResult").hidden = true;
    $("#tossDecision").hidden = true;
    $("#tossControls").hidden = false;
  }

  function startSuperOverTieBreaker() {
    clearPlayTimers();
    state.isSuperOver = true;
    state.superOverRound += 1;
    state.matchOversLimit = 1;
    state.matchWicketsLimit = 2;
    state.currentInnings = 0;
    state.innings = [null, null];
    state.target = null;
    state.battingFirst = 1 - state.battingFirst;
    state.commentary.unshift({
      ball: "SO",
      text: "⚡ SUPER OVER TIE-BREAKER! 1 Over (6 balls), 2 wickets max per side!",
      highlight: true
    });
    beginInnings(0);
  }

  function beginInnings(idx) {
    clearPlayTimers();
    state.currentInnings = idx;
    const batIdx = idx === 0 ? state.battingFirst : 1 - state.battingFirst;
    const bowlIdx = 1 - batIdx;
    state.innings[idx] = createInnings(batIdx, bowlIdx);
    state.localStage = "delivery";
    state.actionLocked = false;
    state.animation.sim = null;
    $("#outcomeBanner").hidden = true;
    $("#celebrationOverlay").hidden = true;
    $("#runCallOverlay").hidden = true;
    showScreen("match");
    checkOverBowlerSelection();
    renderMatchUI();
  }

  function checkOverBowlerSelection() {
    const inn = currentInnings();
    if (!inn || !inn.needsBowlerSelection) return;

    const isHumanBowl = state.settings.mode === "local" || bowlingTeam() === state.playerTeam;
    if (!isHumanBowl) {
      const candidates = inn.bowlRoster.map((b, i) => i).filter((i) => i !== inn.lastBowlerIdx);
      inn.currentBowlerIdx = pick(candidates);
      inn.needsBowlerSelection = false;
      const arch = getBowlerArchetype(inn);
      state.selectedDelivery = arch.deliveries[0].id;
      return;
    }

    const modal = $("#bowlerModal");
    const list = $("#bowlerList");
    const overNum = Math.floor(inn.legalBalls / 6) + 1;
    $("#bowlerModalTitle").textContent = state.isSuperOver
      ? "Select Bowler — ⚡ SUPER OVER"
      : `Select Bowler — Over ${overNum} of ${state.matchOversLimit}`;
    list.innerHTML = inn.bowlRoster
      .map((b, idx) => {
        const arch = BOWLER_ARCHETYPES[b.bowlType];
        const disabled = idx === inn.lastBowlerIdx ? "disabled" : "";
        return `<button class="bowler-card" type="button" data-bowler-idx="${idx}" ${disabled}>
          <strong>${b.name} (${b.hand})</strong>
          <span>${arch.name} • ${arch.speedRange[0]}–${arch.speedRange[1]} km/h</span>
          <small>${idx === inn.lastBowlerIdx ? "Bowled previous over" : `Figures: ${b.wickets}/${b.runsConceded} (${b.oversBowled}.${b.ballsBowled % 6} ov)`}</small>
        </button>`;
      })
      .join("");
    modal.hidden = false;
  }

  function renderMatchUI() {
    const inn = currentInnings();
    if (!inn) return;

    const batTeamIdx = battingTeam();
    const striker = getStriker(inn);
    const nonStriker = getNonStriker(inn);
    const bowler = getCurrentBowler(inn);
    const arch = getBowlerArchetype(inn);
    const pitchInfo = getActivePitchInfo();

    $("#scoreTeamA").textContent = state.settings.teams[0];
    $("#scoreTeamB").textContent = state.settings.teams[1];
    if ($("#crestTeamA")) $("#crestTeamA").textContent = state.settings.teams[0].slice(0, 2).toUpperCase();
    if ($("#crestTeamB")) $("#crestTeamB").textContent = state.settings.teams[1].slice(0, 2).toUpperCase();

    $("#scoreTeamAState").textContent = batTeamIdx === 0 ? "● BATTING" : "BOWLING";
    $("#scoreTeamBState").textContent = batTeamIdx === 1 ? "● BATTING" : "BOWLING";
    $("#scoreTeamA").closest(".score-team")?.classList.toggle("is-batting", batTeamIdx === 0);
    $("#scoreTeamB").closest(".score-team")?.classList.toggle("is-batting", batTeamIdx === 1);

    const innA = getTeamInnings(0);
    const innB = getTeamInnings(1);
    $("#scoreA").innerHTML = `${innA.score}<span>/${innA.wickets}</span>`;
    $("#scoreB").innerHTML = `${innB.score}<span>/${innB.wickets}</span>`;

    $("#matchPhaseLabel").textContent = state.isSuperOver ? "⚡ SUPER OVER" : `INNINGS ${state.currentInnings + 1}`;
    $("#overDisplay").textContent = `${Math.floor(inn.legalBalls / 6)}.${inn.legalBalls % 6}`;
    $("#targetDisplay").textContent = state.target
      ? `NEED ${Math.max(0, state.target - inn.score)} OFF ${Math.max(0, state.matchOversLimit * 6 - inn.legalBalls)}B`
      : `MAX ${state.matchOversLimit}.0 OVERS`;

    const isHumanBat = isHumanBattingTurn();
    $("#stadiumRole").textContent =
      state.settings.mode === "local"
        ? `${state.settings.teams[batTeamIdx].toUpperCase()} (${isHumanBat ? "BATTER TURN" : "BOWLER TURN"})`
        : isHumanBat
        ? "🏏 YOUR BATTING INNINGS"
        : "⚾ YOUR BOWLING INNINGS";

    // STRICT ROLE SEPARATION: Only the Bowler can see and change the Field Preset Bar!
    const fieldBar = $("#fieldPresetBar");
    if (fieldBar) {
      fieldBar.hidden = isHumanBat;
    }

    $("#strikerInfo").textContent = `${striker.name} (${striker.hand}) ${striker.runs}*(${striker.balls})`;
    $("#nonStrikerInfo").textContent = `${nonStriker.name} (${nonStriker.hand}) ${nonStriker.runs}(${nonStriker.balls})`;
    $("#bowlerInfo").textContent = `${bowler.name} (${arch.short}) ${bowler.wickets}/${bowler.runsConceded}`;
    if ($("#pitchHudBadge")) $("#pitchHudBadge").textContent = pitchInfo.badge;
    $("#freeHitBadge").hidden = !inn.freeHit;

    $("#partnershipValue").innerHTML = `${inn.partnership} <small>(${inn.partnershipBalls}b)</small>`;
    $("#partnershipBar").style.width = `${clamp((inn.partnership / 50) * 100, 0, 100)}%`;

    $("#ballSpeedReadout").innerHTML = `${state.speedMeters.ballKmh || "--.-"} <small>KM/H</small>`;
    $("#ballSpeedFill").style.width = `${clamp((state.speedMeters.ballKmh / 156) * 100, 0, 100)}%`;
    $("#batSpeedReadout").innerHTML = `${state.speedMeters.exitKmh || state.speedMeters.batKmh || "--.-"} <small>KM/H</small>`;
    $("#batSpeedFill").style.width = `${clamp(((state.speedMeters.exitKmh || state.speedMeters.batKmh) / 148) * 100, 0, 100)}%`;

    if ($("#telLine")) $("#telLine").textContent = state.telemetry.line;
    if ($("#telShot")) $("#telShot").textContent = state.telemetry.shot;
    if ($("#telDist")) $("#telDist").textContent = state.telemetry.distance;

    const preset = resolveActiveFieldPreset();
    $("#fieldSummaryBadge").textContent = `${preset.badge} • ${striker.hand}`;

    const strip = $("#ballStrip");
    strip.innerHTML = "";
    const chipCount = Math.max(6, inn.currentOver.length);
    for (let i = 0; i < chipCount; i++) {
      const item = inn.currentOver[i];
      const span = document.createElement("span");
      span.className = `ball-chip ${
        item ? (item.kind === "wicket" ? "wicket" : item.kind === "boundary" || item.runs >= 4 ? "boundary" : item.kind === "extra" ? "extra" : "") : ""
      }`;
      span.textContent = item ? item.display : "•";
      strip.appendChild(span);
    }
    $("#legalBallLabel").textContent = `${inn.legalBalls % 6} / 6 LEGAL`;

    renderControlDeck();
  }

  function formatBowlLineLabel(val) {
    if (val < -0.58) return "⚠ WIDE LEG";
    if (val < -0.20) return "LEG STUMP";
    if (val > 0.72) return "⚠ WIDE OFF";
    if (val > 0.22) return "OFF CORRIDOR";
    return "MIDDLE STUMP";
  }

  function formatBowlLengthLabel(offset) {
    if (offset > 0.06) return "FULL / YORKER";
    if (offset < -0.06) return "SHORT / BOUNCER";
    return "GOOD LENGTH";
  }

  function renderControlDeck() {
    const inn = currentInnings();
    if (!inn) return;
    const arch = getBowlerArchetype(inn);
    const striker = getStriker(inn);
    const container = $("#controlContent");

    if (state.actionLocked) {
      $("#controlStateBadge").textContent = "IN PLAY";
      container.innerHTML = `
        <div class="control-lead">
          <strong>Delivery in motion</strong><br>
          Watch the 2.5D Hawk-Eye trajectory &amp; fielders, or press <b>SPACE / ⏩</b> to fast-forward.
        </div>
      `;
      return;
    }

    $("#controlStateBadge").textContent = "READY";
    const isBattingTurn = isHumanBattingTurn();

    if (isBattingTurn) {
      $("#controlEyebrow").textContent = `🏏 BATTER DECK • ${striker.name} (${striker.hand})`;
      $("#controlHint").textContent = "Drag on the turf to aim your 360° shot cone (Bowler's ball spot is hidden).";
      const deg = Math.round((state.shotAngle * 180) / Math.PI);
      container.innerHTML = `
        <div class="shot-grid">
          ${SHOTS.map(
            (s) =>
              `<button class="shot-button ${state.selectedShot === s.id ? "is-selected" : ""}" data-shot="${s.id}" type="button">
                <strong>${s.label} <i>${s.key}</i></strong>
                <small>${s.note}</small>
              </button>`
          ).join("")}
        </div>
        <div class="sector-quick-row" role="group" aria-label="Quick shot sector">
          ${SECTOR_PRESETS.map(
            (sp) =>
              `<button class="sector-pill ${Math.abs(deg - sp.deg) <= 18 ? "is-active" : ""}" type="button" data-sector-deg="${sp.deg}">${sp.label}</button>`
          ).join("")}
        </div>
        <div class="aim-slider-group">
          <label><span>360° SHOT AIM (DRAG TURF)</span><strong id="shotAngleVal">${deg}°</strong></label>
          <input type="range" id="shotAngleRange" min="-175" max="175" value="${deg}">
          <label><span>BAT SWING POWER</span><strong id="batPowerVal">${state.batPowerPct}%</strong></label>
          <input type="range" id="batPowerRange" min="45" max="100" value="${state.batPowerPct}">
        </div>
        <div class="meter-box">
          <div class="meter-title"><span>REFLEX TIMING METER (${state.settings.difficulty.toUpperCase()})</span><strong>CENTER = SIX / SWEET SPOT</strong></div>
          <div class="release-meter">
            <span class="sweet-zone-bracket"></span>
            <span class="release-marker" id="timingMarker" style="left: 50%"></span>
          </div>
          <button class="primary-button" id="commitActionBtn" type="button"><span>PLAY SHOT (SPACE)</span><b>🏏</b></button>
        </div>
      `;
      startTimingLoop(true);
    } else {
      $("#controlEyebrow").textContent = `⚾ BOWLER DECK • ${arch.name.toUpperCase()}`;
      $("#controlHint").textContent = "Drag the target crosshair on the pitch to aim drop spot (Batter's shot is hidden).";
      if (!state.selectedDelivery || !arch.deliveries.some((d) => d.id === state.selectedDelivery)) {
        state.selectedDelivery = arch.deliveries[0].id;
      }
      container.innerHTML = `
        <div class="delivery-grid">
          ${arch.deliveries
            .map(
              (d) =>
                `<button class="delivery-button ${state.selectedDelivery === d.id ? "is-selected" : ""}" data-delivery="${d.id}" type="button">
                  <strong>${d.label} <i>${d.key || ""}</i></strong>
                  <small>${d.note}</small>
                </button>`
            )
            .join("")}
        </div>
        <div class="aim-slider-group">
          <label><span>PITCH LINE (DRAG PITCH RETICLE)</span><strong id="bowlLineVal">${formatBowlLineLabel(state.bowlAimLine)}</strong></label>
          <input type="range" id="bowlLineRange" min="-100" max="100" value="${Math.round(state.bowlAimLine * 100)}">
          <label><span>PITCH LENGTH DROP SPOT</span><strong id="bowlLengthVal">${formatBowlLengthLabel(state.bowlLengthOffset)}</strong></label>
          <input type="range" id="bowlLengthRange" min="-18" max="18" value="${Math.round((state.bowlLengthOffset || 0) * 100)}">
          <label><span>BOWLING EFFORT SPEED</span><strong id="bowlEffortVal">${state.bowlEffortPct}%</strong></label>
          <input type="range" id="bowlEffortRange" min="50" max="100" value="${state.bowlEffortPct}">
        </div>
        <div class="meter-box">
          <div class="meter-title"><span>RELEASE METER (${state.settings.difficulty.toUpperCase()})</span><strong class="noball-warn">RED END = NO-BALL!</strong></div>
          <div class="release-meter">
            <span class="sweet-zone-bracket"></span>
            <span class="noball-zone-tag">NO-BALL</span>
            <span class="release-marker" id="timingMarker" style="left: 50%"></span>
          </div>
          <button class="primary-button" id="commitActionBtn" type="button"><span>BOWL DELIVERY (SPACE)</span><b>⚾</b></button>
        </div>
      `;
      startTimingLoop(false);
    }
  }

  /**
   * High-Speed Difficulty-Scaled Reflex Timing Meter
   */
  function startTimingLoop(isBatting) {
    if (state.timing?.raf) cancelAnimationFrame(state.timing.raf);
    state.timing = { start: performance.now(), marker: 50, raf: 0, isBatting };

    // Fast, crisp oscillation scaled by Rookie / Pro / Elite difficulty!
    const basePeriod =
      state.settings.difficulty === "elite"
        ? 300
        : state.settings.difficulty === "rookie"
        ? 630
        : 430;

    const tick = (now) => {
      if (!state.timing) return;
      const elapsed = (now - state.timing.start) / basePeriod;
      const phase = elapsed % 2;
      state.timing.marker = phase <= 1 ? phase * 100 : (2 - phase) * 100;
      const el = $("#timingMarker");
      if (el) el.style.left = `${state.timing.marker}%`;
      state.timing.raf = requestAnimationFrame(tick);
    };
    state.timing.raf = requestAnimationFrame(tick);
  }

  function getTimingQuality(marker, isBatting) {
    // Bowling meter Red End (86% - 100%) is the Overstep NO-BALL ZONE!
    if (!isBatting && marker >= 86) {
      return "noball_overstep";
    }
    const diff = Math.abs(marker - 51);
    const tolBonus = state.settings.difficulty === "rookie" ? 3.0 : state.settings.difficulty === "elite" ? -1.2 : 0;
    if (diff <= 8.0 + tolBonus) return "perfect";
    if (diff <= 19.0 + tolBonus) return "good";
    if (diff <= 34) return marker < 51 ? "early" : "late";
    return "miss";
  }

  function computeAiBattingChoice(inn, deliveryId) {
    const diff = state.settings.difficulty;
    const arch = getBowlerArchetype(inn);
    const dInfo = arch.deliveries.find((d) => d.id === deliveryId) || arch.deliveries[0];
    const preset = resolveActiveFieldPreset();
    const fielders = getTargetFielderPositions(preset);

    const candidateAngles = [-2.2, -1.5, -0.85, -0.35, 0.0, 0.4, 0.85, 1.5, 2.2];
    let bestAngle = 0.4;
    let bestClearance = -1;
    candidateAngles.forEach((ang) => {
      let minDiff = 99;
      fielders.forEach((f) => {
        const fAng = Math.atan2(f.targetNx, -(f.targetNy - 0.34));
        const d = Math.abs(Math.atan2(Math.sin(fAng - ang), Math.cos(fAng - ang)));
        if (d < minDiff) minDiff = d;
      });
      if (minDiff > bestClearance) {
        bestClearance = minDiff;
        bestAngle = ang + (Math.random() - 0.5) * 0.18;
      }
    });

    state.shotAngle = bestAngle;
    const remBalls = Math.max(1, state.matchOversLimit * 6 - inn.legalBalls);
    const reqRuns = state.target ? state.target - inn.score : 0;
    const needAggression = state.target ? reqRuns / remBalls > 1.5 : remBalls <= 6;

    const effLen = dInfo.pitchFrac + (state.bowlLengthOffset || 0);
    let aiShot = "drive";
    if (effLen < 0.56) aiShot = "cut_pull";
    else if (needAggression && Math.random() < 0.58) aiShot = pick(["loft", "charge", "drive", "cut_pull"]);
    else if (arch.keeperUp && Math.random() < 0.42) aiShot = "sweep";
    else aiShot = pick(["drive", "cut_pull", "loft", "sweep"]);

    state.batPowerPct = needAggression ? 92 : 82;

    const pools = {
      rookie: ["perfect", "good", "early", "late", "miss", "miss"],
      pro: ["perfect", "good", "good", "early", "late", "miss"],
      elite: ["perfect", "perfect", "good", "good", "early"]
    };
    const aiContact = pick(pools[diff] || pools.pro);
    return { aiShot, aiContact };
  }

  function computeAiBowlingChoice(inn) {
    const diff = state.settings.difficulty;
    const arch = getBowlerArchetype(inn);
    const deliveryId = pick(arch.deliveries).id;
    state.fieldPresetMode = "auto";
    state.bowlAimLine = (Math.random() - 0.4) * 0.65;
    state.bowlLengthOffset = (Math.random() - 0.5) * 0.10;
    state.bowlEffortPct = Math.round(75 + Math.random() * 23);
    const pools = {
      rookie: ["good", "good", "late", "miss"],
      pro: ["perfect", "good", "good", "late"],
      elite: ["perfect", "perfect", "good", "good"]
    };
    const releaseQ = pick(pools[diff] || pools.pro);
    return { deliveryId, releaseQ };
  }

  function handleActionCommit() {
    if (state.actionLocked || !state.timing) return;
    const isBattingTurn = isHumanBattingTurn();
    const quality = getTimingQuality(state.timing.marker, isBattingTurn);
    cancelAnimationFrame(state.timing.raf);
    state.timing = null;

    const inn = currentInnings();

    if (!isBattingTurn) {
      state.bowlerReleaseQuality = quality;
      if (state.settings.mode === "local") {
        state.localStage = "shot";
        renderMatchUI();
        return;
      }
      const { aiShot, aiContact } = computeAiBattingChoice(inn, state.selectedDelivery);
      executePlay(aiShot, state.selectedDelivery, aiContact, quality);
    } else {
      if (state.settings.mode === "local") {
        executePlay(state.selectedShot, state.selectedDelivery, quality, state.bowlerReleaseQuality);
      } else {
        const { deliveryId, releaseQ } = computeAiBowlingChoice(inn);
        executePlay(state.selectedShot, deliveryId, quality, releaseQ);
      }
    }
  }

  function buildCelebrationSvg(outcome) {
    if (outcome.kind === "wicket") {
      return `
        <svg viewBox="0 0 80 80" fill="none">
          <rect x="24" y="22" width="5" height="44" rx="2" fill="#fde047" transform="rotate(-18 26 44)"/>
          <rect x="38" y="20" width="5" height="44" rx="2" fill="#f43f5e" transform="rotate(14 40 42)"/>
          <rect x="52" y="22" width="5" height="44" rx="2" fill="#fde047" transform="rotate(28 54 44)"/>
          <rect x="20" y="12" width="14" height="4" rx="2" fill="#ff2a85" transform="rotate(-35 27 14)"/>
          <rect x="46" y="10" width="14" height="4" rx="2" fill="#ff2a85" transform="rotate(40 53 12)"/>
          <circle cx="40" cy="36" r="7" fill="#f43f5e"/>
        </svg>`;
    }
    if (outcome.batRuns === 6 || outcome.runs === 6) {
      return `
        <svg viewBox="0 0 80 80" fill="none">
          <path d="M12 64 Q40 6 68 20" stroke="#c084fc" stroke-width="4" stroke-linecap="round" stroke-dasharray="4 4"/>
          <circle cx="64" cy="20" r="10" fill="#a3e635"/>
          <text x="40" y="58" text-anchor="middle" fill="#ffffff" font-size="34" font-weight="900">6</text>
        </svg>`;
    }
    return `
      <svg viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="40" r="30" stroke="#a3e635" stroke-width="4" stroke-dasharray="8 5"/>
        <text x="40" y="52" text-anchor="middle" fill="#a3e635" font-size="34" font-weight="900">4</text>
      </svg>`;
  }

  function showOutcomeBannerFor(outcome) {
    const banner = $("#outcomeBanner");
    const flash = $("#pitchFlash");
    const celeb = $("#celebrationOverlay");

    banner.hidden = false;
    banner.classList.toggle("is-wicket", outcome.kind === "wicket");
    const isSix = outcome.batRuns === 6 || outcome.runs === 6;
    const isFour = outcome.batRuns === 4 || outcome.runs === 4;

    $("#outcomeTitle").textContent =
      outcome.kind === "wicket"
        ? `OUT! (${outcome.dismissalType.toUpperCase()})`
        : isSix
        ? "MAXIMUM SIX!"
        : isFour
        ? "FOUR RUNS!"
        : outcome.display;
    $("#outcomeDetail").textContent = outcome.text;

    if (state.fxOn && (outcome.kind === "wicket" || isSix || isFour) && celeb) {
      celeb.hidden = false;
      const card = $("#celebrationCard");
      if (card) {
        card.className = `celebration-card ${outcome.kind === "wicket" ? "is-wicket" : isSix ? "is-six" : ""}`;
      }
      $("#celebrationSvgWrap").innerHTML = buildCelebrationSvg(outcome);
      $("#celebrationTitle").textContent =
        outcome.kind === "wicket" ? "WICKET!" : isSix ? `SIX! (${outcome.distanceMeters || 96}m)` : "FOUR!";
      $("#celebrationSub").textContent =
        outcome.kind === "wicket" ? outcome.dismissalType.toUpperCase() : outcome.text.slice(0, 48);
    }

    if (state.fxOn && flash) {
      flash.className = `pitch-flash ${
        outcome.kind === "wicket" ? "is-wicket" : outcome.runs >= 4 ? "is-boundary" : ""
      }`;
      setTimeout(() => {
        if (flash) flash.className = "pitch-flash";
      }, 650);
    }
    if (outcome.kind === "wicket" || outcome.runs >= 4) triggerHaptic([40, 60, 80]);
  }

  function executePlay(shotId, deliveryId, contactQuality, releaseQuality) {
    clearPlayTimers();
    state.actionLocked = true;
    const { outcome, traj } = evaluateDeliveryOutcome(shotId, deliveryId, contactQuality, releaseQuality);
    const sim = buildPlaySimulation(outcome, { shot: shotId, delivery: deliveryId, contactQuality, releaseQuality }, traj);

    // If user turned FX/Animations off, settle much faster!
    const animDuration = state.fxOn ? 2250 : 650;
    state.animation.sim = sim;
    state.animation.started = performance.now();
    state.animation.duration = animDuration;

    const canPushRun = outcome.kind === "runs" && outcome.batRuns >= 1 && outcome.batRuns <= 2;
    $("#runCallOverlay").hidden = !canPushRun;
    $("#diveCreaseBtn").classList.remove("is-armed");
    $("#diveCreaseBtn").textContent = "⚡ DIVE IN (D)";

    renderMatchUI();

    const t1 = window.setTimeout(() => {
      $("#runCallOverlay").hidden = true;
      showOutcomeBannerFor(sim.outcome);
    }, state.fxOn ? 1150 : 260);

    const t2 = window.setTimeout(() => {
      finishPlayAnimation();
    }, state.fxOn ? 2350 : 680);

    state.timers.push(t1, t2);
  }

  function finishPlayAnimation() {
    clearPlayTimers();
    const sim = state.animation.sim;
    if (!sim) return;
    $("#runCallOverlay").hidden = true;
    $("#outcomeBanner").hidden = true;
    $("#celebrationOverlay").hidden = true;
    const finalOutcome = sim.outcome;
    state.animation.sim = null;
    settleBallOutcome(finalOutcome);
  }

  function settleBallOutcome(outcome) {
    const inn = currentInnings();
    if (!inn) return;
    const striker = getStriker(inn);
    const bowler = getCurrentBowler(inn);

    inn.totalBalls += 1;
    inn.score += outcome.runs;
    bowler.runsConceded += outcome.runs;
    if (outcome.kind === "extra") inn.extras += 1;

    if (outcome.legal) {
      inn.legalBalls += 1;
      striker.balls += 1;
      bowler.ballsBowled += 1;
    } else if (outcome.extraType === "noball") {
      striker.balls += 1;
    }

    const batRuns = outcome.batRuns ?? (outcome.kind !== "extra" ? outcome.runs : 0);
    striker.runs += batRuns;
    if (batRuns === 4) striker.fours += 1;
    if (batRuns === 6) striker.sixes += 1;

    inn.freeHit = Boolean(outcome.freeHitNext);

    const ballLabel = `${Math.floor(Math.max(0, inn.legalBalls - (outcome.legal ? 1 : 0)) / 6)}.${
      (Math.max(0, inn.legalBalls - (outcome.legal ? 1 : 0)) % 6) + (outcome.legal ? 1 : 0)
    }${outcome.legal ? "" : "*"}`;

    if (outcome.kind === "wicket") {
      inn.wickets += 1;
      if (outcome.bowlerCredited !== false && outcome.dismissalType !== "runout") {
        bowler.wickets += 1;
      }
      striker.out = true;
      striker.dismissalText = outcome.scorecardText || outcome.dismissalType;
      inn.partnership = 0;
      inn.partnershipBalls = 0;
      if (inn.nextBatterIdx < inn.batRoster.length) {
        inn.strikerIdx = inn.nextBatterIdx;
        inn.nextBatterIdx += 1;
      }
    } else {
      inn.partnership += outcome.runs;
      if (outcome.extraType !== "wide") inn.partnershipBalls += 1;
      const ranOdd = batRuns % 2 === 1 && outcome.extraType !== "wide";
      if (ranOdd) {
        [inn.strikerIdx, inn.nonStrikerIdx] = [inn.nonStrikerIdx, inn.strikerIdx];
      }
    }

    inn.currentOver.push(outcome);
    if (outcome.legal) {
      inn.wormHistory.push({ ball: inn.legalBalls, score: inn.score, wicket: outcome.kind === "wicket" });
    }

    state.commentary.unshift({
      ball: ballLabel,
      text: outcome.text,
      highlight: outcome.kind === "wicket" || outcome.runs >= 4
    });
    $("#commentaryList").innerHTML = state.commentary
      .slice(0, 14)
      .map(
        (c) =>
          `<div class="commentary-item ${c.highlight ? "is-highlight" : ""}">
            <span class="ball-number">${c.ball}</span>
            <p>${c.text}</p>
          </div>`
      )
      .join("");

    state.actionLocked = false;
    state.localStage = "delivery";

    if (outcome.legal && inn.legalBalls > 0 && inn.legalBalls % 6 === 0) {
      bowler.oversBowled += 1;
      const overRuns = inn.currentOver.reduce((acc, item) => acc + (item.runs || 0), 0);
      const overWkts = inn.currentOver.filter((item) => item.kind === "wicket").length;
      inn.overHistory.push({ over: inn.overHistory.length + 1, runs: overRuns, wickets: overWkts });
      inn.lastBowlerIdx = inn.currentBowlerIdx;
      inn.currentOver = [];
      inn.bouncersThisOver = 0;
      [inn.strikerIdx, inn.nonStrikerIdx] = [inn.nonStrikerIdx, inn.strikerIdx];
      inn.needsBowlerSelection = true;
    }

    // Check Innings / Match Completion
    if (state.target && inn.score >= state.target) {
      if (inn.currentOver.length > 0) {
        const overRuns = inn.currentOver.reduce((acc, item) => acc + (item.runs || 0), 0);
        inn.overHistory.push({ over: inn.overHistory.length + 1, runs: overRuns, wickets: 0 });
      }
      finishMatch(battingTeam(), `Won by ${state.matchWicketsLimit - inn.wickets} wickets!`);
      return;
    }

    if (inn.legalBalls >= state.matchOversLimit * 6 || inn.wickets >= state.matchWicketsLimit) {
      if (inn.currentOver.length > 0 && inn.legalBalls % 6 !== 0) {
        const overRuns = inn.currentOver.reduce((acc, item) => acc + (item.runs || 0), 0);
        inn.overHistory.push({ over: inn.overHistory.length + 1, runs: overRuns, wickets: 0 });
      }
      if (state.currentInnings === 0) {
        state.target = inn.score + 1;
        $("#breakBattingTeam").textContent = state.settings.teams[battingTeam()];
        $("#breakScore").innerHTML = `${inn.score}<span>/${inn.wickets}</span>`;
        $("#breakOvers").textContent = `${Math.floor(inn.legalBalls / 6)}.${inn.legalBalls % 6} overs`;
        $("#breakTarget").textContent = state.target;
        $("#breakChaseText").textContent = `from ${state.matchOversLimit * 6} balls`;
        showScreen("innings");
      } else {
        const s0 = state.innings[0].score;
        const s1 = state.innings[1].score;
        if (s0 === s1) {
          // DRAW / TIE -> Trigger Super Over!
          finishMatch(null, "Scores level after regulation — Proceed to Super Over!");
        } else {
          const winTeam = s1 > s0 ? battingTeam() : bowlingTeam();
          finishMatch(winTeam, `Won by ${Math.abs(s0 - s1)} runs!`);
        }
      }
      return;
    }

    checkOverBowlerSelection();
    renderMatchUI();
  }

  /**
   * Quick-Simulate Remaining Balls of Current Over (Helpful in 5–50 Over Matches)
   */
  function quickSimulateCurrentOver() {
    if (state.actionLocked) finishPlayAnimation();
    const inn = currentInnings();
    if (!inn) return;
    if (inn.needsBowlerSelection) {
      const candidates = inn.bowlRoster.map((b, i) => i).filter((i) => i !== inn.lastBowlerIdx);
      inn.currentBowlerIdx = pick(candidates);
      inn.needsBowlerSelection = false;
      $("#bowlerModal").hidden = true;
    }
    const startOver = Math.floor(inn.legalBalls / 6);
    let safety = 0;
    while (
      state.screen === "match" &&
      Math.floor(inn.legalBalls / 6) === startOver &&
      inn.legalBalls < state.matchOversLimit * 6 &&
      inn.wickets < state.matchWicketsLimit &&
      safety < 14
    ) {
      safety += 1;
      const arch = getBowlerArchetype(inn);
      const delivId = pick(arch.deliveries).id;
      const shotId = pick(SHOTS).id;
      state.shotAngle = (Math.random() - 0.5) * 2.4;
      const contactQ = pick(["perfect", "good", "good", "early", "late", "miss"]);
      const releaseQ = pick(["perfect", "good", "good"]);
      const { outcome, traj } = evaluateDeliveryOutcome(shotId, delivId, contactQ, releaseQ);
      buildPlaySimulation(outcome, { shot: shotId, delivery: delivId, contactQuality: contactQ, releaseQuality: releaseQ }, traj);
      settleBallOutcome(outcome);
    }
  }

  function finishMatch(winnerTeam, subtitle) {
    const innA = getTeamInnings(0);
    const innB = getTeamInnings(1);
    const awards = computeMatchAwards();
    state.lastMatchAwards = awards;

    const isTied = winnerTeam === null;
    $("#resultStamp").textContent = isTied ? "⚡ SCORES LEVEL — SUPER OVER!" : state.isSuperOver ? "SUPER OVER WINNER" : "FULL TIME";
    $("#resultTitle").innerHTML = isTied
      ? "Dead<br><em>even!</em>"
      : `${state.settings.teams[winnerTeam]}<br><em>win the match.</em>`;
    $("#resultSubtitle").textContent = subtitle;
    $("#resultTeamA").textContent = state.settings.teams[0];
    $("#resultTeamB").textContent = state.settings.teams[1];
    $("#resultScoreA").textContent = `${innA.score}/${innA.wickets}`;
    $("#resultScoreB").textContent = `${innB.score}/${innB.wickets}`;

    // Render Match Awards Banner (Man of the Match, Best Batter, Best Bowler)
    const awardsEl = $("#matchAwardsGrid");
    if (awardsEl) {
      awardsEl.innerHTML = `
        <div class="award-card motm-card">
          <span class="award-tag">🏆 MAN OF THE MATCH</span>
          <strong>${awards.motm.name}</strong>
          <span>${awards.motm.teamName} • ${awards.motm.pts} Impact Pts</span>
          <small>${awards.motm.detail}</small>
        </div>
        <div class="award-card">
          <span class="award-tag">🏏 BEST BATTER</span>
          <strong>${awards.bestBatter.name}</strong>
          <span>${awards.bestBatter.teamName}</span>
          <small>${awards.bestBatter.detail}</small>
        </div>
        <div class="award-card">
          <span class="award-tag">⚾ BEST BOWLER</span>
          <strong>${awards.bestBowler.name}</strong>
          <span>${awards.bestBowler.teamName}</span>
          <small>${awards.bestBowler.detail}</small>
        </div>
      `;
    }

    // Show/Hide Super Over button if tied!
    const superOverBtn = $("#startSuperOverBtn");
    if (superOverBtn) {
      superOverBtn.hidden = !isTied;
    }

    // Update Tournament Standings & Player Stats if in Tournament Mode
    if (!isTied && state.settings.mode === "tournament" && state.tournament.active) {
      const t = state.tournament;
      const fix = t.fixtures[t.currentFixtureIdx];
      if (fix && !fix.played) {
        fix.played = true;
        const t1Id = fix.t1;
        const t2Id = fix.t2;
        const overs0 = Math.max(1, innA.legalBalls / 6);
        const overs1 = Math.max(1, innB.legalBalls / 6);
        updateTeamStanding(t1Id, innA.score, overs0, innB.score, overs1, winnerTeam === 0);
        updateTeamStanding(t2Id, innB.score, overs1, innA.score, overs0, winnerTeam === 1);

        // Log tournament player stats
        state.innings.forEach((inn) => {
          if (!inn) return;
          const tName = state.settings.teams[inn.battingTeamIdx];
          const bName = state.settings.teams[inn.bowlingTeamIdx];
          inn.batRoster.forEach((b) => {
            if (b.runs > 0 || b.balls > 0) recordTournamentPlayerStat(b.name, tName, b.runs, b.balls, 0, 0);
          });
          inn.bowlRoster.forEach((bw) => {
            if (bw.ballsBowled > 0) recordTournamentPlayerStat(bw.name, bName, 0, 0, bw.wickets, bw.runsConceded);
          });
        });

        if (fix.ai1 != null && fix.ai2 != null) {
          simulateAiVsAiMatch(fix.ai1, fix.ai2);
        }

        t.currentFixtureIdx += 1;
        if (t.currentFixtureIdx >= t.fixtures.length) {
          const sorted = Object.values(t.standings).sort((a, b) => b.pts - a.pts || b.nrr - a.nrr);
          if (!t.fixtures.some((f) => f.round === "Grand Final")) {
            t.fixtures.push({
              round: "Grand Final",
              t1: sorted[0].id,
              t2: sorted[1].id,
              ai1: null,
              ai2: null,
              played: false
            });
          } else {
            t.champion = winnerTeam === 0 ? fix.t1 : fix.t2;
          }
        }
      }
    }

    const summary = isTied
      ? `${state.settings.teams[0]} ${innA.score}/${innA.wickets} tied ${state.settings.teams[1]} ${innB.score}/${innB.wickets}`
      : `${state.settings.teams[winnerTeam]} won (${innA.score}/${innA.wickets} vs ${innB.score}/${innB.wickets})`;
    saveMatchHistory(summary);
    renderHistoryPreview();
    showScreen("result");
  }

  function openScorecardModal(defaultIdx) {
    const modal = $("#scorecardModal");
    if (!modal) return;
    scorecardInningsTab = defaultIdx ?? state.currentInnings ?? 0;
    renderScorecardModalContent();
    modal.hidden = false;
  }

  function renderScorecardModalContent() {
    const inn = state.innings[scorecardInningsTab] || state.innings[0] || currentInnings();
    $$("[data-sc-tab]").forEach((b) => b.classList.toggle("is-active", Number(b.dataset.scTab) === scorecardInningsTab));
    $$("[data-chart-mode]").forEach((b) => b.classList.toggle("is-active", b.dataset.chartMode === activeChartMode));
    const container = $("#scorecardBody");
    if (!inn) {
      container.innerHTML = `<p class="modal-sub">Innings ${scorecardInningsTab + 1} has not started yet.</p>`;
      drawWagonWheel($("#wagonCanvas"), null);
      drawAnalyticsChart($("#AnalyticsChartCanvas"), activeChartMode);
      return;
    }
    const teamName = state.settings.teams[inn.battingTeamIdx];
    const rows = inn.batRoster
      .filter((p, idx) => p.balls > 0 || p.out || idx === inn.strikerIdx || idx === inn.nonStrikerIdx)
      .map((p) => {
        const isCurrent = !p.out && (inn.batRoster[inn.strikerIdx] === p || inn.batRoster[inn.nonStrikerIdx] === p);
        const sr = p.balls > 0 ? ((p.runs / p.balls) * 100).toFixed(1) : "0.0";
        return `<tr class="${isCurrent ? "is-active-batter" : ""}">
          <td>${p.name} <small>(${p.hand})</small></td>
          <td><small>${p.out ? p.dismissalText : isCurrent ? "batting*" : "not out"}</small></td>
          <td><strong>${p.runs}</strong></td>
          <td>${p.balls}</td>
          <td>${p.fours}</td>
          <td>${p.sixes}</td>
          <td>${sr}</td>
        </tr>`;
      })
      .join("");

    const bowlRows = inn.bowlRoster
      .filter((b) => b.ballsBowled > 0 || b === getCurrentBowler(inn))
      .map((b) => {
        const oversStr = `${Math.floor(b.ballsBowled / 6)}.${b.ballsBowled % 6}`;
        const econ = b.ballsBowled > 0 ? ((b.runsConceded / b.ballsBowled) * 6).toFixed(1) : "0.0";
        return `<tr>
          <td>${b.name}</td>
          <td>${oversStr}</td>
          <td>${b.runsConceded}</td>
          <td><strong>${b.wickets}</strong></td>
          <td>${econ}</td>
        </tr>`;
      })
      .join("");

    container.innerHTML = `
      <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
        <strong style="color:var(--accent);font-size:13px;">${teamName} — ${inn.score}/${inn.wickets} (${Math.floor(inn.legalBalls / 6)}.${inn.legalBalls % 6} ov)</strong>
        <small style="color:var(--muted);">Extras: ${inn.extras}</small>
      </div>
      <table class="sc-table">
        <thead><tr><th>Batter</th><th>Status</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <table class="sc-table">
        <thead><tr><th>Bowler</th><th>O</th><th>R</th><th>W</th><th>ECON</th></tr></thead>
        <tbody>${bowlRows}</tbody>
      </table>
    `;
    drawWagonWheel($("#wagonCanvas"), inn);
    drawAnalyticsChart($("#AnalyticsChartCanvas"), activeChartMode);
  }

  function bindEvents() {
    document.addEventListener("click", (e) => {
      const themePick = e.target.closest("[data-theme-pick], [data-theme-btn]");
      if (themePick) setTheme(themePick.dataset.themePick || themePick.dataset.themeBtn);

      const modeBtn = e.target.closest("[data-mode]");
      if (modeBtn) {
        state.settings.mode = modeBtn.dataset.mode;
        $$("[data-mode]").forEach((b) => {
          const sel = b === modeBtn;
          b.classList.toggle("is-selected", sel);
          b.setAttribute("aria-pressed", String(sel));
        });
        const diffGroup = $("#difficultyGroup");
        if (diffGroup) diffGroup.style.opacity = state.settings.mode === "local" ? "0.45" : "1";
        const tourneyBox = $("#tourneySetupBox");
        if (tourneyBox) tourneyBox.hidden = state.settings.mode !== "tournament";
        const teamRow = $("#quickMatchTeamsRow");
        if (teamRow) teamRow.hidden = state.settings.mode === "tournament";
      }

      const overPill = e.target.closest("[data-over-pill]");
      if (overPill) {
        updateOversUI(Number(overPill.dataset.overPill));
      }

      const pitchCard = e.target.closest("[data-pitch]");
      if (pitchCard) {
        state.settings.pitchChoice = pitchCard.dataset.pitch;
        $$("[data-pitch]").forEach((b) => b.classList.toggle("is-selected", b === pitchCard));
      }

      const diffBtn = e.target.closest("[data-difficulty]");
      if (diffBtn) {
        state.settings.difficulty = diffBtn.dataset.difficulty;
        $$("[data-difficulty]").forEach((b) => {
          const sel = b === diffBtn;
          b.classList.toggle("is-selected", sel);
          b.setAttribute("aria-pressed", String(sel));
        });
        const labels = { rookie: "ROOKIE / 630ms timer", pro: "PRO / 430ms timer", elite: "ELITE / 300ms fast timer" };
        $("#difficultyLabel").textContent = labels[state.settings.difficulty] || "PRO / 430ms timer";
      }

      const tossChoiceBtn = e.target.closest("[data-toss]");
      if (tossChoiceBtn) {
        state.tossCall = tossChoiceBtn.dataset.toss;
        $$("[data-toss]").forEach((b) => {
          const sel = b === tossChoiceBtn;
          b.classList.toggle("is-selected", sel);
          b.setAttribute("aria-pressed", String(sel));
        });
      }

      const presetBtn = e.target.closest("[data-field-preset]");
      if (presetBtn && !isHumanBattingTurn()) {
        const chosen = presetBtn.dataset.fieldPreset;
        if (chosen === "random") {
          const keys = Object.keys(FIELD_PRESETS);
          state.fieldPresetMode = pick(keys);
        } else {
          state.fieldPresetMode = chosen;
        }
        $$("[data-field-preset]").forEach((b) => b.classList.toggle("is-selected", b.dataset.fieldPreset === state.fieldPresetMode));
        renderMatchUI();
      }

      const bowlerCard = e.target.closest("[data-bowler-idx]");
      if (bowlerCard && !bowlerCard.disabled) {
        const inn = currentInnings();
        inn.currentBowlerIdx = Number(bowlerCard.dataset.bowlerIdx);
        inn.needsBowlerSelection = false;
        $("#bowlerModal").hidden = true;
        renderMatchUI();
      }

      const shotBtn = e.target.closest("[data-shot]");
      if (shotBtn) {
        state.selectedShot = shotBtn.dataset.shot;
        renderControlDeck();
      }

      const sectorBtn = e.target.closest("[data-sector-deg]");
      if (sectorBtn) {
        const deg = Number(sectorBtn.dataset.sectorDeg);
        state.shotAngle = (deg * Math.PI) / 180;
        renderControlDeck();
      }

      const delivBtn = e.target.closest("[data-delivery]");
      if (delivBtn) {
        state.selectedDelivery = delivBtn.dataset.delivery;
        renderControlDeck();
      }

      const scTabBtn = e.target.closest("[data-sc-tab]");
      if (scTabBtn) {
        scorecardInningsTab = Number(scTabBtn.dataset.scTab);
        renderScorecardModalContent();
      }

      const chartModeBtn = e.target.closest("[data-chart-mode]");
      if (chartModeBtn) {
        activeChartMode = chartModeBtn.dataset.chartMode;
        renderScorecardModalContent();
      }

      if (e.target.closest("#commitActionBtn")) handleActionCommit();
      if (e.target.closest("#openScorecardBtn") || e.target.closest("#resultScorecardBtn")) openScorecardModal();
      if (e.target.closest("#closeScorecardModal")) $("#scorecardModal").hidden = true;
      if (e.target.closest("#simOverBtn")) quickSimulateCurrentOver();
      if (e.target.closest("#startSuperOverBtn")) startSuperOverTieBreaker();
      if (e.target.closest("#playNextTourneyMatchBtn")) startNewMatch();
    });

    $("#soundToggle")?.addEventListener("click", () => {
      state.soundOn = !state.soundOn;
      $("#soundToggle").textContent = state.soundOn ? "🔊" : "🔇";
      if (state.soundOn) playTone(520, 0.05);
    });

    $("#fxToggle")?.addEventListener("click", (e) => {
      state.fxOn = !state.fxOn;
      e.currentTarget.classList.toggle("is-active", state.fxOn);
      e.currentTarget.textContent = `✨ FX: ${state.fxOn ? "ON" : "OFF"}`;
      if (!state.fxOn) $("#celebrationOverlay").hidden = true;
    });

    $("#toggleFieldLabels")?.addEventListener("click", (e) => {
      state.showFieldLabels = !state.showFieldLabels;
      e.currentTarget.classList.toggle("is-active", state.showFieldLabels);
      e.currentTarget.textContent = `LABELS: ${state.showFieldLabels ? "ON" : "OFF"}`;
    });

    $("#toggleCameraMode")?.addEventListener("click", (e) => {
      state.dynamicCamera = !state.dynamicCamera;
      e.currentTarget.classList.toggle("is-active", state.dynamicCamera);
      e.currentTarget.textContent = `CAM: ${state.dynamicCamera ? "DYNAMIC" : "STATIC"}`;
    });

    $("#toggleHawkEye")?.addEventListener("click", (e) => {
      state.showHawkEye = !state.showHawkEye;
      e.currentTarget.classList.toggle("is-active", state.showHawkEye);
      e.currentTarget.textContent = `HAWK-EYE: ${state.showHawkEye ? "ON" : "OFF"}`;
    });

    $("#skipAnimation")?.addEventListener("click", () => {
      if (state.actionLocked && state.animation.sim) {
        finishPlayAnimation();
      }
    });

    document.addEventListener("input", (e) => {
      if (e.target.id === "oversSlider") {
        updateOversUI(Number(e.target.value));
      } else if (e.target.id === "shotAngleRange") {
        const deg = Number(e.target.value);
        state.shotAngle = (deg * Math.PI) / 180;
        if ($("#shotAngleVal")) $("#shotAngleVal").textContent = `${deg}°`;
      } else if (e.target.id === "batPowerRange") {
        state.batPowerPct = Number(e.target.value);
        if ($("#batPowerVal")) $("#batPowerVal").textContent = `${state.batPowerPct}%`;
      } else if (e.target.id === "bowlLineRange") {
        state.bowlAimLine = Number(e.target.value) / 100;
        if ($("#bowlLineVal")) $("#bowlLineVal").textContent = formatBowlLineLabel(state.bowlAimLine);
      } else if (e.target.id === "bowlLengthRange") {
        state.bowlLengthOffset = Number(e.target.value) / 100;
        if ($("#bowlLengthVal")) $("#bowlLengthVal").textContent = formatBowlLengthLabel(state.bowlLengthOffset);
      } else if (e.target.id === "bowlEffortRange") {
        state.bowlEffortPct = Number(e.target.value);
        if ($("#bowlEffortVal")) $("#bowlEffortVal").textContent = `${state.bowlEffortPct}%`;
      }
    });

    // Interactive Drag on Stadium Canvas (Batter drags 360° Shot Cone; Bowler drags Pitch Drop Reticle!)
    const canvas = $("#pitchCanvas");
    let isDraggingCanvas = false;
    const updateCanvasAim = (ev) => {
      if (state.actionLocked) return;
      const rect = canvas.getBoundingClientRect();
      const clientX = ev.clientX ?? ev.touches?.[0]?.clientX;
      const clientY = ev.clientY ?? ev.touches?.[0]?.clientY;
      if (clientX == null || clientY == null) return;
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      if (isHumanBattingTurn()) {
        const strikerX = rect.width * 0.5;
        const strikerY = rect.height * 0.52 + rect.height * 0.42 * 0.34;
        state.shotAngle = Math.atan2(x - strikerX, -(y - strikerY));
        const deg = Math.round((state.shotAngle * 180) / Math.PI);
        const slider = $("#shotAngleRange");
        if (slider) slider.value = String(deg);
        if ($("#shotAngleVal")) $("#shotAngleVal").textContent = `${deg}°`;
      } else {
        const inn = currentInnings();
        const handSign = inn && getStriker(inn).hand === "LHB" ? -1 : 1;
        const cx = rect.width * 0.5;
        const cy = rect.height * 0.52;
        const rx = rect.width * 0.43;
        const ry = rect.height * 0.42;
        const rawLine = ((x - cx) / (rx * 0.072)) * handSign;
        state.bowlAimLine = clamp(rawLine, -1, 1);
        const lineSlider = $("#bowlLineRange");
        if (lineSlider) lineSlider.value = String(Math.round(state.bowlAimLine * 100));
        if ($("#bowlLineVal")) $("#bowlLineVal").textContent = formatBowlLineLabel(state.bowlAimLine);

        const ny = (y - cy) / ry;
        const frac = clamp((ny - -0.345) / (0.34 - -0.345), 0.32, 0.98);
        const arch = inn ? getBowlerArchetype(inn) : null;
        const dInfo = arch?.deliveries.find((d) => d.id === state.selectedDelivery) || arch?.deliveries[0];
        const baseFrac = dInfo ? dInfo.pitchFrac : 0.72;
        state.bowlLengthOffset = clamp(frac - baseFrac, -0.18, 0.18);
        const lenSlider = $("#bowlLengthRange");
        if (lenSlider) lenSlider.value = String(Math.round(state.bowlLengthOffset * 100));
        if ($("#bowlLengthVal")) $("#bowlLengthVal").textContent = formatBowlLengthLabel(state.bowlLengthOffset);
      }
    };

    canvas.addEventListener("pointerdown", (ev) => {
      isDraggingCanvas = true;
      updateCanvasAim(ev);
    });
    window.addEventListener("pointermove", (ev) => {
      if (isDraggingCanvas) updateCanvasAim(ev);
    });
    window.addEventListener("pointerup", () => {
      isDraggingCanvas = false;
    });

    $("#pushExtraRunBtn")?.addEventListener("click", () => {
      const sim = state.animation.sim;
      if (!sim || sim.pushedExtraRun) return;
      sim.pushedExtraRun = true;
      $("#runCallOverlay").hidden = true;
      const inn = currentInnings();
      const striker = getStriker(inn);

      const runOutChance = sim.divedCrease ? 0.28 : 0.46;
      sim.runsToRun += 1;
      sim.throwTarget = sim.runsToRun % 2 === 1 ? { nx: 0, ny: -0.34, end: "bowler" } : { nx: 0, ny: 0.34, end: "keeper" };

      if (Math.random() < runOutChance) {
        const completedRuns = Math.max(0, sim.runsToRun - 1);
        sim.outcome.kind = "wicket";
        sim.outcome.dismissalType = "runout";
        sim.outcome.bowlerCredited = false;
        sim.outcome.runs = completedRuns + (sim.isNoBall ? 1 : 0);
        sim.outcome.batRuns = completedRuns;
        sim.outcome.scorecardText = "run out";
        sim.outcome.display = completedRuns > 0 ? `W+${completedRuns}` : "W";
        sim.outcome.text = `RUN OUT! ${striker.name} pushes for a ${sim.runsToRun}nd run — direct hit shatters the stumps short of the crease!`;
      } else {
        sim.outcome.runs += 1;
        sim.outcome.batRuns = (sim.outcome.batRuns || 1) + 1;
        sim.outcome.display = sim.isNoBall ? `Nb+${sim.outcome.batRuns}` : String(sim.outcome.batRuns);
        sim.outcome.text = `Aggressive running! ${striker.name} sprints hard and beats the throw for ${sim.outcome.batRuns} runs!`;
      }
      if (!$("#outcomeBanner").hidden) {
        showOutcomeBannerFor(sim.outcome);
      }
    });

    $("#diveCreaseBtn")?.addEventListener("click", (e) => {
      if (state.animation.sim) {
        state.animation.sim.divedCrease = true;
        e.currentTarget.classList.add("is-armed");
        e.currentTarget.textContent = "⚡ DIVE ARMED!";
        playTone(660, 0.04);
      }
    });

    $("#startMatch")?.addEventListener("click", startNewMatch);
    $("#callToss")?.addEventListener("click", () => {
      const coin3d = $("#coin3d");
      const res = Math.random() > 0.5 ? "heads" : "tails";
      state.tossResultFace = res;
      playSoundEffect("coin_flip");
      if (coin3d) {
        // Spin 4 full rotations -> 0deg for HEADS, 180deg for TAILS
        const targetDeg = res === "heads" ? 1440 : 1620;
        coin3d.style.transform = `rotateY(${targetDeg}deg)`;
      }
      window.setTimeout(() => {
        state.tossWinner = res === state.tossCall ? 0 : 1;
        $("#tossControls").hidden = true;
        $("#tossResult").hidden = false;
        $("#tossResult").textContent = `${res.toUpperCase()} — ${state.settings.teams[state.tossWinner]} win the toss!`;
        if (state.tossWinner === 0 || state.settings.mode === "local") {
          $("#tossDecision").hidden = false;
        } else {
          const aiBatFirst = Math.random() > 0.45 ? 1 : 0;
          $("#tossResult").textContent += ` ${state.settings.teams[1]} elect to ${aiBatFirst === 1 ? "bat" : "bowl"} first.`;
          window.setTimeout(() => {
            state.battingFirst = aiBatFirst;
            beginInnings(0);
          }, 1050);
        }
      }, 950);
    });

    $$("[data-decision]").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.battingFirst = btn.dataset.decision === "bat" ? state.tossWinner : 1 - state.tossWinner;
        beginInnings(0);
      })
    );

    $("#startChase")?.addEventListener("click", () => beginInnings(1));
    $("#quitMatch")?.addEventListener("click", () => {
      clearPlayTimers();
      showScreen(state.settings.mode === "tournament" && state.tournament.active ? "tournament" : "setup");
    });
    $("#brandHome")?.addEventListener("click", () => {
      clearPlayTimers();
      showScreen("setup");
    });
    $("#rematchButton")?.addEventListener("click", () => {
      if (state.settings.mode === "tournament" && state.tournament.active) {
        renderTournamentHub();
        showScreen("tournament");
      } else {
        startNewMatch();
      }
    });
    $("#setupAgainButton")?.addEventListener("click", () => {
      state.tournament.active = false;
      showScreen("setup");
    });

    document.addEventListener("keydown", (e) => {
      if (state.screen !== "match") return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (state.actionLocked && state.animation.sim) {
          finishPlayAnimation();
        } else {
          handleActionCommit();
        }
      } else if (e.key >= "1" && e.key <= "6" && !state.actionLocked) {
        const idx = Number(e.key) - 1;
        if (isHumanBattingTurn() && SHOTS[idx]) {
          state.selectedShot = SHOTS[idx].id;
          renderControlDeck();
        } else if (!isHumanBattingTurn()) {
          const arch = getBowlerArchetype();
          if (arch.deliveries[idx]) {
            state.selectedDelivery = arch.deliveries[idx].id;
            renderControlDeck();
          }
        }
      } else if (e.key.toLowerCase() === "r" && !$("#runCallOverlay").hidden) {
        $("#pushExtraRunBtn").click();
      } else if (e.key.toLowerCase() === "d" && !$("#runCallOverlay").hidden) {
        $("#diveCreaseBtn").click();
      } else if (e.key.toLowerCase() === "s") {
        const modal = $("#scorecardModal");
        if (modal) {
          if (modal.hidden) openScorecardModal();
          else modal.hidden = true;
        }
      }
    });
  }

  bindEvents();
  renderHistoryPreview();
  showScreen("setup");
})(window);