const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const dayjs = require('dayjs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'store.json');

// Schedule/teams loader: attempts to read full 2025 data if available, otherwise falls back to Week 1 seed
const SCHEDULE_FILE = path.join(__dirname, 'data', 'schedule-2025.json');
let SCHEDULE = {
  1: [
    { home: 'Chiefs', away: 'Ravens', kickoff: '2025-09-07T17:00:00Z' },
    { home: 'Bills', away: 'Jets', kickoff: '2025-09-07T17:00:00Z' },
    { home: 'Cowboys', away: 'Giants', kickoff: '2025-09-07T20:25:00Z' },
    { home: '49ers', away: 'Seahawks', kickoff: '2025-09-08T00:20:00Z' }
  ]
};
let ALL_TEAMS = [
  '49ers','Bears','Bengals','Bills','Broncos','Browns','Buccaneers','Cardinals',
  'Chargers','Chiefs','Colts','Commanders','Cowboys','Dolphins','Eagles','Falcons',
  'Giants','Jaguars','Jets','Lions','Packers','Panthers','Patriots','Raiders',
  'Rams','Ravens','Saints','Seahawks','Steelers','Texans','Titans','Vikings'
];
(function loadSchedule() {
  const TXT_FILE = path.join(__dirname, 'data', 'schedule-2025.txt');
  try {
    const raw = fs.readFileSync(SCHEDULE_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (data && data.weeks && data.teams) {
      SCHEDULE = data.weeks;
      ALL_TEAMS = data.teams;
      console.log('Loaded 2025 schedule from', SCHEDULE_FILE);
      return;
    }
  } catch (e) {
    // try txt
  }
  try {
    const txt = fs.readFileSync(TXT_FILE, 'utf8');
    const lines = txt.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length > 1) {
      const header = lines[0].split(',').map(h => h.trim());
      const idx = (name) => header.indexOf(name);
      const iWeek = idx('week');
      const iTime = idx('game_time');
      const iPick = idx('teamPick');
      const iOpp = idx('teamOpponent');
      const iStatus = idx('status');
      const weeks = {};
      const teamsSet = new Set();
      const seen = new Set();
      const parseUSDateTime = (s) => {
        const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!m) return new Date(s);
        const month = parseInt(m[1], 10) - 1;
        const day = parseInt(m[2], 10);
        const year = parseInt(m[3], 10);
        let hour = parseInt(m[4], 10);
        const minute = parseInt(m[5], 10);
        const ampm = m[6].toUpperCase();
        if (ampm === 'PM' && hour !== 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0;
        return new Date(year, month, day, hour, minute, 0, 0);
      };
      for (let k = 1; k < lines.length; k++) {
        const parts = lines[k].split(',');
        if (parts.length < header.length) continue;
        const status = parts[iStatus]?.trim();
        // Only include Upcoming (ignore duplicates regardless of status)
        const weekNum = parseInt(parts[iWeek], 10);
        const teamA = parts[iPick]?.trim();
        const teamB = parts[iOpp]?.trim();
        const gameTime = parts[iTime]?.trim();
        if (!weekNum || !teamA || !teamB || !gameTime) continue;
        const key = `${weekNum}:${[teamA, teamB].sort().join(' vs ')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        teamsSet.add(teamA);
        teamsSet.add(teamB);
        weeks[weekNum] = weeks[weekNum] || [];
        const dt = parseUSDateTime(gameTime);
        weeks[weekNum].push({ home: teamA, away: teamB, kickoff: dt.toISOString() });
      }
      if (Object.keys(weeks).length > 0) {
        SCHEDULE = weeks;
        ALL_TEAMS = Array.from(teamsSet);
        console.log('Loaded 2025 schedule from', TXT_FILE);
      }
    }
  } catch (e) {
    console.log('Using built-in sample schedule. Provide data/schedule-2025.json or data/schedule-2025.txt to load full 2025 season.');
  }
})();

// Helpers to load/save data
function readStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { users: [], games: [], config: {} };
  }
}
function writeStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

// Config: admin week override (loaded at startup and updated on change)
let CURRENT_WEEK_OVERRIDE = null;
(function loadConfig() {
  const s = readStore();
  if (s && s.config && typeof s.config.currentWeekOverride !== 'undefined') {
    CURRENT_WEEK_OVERRIDE = s.config.currentWeekOverride;
  }
})();

// One-time migration: remove legacy admin account (old email)
(function migrateAdminAccount() {
  try {
    const OLD_ADMIN_EMAIL = 'albertisntreal@gmail.com';
    const store = readStore();
    if (store && Array.isArray(store.users)) {
      const before = store.users.length;
      const oldLower = OLD_ADMIN_EMAIL.toLowerCase();
      const hasOld = store.users.some(u => (u.email || '').toLowerCase() === oldLower);
      if (hasOld) {
        store.users = store.users.filter(u => (u.email || '').toLowerCase() !== oldLower);
        writeStore(store);
        console.log('Removed legacy admin account:', OLD_ADMIN_EMAIL);
      }
    }
  } catch (e) {
    // ignore
  }
})();

// Express setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
const expressLayouts = require('express-ejs-layouts');
app.use(expressLayouts);
app.set('layout', 'layout');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'showdown-secret',
  resave: false,
  saveUninitialized: false
}));

// Middleware to expose user to views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.isAdmin) return res.status(403).send('Forbidden');
  next();
}

// Utility: determine current week based on first kickoff per week, with admin override
function getCurrentWeek() {
  const weekNums = Object.keys(SCHEDULE).map(n => parseInt(n, 10)).sort((a,b)=>a-b);
  if (weekNums.length === 0) return 1;
  if (CURRENT_WEEK_OVERRIDE && weekNums.includes(Number(CURRENT_WEEK_OVERRIDE))) {
    return Number(CURRENT_WEEK_OVERRIDE);
  }
  const now = Date.now();
  for (let i = 0; i < weekNums.length; i++) {
    const w = weekNums[i];
    const games = SCHEDULE[w] || [];
    if (games.length === 0) continue;
    const firstKick = games.map(g => new Date(g.kickoff).getTime()).sort((a,b)=>a-b)[0];
    if (now < firstKick) {
      return w; // upcoming week
    }
  }
  return weekNums[weekNums.length - 1]; // default to last week
}
function isWeekLocked(week) {
  const games = SCHEDULE[week] || [];
  if (games.length === 0) return false;
  const firstKick = games.map(g => new Date(g.kickoff).getTime()).sort((a,b)=>a-b)[0];
  return Date.now() >= firstKick;
}

// Routes
app.get('/', (req, res) => {
  res.render('landing');
});

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/lobby');
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.render('login', { error: 'Please enter a valid email address.' });
  }
  const store = readStore();

  // Admin hardcoded: allow login with configured admin credentials
  const ADMIN_EMAIL = 'albertisntreal1180@gmail.com';
  const ADMIN_PASS = 'password';
  if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASS) {
    let adminUser = store.users.find(u => (u.email && u.email.toLowerCase()) === ADMIN_EMAIL.toLowerCase());
    if (!adminUser) {
      const salt = crypto.randomBytes(16);
      const hash = crypto.scryptSync(ADMIN_PASS, salt, 64);
      adminUser = {
        id: uuidv4(),
        email: ADMIN_EMAIL,
        displayName: 'Admin',
        avatarUrl: '',
        joinedGames: [],
        earnings: 0,
        isAdmin: true,
        passwordSalt: salt.toString('hex'),
        passwordHash: hash.toString('hex')
      };
      store.users.push(adminUser);
      if (!store.config) store.config = {};
      writeStore(store);
    }
    // ensure flag
    adminUser.isAdmin = true;
    writeStore(store);
    req.session.user = { id: adminUser.id, email: adminUser.email, displayName: adminUser.displayName || 'Admin', isAdmin: true };
    return res.redirect('/admin');
  }

  if (!password || password.length < 6) {
    return res.render('login', { error: 'Password must be at least 6 characters.' });
  }

  let user = store.users.find(u => (u.email && u.email.toLowerCase()) === email.toLowerCase());

  // Helpers for password hashing/verification
  const verifyPassword = (pw, saltHex, hashHex) => {
    try {
      const salt = Buffer.from(saltHex, 'hex');
      const derived = crypto.scryptSync(pw, salt, 64);
      const hash = Buffer.from(hashHex, 'hex');
      return crypto.timingSafeEqual(derived, hash);
    } catch (e) {
      return false;
    }
  };

  if (user) {
    if (!user.passwordHash || !user.passwordSalt) {
      return res.render('login', { error: 'This account needs to be upgraded. Please contact support.' });
    }
    if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return res.render('login', { error: 'Invalid email or password.' });
    }
    // Successful login
    req.session.user = { id: user.id, email: user.email, displayName: user.displayName, isAdmin: !!user.isAdmin };
    return res.redirect('/lobby');
  } else {
    // Register new user
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, 64);
    const newUser = {
      id: uuidv4(),
      email,
      displayName: displayName && displayName.trim() ? displayName.trim() : email.split('@')[0],
      avatarUrl: '',
      joinedGames: [],
      earnings: 0,
      passwordSalt: salt.toString('hex'),
      passwordHash: hash.toString('hex')
    };
    store.users.push(newUser);
    writeStore(store);
    req.session.user = { id: newUser.id, email: newUser.email, displayName: newUser.displayName, isAdmin: false };
    return res.redirect('/lobby');
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.get('/lobby', requireAuth, (req, res) => {
  const store = readStore();
  const games = store.games;
  res.render('lobby', { games });
});

// Admin panel routes
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  const store = readStore();
  const weekNums = Object.keys(SCHEDULE).map(n => parseInt(n, 10)).sort((a,b)=>a-b);
  const unusedGames = (store.games || []).filter(g => ((g.players || []).length <= 1) && (!g.picks || Object.keys(g.picks).length === 0));
  res.render('admin', {
    currentWeek: getCurrentWeek(),
    overrideWeek: CURRENT_WEEK_OVERRIDE,
    weeks: weekNums,
    unusedGames
  });
});

app.post('/admin/week', requireAuth, requireAdmin, (req, res) => {
  const { week } = req.body;
  const w = Number(week);
  const weekNums = Object.keys(SCHEDULE).map(n => parseInt(n, 10));
  if (!Number.isInteger(w) || !weekNums.includes(w)) {
    return res.status(400).send('Invalid week');
  }
  const store = readStore();
  if (!store.config) store.config = {};
  store.config.currentWeekOverride = w;
  CURRENT_WEEK_OVERRIDE = w;
  writeStore(store);
  res.redirect('/admin');
});

app.post('/admin/week/clear', requireAuth, requireAdmin, (req, res) => {
  const store = readStore();
  if (!store.config) store.config = {};
  store.config.currentWeekOverride = null;
  CURRENT_WEEK_OVERRIDE = null;
  writeStore(store);
  res.redirect('/admin');
});

app.post('/admin/games/:id/delete', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const store = readStore();
  const idx = store.games.findIndex(g => g.id === id);
  if (idx === -1) return res.status(404).send('Game not found');
  const game = store.games[idx];
  // Only delete if unused: <=1 player and no picks
  const unused = ((game.players || []).length <= 1) && (!game.picks || Object.keys(game.picks).length === 0);
  if (!unused) return res.status(400).send('Cannot delete an active game');
  store.games.splice(idx, 1);
  // Clean from users' joinedGames
  (store.users || []).forEach(u => {
    if (u.joinedGames) u.joinedGames = u.joinedGames.filter(gid => gid !== id);
  });
  writeStore(store);
  res.redirect('/admin');
});

app.post('/admin/games/cleanup', requireAuth, requireAdmin, (req, res) => {
  const store = readStore();
  const toDelete = new Set((store.games || []).filter(g => ((g.players || []).length <= 1) && (!g.picks || Object.keys(g.picks).length === 0)).map(g => g.id));
  store.games = (store.games || []).filter(g => !toDelete.has(g.id));
  (store.users || []).forEach(u => {
    if (u.joinedGames) u.joinedGames = u.joinedGames.filter(gid => !toDelete.has(gid));
  });
  writeStore(store);
  res.redirect('/admin');
});

app.post('/games', requireAuth, (req, res) => {
  const { name, entryFee, maxPlayers, visibility, joinKey } = req.body;
  const store = readStore();
  const creatorId = req.session.user.id;
  const game = {
    id: uuidv4(),
    name: name && name.trim() ? name.trim() : 'New Pool',
    creatorId,
    entryFee: Number(entryFee) || 0,
    maxPlayers: Number(maxPlayers) || 50,
    visibility: visibility === 'private' ? 'private' : 'public',
    joinKey: visibility === 'private' ? (joinKey || '') : '',
    players: [creatorId],
    picks: {}, // { userId: { weekNumber: teamName } }
    eliminated: [], // userIds
    winnerId: null,
    createdAt: new Date().toISOString()
  };
  // add to user's joinedGames
  store.games.push(game);
  const user = store.users.find(u => u.id === creatorId);
  if (user && !user.joinedGames.includes(game.id)) user.joinedGames.push(game.id);
  writeStore(store);
  res.redirect(`/games/${game.id}`);
});

app.post('/games/:id/join', requireAuth, (req, res) => {
  const { id } = req.params;
  const { key } = req.body;
  const store = readStore();
  const game = store.games.find(g => g.id === id);
  if (!game) return res.status(404).send('Game not found');
  if (game.players.includes(req.session.user.id)) return res.redirect(`/games/${id}`);
  if (game.players.length >= game.maxPlayers) return res.status(400).send('Game full');
  if (game.visibility === 'private' && game.joinKey !== key) {
    return res.status(403).send('Invalid join key');
  }
  game.players.push(req.session.user.id);
  const user = store.users.find(u => u.id === req.session.user.id);
  if (user && !user.joinedGames.includes(game.id)) user.joinedGames.push(game.id);
  writeStore(store);
  res.redirect(`/games/${id}`);
});

app.get('/games/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  // remember current game in session for header /game link
  req.session.currentGameId = id;
  const store = readStore();
  const game = store.games.find(g => g.id === id);
  if (!game) return res.status(404).send('Game not found');
  const week = getCurrentWeek();
  const schedule = SCHEDULE[week] || [];
  const userId = req.session.user.id;
  const userPicks = game.picks[userId] || {};
  const pickedTeamsAllWeeks = new Set(Object.values(userPicks));
  const weekLocked = isWeekLocked(week);

  // Build players roster with current-week pick and status
  const usersById = new Map((store.users || []).map(u => [u.id, u]));
  const playersDetailed = (game.players || []).map(uid => {
    const u = usersById.get(uid) || { id: uid, displayName: 'Unknown', email: '' };
    const pick = (game.picks && game.picks[uid] && game.picks[uid][week]) ? game.picks[uid][week] : null;
    const eliminated = (game.eliminated || []).includes(uid);
    return {
      id: uid,
      displayName: u.displayName || (u.email ? u.email.split('@')[0] : 'Player'),
      email: u.email || '',
      avatarUrl: u.avatarUrl || '',
      pick,
      eliminated
    };
  });
  const creator = usersById.get(game.creatorId) || null;

  res.render('game', {
    game,
    week,
    schedule,
    userPick: userPicks[week] || '',
    pickedTeamsAllWeeks: Array.from(pickedTeamsAllWeeks),
    weekLocked,
    pot: game.entryFee * game.players.length,
    playersDetailed,
    creator
  });
});

app.get('/games/:id/details', requireAuth, (req, res) => {
  const { id } = req.params;
  const store = readStore();
  const game = store.games.find(g => g.id === id);
  if (!game) return res.status(404).send('Game not found');
  const week = getCurrentWeek();
  const usersById = new Map((store.users || []).map(u => [u.id, u]));
  const playersDetailed = (game.players || []).map(uid => {
    const u = usersById.get(uid) || { id: uid, displayName: 'Unknown', email: '' };
    const pick = (game.picks && game.picks[uid] && game.picks[uid][week]) ? game.picks[uid][week] : null;
    const eliminated = (game.eliminated || []).includes(uid);
    return {
      id: uid,
      displayName: u.displayName || (u.email ? u.email.split('@')[0] : 'Player'),
      email: u.email || '',
      avatarUrl: u.avatarUrl || '',
      pick,
      eliminated
    };
  });
  const creator = usersById.get(game.creatorId) || null;
  res.render('game-details', {
    game,
    week,
    pot: game.entryFee * game.players.length,
    playersDetailed,
    creator
  });
});

app.get('/game', requireAuth, (req, res) => {
  const store = readStore();
  let gid = req.session.currentGameId;
  if (!gid) {
    const user = (store.users || []).find(u => u.id === req.session.user.id);
    const first = (user && Array.isArray(user.joinedGames) && user.joinedGames.length > 0) ? user.joinedGames[0] : null;
    gid = first;
  }
  const exists = gid && (store.games || []).some(g => g.id === gid);
  if (!exists) return res.redirect('/lobby');
  return res.redirect(`/games/${gid}/details`);
});

app.post('/games/:id/pick', requireAuth, (req, res) => {
  const { id } = req.params;
  const { team } = req.body;
  const store = readStore();
  const game = store.games.find(g => g.id === id);
  if (!game) return res.status(404).send('Game not found');
  const week = getCurrentWeek();
  if (isWeekLocked(week)) return res.status(400).send('Picks are locked for this week.');
  if (!ALL_TEAMS.includes(team)) return res.status(400).send('Invalid team');
  const userId = req.session.user.id;
  const picks = game.picks[userId] || {};
  // Enforce unique team across season
  const previouslyUsed = Object.values(picks);
  if (previouslyUsed.includes(team)) {
    return res.status(400).send('You already used this team this season.');
  }
  picks[week] = team;
  game.picks[userId] = picks;
  writeStore(store);
  res.redirect(`/games/${id}/details`);
});

app.get('/profile', requireAuth, (req, res) => {
  const store = readStore();
  const user = store.users.find(u => u.id === req.session.user.id);
  const games = store.games.filter(g => g.players.includes(user.id));
  res.render('profile', { user, games });
});

app.post('/profile', requireAuth, (req, res) => {
  const { displayName, avatarUrl } = req.body;
  const store = readStore();
  const user = store.users.find(u => u.id === req.session.user.id);
  if (user) {
    if (displayName && displayName.trim()) user.displayName = displayName.trim();
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
    writeStore(store);
  }
  res.redirect('/profile');
});

app.listen(PORT, () => {
  console.log(`Showdown server listening on http://localhost:${PORT}`);
});
