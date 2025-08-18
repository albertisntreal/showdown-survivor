// setup-data.js - Run this once to create your data directory and initial files
const fs = require('fs');
const path = require('path');

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
  console.log('✅ Created data directory');
}

// Create initial store.json if it doesn't exist
const storeFile = path.join(dataDir, 'store.json');
if (!fs.existsSync(storeFile)) {
  const initialStore = {
    users: [],
    games: [],
    config: {}
  };
  fs.writeFileSync(storeFile, JSON.stringify(initialStore, null, 2));
  console.log('✅ Created initial store.json');
}

// Create images/teams directory for team logos
const imagesDir = path.join(__dirname, 'public', 'images');
const teamsDir = path.join(imagesDir, 'teams');

if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

if (!fs.existsSync(teamsDir)) {
  fs.mkdirSync(teamsDir);
  console.log('✅ Created public/images/teams directory');
  console.log('💡 Add team logo files here (e.g., chiefs.png, patriots.png, etc.)');
}

// Save the complete 2025 schedule JSON
const scheduleFile = path.join(dataDir, 'schedule-2025.json');
const fullSchedule = {
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
    ]
    // Add more weeks as needed - this is just Week 1 for initial setup
  }
};

fs.writeFileSync(scheduleFile, JSON.stringify(fullSchedule, null, 2));
console.log('✅ Created schedule-2025.json with Week 1 data');

console.log('\n🚀 Setup complete! Next steps:');
console.log('1. Run "npm install" if you haven\'t already');
console.log('2. Run "npm run dev" to start the development server');
console.log('3. Visit http://localhost:3000 to see your app');
console.log('4. Login with admin credentials: albertisntreal1180@gmail.com / password');
console.log('5. Add team logos to public/images/teams/ directory');

// Create a simple CSS file for immediate styling improvements
const cssDir = path.join(__dirname, 'public', 'css');
if (!fs.existsSync(cssDir)) {
  fs.mkdirSync(cssDir, { recursive: true });
}

const mainCss = `
/* Enhanced Showdown Styles */
* {
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  color: #333;
  background: #f8f9fa;
  margin: 0;
  padding: 0;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

.btn {
  display: inline-block;
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  text-decoration: none;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover {
  background: #0056b3;
  transform: translateY(-1px);
}

.card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  margin-bottom: 20px;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px 0;
  margin-bottom: 30px;
}

.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  font-size: 24px;
  font-weight: bold;
}

.nav-links {
  display: flex;
  gap: 20px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.nav-links a {
  color: white;
  text-decoration: none;
  padding: 8px 16px;
  border-radius: 4px;
  transition: background 0.3s;
}

.nav-links a:hover {
  background: rgba(255,255,255,0.2);
}

@media (max-width: 768px) {
  .nav {
    flex-direction: column;
    gap: 15px;
  }
  
  .nav-links {
    flex-wrap: wrap;
    justify-content: center;
  }
}
`;

fs.writeFileSync(path.join(cssDir, 'main.css'), mainCss);
console.log('✅ Created basic CSS file');
