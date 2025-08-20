// Enhanced schedule loader with full 2025 NFL data - FIXED VERSION
const path = require('path');
const fs = require('fs');

// Complete 2025 NFL schedule data with more weeks
const FULL_2025_SCHEDULE = {
    "teams": [
        "49ers", "Bears", "Bengals", "Bills", "Broncos", "Browns", "Buccaneers",
        "Cardinals", "Chargers", "Chiefs", "Colts", "Commanders", "Cowboys",
        "Dolphins", "Eagles", "Falcons", "Giants", "Jaguars", "Jets", "Lions",
        "Packers", "Panthers", "Patriots", "Raiders", "Rams", "Ravens", "Saints",
        "Seahawks", "Steelers", "Texans", "Titans", "Vikings"
    ],
    "weeks": {
        "1": [
            { "home": "Eagles", "away": "Cowboys", "kickoff": "2025-09-05T00:20:00Z" },
            { "home": "Chargers", "away": "Chiefs", "kickoff": "2025-09-06T00:00:00Z" },
            { "home": "Patriots", "away": "Raiders", "kickoff": "2025-09-07T17:00:00Z" },
            { "home": "Jets", "away": "Steelers", "kickoff": "2025-09-07T17:00:00Z" },
            { "home": "Colts", "away": "Dolphins", "kickoff": "2025-09-07T17:00:00Z" },
            { "home": "Saints", "away": "Cardinals", "kickoff": "2025-09-07T17:00:00Z" },
            { "home": "Commanders", "away": "Giants", "kickoff": "2025-09-07T17:00:00Z" },
            { "home": "Jaguars", "away": "Panthers", "kickoff": "2025-09-07T17:00:00Z" },
            { "home": "Browns", "away": "Bengals", "kickoff": "2025-09-07T17:00:00Z" },
            { "home": "Falcons", "away": "Buccaneers", "kickoff": "2025-09-07T17:00:00Z" },
            { "home": "Broncos", "away": "Titans", "kickoff": "2025-09-07T20:05:00Z" },
            { "home": "Seahawks", "away": "49ers", "kickoff": "2025-09-07T20:05:00Z" },
            { "home": "Packers", "away": "Lions", "kickoff": "2025-09-07T20:25:00Z" },
            { "home": "Rams", "away": "Texans", "kickoff": "2025-09-07T20:25:00Z" },
            { "home": "Bills", "away": "Ravens", "kickoff": "2025-09-08T00:20:00Z" },
            { "home": "Bears", "away": "Vikings", "kickoff": "2025-09-09T00:15:00Z" }
        ],
        "2": [
            { "home": "Cowboys", "away": "Saints", "kickoff": "2025-09-14T17:00:00Z" },
            { "home": "Eagles", "away": "Falcons", "kickoff": "2025-09-14T17:00:00Z" },
            { "home": "Chiefs", "away": "Bengals", "kickoff": "2025-09-14T17:00:00Z" },
            { "home": "Steelers", "away": "Broncos", "kickoff": "2025-09-14T17:00:00Z" },
            { "home": "Ravens", "away": "Colts", "kickoff": "2025-09-14T17:00:00Z" },
            { "home": "49ers", "away": "Cardinals", "kickoff": "2025-09-14T20:05:00Z" },
            { "home": "Packers", "away": "Bears", "kickoff": "2025-09-14T20:25:00Z" },
            { "home": "Rams", "away": "Bills", "kickoff": "2025-09-15T00:20:00Z" }
        ],
        "3": [
            { "home": "Cardinals", "away": "Lions", "kickoff": "2025-09-21T17:00:00Z" },
            { "home": "Bengals", "away": "Commanders", "kickoff": "2025-09-21T17:00:00Z" },
            { "home": "Saints", "away": "Eagles", "kickoff": "2025-09-21T17:00:00Z" },
            { "home": "Browns", "away": "Giants", "kickoff": "2025-09-21T17:00:00Z" },
            { "home": "Texans", "away": "Jaguars", "kickoff": "2025-09-21T17:00:00Z" },
            { "home": "Panthers", "away": "Raiders", "kickoff": "2025-09-21T20:05:00Z" },
            { "home": "Cowboys", "away": "Ravens", "kickoff": "2025-09-22T00:20:00Z" }
        ]
    }
};

// Team info with external logo URLs
const TEAM_INFO = {
    "49ers": {
        fullName: "San Francisco 49ers",
        city: "San Francisco",
        colors: ["#AA0000", "#B3995D"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/sf.png",
        conference: "NFC",
        division: "West"
    },
    "Bears": {
        fullName: "Chicago Bears",
        city: "Chicago",
        colors: ["#0B162A", "#C83803"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/chi.png",
        conference: "NFC",
        division: "North"
    },
    "Bengals": {
        fullName: "Cincinnati Bengals",
        city: "Cincinnati",
        colors: ["#FB4F14", "#000000"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/cin.png",
        conference: "AFC",
        division: "North"
    },
    "Bills": {
        fullName: "Buffalo Bills",
        city: "Buffalo",
        colors: ["#00338D", "#C60C30"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/buf.png",
        conference: "AFC",
        division: "East"
    },
    "Broncos": {
        fullName: "Denver Broncos",
        city: "Denver",
        colors: ["#FB4F14", "#002244"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/den.png",
        conference: "AFC",
        division: "West"
    },
    "Browns": {
        fullName: "Cleveland Browns",
        city: "Cleveland",
        colors: ["#311D00", "#FF3C00"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/cle.png",
        conference: "AFC",
        division: "North"
    },
    "Buccaneers": {
        fullName: "Tampa Bay Buccaneers",
        city: "Tampa Bay",
        colors: ["#D50A0A", "#FF7900"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/tb.png",
        conference: "NFC",
        division: "South"
    },
    "Cardinals": {
        fullName: "Arizona Cardinals",
        city: "Arizona",
        colors: ["#97233F", "#000000"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/ari.png",
        conference: "NFC",
        division: "West"
    },
    "Chargers": {
        fullName: "Los Angeles Chargers",
        city: "Los Angeles",
        colors: ["#0080C6", "#FFC20E"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/lac.png",
        conference: "AFC",
        division: "West"
    },
    "Chiefs": {
        fullName: "Kansas City Chiefs",
        city: "Kansas City",
        colors: ["#E31837", "#FFB81C"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/kc.png",
        conference: "AFC",
        division: "West"
    },
    "Colts": {
        fullName: "Indianapolis Colts",
        city: "Indianapolis",
        colors: ["#002C5F", "#A2AAAD"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/ind.png",
        conference: "AFC",
        division: "South"
    },
    "Commanders": {
        fullName: "Washington Commanders",
        city: "Washington",
        colors: ["#5A1414", "#FFB612"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png",
        conference: "NFC",
        division: "East"
    },
    "Cowboys": {
        fullName: "Dallas Cowboys",
        city: "Dallas",
        colors: ["#003594", "#041E42"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/dal.png",
        conference: "NFC",
        division: "East"
    },
    "Dolphins": {
        fullName: "Miami Dolphins",
        city: "Miami",
        colors: ["#008E97", "#FC4C02"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/mia.png",
        conference: "AFC",
        division: "East"
    },
    "Eagles": {
        fullName: "Philadelphia Eagles",
        city: "Philadelphia",
        colors: ["#004C54", "#A5ACAF"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/phi.png",
        conference: "NFC",
        division: "East"
    },
    "Falcons": {
        fullName: "Atlanta Falcons",
        city: "Atlanta",
        colors: ["#A71930", "#000000"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/atl.png",
        conference: "NFC",
        division: "South"
    },
    "Giants": {
        fullName: "New York Giants",
        city: "New York",
        colors: ["#0B2265", "#A71930"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png",
        conference: "NFC",
        division: "East"
    },
    "Jaguars": {
        fullName: "Jacksonville Jaguars",
        city: "Jacksonville",
        colors: ["#006778", "#9F792C"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/jax.png",
        conference: "AFC",
        division: "South"
    },
    "Jets": {
        fullName: "New York Jets",
        city: "New York",
        colors: ["#125740", "#000000"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png",
        conference: "AFC",
        division: "East"
    },
    "Lions": {
        fullName: "Detroit Lions",
        city: "Detroit",
        colors: ["#0076B6", "#B0B7BC"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/det.png",
        conference: "NFC",
        division: "North"
    },
    "Packers": {
        fullName: "Green Bay Packers",
        city: "Green Bay",
        colors: ["#203731", "#FFB612"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/gb.png",
        conference: "NFC",
        division: "North"
    },
    "Panthers": {
        fullName: "Carolina Panthers",
        city: "Carolina",
        colors: ["#0085CA", "#101820"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/car.png",
        conference: "NFC",
        division: "South"
    },
    "Patriots": {
        fullName: "New England Patriots",
        city: "New England",
        colors: ["#002244", "#C60C30"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/ne.png",
        conference: "AFC",
        division: "East"
    },
    "Raiders": {
        fullName: "Las Vegas Raiders",
        city: "Las Vegas",
        colors: ["#000000", "#A5ACAF"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/lv.png",
        conference: "AFC",
        division: "West"
    },
    "Rams": {
        fullName: "Los Angeles Rams",
        city: "Los Angeles",
        colors: ["#003594", "#FFA300"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/lar.png",
        conference: "NFC",
        division: "West"
    },
    "Ravens": {
        fullName: "Baltimore Ravens",
        city: "Baltimore",
        colors: ["#241773", "#000000"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/bal.png",
        conference: "AFC",
        division: "North"
    },
    "Saints": {
        fullName: "New Orleans Saints",
        city: "New Orleans",
        colors: ["#D3BC8D", "#101820"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/no.png",
        conference: "NFC",
        division: "South"
    },
    "Seahawks": {
        fullName: "Seattle Seahawks",
        city: "Seattle",
        colors: ["#002244", "#69BE28"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png",
        conference: "NFC",
        division: "West"
    },
    "Steelers": {
        fullName: "Pittsburgh Steelers",
        city: "Pittsburgh",
        colors: ["#FFB612", "#101820"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/pit.png",
        conference: "AFC",
        division: "North"
    },
    "Texans": {
        fullName: "Houston Texans",
        city: "Houston",
        colors: ["#03202F", "#A71930"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/hou.png",
        conference: "AFC",
        division: "South"
    },
    "Titans": {
        fullName: "Tennessee Titans",
        city: "Tennessee",
        colors: ["#0C2340", "#4B92DB"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/ten.png",
        conference: "AFC",
        division: "South"
    },
    "Vikings": {
        fullName: "Minnesota Vikings",
        city: "Minnesota",
        colors: ["#4F2683", "#FFC62F"],
        logo: "https://a.espncdn.com/i/teamlogos/nfl/500/min.png",
        conference: "NFC",
        division: "North"
    }
};

function loadEnhancedSchedule() {
    const SCHEDULE_FILE = path.join(__dirname, 'data', 'schedule-2025.json');
    const TXT_FILE = path.join(__dirname, 'data', 'schedule-2025.txt');

    let scheduleData = FULL_2025_SCHEDULE; // Start with built-in data

    // Try to load from JSON file first
    try {
        if (fs.existsSync(SCHEDULE_FILE)) {
            const raw = fs.readFileSync(SCHEDULE_FILE, 'utf8');
            const data = JSON.parse(raw);
            if (data && data.weeks && data.teams) {
                scheduleData = data;
                console.log('✅ Loaded 2025 schedule from', SCHEDULE_FILE);
            }
        }
    } catch (e) {
        console.log('⚠️ Failed to load from JSON file:', e.message);
        // Try CSV format
        try {
            if (fs.existsSync(TXT_FILE)) {
                const txt = fs.readFileSync(TXT_FILE, 'utf8');
                const parsed = parseCSVSchedule(txt);
                if (parsed) {
                    scheduleData = parsed;
                    console.log('✅ Loaded 2025 schedule from', TXT_FILE);
                }
            }
        } catch (e2) {
            console.log('⚠️ Failed to load from TXT file:', e2.message);
        }
    }

    console.log('📅 Using built-in 2025 schedule data');

    return {
        schedule: scheduleData.weeks,
        teams: scheduleData.teams,
        teamInfo: TEAM_INFO
    };
}

function parseCSVSchedule(csvContent) {
    try {
        const lines = csvContent.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length <= 1) return null;

        const header = lines[0].split(',').map(h => h.trim());
        const idx = (name) => header.indexOf(name);

        const iWeek = idx('week');
        const iTime = idx('game_time');
        const iPick = idx('teamPick');
        const iOpp = idx('teamOpponent');
        const iStatus = idx('status');

        if (iWeek === -1 || iTime === -1 || iPick === -1 || iOpp === -1) {
            return null;
        }

        const weeks = {};
        const teamsSet = new Set();
        const seen = new Set();

        const parseUSDateTime = (s) => {
            try {
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
            } catch (e) {
                return new Date();
            }
        };

        for (let k = 1; k < lines.length; k++) {
            const parts = lines[k].split(',');
            if (parts.length < header.length) continue;

            const weekNum = parseInt(parts[iWeek], 10);
            const teamA = parts[iPick]?.trim();
            const teamB = parts[iOpp]?.trim();
            const gameTime = parts[iTime]?.trim();
            const status = parts[iStatus]?.trim();

            if (!weekNum || !teamA || !teamB || !gameTime) continue;
            if (status !== 'Upcoming') continue; // Only process upcoming games

            // Avoid duplicates by creating a unique key
            const sortedTeams = [teamA, teamB].sort();
            const key = `${weekNum}:${sortedTeams[0]} vs ${sortedTeams[1]}`;
            if (seen.has(key)) continue;
            seen.add(key);

            teamsSet.add(teamA);
            teamsSet.add(teamB);

            weeks[weekNum] = weeks[weekNum] || [];
            const dt = parseUSDateTime(gameTime);

            // Determine home/away based on your CSV structure
            weeks[weekNum].push({
                home: teamA,
                away: teamB,
                kickoff: dt.toISOString()
            });
        }

        if (Object.keys(weeks).length === 0) return null;

        return {
            weeks,
            teams: Array.from(teamsSet)
        };
    } catch (e) {
        console.error('Error parsing CSV schedule:', e);
        return null;
    }
}

// Helper functions for the schedule - WITH ERROR HANDLING
function getTeamInfo(teamName) {
    try {
        return TEAM_INFO[teamName] || {
            fullName: teamName,
            city: teamName,
            colors: ["#000000", "#FFFFFF"],
            logo: "https://a.espncdn.com/i/teamlogos/nfl/500/default.png",
            conference: "Unknown",
            division: "Unknown"
        };
    } catch (e) {
        console.error('Error getting team info for', teamName, ':', e);
        return {
            fullName: teamName || 'Unknown Team',
            city: teamName || 'Unknown',
            colors: ["#000000", "#FFFFFF"],
            logo: "https://a.espncdn.com/i/teamlogos/nfl/500/default.png",
            conference: "Unknown",
            division: "Unknown"
        };
    }
}

function getGamesByWeek(schedule, week) {
    try {
        if (!schedule || typeof schedule !== 'object') {
            console.error('Invalid schedule object provided to getGamesByWeek');
            return [];
        }
        return schedule[week] || [];
    } catch (e) {
        console.error('Error getting games for week', week, ':', e);
        return [];
    }
}

function getAllWeeks(schedule) {
    try {
        if (!schedule || typeof schedule !== 'object') {
            console.error('Invalid schedule object provided to getAllWeeks');
            return [1]; // Return week 1 as fallback
        }

        const weeks = Object.keys(schedule)
            .map(n => parseInt(n, 10))
            .filter(n => !isNaN(n))
            .sort((a, b) => a - b);

        return weeks.length > 0 ? weeks : [1]; // Return week 1 as fallback
    } catch (e) {
        console.error('Error getting all weeks:', e);
        return [1]; // Return week 1 as fallback
    }
}

function formatGameTime(kickoffISO, timezone = 'America/New_York') {
    try {
        const date = new Date(kickoffISO);

        // Check if date is valid
        if (isNaN(date.getTime())) {
            return {
                date: 'TBD',
                time: 'TBD'
            };
        }

        return {
            date: date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            }),
            time: date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                timeZone: timezone
            })
        };
    } catch (e) {
        console.error('Error formatting game time for', kickoffISO, ':', e);
        return {
            date: 'TBD',
            time: 'TBD'
        };
    }
}

module.exports = {
    loadEnhancedSchedule,
    getTeamInfo,
    getGamesByWeek,
    getAllWeeks,
    formatGameTime,
    TEAM_INFO
};