const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const dayjs = require('dayjs');
const { v4: uuidv4 } = require('uuid');
const webpush = require('web-push');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'store.json');

// VAPID Configuration - Use environment variables for production
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BIZtF2mee3R8Rpr8aj4NNiuEnOXn5rDONEeXMGy61p0KZTWOh_744al-_ic_WFX4Df9CMArs9jVXk_4zDweBX4w';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '_N5P1hlXlZfXbJ7LQIJi37inct8us-krPjBzg_0YlUQ';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'albertisntreal1180@gmail.com';

webpush.setVapidDetails(
    `mailto:${VAPID_EMAIL}`,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

// Import the enhanced schedule loader
const {
    loadEnhancedSchedule,
    getTeamInfo,
    getGamesByWeek,
    getAllWeeks,
    formatGameTime,
    TEAM_INFO
} = require('./enhanced-schedule-loader');

// Load enhanced schedule data
console.log('🔍 Loading schedule data...');
const scheduleData = loadEnhancedSchedule();
const SCHEDULE = scheduleData.schedule;
const ALL_TEAMS = scheduleData.teams;

// DEBUG LOGGING FOR SCHEDULE
console.log('\n=== SCHEDULE DEBUG INFO ===');
console.log('scheduleData type:', typeof scheduleData);
console.log('scheduleData keys:', scheduleData ? Object.keys(scheduleData) : 'null/undefined');
console.log('SCHEDULE type:', typeof SCHEDULE);
console.log('SCHEDULE is null/undefined:', SCHEDULE == null);

if (SCHEDULE) {
    console.log('SCHEDULE keys:', Object.keys(SCHEDULE));
    console.log('First few weeks:', Object.keys(SCHEDULE).slice(0, 5));

    // Test first week
    const firstWeek = Object.keys(SCHEDULE)[0];
    if (firstWeek) {
        console.log(`Week ${firstWeek} games count:`, SCHEDULE[firstWeek]?.length || 0);
        if (SCHEDULE[firstWeek] && SCHEDULE[firstWeek][0]) {
            console.log('Sample game:', SCHEDULE[firstWeek][0]);
        }
    }
} else {
    console.log('❌ SCHEDULE is null/undefined - this is the problem!');
}

console.log('ALL_TEAMS type:', typeof ALL_TEAMS);
console.log('ALL_TEAMS length:', ALL_TEAMS ? ALL_TEAMS.length : 'null/undefined');
console.log('========================\n');

console.log(`📅 Loaded schedule for ${Object.keys(SCHEDULE || {}).length} weeks with ${(ALL_TEAMS || []).length} teams`);

// Helpers to load/save data
function readStore() {
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        // Try to copy from template
        try {
            const template = fs.readFileSync(path.join(__dirname, 'data', 'store-template.json'), 'utf8');
            const initialData = JSON.parse(template);
            writeStore(initialData);
            return initialData;
        } catch (e2) {
            // Fall back to empty structure
            return { users: [], games: [], config: {}, gameResults: {} };
        }
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
app.use(bodyParser.json()); // Added for PWA API endpoints

// Trust proxy for Render/Heroku-style deployments so secure cookies work behind TLS terminators
app.set('trust proxy', 1);

// Session configuration (prod-safe)
app.use(session({
    secret: process.env.SESSION_SECRET || 'showdown-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true
    }
}));

// Enhanced middleware to expose user and helper functions to views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.req = req;

    // Expose helper functions to all templates
    res.locals.getTeamInfo = getTeamInfo;
    res.locals.formatGameTime = formatGameTime;
    res.locals.TEAM_INFO = TEAM_INFO;

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

// Push Notification Helper Functions
function sendPushNotification(userId, message, options = {}) {
    const store = readStore();
    const user = store.users.find(u => u.id === userId);

    if (user && user.pushSubscription) {
        const payload = JSON.stringify({
            title: options.title || 'Showdown Survivor',
            body: message,
            icon: '/images/icon-192.png',
            badge: '/images/badge-72.png',
            url: options.url || '/',
            data: {
                userId: userId,
                timestamp: Date.now(),
                ...options.data
            }
        });

        webpush.sendNotification(user.pushSubscription, payload)
            .then(() => {
                console.log(`✅ Notification sent to ${user.displayName}: ${message}`);
            })
            .catch(err => {
                console.error(`❌ Push notification failed for ${user.displayName}:`, err);

                // If subscription is invalid, remove it
                if (err.statusCode === 410) {
                    console.log(`🗑️ Removing invalid subscription for ${user.displayName}`);
                    delete user.pushSubscription;
                    writeStore(store);
                }
            });
    } else {
        console.log(`📵 No push subscription for user ${userId}`);
    }
}

function notifyGamePlayers(gameId, message, options = {}) {
    const store = readStore();
    const game = store.games.find(g => g.id === gameId);

    if (game) {
        game.players.forEach(playerId => {
            sendPushNotification(playerId, message, {
                ...options,
                url: `/games/${gameId}`
            });
        });
    }
}

function sendPickReminders() {
    const store = readStore();
    const currentWeek = getCurrentWeek();
    const weekLocked = isWeekLocked(currentWeek);

    if (!weekLocked) {
        store.games.forEach(game => {
            const playersWithoutPicks = game.players.filter(playerId => {
                const picks = game.picks[playerId] || {};
                return !picks[currentWeek] && !game.eliminated.includes(playerId);
            });

            playersWithoutPicks.forEach(playerId => {
                sendPushNotification(playerId, `⏰ Don't forget to make your Week ${currentWeek} pick!`, {
                    title: `${game.name} - Pick Reminder`,
                    url: `/games/${game.id}`
                });
            });
        });
    }
}

// Enhanced utility functions
function getCurrentWeek() {
    console.log('🔍 getCurrentWeek() called');
    try {
        if (!SCHEDULE || typeof SCHEDULE !== 'object') {
            console.error('❌ SCHEDULE not available in getCurrentWeek, type:', typeof SCHEDULE);
            return 1;
        }

        const weekNums = getAllWeeks(SCHEDULE);
        console.log('📅 Available weeks:', weekNums.length);

        if (weekNums.length === 0) {
            console.warn('⚠️ No weeks found in schedule');
            return 1;
        }

        if (CURRENT_WEEK_OVERRIDE && weekNums.includes(Number(CURRENT_WEEK_OVERRIDE))) {
            console.log('🔧 Using admin week override:', CURRENT_WEEK_OVERRIDE);
            return Number(CURRENT_WEEK_OVERRIDE);
        }

        const now = Date.now();
        for (let i = 0; i < weekNums.length; i++) {
            const w = weekNums[i];
            const games = getGamesByWeek(SCHEDULE, w);
            if (games.length === 0) continue;

            try {
                const kickoffTimes = games.map(g => {
                    const date = new Date(g.kickoff);
                    if (isNaN(date.getTime())) {
                        console.warn('Invalid date in game:', g);
                        return Date.now();
                    }
                    return date.getTime();
                });

                const firstKick = Math.min(...kickoffTimes);
                if (now < firstKick) {
                    console.log(`✅ Current week determined: ${w}`);
                    return w;
                }
            } catch (dateError) {
                console.error('Date parsing error in week', w, ':', dateError);
                continue;
            }
        }
        const lastWeek = weekNums[weekNums.length - 1];
        console.log(`📅 Defaulting to last week: ${lastWeek}`);
        return lastWeek;
    } catch (error) {
        console.error('❌ Error in getCurrentWeek:', error);
        return 1;
    }
}

function isWeekLocked(week) {
    try {
        if (!SCHEDULE || typeof SCHEDULE !== 'object') {
            console.warn('⚠️ SCHEDULE not available in isWeekLocked');
            return false;
        }

        const games = getGamesByWeek(SCHEDULE, week);
        if (games.length === 0) return false;

        const kickoffTimes = games.map(g => {
            try {
                const date = new Date(g.kickoff);
                if (isNaN(date.getTime())) {
                    console.warn('Invalid date in isWeekLocked:', g.kickoff);
                    return Date.now();
                }
                return date.getTime();
            } catch (error) {
                console.error('Date parsing error in isWeekLocked:', error);
                return Date.now();
            }
        });

        const firstKick = Math.min(...kickoffTimes);
        return Date.now() >= firstKick;
    } catch (error) {
        console.error('❌ Error in isWeekLocked:', error);
        return false;
    }
}

function getUpcomingGames(limit = 5) {
    console.log('🔍 getUpcomingGames() called with limit:', limit);
    try {
        if (!SCHEDULE || typeof SCHEDULE !== 'object') {
            console.error('❌ SCHEDULE not available in getUpcomingGames');
            return [];
        }

        const now = Date.now();
        const allGames = [];

        getAllWeeks(SCHEDULE).forEach(week => {
            try {
                const games = getGamesByWeek(SCHEDULE, week);
                games.forEach(game => {
                    try {
                        if (!game.kickoff) {
                            console.warn('Game missing kickoff time:', game);
                            return;
                        }

                        const kickoffDate = new Date(game.kickoff);
                        if (isNaN(kickoffDate.getTime())) {
                            console.warn('Invalid kickoff date:', game.kickoff, 'in game:', game);
                            return;
                        }

                        const kickoff = kickoffDate.getTime();
                        if (kickoff > now) {
                            allGames.push({ ...game, week, kickoff });
                        }
                    } catch (gameError) {
                        console.error('Error processing game:', game, gameError);
                    }
                });
            } catch (weekError) {
                console.error('Error processing week', week, ':', weekError);
            }
        });

        const result = allGames
            .sort((a, b) => a.kickoff - b.kickoff)
            .slice(0, limit);

        console.log(`✅ getUpcomingGames returning ${result.length} games`);
        return result;
    } catch (error) {
        console.error('❌ Error in getUpcomingGames:', error);
        return [];
    }
}

function getMostPopularPick(players) {
    const pickCounts = {};
    players.forEach(p => {
        if (p.pick) {
            pickCounts[p.pick] = (pickCounts[p.pick] || 0) + 1;
        }
    });

    let mostPopular = null;
    let maxCount = 0;

    Object.entries(pickCounts).forEach(([team, count]) => {
        if (count > maxCount) {
            maxCount = count;
            mostPopular = team;
        }
    });

    return mostPopular ? { team: mostPopular, count: maxCount } : null;
}

// Helper functions for game results
function getWeekResults(week) {
    const store = readStore();
    return store.gameResults || {};
}

function saveWeekResults(week, results) {
    const store = readStore();
    if (!store.gameResults) store.gameResults = {};
    store.gameResults[week] = results;
    writeStore(store);
}

function processWeekEliminations(week) {
    const store = readStore();
    const weekResults = store.gameResults[week];
    if (!weekResults) return { eliminated: 0, games: [] };

    const games = getGamesByWeek(SCHEDULE, week);
    let totalEliminated = 0;
    const processedGames = [];

    games.forEach(game => {
        const gameKey = `${game.away}_at_${game.home}`;
        const result = weekResults[gameKey];

        if (result && result.winner) {
            const losingTeam = result.winner === game.home ? game.away : game.home;
            let gameEliminated = 0;

            store.games.forEach(pool => {
                if (!pool.picks) return;

                Object.keys(pool.picks).forEach(userId => {
                    const userPicks = pool.picks[userId];
                    if (userPicks[week] === losingTeam && !pool.eliminated.includes(userId)) {
                        pool.eliminated.push(userId);
                        gameEliminated++;
                        totalEliminated++;

                        sendPushNotification(userId, `💀 You've been eliminated from ${pool.name}`, {
                            title: 'Showdown Survivor - Eliminated',
                            url: `/games/${pool.id}`
                        });
                    }
                });
            });

            processedGames.push({
                matchup: `${game.away} @ ${game.home}`,
                winner: result.winner,
                loser: losingTeam,
                eliminated: gameEliminated
            });
        }
    });

    writeStore(store);
    return { eliminated: totalEliminated, games: processedGames };
}

function getBuybackCost(entryFee, nextIndex) {
    const increment = entryFee * 0.5;
    return entryFee + nextIndex * increment;
}

function calculatePot(game) {
    const base = (game.entryFee || 0) * (game.players ? game.players.length : 0);
    const buybacks = game.buybacks || {};
    const ef = game.entryFee || 0;
    const inc = ef * 0.5;
    let extra = 0;
    Object.values(buybacks).forEach(m => {
        const count = Number(m) || 0;
        for (let i = 1; i <= count; i++) {
            extra += ef + i * inc;
        }
    });
    return Math.round((base + extra) * 100) / 100;
}

// PWA API Routes
app.get('/api/vapid-public-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/subscribe', requireAuth, (req, res) => {
    const subscription = req.body;
    const store = readStore();

    try {
        const user = store.users.find(u => u.id === req.session.user.id);
        if (user) {
            user.pushSubscription = subscription;
            writeStore(store);
            console.log(`📱 User ${user.displayName} subscribed to notifications`);
        }

        res.json({ success: true, message: 'Subscribed successfully' });
    } catch (error) {
        console.error('❌ Subscription failed:', error);
        res.status(500).json({ error: 'Subscription failed' });
    }
});

app.post('/api/unsubscribe', requireAuth, (req, res) => {
    const store = readStore();

    try {
        const user = store.users.find(u => u.id === req.session.user.id);
        if (user && user.pushSubscription) {
            delete user.pushSubscription;
            writeStore(store);
            console.log(`📱 User ${user.displayName} unsubscribed from notifications`);
        }

        res.json({ success: true, message: 'Unsubscribed successfully' });
    } catch (error) {
        console.error('❌ Unsubscribe failed:', error);
        res.status(500).json({ error: 'Unsubscribe failed' });
    }
});

app.post('/api/test-notification', requireAuth, requireAdmin, (req, res) => {
    const { userId, message } = req.body;

    if (userId) {
        sendPushNotification(userId, message || 'Test notification from Showdown!');
        res.json({ success: true, message: 'Test notification sent' });
    } else {
        res.status(400).json({ error: 'User ID required' });
    }
});

app.post('/admin/send-reminders', requireAuth, requireAdmin, (req, res) => {
    try {
        sendPickReminders();
        res.json({ success: true, message: 'Pick reminders sent' });
    } catch (error) {
        console.error('❌ Failed to send reminders:', error);
        res.status(500).json({ error: 'Failed to send reminders' });
    }
});

// Main Routes
app.get('/', (req, res) => {
    res.render('landing', { isLanding: true });
});

app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/lobby');
    res.render('login', { error: null });
});

app.get('/rules', (req, res) => {
    res.render('rules');
});

app.get('/debug', (req, res) => {
    const debugInfo = {
        serverRunning: true,
        timestamp: new Date().toISOString()
    };

    try {
        debugInfo.scheduleType = typeof SCHEDULE;
        debugInfo.scheduleExists = !!SCHEDULE;

        if (SCHEDULE) {
            debugInfo.scheduleWeeks = Object.keys(SCHEDULE);
            debugInfo.weekCount = Object.keys(SCHEDULE).length;
            debugInfo.week1Games = SCHEDULE["1"] ? SCHEDULE["1"].length : 0;
        }

        debugInfo.functionsAvailable = {
            getAllWeeks: typeof getAllWeeks,
            getCurrentWeek: typeof getCurrentWeek,
            getUpcomingGames: typeof getUpcomingGames
        };

        // Test getAllWeeks
        try {
            debugInfo.allWeeksResult = getAllWeeks(SCHEDULE);
        } catch (e) {
            debugInfo.allWeeksError = e.message;
        }

    } catch (error) {
        debugInfo.error = error.message;
    }

    res.json(debugInfo);
});

app.post('/login', (req, res) => {
    const { email, password, displayName } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.render('login', { error: 'Please enter a valid email address.' });
    }
    const store = readStore();

    // Admin hardcoded credentials
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
        adminUser.isAdmin = true;
        writeStore(store);
        req.session.user = { id: adminUser.id, email: adminUser.email, displayName: adminUser.displayName || 'Admin', isAdmin: true };
        return res.redirect('/admin');
    }

    if (!password || password.length < 6) {
        return res.render('login', { error: 'Password must be at least 6 characters.' });
    }

    let user = store.users.find(u => (u.email && u.email.toLowerCase()) === email.toLowerCase());

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
    console.log('🔍 LOBBY: Route accessed by', req.session.user.displayName);

    try {
        console.log('🔍 LOBBY: Step 1 - Reading store');
        const store = readStore() || {};
        const games = Array.isArray(store.games) ? store.games : [];
        console.log('🔍 LOBBY: Store read OK, games:', games.length);

        console.log('🔍 LOBBY: Step 2 - Testing getUpcomingGames');
        let upcomingGames = [];
        try {
            upcomingGames = getUpcomingGames ? getUpcomingGames(3) : [];
            console.log('🔍 LOBBY: getUpcomingGames OK, count:', upcomingGames.length);
        } catch (upcomingError) {
            console.error('❌ LOBBY: getUpcomingGames failed:', upcomingError.message);
        }

        console.log('🔍 LOBBY: Step 3 - Testing getCurrentWeek');
        let currentWeek = 1;
        try {
            currentWeek = getCurrentWeek ? getCurrentWeek() : 1;
            console.log('🔍 LOBBY: getCurrentWeek OK:', currentWeek);
        } catch (weekError) {
            console.error('❌ LOBBY: getCurrentWeek failed:', weekError.message);
        }

        console.log('🔍 LOBBY: Step 4 - Testing getAllWeeks');
        let weeks = [];
        try {
            weeks = getAllWeeks ? getAllWeeks(SCHEDULE) : [];
            console.log('🔍 LOBBY: getAllWeeks OK, count:', weeks.length);
        } catch (weeksError) {
            console.error('❌ LOBBY: getAllWeeks failed:', weeksError.message);
            weeks = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];
        }

        console.log('🔍 LOBBY: Step 5 - Rendering template');
        res.render('lobby', {
            games,
            upcomingGames,
            currentWeek,
            allWeeks: weeks
        });
        console.log('✅ LOBBY: Rendered successfully');

    } catch (err) {
        console.error('❌ LOBBY: Critical error:', err.message);
        console.error('❌ LOBBY: Stack trace:', err.stack);
        res.status(500).send('Lobby temporarily unavailable');
    }
});

app.get('/admin', requireAuth, requireAdmin, (req, res) => {
    const store = readStore();
    const weekNums = getAllWeeks(SCHEDULE);
    const unusedGames = (store.games || []).filter(g =>
        ((g.players || []).length <= 1) &&
        (!g.picks || Object.keys(g.picks).length === 0)
    );

    const currentWeek = getCurrentWeek();
    const currentGames = getGamesByWeek(SCHEDULE, currentWeek);
    const weekLocked = isWeekLocked(currentWeek);

    const totalPicks = (store.games || []).reduce((acc, game) => {
        const gamePicks = Object.values(game.picks || {}).filter(picks => picks[currentWeek]).length;
        return acc + gamePicks;
    }, 0);

    res.render('admin', {
        currentWeek,
        overrideWeek: CURRENT_WEEK_OVERRIDE,
        weeks: weekNums,
        unusedGames,
        allGames: store.games || [],
        currentGames,
        weekLocked,
        totalPicks,
        totalPlayers: (store.users || []).length,
        totalActiveGames: (store.games || []).filter(g => (g.players || []).length > 1).length
    });
});

app.post('/admin/week', requireAuth, requireAdmin, (req, res) => {
    const { week } = req.body;
    const w = Number(week);
    const weekNums = getAllWeeks(SCHEDULE);
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
    const idx = (store.games || []).findIndex(g => g.id === id);
    if (idx === -1) return res.status(404).send('Game not found');
    store.games.splice(idx, 1);
    (store.users || []).forEach(u => {
        if (Array.isArray(u.joinedGames)) {
            u.joinedGames = u.joinedGames.filter(gid => gid !== id);
        }
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

// Admin Results Routes
app.get('/admin/results', requireAuth, requireAdmin, (req, res) => {
    const requested = parseInt(req.query.week, 10);
    const week = Number.isInteger(requested) ? requested : getCurrentWeek();
    const games = getGamesByWeek(SCHEDULE, week);
    const weekResults = getWeekResults(week);
    const store = readStore();

    const gamePickCounts = {};
    games.forEach(game => {
        gamePickCounts[game.home] = 0;
        gamePickCounts[game.away] = 0;
    });

    store.games.forEach(pool => {
        if (!pool.picks) return;
        Object.values(pool.picks).forEach(userPicks => {
            const pick = userPicks[week];
            if (pick && gamePickCounts.hasOwnProperty(pick)) {
                gamePickCounts[pick]++;
            }
        });
    });

    const gamesWithData = games.map(game => {
        const gameKey = `${game.away}_at_${game.home}`;
        const result = weekResults[gameKey];
        const homeTeam = getTeamInfo(game.home);
        const awayTeam = getTeamInfo(game.away);

        return {
            ...game,
            gameKey,
            homeTeam,
            awayTeam,
            result: result || null,
            pickCounts: {
                home: gamePickCounts[game.home] || 0,
                away: gamePickCounts[game.away] || 0
            },
            formattedTime: formatGameTime(game.kickoff)
        };
    });

    res.render('admin-results', {
        week,
        games: gamesWithData,
        weekLocked: isWeekLocked(week),
        allWeeks: getAllWeeks(SCHEDULE)
    });
});

app.post('/admin/results/set-winner', requireAuth, requireAdmin, (req, res) => {
    const { week, gameKey, winner } = req.body;

    if (!week || !gameKey || !winner) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const weekNum = parseInt(week, 10);
    const weekResults = getWeekResults(weekNum);

    weekResults[gameKey] = {
        winner: winner,
        timestamp: new Date().toISOString()
    };

    saveWeekResults(weekNum, weekResults);
    res.json({ success: true, message: `${winner} marked as winner` });
});

app.post('/admin/results/set-winners-bulk', requireAuth, requireAdmin, (req, res) => {
    const { week, winners } = req.body;
    if (!week) {
        return res.status(400).json({ error: 'Week is required' });
    }
    const weekNum = parseInt(week, 10);
    let winnersMap;
    try {
        winnersMap = winners ? JSON.parse(winners) : {};
    } catch (e) {
        return res.status(400).json({ error: 'Invalid winners payload' });
    }
    const current = getWeekResults(weekNum);
    const merged = { ...current };
    const now = new Date().toISOString();

    Object.keys(winnersMap || {}).forEach(gameKey => {
        const selectedWinner = winnersMap[gameKey];
        if (!selectedWinner) return;
        merged[gameKey] = { winner: selectedWinner, timestamp: now };
    });

    saveWeekResults(weekNum, merged);
    return res.json({ success: true, saved: Object.keys(winnersMap || {}).length });
});

app.post('/admin/results/process-eliminations', requireAuth, requireAdmin, (req, res) => {
    const { week } = req.body;

    if (!week) {
        return res.status(400).json({ error: 'Week is required' });
    }

    const weekNum = parseInt(week, 10);
    const result = processWeekEliminations(weekNum);

    res.json({
        success: true,
        message: `Processed Week ${weekNum}: ${result.eliminated} players eliminated`,
        eliminated: result.eliminated,
        games: result.games
    });
});

app.get('/admin/results/:week', requireAuth, requireAdmin, (req, res) => {
    const week = parseInt(req.params.week, 10);
    const games = getGamesByWeek(SCHEDULE, week);
    const weekResults = getWeekResults(week);

    const gamesWithResults = games.map(game => {
        const gameKey = `${game.away}_at_${game.home}`;
        const result = weekResults[gameKey];

        return {
            ...game,
            gameKey,
            homeTeam: getTeamInfo(game.home),
            awayTeam: getTeamInfo(game.away),
            result: result || null,
            formattedTime: formatGameTime(game.kickoff)
        };
    });

    res.json({
        week,
        games: gamesWithResults,
        weekLocked: isWeekLocked(week)
    });
});

app.post('/admin/results/clear-week', requireAuth, requireAdmin, (req, res) => {
    const { week } = req.body;

    if (!week) {
        return res.status(400).json({ error: 'Week is required' });
    }

    const weekNum = parseInt(week, 10);
    const store = readStore();

    if (store.gameResults && store.gameResults[weekNum]) {
        delete store.gameResults[weekNum];
    }

    writeStore(store);

    res.json({
        success: true,
        message: `Cleared all results for Week ${weekNum}`
    });
});

// Game Routes
app.post('/games', requireAuth, (req, res) => {
    const { name, entryFee, maxPlayers, visibility, joinKey, gameType } = req.body;
    const store = readStore();
    const creatorId = req.session.user.id;
    const ef = Number(entryFee) || 0;
    const game = {
        id: uuidv4(),
        name: name && name.trim() ? name.trim() : 'New Pool',
        creatorId,
        entryFee: ef,
        maxPlayers: Number(maxPlayers) || 50,
        visibility: visibility === 'private' ? 'private' : 'public',
        joinKey: visibility === 'private' ? (joinKey || '') : '',
        gameType: gameType === 'buyback' ? 'buyback' : 'regular',
        buybacks: {},
        players: [creatorId],
        picks: {},
        eliminated: [],
        winnerId: null,
        createdAt: new Date().toISOString()
    };

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

    // Send notification to game creator about new player
    const creator = store.users.find(u => u.id === game.creatorId);
    if (creator) {
        sendPushNotification(game.creatorId, `${user.displayName} joined ${game.name}`, {
            title: 'New Player Joined',
            url: `/games/${game.id}`
        });
    }

    writeStore(store);
    res.redirect(`/games/${id}`);
});

app.get('/games/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    req.session.currentGameId = id;

    const store = readStore();
    const game = store.games.find(g => g.id === id);
    if (!game) return res.status(404).send('Game not found');

    const week = getCurrentWeek();
    const schedule = getGamesByWeek(SCHEDULE, week);
    const userId = req.session.user.id;
    const userPicks = game.picks[userId] || {};
    const pickedTeamsAllWeeks = new Set(Object.values(userPicks));
    const weekLocked = isWeekLocked(week);

    const usersById = new Map((store.users || []).map(u => [u.id, u]));
    const playersDetailed = (game.players || []).map(uid => {
        const u = usersById.get(uid) || { id: uid, displayName: 'Unknown', email: '' };
        const pick = (game.picks && game.picks[uid] && game.picks[uid][week]) ? game.picks[uid][week] : null;
        const eliminated = (game.eliminated || []).includes(uid);

        const seasonPicks = game.picks[uid] || {};
        const picksCount = Object.keys(seasonPicks).length;

        return {
            id: uid,
            displayName: u.displayName || (u.email ? u.email.split('@')[0] : 'Player'),
            email: u.email || '',
            avatarUrl: u.avatarUrl || '',
            pick,
            eliminated,
            picksCount,
            seasonPicks
        };
    });

    const creator = usersById.get(game.creatorId) || null;

    const gameStats = {
        totalPot: calculatePot(game),
        activePlayers: playersDetailed.filter(p => !p.eliminated).length,
        eliminatedPlayers: playersDetailed.filter(p => p.eliminated).length,
        picksThisWeek: playersDetailed.filter(p => p.pick).length,
        mostPopularPick: getMostPopularPick(playersDetailed)
    };

    res.render('game', {
        game,
        week,
        schedule,
        userPick: userPicks[week] || '',
        pickedTeamsAllWeeks: Array.from(pickedTeamsAllWeeks),
        weekLocked,
        pot: gameStats.totalPot,
        playersDetailed,
        creator,
        gameStats,
        allWeeks: getAllWeeks(SCHEDULE)
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
        pot: calculatePot(game),
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

app.get('/picks', requireAuth, (req, res) => {
    const store = readStore();
    let gid = req.session.currentGameId;
    if (!gid) {
        const user = (store.users || []).find(u => u.id === req.session.user.id);
        const first = (user && Array.isArray(user.joinedGames) && user.joinedGames.length > 0) ? user.joinedGames[0] : null;
        gid = first;
    }
    const exists = gid && (store.games || []).some(g => g.id === gid);
    if (!exists) return res.redirect('/lobby');
    return res.redirect(`/games/${gid}`);
});

app.post('/games/:id/pick', requireAuth, (req, res) => {
    const { id } = req.params;
    const { team } = req.body;
    const store = readStore();
    const game = store.games.find(g => g.id === id);

    if (!game) return res.status(404).send('Game not found');

    const week = getCurrentWeek();
    if (isWeekLocked(week)) {
        return res.status(400).send('Picks are locked for this week.');
    }

    if (!ALL_TEAMS.includes(team)) {
        return res.status(400).send('Invalid team');
    }

    const weekGames = getGamesByWeek(SCHEDULE, week);
    const teamPlaying = weekGames.some(g => g.home === team || g.away === team);
    if (!teamPlaying) {
        return res.status(400).send('This team is not playing this week.');
    }

    const userId = req.session.user.id;
    const picks = game.picks[userId] || {};

    const previouslyUsed = Object.values(picks);
    if (previouslyUsed.includes(team)) {
        return res.status(400).send('You already used this team this season.');
    }

    picks[week] = team;
    game.picks[userId] = picks;
    writeStore(store);

    // Send confirmation notification
    const teamInfo = getTeamInfo(team);
    sendPushNotification(userId,
        `Pick confirmed: ${teamInfo.fullName} for Week ${week}`, {
            title: `${game.name} - Pick Confirmed`,
            url: `/games/${id}`
        }
    );

    res.redirect(`/games/${id}`);
});

app.post('/games/:id/buyback', requireAuth, (req, res) => {
    const { id } = req.params;
    const store = readStore();
    const game = store.games.find(g => g.id === id);
    if (!game) return res.status(404).send('Game not found');

    const gameType = game.gameType || 'regular';
    if (gameType !== 'buyback') {
        return res.status(400).send('Buy back is not available for this game.');
    }

    const userId = req.session.user.id;
    if (!game.players.includes(userId)) {
        return res.status(403).send('You are not part of this game.');
    }

    if (!(game.eliminated || []).includes(userId)) {
        return res.status(400).send('You are not eliminated.');
    }

    if (!game.buybacks) game.buybacks = {};
    const used = Number(game.buybacks[userId] || 0);
    if (used >= 2) {
        return res.status(400).send('You have no buy backs remaining.');
    }

    game.buybacks[userId] = used + 1;
    game.eliminated = (game.eliminated || []).filter(uid => uid !== userId);

    const user = store.users.find(u => u.id === userId);
    sendPushNotification(userId, `You're back in the game! Buyback #${used + 1} successful`, {
        title: `${game.name} - Buyback Successful`,
        url: `/games/${id}`
    });

    notifyGamePlayers(id, `${user.displayName} bought back into the game!`, {
        title: `${game.name} - Player Returned`
    });

    writeStore(store);
    return res.redirect(`/games/${id}/details`);
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

// API endpoints
app.get('/api/games/:id/stats', requireAuth, (req, res) => {
    const { id } = req.params;
    const store = readStore();
    const game = store.games.find(g => g.id === id);

    if (!game) return res.status(404).json({ error: 'Game not found' });

    const week = getCurrentWeek();

    const stats = {
        totalPlayers: game.players.length,
        activePlayers: game.players.filter(pid => !game.eliminated.includes(pid)).length,
        currentWeek: week,
        weekLocked: isWeekLocked(week),
        pickDistribution: {}
    };

    game.players.forEach(pid => {
        const pick = game.picks[pid] && game.picks[pid][week];
        if (pick) {
            stats.pickDistribution[pick] = (stats.pickDistribution[pick] || 0) + 1;
        }
    });

    res.json(stats);
});

app.get('/api/schedule/:week', (req, res) => {
    const { week } = req.params;
    const weekNum = parseInt(week, 10);

    if (!getAllWeeks(SCHEDULE).includes(weekNum)) {
        return res.status(404).json({ error: 'Week not found' });
    }

    const games = getGamesByWeek(SCHEDULE, weekNum);
    const enhancedGames = games.map(game => ({
        ...game,
        homeTeam: getTeamInfo(game.home),
        awayTeam: getTeamInfo(game.away),
        formattedTime: formatGameTime(game.kickoff)
    }));

    res.json({
        week: weekNum,
        games: enhancedGames,
        locked: isWeekLocked(weekNum)
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🏈 Showdown server listening on port ${PORT}`);
    console.log(`📊 Tracking ${getAllWeeks(SCHEDULE).length} weeks with ${ALL_TEAMS.length} teams`);
    console.log(`📱 PWA features enabled with push notifications`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});