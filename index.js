const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { kv } = require('@vercel/kv');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic Express setup
app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.static('./public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('trust proxy', 1);

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'showdown-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true
    }
}));

// Middleware
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

// KV Storage functions
async function readStore() {
    try {
        const store = await kv.get('showdown:store');
        if (store) {
            return store;
        } else {
            const initialStore = { users: [], games: [], config: {} };
            await writeStore(initialStore);
            return initialStore;
        }
    } catch (e) {
        console.error('KV Error:', e);
        return { users: [], games: [], config: {} };
    }
}

async function writeStore(store) {
    try {
        await kv.set('showdown:store', store);
    } catch (e) {
        console.error('KV Write Error:', e);
    }
}

// Routes
app.get('/', (req, res) => {
    res.send('<h1>Showdown Survivor</h1><p><a href="/login">Login</a></p>');
});

app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/lobby');
    res.send(`
        <h1>Login</h1>
        <form method="post" action="/login">
            <div>
                <label>Email:</label>
                <input name="email" type="email" required>
            </div>
            <div>
                <label>Password:</label>
                <input name="password" type="password" required>
            </div>
            <div>
                <label>Display Name (optional):</label>
                <input name="displayName">
            </div>
            <button type="submit">Login / Register</button>
        </form>
    `);
});

app.post('/login', async (req, res) => {
    try {
        const { email, password, displayName } = req.body;

        if (!email || !password) {
            return res.send('Email and password required. <a href="/login">Try again</a>');
        }

        const store = await readStore();

        // Admin login
        if (email === 'albertisntreal1180@gmail.com' && password === 'password') {
            let adminUser = store.users.find(u => u.email === email);
            if (!adminUser) {
                adminUser = {
                    id: uuidv4(),
                    email: email,
                    displayName: 'Admin',
                    isAdmin: true
                };
                store.users.push(adminUser);
                await writeStore(store);
            }
            req.session.user = { id: adminUser.id, email: adminUser.email, displayName: adminUser.displayName, isAdmin: true };
            return res.redirect('/admin');
        }

        // Regular user login/register
        let user = store.users.find(u => u.email === email);
        if (user) {
            // Simple password check (you can add hashing later)
            if (user.password !== password) {
                return res.send('Invalid password. <a href="/login">Try again</a>');
            }
        } else {
            // Register new user
            user = {
                id: uuidv4(),
                email: email,
                password: password, // In production, hash this
                displayName: displayName || email.split('@')[0],
                joinedGames: []
            };
            store.users.push(user);
            await writeStore(store);
        }

        req.session.user = { id: user.id, email: user.email, displayName: user.displayName, isAdmin: false };
        res.redirect('/lobby');
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send('Login error: ' + error.message);
    }
});

app.get('/lobby', requireAuth, async (req, res) => {
    try {
        const store = await readStore();
        const games = store.games || [];

        let gamesList = '<h3>Available Games</h3>';
        if (games.length === 0) {
            gamesList += '<p>No games yet. Create one!</p>';
        } else {
            gamesList += '<ul>';
            games.forEach(game => {
                gamesList += `<li><a href="/games/${game.id}">${game.name}</a> - ${game.players.length} players</li>`;
            });
            gamesList += '</ul>';
        }

        res.send(`
            <h1>Lobby</h1>
            <p>Welcome, ${req.session.user.displayName}!</p>
            <p><a href="/logout">Logout</a> | <a href="/profile">Profile</a></p>
            
            <h3>Create New Game</h3>
            <form method="post" action="/games">
                <div>
                    <label>Game Name:</label>
                    <input name="name" value="My Pool" required>
                </div>
                <div>
                    <label>Entry Fee ($):</label>
                    <input name="entryFee" type="number" value="20">
                </div>
                <button type="submit">Create Game</button>
            </form>
            
            ${gamesList}
        `);
    } catch (error) {
        console.error('Lobby error:', error);
        res.status(500).send('Lobby error');
    }
});

app.get('/admin', requireAuth, requireAdmin, async (req, res) => {
    try {
        const store = await readStore();
        res.send(`
            <h1>Admin Panel</h1>
            <p>Welcome, Admin!</p>
            <p><a href="/lobby">Back to Lobby</a></p>
            <h3>Stats</h3>
            <ul>
                <li>Total Users: ${store.users.length}</li>
                <li>Total Games: ${store.games.length}</li>
            </ul>
        `);
    } catch (error) {
        res.status(500).send('Admin error');
    }
});

app.post('/games', requireAuth, async (req, res) => {
    try {
        const { name, entryFee } = req.body;
        const store = await readStore();

        const game = {
            id: uuidv4(),
            name: name || 'New Game',
            entryFee: Number(entryFee) || 0,
            creatorId: req.session.user.id,
            players: [req.session.user.id],
            picks: {},
            eliminated: [],
            createdAt: new Date().toISOString()
        };

        store.games.push(game);
        await writeStore(store);

        res.redirect(`/games/${game.id}`);
    } catch (error) {
        res.status(500).send('Error creating game');
    }
});

app.get('/games/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const store = await readStore();
        const game = store.games.find(g => g.id === id);

        if (!game) return res.status(404).send('Game not found');

        const players = game.players.map(pid => {
            const user = store.users.find(u => u.id === pid);
            return user ? user.displayName : 'Unknown';
        }).join(', ');

        res.send(`
            <h1>${game.name}</h1>
            <p><a href="/lobby">Back to Lobby</a></p>
            <p>Entry Fee: $${game.entryFee}</p>
            <p>Players: ${players}</p>
            
            <h3>Join Game</h3>
            <form method="post" action="/games/${game.id}/join">
                <button type="submit">Join This Game</button>
            </form>
        `);
    } catch (error) {
        res.status(500).send('Error loading game');
    }
});

app.post('/games/:id/join', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const store = await readStore();
        const game = store.games.find(g => g.id === id);

        if (!game) return res.status(404).send('Game not found');
        if (game.players.includes(req.session.user.id)) {
            return res.redirect(`/games/${id}`);
        }

        game.players.push(req.session.user.id);
        await writeStore(store);

        res.redirect(`/games/${id}`);
    } catch (error) {
        res.status(500).send('Error joining game');
    }
});

app.get('/profile', requireAuth, (req, res) => {
    res.send(`
        <h1>Profile</h1>
        <p>Email: ${req.session.user.email}</p>
        <p>Display Name: ${req.session.user.displayName}</p>
        <p><a href="/lobby">Back to Lobby</a></p>
    `);
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

app.get('/debug', async (req, res) => {
    try {
        const store = await readStore();
        res.json({
            kvWorking: true,
            users: store.users.length,
            games: store.games.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// For Vercel
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;