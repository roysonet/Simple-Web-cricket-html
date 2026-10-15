(function (root) {
  const NLC = (root.NLC = root.NLC || {});

  NLC.PITCH_TYPES = {
    green: {
      id: "green",
      name: "Green Seamer",
      badge: "🌿 GREEN SEAMER",
      desc: "+35% Seam & Swing, lively pace bounce",
      swingMult: 1.35,
      seamMult: 1.35,
      spinMult: 0.90,
      bounceMult: 1.14,
      batPowerMult: 0.96,
      outfieldSpeed: 1.0,
      clayColor: "#bfa574"
    },
    dusty: {
      id: "dusty",
      name: "Dusty Turner",
      badge: "🏜️ DUSTY TURNER",
      desc: "+45% Sharp Spin Turn, gripping surface",
      swingMult: 0.92,
      seamMult: 1.10,
      spinMult: 1.45,
      bounceMult: 0.92,
      batPowerMult: 0.95,
      outfieldSpeed: 1.0,
      clayColor: "#c99e67"
    },
    flat: {
      id: "flat",
      name: "Flat Batting Deck",
      badge: "🔥 FLAT BELTER",
      desc: "+10% Exit Speed & Carry, true bounce",
      swingMult: 0.85,
      seamMult: 0.85,
      spinMult: 0.88,
      bounceMult: 1.04,
      batPowerMult: 1.10,
      outfieldSpeed: 1.08,
      clayColor: "#dfc28f"
    },
    slow: {
      id: "slow",
      name: "Slow Dry Track",
      badge: "🐢 SLOW TRACK",
      desc: "Low bounce, cutters grip, harder sixes",
      swingMult: 0.95,
      seamMult: 1.25,
      spinMult: 1.22,
      bounceMult: 0.82,
      batPowerMult: 0.91,
      outfieldSpeed: 0.94,
      clayColor: "#b59263"
    },
    dew: {
      id: "dew",
      name: "Dewy Night Turf",
      badge: "💧 DEWY OUTFIELD",
      desc: "Skiddy ball, +12% fast turf boundaries",
      swingMult: 1.08,
      seamMult: 0.90,
      spinMult: 0.78,
      bounceMult: 1.02,
      batPowerMult: 1.06,
      outfieldSpeed: 1.14,
      clayColor: "#cfa972"
    }
  };

  NLC.BOWLER_ARCHETYPES = {
    pace: {
      id: "pace",
      name: "Express Pace",
      short: "FAST",
      keeperUp: false,
      speedRange: [138, 155],
      deliveries: [
        { id: "stock_seam", label: "Hard Seam", note: "146 km/h good length", key: "1", speed: [142, 150], pitchFrac: 0.68, swing: 0.0, seam: 0.010, bounce: 7.6 },
        { id: "inswing", label: "Inswinger", note: "144 km/h shapes in", key: "2", speed: [140, 148], pitchFrac: 0.76, swing: -0.032, seam: -0.014, bounce: 6.5 },
        { id: "outswing", label: "Outswinger", note: "143 km/h shapes away", key: "3", speed: [139, 147], pitchFrac: 0.75, swing: 0.034, seam: 0.015, bounce: 6.8 },
        { id: "yorker", label: "Toe-Crusher", note: "149 km/h blockhole", key: "4", speed: [144, 153], pitchFrac: 0.93, swing: -0.016, seam: 0.0, bounce: 1.8 },
        { id: "bouncer", label: "Short Bouncer", note: "150 km/h throat high", key: "5", speed: [145, 154], pitchFrac: 0.44, swing: 0.0, seam: 0.008, bounce: 15.4 },
        { id: "slower_cutter", label: "Off-Pace Cutter", note: "124 km/h deceptive dip", key: "6", speed: [120, 128], pitchFrac: 0.71, swing: 0.0, seam: -0.024, bounce: 5.8 }
      ]
    },
    swing: {
      id: "swing",
      name: "Swing & Seam",
      short: "MED-FAST",
      keeperUp: false,
      speedRange: [124, 140],
      deliveries: [
        { id: "outswing", label: "Big Outswinger", note: "134 km/h hooping away", key: "1", speed: [130, 137], pitchFrac: 0.78, swing: 0.044, seam: 0.018, bounce: 6.5 },
        { id: "inswing", label: "Late Inswinger", note: "135 km/h attacks pads", key: "2", speed: [131, 138], pitchFrac: 0.79, swing: -0.040, seam: -0.016, bounce: 6.2 },
        { id: "off_cutter", label: "Off-Cutter", note: "123 km/h grips & cuts in", key: "3", speed: [119, 126], pitchFrac: 0.67, swing: 0.0, seam: -0.026, bounce: 6.0 },
        { id: "slower_bouncer", label: "Slower Bouncer", note: "117 km/h sits up", key: "4", speed: [113, 121], pitchFrac: 0.48, swing: 0.0, seam: 0.010, bounce: 13.0 },
        { id: "wide_yorker", label: "Wide Yorker", note: "133 km/h outside off", key: "5", speed: [129, 136], pitchFrac: 0.92, swing: 0.024, seam: 0.0, bounce: 2.0 },
        { id: "wobble_seam", label: "Wobble Seam", note: "135 km/h nip & seam", key: "6", speed: [132, 138], pitchFrac: 0.72, swing: 0.008, seam: -0.022, bounce: 7.2 }
      ]
    },
    legspin: {
      id: "legspin",
      name: "Wrist Spin (Leggie)",
      short: "LEG-SPIN",
      keeperUp: true,
      speedRange: [78, 96],
      deliveries: [
        { id: "leg_break", label: "Leg Break", note: "86 km/h sharp rip away", key: "1", speed: [82, 89], pitchFrac: 0.74, swing: -0.012, seam: 0.040, bounce: 8.2 },
        { id: "googly", label: "Googly (Wrong'un)", note: "87 km/h spins into pads", key: "2", speed: [84, 90], pitchFrac: 0.75, swing: 0.010, seam: -0.036, bounce: 7.8 },
        { id: "top_spinner", label: "Top-Spinner", note: "88 km/h dips & kicks", key: "3", speed: [85, 91], pitchFrac: 0.72, swing: 0.0, seam: 0.005, bounce: 11.2 },
        { id: "flipper", label: "Flipper", note: "93 km/h skids low", key: "4", speed: [90, 96], pitchFrac: 0.80, swing: 0.0, seam: 0.008, bounce: 3.2 },
        { id: "flighted", label: "Loopy Flight", note: "79 km/h tempts charge", key: "5", speed: [76, 83], pitchFrac: 0.78, swing: -0.018, seam: 0.046, bounce: 9.0 },
        { id: "slider", label: "Slider", note: "91 km/h skids on middle", key: "6", speed: [88, 94], pitchFrac: 0.76, swing: 0.0, seam: -0.012, bounce: 5.2 }
      ]
    },
    offspin: {
      id: "offspin",
      name: "Finger Spin (Offie)",
      short: "OFF-SPIN",
      keeperUp: true,
      speedRange: [82, 102],
      deliveries: [
        { id: "off_break", label: "Off Break", note: "89 km/h grips & turns in", key: "1", speed: [86, 92], pitchFrac: 0.74, swing: 0.010, seam: -0.034, bounce: 7.5 },
        { id: "carrom", label: "Carrom / Doosra", note: "90 km/h flicks away", key: "2", speed: [87, 93], pitchFrac: 0.73, swing: -0.008, seam: 0.032, bounce: 7.4 },
        { id: "arm_ball", label: "Arm Ball", note: "95 km/h skids with arm", key: "3", speed: [92, 98], pitchFrac: 0.77, swing: -0.015, seam: 0.0, bounce: 5.5 },
        { id: "quicker_dart", label: "Flat Dart", note: "99 km/h cramps room", key: "4", speed: [96, 102], pitchFrac: 0.84, swing: 0.0, seam: -0.010, bounce: 4.2 },
        { id: "tossed_up", label: "Flighted Dip", note: "83 km/h classic loop", key: "5", speed: [80, 86], pitchFrac: 0.79, swing: 0.015, seam: -0.038, bounce: 8.8 },
        { id: "undercutter", label: "Undercutter", note: "92 km/h stays low", key: "6", speed: [89, 95], pitchFrac: 0.75, swing: 0.0, seam: -0.014, bounce: 4.5 }
      ]
    }
  };

  NLC.SHOTS = [
    { id: "defend", label: "Defend / Block", note: "Dead bat, soft hands", key: "1", foot: "front", elevation: "ground", powerMult: 0.42, sixCapable: false, risk: 0.006, idealLength: [0.58, 0.92] },
    { id: "drive", label: "Crisp Drive", note: "Classical cover/straight", key: "2", foot: "front", elevation: "dynamic", powerMult: 0.94, sixCapable: true, risk: 0.032, idealLength: [0.66, 0.95] },
    { id: "cut_pull", label: "Cut / Pull / Hook", note: "Crushes short balls", key: "3", foot: "back", elevation: "dynamic", powerMult: 1.02, sixCapable: true, risk: 0.048, idealLength: [0.36, 0.68] },
    { id: "sweep", label: "Sweep / Flick", note: "Whips spin & leg line", key: "4", foot: "front", elevation: "dynamic", powerMult: 0.96, sixCapable: true, risk: 0.052, idealLength: [0.62, 0.90] },
    { id: "loft", label: "Power Loft", note: "High launch into stands", key: "5", foot: "front", elevation: "aerial", powerMult: 1.12, sixCapable: true, risk: 0.082, idealLength: [0.55, 0.88] },
    { id: "charge", label: "Advance & Slog", note: "Charge down track!", key: "6", foot: "advance", elevation: "aerial", powerMult: 1.22, sixCapable: true, risk: 0.115, idealLength: [0.58, 0.86] }
  ];

  NLC.SECTOR_PRESETS = [
    { label: "FINE LEG", deg: -135 },
    { label: "SQ LEG", deg: -85 },
    { label: "MID-WKT", deg: -42 },
    { label: "STRAIGHT V", deg: 0 },
    { label: "COVER", deg: 45 },
    { label: "POINT", deg: 88 },
    { label: "3RD MAN", deg: 135 }
  ];

  NLC.FRANCHISE_TEAMS = [
    {
      name: "Harbor Hawks",
      code: "HH",
      color: "#a3e635",
      roster: [
        { name: "R. Sharma", hand: "RHB", bowlType: null },
        { name: "T. Head", hand: "LHB", bowlType: "offspin" },
        { name: "V. Kohli", hand: "RHB", bowlType: null },
        { name: "N. Pooran", hand: "LHB", bowlType: null },
        { name: "H. Klaasen", hand: "RHB", bowlType: null },
        { name: "R. Jadeja", hand: "LHB", bowlType: "offspin" },
        { name: "H. Pandya", hand: "RHB", bowlType: "swing" },
        { name: "R. Khan", hand: "RHB", bowlType: "legspin" },
        { name: "M. Starc", hand: "LHB", bowlType: "pace" },
        { name: "J. Bumrah", hand: "RHB", bowlType: "pace" },
        { name: "T. Boult", hand: "LHB", bowlType: "swing" }
      ]
    },
    {
      name: "Metro Foxes",
      code: "MF",
      color: "#f97316",
      roster: [
        { name: "D. Warner", hand: "LHB", bowlType: null },
        { name: "J. Buttler", hand: "RHB", bowlType: null },
        { name: "S. Yadav", hand: "RHB", bowlType: null },
        { name: "S. Dube", hand: "LHB", bowlType: "swing" },
        { name: "G. Maxwell", hand: "RHB", bowlType: "offspin" },
        { name: "A. Patel", hand: "LHB", bowlType: "offspin" },
        { name: "S. Curran", hand: "LHB", bowlType: "swing" },
        { name: "A. Zampa", hand: "RHB", bowlType: "legspin" },
        { name: "K. Rabada", hand: "LHB", bowlType: "pace" },
        { name: "J. Archer", hand: "RHB", bowlType: "pace" },
        { name: "K. Yadav", hand: "LHB", bowlType: "legspin" }
      ]
    },
    {
      name: "Royal Titans",
      code: "RT",
      color: "#38bdf8",
      roster: [
        { name: "S. Gill", hand: "RHB", bowlType: null },
        { name: "Y. Jaiswal", hand: "LHB", bowlType: "legspin" },
        { name: "K. Williamson", hand: "RHB", bowlType: null },
        { name: "D. Miller", hand: "LHB", bowlType: null },
        { name: "A. Russell", hand: "RHB", bowlType: "pace" },
        { name: "M. Nabi", hand: "RHB", bowlType: "offspin" },
        { name: "P. Cummins", hand: "RHB", bowlType: "pace" },
        { name: "S. Narine", hand: "LHB", bowlType: "offspin" },
        { name: "M. Shami", hand: "RHB", bowlType: "swing" },
        { name: "N. Ahmad", hand: "LHB", bowlType: "legspin" },
        { name: "L. Ferguson", hand: "RHB", bowlType: "pace" }
      ]
    },
    {
      name: "Apex Strikers",
      code: "AS",
      color: "#c084fc",
      roster: [
        { name: "P. Salt", hand: "RHB", bowlType: null },
        { name: "Q. de Kock", hand: "LHB", bowlType: null },
        { name: "S. Iyer", hand: "RHB", bowlType: null },
        { name: "R. Pant", hand: "LHB", bowlType: null },
        { name: "L. Livingstone", hand: "RHB", bowlType: "legspin" },
        { name: "M. Stoinis", hand: "RHB", bowlType: "swing" },
        { name: "W. Hasaranga", hand: "RHB", bowlType: "legspin" },
        { name: "M. Santner", hand: "LHB", bowlType: "offspin" },
        { name: "A. Nortje", hand: "RHB", bowlType: "pace" },
        { name: "A. Singh", hand: "LHB", bowlType: "swing" },
        { name: "H. Rauf", hand: "RHB", bowlType: "pace" }
      ]
    },
    {
      name: "Coastal Kings",
      code: "CK",
      color: "#facc15",
      roster: [
        { name: "R. Gaikwad", hand: "RHB", bowlType: null },
        { name: "D. Conway", hand: "LHB", bowlType: null },
        { name: "D. Mitchell", hand: "RHB", bowlType: "swing" },
        { name: "M. Ali", hand: "LHB", bowlType: "offspin" },
        { name: "R. Singh", hand: "LHB", bowlType: null },
        { name: "R. Shepherd", hand: "RHB", bowlType: "pace" },
        { name: "M. Theekshana", hand: "RHB", bowlType: "offspin" },
        { name: "Y. Chahal", hand: "RHB", bowlType: "legspin" },
        { name: "M. Pathirana", hand: "RHB", bowlType: "pace" },
        { name: "D. Chahar", hand: "RHB", bowlType: "swing" },
        { name: "M. Rahman", hand: "LHB", bowlType: "swing" }
      ]
    },
    {
      name: "Thunder Bolts",
      code: "TB",
      color: "#f43f5e",
      roster: [
        { name: "B. Azam", hand: "RHB", bowlType: null },
        { name: "F. Zaman", hand: "LHB", bowlType: null },
        { name: "H. Brook", hand: "RHB", bowlType: null },
        { name: "T. Stubbs", hand: "RHB", bowlType: "offspin" },
        { name: "S. Khan", hand: "RHB", bowlType: "legspin" },
        { name: "C. Green", hand: "RHB", bowlType: "pace" },
        { name: "M. Jansen", hand: "LHB", bowlType: "swing" },
        { name: "S. Afridi", hand: "LHB", bowlType: "swing" },
        { name: "N. Shah", hand: "RHB", bowlType: "pace" },
        { name: "A. Maharaj", hand: "LHB", bowlType: "offspin" },
        { name: "M. Wood", hand: "RHB", bowlType: "pace" }
      ]
    }
  ];

  NLC.DEFAULT_ROSTERS = NLC.FRANCHISE_TEAMS.map((t) => t.roster);

  NLC.FIELD_PRESETS = {
    powerplay: {
      id: "powerplay",
      name: "POWERPLAY",
      badge: "FIELD: POWERPLAY (2 OUT)",
      outsideCount: 2,
      fielders: [
        { id: "f1", role: "1st Slip", nx: 0.09, ny: 0.49, ring: "slip" },
        { id: "f2", role: "Gully", nx: 0.19, ny: 0.40, ring: "inner" },
        { id: "f3", role: "Point", nx: 0.40, ny: 0.22, ring: "inner" },
        { id: "f4", role: "Cover", nx: 0.41, ny: 0.01, ring: "inner" },
        { id: "f5", role: "Mid-Off", nx: 0.21, ny: -0.36, ring: "inner" },
        { id: "f6", role: "Mid-On", nx: -0.21, ny: -0.36, ring: "inner" },
        { id: "f7", role: "Mid-Wicket", nx: -0.39, ny: 0.06, ring: "inner" },
        { id: "f8", role: "Third Man", nx: 0.62, ny: 0.66, ring: "outer" },
        { id: "f9", role: "Deep Square", nx: -0.86, ny: 0.24, ring: "outer" }
      ]
    },
    attacking: {
      id: "attacking",
      name: "ATTACKING",
      badge: "FIELD: ATTACKING (1 OUT)",
      outsideCount: 1,
      fielders: [
        { id: "f1", role: "1st Slip", nx: 0.10, ny: 0.48, ring: "slip" },
        { id: "f2", role: "2nd Slip", nx: 0.18, ny: 0.44, ring: "slip" },
        { id: "f3", role: "Gully", nx: 0.26, ny: 0.36, ring: "inner" },
        { id: "f4", role: "Point", nx: 0.39, ny: 0.21, ring: "inner" },
        { id: "f5", role: "Extra Cover", nx: 0.39, ny: -0.03, ring: "inner" },
        { id: "f6", role: "Mid-Off", nx: 0.19, ny: -0.34, ring: "inner" },
        { id: "f7", role: "Short Leg", nx: -0.11, ny: 0.28, ring: "close" },
        { id: "f8", role: "Mid-Wicket", nx: -0.37, ny: 0.07, ring: "inner" },
        { id: "f9", role: "Fine Leg", nx: -0.58, ny: 0.70, ring: "outer" }
      ]
    },
    balanced: {
      id: "balanced",
      name: "BALANCED",
      badge: "FIELD: BALANCED (4 OUT)",
      outsideCount: 4,
      fielders: [
        { id: "f1", role: "Short Third", nx: 0.25, ny: 0.41, ring: "inner" },
        { id: "f2", role: "Point", nx: 0.42, ny: 0.20, ring: "inner" },
        { id: "f3", role: "Extra Cover", nx: 0.41, ny: -0.04, ring: "inner" },
        { id: "f4", role: "Mid-Off", nx: 0.21, ny: -0.37, ring: "inner" },
        { id: "f5", role: "Mid-Wicket", nx: -0.39, ny: 0.08, ring: "inner" },
        { id: "f6", role: "Deep Cover", nx: 0.85, ny: 0.24, ring: "outer" },
        { id: "f7", role: "Long-On", nx: -0.36, ny: -0.83, ring: "outer" },
        { id: "f8", role: "Deep Mid-Wkt", nx: -0.83, ny: -0.28, ring: "outer" },
        { id: "f9", role: "Fine Leg", nx: -0.58, ny: 0.71, ring: "outer" }
      ]
    },
    spin: {
      id: "spin",
      name: "SPIN TRAP",
      badge: "FIELD: SPIN TRAP (WK UP)",
      outsideCount: 3,
      fielders: [
        { id: "f1", role: "1st Slip", nx: 0.11, ny: 0.44, ring: "slip" },
        { id: "f2", role: "Silly Point", nx: 0.14, ny: 0.25, ring: "close" },
        { id: "f3", role: "Backward Pt", nx: 0.39, ny: 0.26, ring: "inner" },
        { id: "f4", role: "Cover", nx: 0.39, ny: 0.02, ring: "inner" },
        { id: "f5", role: "Mid-Off", nx: 0.22, ny: -0.35, ring: "inner" },
        { id: "f6", role: "Short Fine", nx: -0.27, ny: 0.39, ring: "inner" },
        { id: "f7", role: "Deep Cover", nx: 0.81, ny: -0.34, ring: "outer" },
        { id: "f8", role: "Long-On", nx: -0.35, ny: -0.84, ring: "outer" },
        { id: "f9", role: "Deep Mid-Wkt", nx: -0.85, ny: -0.22, ring: "outer" }
      ]
    },
    death: {
      id: "death",
      name: "DEATH ROPE",
      badge: "FIELD: DEATH DEFENSE (5 OUT)",
      outsideCount: 5,
      fielders: [
        { id: "f1", role: "Point", nx: 0.41, ny: 0.22, ring: "inner" },
        { id: "f2", role: "Cover", nx: 0.40, ny: -0.02, ring: "inner" },
        { id: "f3", role: "Mid-Off", nx: 0.21, ny: -0.36, ring: "inner" },
        { id: "f4", role: "Mid-Wicket", nx: -0.38, ny: 0.09, ring: "inner" },
        { id: "f5", role: "Third Man", nx: 0.62, ny: 0.67, ring: "outer" },
        { id: "f6", role: "Deep Cover", nx: 0.88, ny: 0.14, ring: "outer" },
        { id: "f7", role: "Long-Off", nx: 0.38, ny: -0.83, ring: "outer" },
        { id: "f8", role: "Long-On", nx: -0.38, ny: -0.83, ring: "outer" },
        { id: "f9", role: "Deep Square", nx: -0.87, ny: 0.24, ring: "outer" }
      ]
    }
  };
})(window);