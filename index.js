const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const dayjs = require('dayjs');
const { v4: uuidv4 } = require('uuid');
const webpush = require('web-push');

// Update these lines in your index.js:

// Change PORT configuration (around line 11)
const PORT = process.env.PORT || 3000;

// VAPID Configuration - Use environment variables for production
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BIZtF2mee3R8Rpr8aj4NNiuEnOXn5rDONEeXMGy61p0KZTWOh_744al-_ic_WFX4Df9CMArs9jVXk_4zDweBX4w';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '_N5P1hlXlZfXbJ7LQIJi37inct8us-krPjBzg_0YlUQ';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'albertisntreal1180@gmail.com';

webpush.setVapidDetails(
    `mailto:${VAPID_EMAIL}`,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

// Update session secret for production (around line 85)
app.use(session({
    secret: process.env.SESSION_SECRET || 'showdown-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS in production
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Update the final listen call (at the very end)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏈 Showdown server listening on port ${PORT}`);
    console.log(`📊 Tracking ${getAllWeeks(SCHEDULE).length} weeks with ${ALL_TEAMS.length} teams`);
    console.log(`📱 PWA features enabled with push notifications`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

const app = express();
const DATA_FILE = path.join(__dirname, 'data', 'store.json');


webpush.setVapidDetails(
    'mailto:your-email@example.com', // Replace with your email
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
const scheduleData = loadEnhancedSchedule();
const SCHEDULE = scheduleData.schedule;
const ALL_TEAMS = scheduleData.teams;

console.log(`📅 Loaded schedule for ${Object.keys(SCHEDULE).length} weeks with ${ALL_TEAMS.length} teams`);

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
app.use(bodyParser.json()); // Added for PWA API endpoints
app.use(session({
    secret: 'showdown-secret',
    resave: false,
    saveUninitialized: false
}));

// Enhanced middleware to expose user and helper functions to views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    // Expose request object so templates can build absolute URLs when needed
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
        // Find users who haven't made picks yet
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
    const weekNums = getAllWeeks(SCHEDULE);
    if (weekNums.length === 0) return 1;

    if (CURRENT_WEEK_OVERRIDE && weekNums.includes(Number(CURRENT_WEEK_OVERRIDE))) {
        return Number(CURRENT_WEEK_OVERRIDE);
    }

    const now = Date.now();
    for (let i = 0; i < weekNums.length; i++) {
        const w = weekNums[i];
        const games = getGamesByWeek(SCHEDULE, w);
        if (games.length === 0) continue;

        const firstKick = games.map(g => new Date(g.kickoff).getTime()).sort((a,b)=>a-b)[0];
        if (now < firstKick) {
            return w; // upcoming week
        }
    }
    return weekNums[weekNums.length - 1]; // default to last week
}

function isWeekLocked(week) {
    const games = getGamesByWeek(SCHEDULE, week);
    if (games.length === 0) return false;

    const firstKick = games.map(g => new Date(g.kickoff).getTime()).sort((a,b)=>a-b)[0];
    return Date.now() >= firstKick;
}

function getUpcomingGames(limit = 5) {
    const now = Date.now();
    const allGames = [];

    getAllWeeks(SCHEDULE).forEach(week => {
        const games = getGamesByWeek(SCHEDULE, week);
        games.forEach(game => {
            const kickoff = new Date(game.kickoff).getTime();
            if (kickoff > now) {
                allGames.push({ ...game, week, kickoff });
            }
        });
    });

    return allGames
        .sort((a, b) => a.kickoff - b.kickoff)
        .slice(0, limit);
}

// Helper function for game statistics
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

// PWA API Routes
// Get VAPID public key for client
app.get('/api/vapid-public-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Subscribe to push notifications
app.post('/api/subscribe', requireAuth, (req, res) => {
    const subscription = req.body;
    const store = readStore();

    try {
        // Store subscription for user
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

// Unsubscribe from push notifications
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

// Test notification endpoint (admin only)
app.post('/api/test-notification', requireAuth, requireAdmin, (req, res) => {
    const { userId, message } = req.body;

    if (userId) {
        sendPushNotification(userId, message || 'Test notification from Showdown!');
        res.json({ success: true, message: 'Test notification sent' });
    } else {
        res.status(400).json({ error: 'User ID required' });
    }
});

// Schedule pick reminders (admin endpoint)
app.post('/admin/send-reminders', requireAuth, requireAdmin, (req, res) => {
    try {
        sendPickReminders();
        res.json({ success: true, message: 'Pick reminders sent' });
    } catch (error) {
        console.error('❌ Failed to send reminders:', error);
        res.status(500).json({ error: 'Failed to send reminders' });
    }
});

// Routes
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

// Enhanced lobby route with upcoming games
app.get('/lobby', requireAuth, (req, res) => {
    const store = readStore();
    const games = store.games;
    const upcomingGames = getUpcomingGames(3);
    const currentWeek = getCurrentWeek();

    res.render('lobby', {
        games,
        upcomingGames,
        currentWeek,
        allWeeks: getAllWeeks(SCHEDULE)
    });
});

// Enhanced admin panel
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
    const store = readStore();
    const weekNums = getAllWeeks(SCHEDULE);
    const unusedGames = (store.games || []).filter(g =>
        ((g.players || []).length <= 1) &&
        (!g.picks || Object.keys(g.picks).length === 0)
    );

    // Get current week stats
    const currentWeek = getCurrentWeek();
    const currentGames = getGamesByWeek(SCHEDULE, currentWeek);
    const weekLocked = isWeekLocked(currentWeek);

    // Count total picks for current week across all games
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
    // Remove the game regardless of status
    store.games.splice(idx, 1);
    // Clean from users' joinedGames
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

// Helper function to get game results for a week
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

// Helper function to eliminate players based on results
function processWeekEliminations(week) {
    const store = readStore();
    const weekResults = store.gameResults[week];
    if (!weekResults) return { eliminated: 0, games: [] };

    const games = getGamesByWeek(SCHEDULE, week);
    let totalEliminated = 0;
    const processedGames = [];

    // Process each game in the schedule
    games.forEach(game => {
        const gameKey = `${game.away}_at_${game.home}`;
        const result = weekResults[gameKey];

        if (result && result.winner) {
            const losingTeam = result.winner === game.home ? game.away : game.home;
            let gameEliminated = 0;

            // Check all pools for players who picked the losing team
            store.games.forEach(pool => {
                if (!pool.picks) return;

                Object.keys(pool.picks).forEach(userId => {
                    const userPicks = pool.picks[userId];
                    if (userPicks[week] === losingTeam && !pool.eliminated.includes(userId)) {
                        pool.eliminated.push(userId);
                        gameEliminated++;
                        totalEliminated++;

                        // Send elimination notification
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

// Admin Results Page - Show all games for current week
app.get('/admin/results', requireAuth, requireAdmin, (req, res) => {
    const requested = parseInt(req.query.week, 10);
    const week = Number.isInteger(requested) ? requested : getCurrentWeek();
    const games = getGamesByWeek(SCHEDULE, week);
    const weekResults = getWeekResults(week);
    const store = readStore();

    // Count total picks per game
    const gamePickCounts = {};
    games.forEach(game => {
        gamePickCounts[game.home] = 0;
        gamePickCounts[game.away] = 0;
    });

    // Count picks across all pools
    store.games.forEach(pool => {
        if (!pool.picks) return;
        Object.values(pool.picks).forEach(userPicks => {
            const pick = userPicks[week];
            if (pick && gamePickCounts.hasOwnProperty(pick)) {
                gamePickCounts[pick]++;
            }
        });
    });

    // Prepare games with results and pick counts
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

// Set Game Winner
app.post('/admin/results/set-winner', requireAuth, requireAdmin, (req, res) => {
    const { week, gameKey, winner } = req.body;

    if (!week || !gameKey || !winner) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const weekNum = parseInt(week, 10);
    const weekResults = getWeekResults(weekNum);

    // Update the result
    weekResults[gameKey] = {
        winner: winner,
        timestamp: new Date().toISOString()
    };

    saveWeekResults(weekNum, weekResults);

    res.json({ success: true, message: `${winner} marked as winner` });
});

// Set Winners in Bulk
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

// Process Week Eliminations
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

// Get Results for Specific Week (AJAX)
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

// Clear Week Results (for testing/corrections)
app.post('/admin/results/clear-week', requireAuth, requireAdmin, (req, res) => {
    const { week } = req.body;

    if (!week) {
        return res.status(400).json({ error: 'Week is required' });
    }

    const weekNum = parseInt(week, 10);
    const store = readStore();

    // Clear results
    if (store.gameResults && store.gameResults[weekNum]) {
        delete store.gameResults[weekNum];
    }

    // Reset eliminations for this week (optional - might want to be more careful here)
    // This is a simple implementation - in production you might want more sophisticated rollback

    writeStore(store);

    res.json({
        success: true,
        message: `Cleared all results for Week ${weekNum}`
    });
});

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
        buybacks: {}, // { userId: numberOfBuybacks }
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

// Helper: calculate buyback cost and total pot for a game
function getBuybackCost(entryFee, nextIndex) {
    // nextIndex starts at 1 for the first buy-back
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

// Enhanced game view route
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

    // Build enhanced players roster
    const usersById = new Map((store.users || []).map(u => [u.id, u]));
    const playersDetailed = (game.players || []).map(uid => {
        const u = usersById.get(uid) || { id: uid, displayName: 'Unknown', email: '' };
        const pick = (game.picks && game.picks[uid] && game.picks[uid][week]) ? game.picks[uid][week] : null;
        const eliminated = (game.eliminated || []).includes(uid);

        // Calculate player's season picks for display
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

    // Add game statistics
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

// New: quick link to picks room
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

// Enhanced pick validation with notification
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

    // Verify team is playing this week
    const weekGames = getGamesByWeek(SCHEDULE, week);
    const teamPlaying = weekGames.some(g => g.home === team || g.away === team);
    if (!teamPlaying) {
        return res.status(400).send('This team is not playing this week.');
    }

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

// Buy Back endpoint
app.post('/games/:id/buyback', requireAuth, (req, res) => {
    const { id } = req.params;
    const store = readStore();
    const game = store.games.find(g => g.id === id);
    if (!game) return res.status(404).send('Game not found');

    // Only for buy-back games
    const gameType = game.gameType || 'regular';
    if (gameType !== 'buyback') {
        return res.status(400).send('Buy back is not available for this game.');
    }

    const userId = req.session.user.id;
    if (!game.players.includes(userId)) {
        return res.status(403).send('You are not part of this game.');
    }

    // Must be eliminated to buy back
    if (!(game.eliminated || []).includes(userId)) {
        return res.status(400).send('You are not eliminated.');
    }

    // Check buy-back cap (max 2)
    if (!game.buybacks) game.buybacks = {};
    const used = Number(game.buybacks[userId] || 0);
    if (used >= 2) {
        return res.status(400).send('You have no buy backs remaining.');
    }

    // Process buy back: increment, revive player
    game.buybacks[userId] = used + 1;
    game.eliminated = (game.eliminated || []).filter(uid => uid !== userId);

    // Send buyback notification
    const user = store.users.find(u => u.id === userId);
    sendPushNotification(userId, `You're back in the game! Buyback #${used + 1} successful`, {
        title: `${game.name} - Buyback Successful`,
        url: `/games/${id}`
    });

    // Notify other players
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

// New API endpoints for enhanced functionality
app.get('/api/games/:id/stats', requireAuth, (req, res) => {
    const { id } = req.params;
    const store = readStore();
    const game = store.games.find(g => g.id === id);

    if (!game) return res.status(404).json({ error: 'Game not found' });

    const week = getCurrentWeek();
    const usersById = new Map((store.users || []).map(u => [u.id, u]));

    const stats = {
        totalPlayers: game.players.length,
        activePlayers: game.players.filter(pid => !game.eliminated.includes(pid)).length,
        currentWeek: week,
        weekLocked: isWeekLocked(week),
        pickDistribution: {}
    };

    // Calculate pick distribution for current week
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏈 Showdown server listening on port ${PORT}`);
    console.log(`📊 Tracking ${getAllWeeks(SCHEDULE).length} weeks with ${ALL_TEAMS.length} teams`);
    console.log(`📱 PWA features enabled with push notifications`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});