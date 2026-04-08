/* ============================================================
   Intelligent Agent Survival — Game Engine
   World, Agents, Enemies, Power-ups, Day/Night, Waves
   ============================================================ */

// ==================== CONSTANTS ====================
const GRID = 25;
const TILE = 0; // calculated later
const AGENT_TYPES = ['reflex','model','goal','utility','learning'];
const AGENT_COLORS = { reflex:'#ff4444', model:'#3b82f6', goal:'#00ff87', utility:'#ffd700', learning:'#a855f7' };
const AGENT_NAMES = { reflex:'Simple Reflex', model:'Model-Based', goal:'Goal-Based', utility:'Utility-Based', learning:'Learning' };
const AGENT_EMOJIS = { reflex:'🔴', model:'🔵', goal:'🟢', utility:'🟡', learning:'🟣' };

const TERRAIN = { GRASS:0, WATER:1, LAVA:2, FOREST:3 };
const TERRAIN_COLORS_DAY = { 0:'#1e2030', 1:'#023e8a', 2:'#800f2f', 3:'#1b4332' };
const TERRAIN_COLORS_NIGHT = { 0:'#0f1018', 1:'#011f45', 2:'#400717', 3:'#0d2219' };
const TERRAIN_GRID_DAY = { 0:'#2c2e42', 1:'#0353a4', 2:'#a4133c', 3:'#2d6a4f' };
const TERRAIN_GRID_NIGHT = { 0:'#171824', 1:'#012a5e', 2:'#590920', 3:'#123124' };

const ITEM_TYPES = ['food','heal','speed','shield','bomb','vision'];
const ITEM_EMOJIS = { food:'🍎', heal:'❤️', speed:'⚡', shield:'🛡️', bomb:'💣', vision:'👁️' };

const DAY_DURATION = 300; // ticks
const NIGHT_DURATION = 200;

// ==================== STATE ====================
const S = {
    canvas: null, ctx: null, tile: 24,
    terrain: [],
    agents: {},
    enemies: [],
    items: [],
    particles: [],
    wave: 0,
    tick: 0,
    dayTick: 0,
    isNight: false,
    running: false,
    paused: false,
    gameOver: false,
    speed: 4,
    controlled: null, // agent key being controlled
    leaderboard: [],
    aliveCount: 5,
    waveTimer: 0,
    nextWaveTicks: 150, // first wave starts early
    animFrame: null,
    lastTime: 0,
    accumulator: 0,
    // Learning agent memory
    deathCauses: [],
};

// ==================== DOM ====================
const $ = id => document.getElementById(id);
const canvas = $('arena');
const ctx = canvas.getContext('2d');

// ==================== INIT ====================
function init() {
    calcTileSize();
    generateTerrain();
    spawnAgents();
    spawnItems(6);
    render();
    bindEvents();
    updateAllUI();
    log('Arena ready. Press Start!', 'wave');
}

function calcTileSize() {
    const wrap = $('arena-wrap');
    const maxDim = Math.min(window.innerWidth - 540, window.innerHeight - 150, 620);
    const size = Math.max(300, maxDim);
    S.tile = Math.floor(size / GRID);
    const px = S.tile * GRID;
    canvas.width = px;
    canvas.height = px;
    canvas.style.width = px + 'px';
    canvas.style.height = px + 'px';
}

function generateTerrain() {
    S.terrain = [];
    for (let r = 0; r < GRID; r++) {
        S.terrain[r] = [];
        for (let c = 0; c < GRID; c++) {
            const rnd = Math.random();
            if (rnd < 0.08) S.terrain[r][c] = TERRAIN.WATER;
            else if (rnd < 0.12) S.terrain[r][c] = TERRAIN.LAVA;
            else if (rnd < 0.20) S.terrain[r][c] = TERRAIN.FOREST;
            else S.terrain[r][c] = TERRAIN.GRASS;
        }
    }
    // Clear center area for agents to start
    for (let r = 10; r < 15; r++)
        for (let c = 10; c < 15; c++)
            S.terrain[r][c] = TERRAIN.GRASS;
}

function spawnAgents() {
    S.agents = {};
    const positions = [[12,10],[12,14],[10,12],[14,12],[12,12]];
    AGENT_TYPES.forEach((type, i) => {
        S.agents[type] = {
            type, r: positions[i][0], c: positions[i][1],
            hp: 100, hunger: 100, energy: 100,
            alive: true, shield: false, speedBoost: 0, visionBoost: 0,
            survivalTime: 0, kills: 0,
            // Model-based memory
            dangerMap: Array.from({length:GRID}, () => Array(GRID).fill(0)),
            // Learning adaptations
            avoidLava: false, seekForest: false, fleeDistance: 2,
        };
    });
}

// ==================== TERRAIN HELPERS ====================
function terrainAt(r, c) {
    if (r < 0 || r >= GRID || c < 0 || c >= GRID) return -1;
    return S.terrain[r][c];
}

function isWalkable(r, c) {
    return r >= 0 && r < GRID && c >= 0 && c < GRID;
}

function neighbors(r, c) {
    return [[-1,0],[1,0],[0,-1],[0,1]]
        .map(([dr,dc]) => [r+dr, c+dc])
        .filter(([nr,nc]) => isWalkable(nr,nc));
}

// ==================== ITEMS ====================
function spawnItems(count) {
    for (let i = 0; i < count; i++) {
        let r, c, tries = 0;
        do { r = Math.floor(Math.random()*GRID); c = Math.floor(Math.random()*GRID); tries++; }
        while (S.terrain[r][c] === TERRAIN.LAVA && tries < 30);
        const type = ITEM_TYPES[Math.floor(Math.random()*ITEM_TYPES.length)];
        S.items.push({ type, r, c, ttl: 250 + Math.floor(Math.random()*150) });
    }
}

function collectItem(agent, item) {
    switch(item.type) {
        case 'food': agent.hunger = Math.min(100, agent.hunger + 35); break;
        case 'heal': agent.hp = Math.min(100, agent.hp + 50); break;
        case 'speed': agent.speedBoost = 30; break;
        case 'shield': agent.shield = true; break;
        case 'bomb':
            // Destroy enemies in radius 3
            S.enemies = S.enemies.filter(e => {
                if (Math.abs(e.r - agent.r) <= 3 && Math.abs(e.c - agent.c) <= 3) {
                    spawnParticles(e.r, e.c, '#ff9500', 6);
                    agent.kills++;
                    return false;
                }
                return true;
            });
            spawnParticles(agent.r, agent.c, '#ffd700', 12);
            log(`${AGENT_NAMES[agent.type]} used BOMB! 💣`, 'pickup');
            break;
        case 'vision': agent.visionBoost = 40; break;
    }
    if (item.type !== 'bomb') log(`${AGENT_NAMES[agent.type]} picked up ${ITEM_EMOJIS[item.type]}`, 'pickup');
}

// ==================== ENEMIES ====================
function spawnWave() {
    S.wave++;
    const count = 2 + Math.floor(S.wave * 1.3);
    const isBoss = S.wave % 5 === 0;

    log(`⚔️ WAVE ${S.wave}!` + (isBoss ? ' 👹 BOSS!' : ''), isBoss ? 'boss' : 'wave');

    for (let i = 0; i < count; i++) {
        // Spawn on edges
        let r, c;
        const edge = Math.floor(Math.random() * 4);
        switch (edge) {
            case 0: r = 0; c = Math.floor(Math.random()*GRID); break;
            case 1: r = GRID-1; c = Math.floor(Math.random()*GRID); break;
            case 2: r = Math.floor(Math.random()*GRID); c = 0; break;
            case 3: r = Math.floor(Math.random()*GRID); c = GRID-1; break;
        }
        S.enemies.push({
            r, c, hp: isBoss && i === 0 ? 5 : 1,
            boss: isBoss && i === 0,
            speed: S.isNight ? 2 : 1,
            moveCooldown: 0,
        });
    }

    if (isBoss) {
        // Boss spawns at a random edge center
        S.enemies.push({
            r: Math.random() > 0.5 ? 0 : GRID-1,
            c: Math.floor(GRID/2),
            hp: 8 + S.wave, boss: true, speed: 1, moveCooldown: 0,
        });
    }

    $('wave-num').textContent = S.wave;
    S.nextWaveTicks = 140 + Math.max(0, 60 - S.wave * 3);
    S.waveTimer = 0;
}

function moveEnemies() {
    const alive = Object.values(S.agents).filter(a => a.alive);
    if (alive.length === 0) return;

    for (const e of S.enemies) {
        e.moveCooldown--;
        if (e.moveCooldown > 0) continue;
        e.moveCooldown = e.boss ? 3 : 2;

        // Chase nearest alive agent
        let nearest = alive[0], minDist = Infinity;
        for (const a of alive) {
            const d = Math.abs(a.r - e.r) + Math.abs(a.c - e.c);
            if (d < minDist) { minDist = d; nearest = a; }
        }

        // Move toward nearest agent (simple chase)
        const dr = Math.sign(nearest.r - e.r);
        const dc = Math.sign(nearest.c - e.c);

        // Try primary direction, then secondary
        const moves = Math.abs(dr) >= Math.abs(dc)
            ? [[dr,0],[0,dc],[0,-dc]]
            : [[0,dc],[dr,0],[-dr,0]];

        for (const [mr, mc] of moves) {
            const nr = e.r + mr;
            const nc = e.c + mc;
            if (isWalkable(nr, nc) && S.terrain[nr][nc] !== TERRAIN.WATER) {
                e.r = nr; e.c = nc;
                break;
            }
        }
    }
}

function checkEnemyCollisions() {
    for (const type of AGENT_TYPES) {
        const a = S.agents[type];
        if (!a.alive) continue;

        for (const e of S.enemies) {
            if (e.r === a.r && e.c === a.c) {
                if (a.shield) {
                    a.shield = false;
                    spawnParticles(a.r, a.c, '#00d4ff', 6);
                    log(`${AGENT_NAMES[type]}'s shield blocked a hit! 🛡️`, 'pickup');
                } else {
                    const dmg = e.boss ? 35 : 20;
                    a.hp -= dmg;
                    spawnParticles(a.r, a.c, AGENT_COLORS[type], 5);
                    log(`${AGENT_NAMES[type]} hit by ${e.boss ? 'BOSS' : 'enemy'}! (-${dmg} HP)`, 'danger');
                    if (a.hp <= 0) killAgent(a, 'enemy');
                }
            }
        }
    }
}

function killAgent(agent, cause) {
    agent.alive = false;
    agent.hp = 0;
    S.aliveCount--;
    S.deathCauses.push({ type: agent.type, cause, wave: S.wave, r: agent.r, c: agent.c, terrain: S.terrain[agent.r][agent.c] });
    S.leaderboard.push({ type: agent.type, time: agent.survivalTime, wave: S.wave, kills: agent.kills });
    spawnParticles(agent.r, agent.c, AGENT_COLORS[agent.type], 15);
    log(`💀 ${AGENT_NAMES[agent.type]} DIED! (${cause}) Wave ${S.wave}`, 'death');

    $(`card-${agent.type}`).classList.add('dead');
    $(`status-${agent.type}`).textContent = `☠️ Dead (Wave ${S.wave})`;
    $('alive-count').textContent = S.aliveCount;

    if (S.controlled === agent.type) S.controlled = null;

    updateLeaderboard();

    if (S.aliveCount <= 0) endGame();
    else if (S.aliveCount === 1) {
        const winner = Object.values(S.agents).find(a => a.alive);
        log(`🏆 ${AGENT_NAMES[winner.type]} is the last one standing!`, 'wave');
    }
}

// ==================== AGENT AI ====================

function agentThink(type) {
    const a = S.agents[type];
    if (!a.alive || (S.controlled === type)) return; // player-controlled

    let move = null;

    switch (type) {
        case 'reflex': move = aiReflex(a); break;
        case 'model': move = aiModel(a); break;
        case 'goal': move = aiGoal(a); break;
        case 'utility': move = aiUtility(a); break;
        case 'learning': move = aiLearning(a); break;
    }

    if (move) moveAgent(a, move[0], move[1]);
}

// Simple Reflex: Only sees adjacent cells, reacts to immediate threats
function aiReflex(a) {
    const adj = neighbors(a.r, a.c);
    // Rule 1: If enemy adjacent, flee opposite direction
    for (const e of S.enemies) {
        if (Math.abs(e.r - a.r) <= 1 && Math.abs(e.c - a.c) <= 1) {
            const dr = Math.sign(a.r - e.r);
            const dc = Math.sign(a.c - e.c);
            const nr = a.r + dr, nc = a.c + dc;
            if (isWalkable(nr, nc)) return [dr, dc];
        }
    }
    // Rule 2: If item adjacent, grab it
    for (const item of S.items) {
        if (Math.abs(item.r - a.r) <= 1 && Math.abs(item.c - a.c) <= 1) {
            return [Math.sign(item.r - a.r), Math.sign(item.c - a.c)];
        }
    }
    // Rule 3: Random move
    if (adj.length > 0) {
        const [nr, nc] = adj[Math.floor(Math.random() * adj.length)];
        return [nr - a.r, nc - a.c];
    }
    return null;
}

// Special: Panic Dash (teleport to random safe cell when HP < 25)
function reflexPanicDash(a) {
    if (a.hp < 25 && Math.random() < 0.3) {
        let tries = 0;
        while (tries < 20) {
            const r = Math.floor(Math.random() * GRID);
            const c = Math.floor(Math.random() * GRID);
            if (S.terrain[r][c] === TERRAIN.GRASS) {
                const enemyNear = S.enemies.some(e => Math.abs(e.r-r)+Math.abs(e.c-c) < 4);
                if (!enemyNear) {
                    a.r = r; a.c = c;
                    spawnParticles(r, c, '#ff4444', 8);
                    log(`${AGENT_NAMES.reflex} used PANIC DASH! 💨`, 'pickup');
                    return true;
                }
            }
            tries++;
        }
    }
    return false;
}

// Model-Based: Remembers where threats were, avoids danger zones
function aiModel(a) {
    // Update danger map: mark enemy positions
    for (const e of S.enemies) {
        if (e.r >= 0 && e.r < GRID && e.c >= 0 && e.c < GRID)
            a.dangerMap[e.r][e.c] = Math.min(10, a.dangerMap[e.r][e.c] + 3);
    }
    // Decay danger map
    for (let r = 0; r < GRID; r++)
        for (let c = 0; c < GRID; c++)
            a.dangerMap[r][c] = Math.max(0, a.dangerMap[r][c] - 0.1);

    const adj = neighbors(a.r, a.c);
    // Pick move with lowest danger and not lava
    let best = null, bestScore = Infinity;
    for (const [nr, nc] of adj) {
        let score = a.dangerMap[nr][nc];
        if (S.terrain[nr][nc] === TERRAIN.LAVA) score += 20;
        if (S.terrain[nr][nc] === TERRAIN.FOREST) score -= 2; // prefer hiding
        // Bonus for items
        for (const item of S.items) {
            if (item.r === nr && item.c === nc) score -= 5;
        }
        if (score < bestScore) { bestScore = score; best = [nr-a.r, nc-a.c]; }
    }
    return best;
}

// Goal-Based: Pathfinds to nearest resource using BFS
function aiGoal(a) {
    // Find nearest item or food/heal if low stats
    let targetR = -1, targetC = -1, minDist = Infinity;

    for (const item of S.items) {
        // Prioritize heal if HP low, food if hunger low
        let priority = 0;
        if (a.hp < 50 && item.type === 'heal') priority = -10;
        if (a.hunger < 40 && item.type === 'food') priority = -10;
        if (item.type === 'shield') priority = -3;
        if (item.type === 'bomb' && S.enemies.length > 4) priority = -5;

        const dist = Math.abs(item.r - a.r) + Math.abs(item.c - a.c) + priority;
        if (dist < minDist) { minDist = dist; targetR = item.r; targetC = item.c; }
    }

    if (targetR < 0) {
        // No items — flee from enemies
        return fleeFromEnemies(a, 3);
    }

    // BFS to target
    const path = bfsPath(a.r, a.c, targetR, targetC);
    if (path && path.length > 1) {
        return [path[1][0] - a.r, path[1][1] - a.c];
    }

    return fleeFromEnemies(a, 3);
}

// Utility-Based: Scores each move by weighing risk vs reward
function aiUtility(a) {
    const adj = neighbors(a.r, a.c);
    let best = null, bestUtil = -Infinity;

    for (const [nr, nc] of adj) {
        let util = 0;

        // Terrain cost
        const t = S.terrain[nr][nc];
        if (t === TERRAIN.LAVA) util -= 40;
        if (t === TERRAIN.WATER) util -= 5;
        if (t === TERRAIN.FOREST) util += 8; // hiding is good

        // Enemy threat assessment
        for (const e of S.enemies) {
            const dist = Math.abs(e.r - nr) + Math.abs(e.c - nc);
            if (dist === 0) util -= 50;
            else if (dist <= 2) util -= 20 / dist;
            else if (dist <= 4) util -= 5 / dist;
        }

        // Item attraction (weighted by need)
        for (const item of S.items) {
            const dist = Math.abs(item.r - nr) + Math.abs(item.c - nc);
            let value = 3;
            if (item.type === 'heal' && a.hp < 50) value = 15;
            if (item.type === 'food' && a.hunger < 50) value = 15;
            if (item.type === 'shield') value = 8;
            if (item.type === 'bomb' && S.enemies.length > 3) value = 12;
            util += value / (dist + 1);
        }

        // Prefer moving away from edges
        if (nr <= 1 || nr >= GRID-2 || nc <= 1 || nc >= GRID-2) util -= 3;

        // Proximity to other alive agents (safety in... not being clumped)
        for (const type2 of AGENT_TYPES) {
            const a2 = S.agents[type2];
            if (a2.alive && type2 !== a.type) {
                const d = Math.abs(a2.r - nr) + Math.abs(a2.c - nc);
                if (d < 2) util -= 2; // don't clump
            }
        }

        if (util > bestUtil) { bestUtil = util; best = [nr - a.r, nc - a.c]; }
    }
    return best;
}

// Learning: Adapts based on observations of other agent deaths
function aiLearning(a) {
    // Analyze deaths
    for (const d of S.deathCauses) {
        if (d.terrain === TERRAIN.LAVA) a.avoidLava = true;
        if (d.cause === 'enemy') a.fleeDistance = Math.max(a.fleeDistance, 4);
    }
    // After wave 3, prefer forests (learned hiding helps)
    if (S.wave >= 3) a.seekForest = true;

    const adj = neighbors(a.r, a.c);
    let best = null, bestScore = -Infinity;

    for (const [nr, nc] of adj) {
        let score = 0;
        const t = S.terrain[nr][nc];

        // Learned: avoid lava
        if (a.avoidLava && t === TERRAIN.LAVA) score -= 50;
        // Learned: seek forest
        if (a.seekForest && t === TERRAIN.FOREST) score += 15;

        // Flee from enemies with learned distance
        for (const e of S.enemies) {
            const dist = Math.abs(e.r - nr) + Math.abs(e.c - nc);
            if (dist < a.fleeDistance) score -= 30 / (dist + 1);
        }

        // Item attraction — learning agent gets smarter about priorities
        for (const item of S.items) {
            const dist = Math.abs(item.r - nr) + Math.abs(item.c - nc);
            let value = 5;
            if (item.type === 'bomb' && S.enemies.length > 3) value = 20;
            if (item.type === 'shield') value = 12;
            if (item.type === 'heal' && a.hp < 60) value = 18;
            if (item.type === 'food' && a.hunger < 50) value = 16;
            score += value / (dist + 1);
        }

        // Evolution bonus: gets stat boost each wave survived
        score += S.wave * 0.5;

        if (score > bestScore) { bestScore = score; best = [nr - a.r, nc - a.c]; }
    }
    return best;
}

// ==================== MOVEMENT HELPERS ====================

function moveAgent(a, dr, dc) {
    const nr = a.r + dr;
    const nc = a.c + dc;
    if (!isWalkable(nr, nc)) return;
    // Water: only move if has energy
    if (S.terrain[nr][nc] === TERRAIN.WATER) {
        a.energy -= 3;
    }
    a.r = nr;
    a.c = nc;
}

function fleeFromEnemies(a, minDist) {
    const adj = neighbors(a.r, a.c);
    let best = null, bestDistSum = -1;
    for (const [nr, nc] of adj) {
        let totalDist = 0;
        for (const e of S.enemies) {
            totalDist += Math.abs(e.r - nr) + Math.abs(e.c - nc);
        }
        if (S.terrain[nr][nc] === TERRAIN.LAVA) totalDist -= 100;
        if (totalDist > bestDistSum) { bestDistSum = totalDist; best = [nr - a.r, nc - a.c]; }
    }
    return best;
}

function bfsPath(sr, sc, gr, gc) {
    const queue = [[sr, sc]];
    const visited = new Set();
    visited.add(`${sr},${sc}`);
    const parent = {};

    while (queue.length > 0) {
        const [r, c] = queue.shift();
        if (r === gr && c === gc) {
            // Reconstruct
            const path = [];
            let cur = [gr, gc];
            while (cur) {
                path.unshift(cur);
                cur = parent[`${cur[0]},${cur[1]}`] || null;
            }
            return path;
        }
        for (const [nr, nc] of neighbors(r, c)) {
            const k = `${nr},${nc}`;
            if (!visited.has(k) && S.terrain[nr][nc] !== TERRAIN.LAVA) {
                visited.add(k);
                parent[k] = [r, c];
                queue.push([nr, nc]);
            }
        }
    }
    return null;
}

// ==================== GAME LOOP ====================

function gameTick() {
    if (!S.running || S.paused || S.gameOver) return;
    S.tick++;

    // Day/Night cycle
    S.dayTick++;
    const cycleDuration = S.isNight ? NIGHT_DURATION : DAY_DURATION;
    if (S.dayTick >= cycleDuration) {
        S.dayTick = 0;
        S.isNight = !S.isNight;
        $('arena-wrap').classList.toggle('night', S.isNight);
        $('time-icon').textContent = S.isNight ? '🌙' : '☀️';
        $('time-label').textContent = S.isNight ? 'NIGHT' : 'DAY';
        log(S.isNight ? '🌙 Night falls... enemies grow stronger!' : '☀️ Day breaks!', 'wave');
        // Night: enemies get speed buff
        for (const e of S.enemies) e.speed = S.isNight ? 2 : 1;
    }
    $('time-bar').style.width = (1 - S.dayTick / cycleDuration) * 100 + '%';

    // Wave spawning
    S.waveTimer++;
    if (S.waveTimer >= S.nextWaveTicks) spawnWave();

    // Agent stat drain
    for (const type of AGENT_TYPES) {
        const a = S.agents[type];
        if (!a.alive) continue;
        a.survivalTime++;
        a.hunger -= 0.15;
        a.energy -= 0.1;
        if (a.speedBoost > 0) a.speedBoost--;
        if (a.visionBoost > 0) a.visionBoost--;

        // Lava damage
        if (S.terrain[a.r][a.c] === TERRAIN.LAVA) {
            a.hp -= 2;
            if (S.tick % 15 === 0) spawnParticles(a.r, a.c, '#ff6600', 2);
        }

        // Hunger/energy death
        if (a.hunger <= 0) { a.hunger = 0; a.hp -= 1; }
        if (a.energy <= 0) { a.energy = 0; a.hp -= 0.5; }

        if (a.hp <= 0) killAgent(a, a.hunger <= 0 ? 'starvation' : (S.terrain[a.r][a.c] === TERRAIN.LAVA ? 'lava' : 'exhaustion'));

        // Learning agent evolves: small stat buff each wave
        if (type === 'learning' && S.tick % 200 === 0 && S.wave > 0) {
            a.hp = Math.min(100, a.hp + 2);
            a.energy = Math.min(100, a.energy + 2);
        }
    }

    // Agent AI moves (every other tick for non-boosted, every tick for boosted)
    if (S.tick % 2 === 0) {
        for (const type of AGENT_TYPES) {
            const a = S.agents[type];
            if (!a.alive) continue;
            if (type === 'reflex' && reflexPanicDash(a)) continue;
            if (a.speedBoost > 0 || S.tick % 2 === 0) agentThink(type);
        }
    }

    // Move enemies
    if (S.tick % 3 === 0) moveEnemies();

    // Item collection
    for (const type of AGENT_TYPES) {
        const a = S.agents[type];
        if (!a.alive) continue;
        S.items = S.items.filter(item => {
            if (item.r === a.r && item.c === a.c) {
                collectItem(a, item);
                return false;
            }
            return true;
        });
    }

    // Check enemy collisions
    checkEnemyCollisions();

    // Item TTL & respawn
    S.items = S.items.filter(i => { i.ttl--; return i.ttl > 0; });
    if (S.items.length < 3 + Math.floor(S.wave / 2)) spawnItems(1);

    // Particles
    S.particles = S.particles.filter(p => { p.life--; p.x += p.vx; p.y += p.vy; p.vy += 0.1; return p.life > 0; });

    updateAllUI();
}

function endGame() {
    S.gameOver = true;
    S.running = false;

    // Sort leaderboard by survival time
    S.leaderboard.sort((a, b) => b.time - a.time);
    updateLeaderboard();

    const winner = S.leaderboard[0];
    const ov = $('overlay');
    const oc = $('overlay-content');
    oc.innerHTML = `
        <h2>🏆 Game Over!</h2>
        <p>All agents eliminated at <strong>Wave ${S.wave}</strong></p>
        <p class="winner-name">${AGENT_EMOJIS[winner.type]} ${AGENT_NAMES[winner.type]} survived longest!</p>
        <p style="margin-top:0.8rem;color:#888">Survived ${Math.floor(winner.time/10)}s · ${winner.kills} kills</p>
        <button class="btn btn-start" onclick="restartGame()" style="margin-top:1rem;">🔄 Play Again</button>
    `;
    ov.classList.remove('hidden');
    $('btn-pause').classList.add('hidden');
    $('btn-restart').classList.remove('hidden');

    log(`🏆 GAME OVER! ${AGENT_NAMES[winner.type]} wins! (Wave ${S.wave})`, 'wave');
}

// ==================== RENDER ====================

function render() {
    const t = S.tile;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const colors = S.isNight ? TERRAIN_COLORS_NIGHT : TERRAIN_COLORS_DAY;
    const gridColors = S.isNight ? TERRAIN_GRID_NIGHT : TERRAIN_GRID_DAY;

    // Terrain
    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            const terrain = S.terrain[r][c];
            ctx.fillStyle = colors[terrain];
            ctx.fillRect(c * t, r * t, t, t);

            // Grid lines
            ctx.strokeStyle = gridColors[terrain];
            ctx.lineWidth = 0.5;
            ctx.strokeRect(c * t, r * t, t, t);

            // Lava glow
            if (terrain === TERRAIN.LAVA && S.tick % 20 < 10) {
                ctx.fillStyle = 'rgba(255,100,0,0.15)';
                ctx.fillRect(c * t, r * t, t, t);
            }
            // Water ripple
            if (terrain === TERRAIN.WATER) {
                ctx.fillStyle = `rgba(0,150,255,${0.05 + 0.03 * Math.sin(S.tick * 0.1 + r + c)})`;
                ctx.fillRect(c * t, r * t, t, t);
            }
        }
    }

    // Night fog
    if (S.isNight) {
        // Show limited visibility around agents
        ctx.fillStyle = 'rgba(0,0,10,0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Cut out visibility circles for alive agents
        for (const type of AGENT_TYPES) {
            const a = S.agents[type];
            if (!a.alive) continue;
            const radius = (a.visionBoost > 0 ? 6 : 2.5) * t;
            const cx = a.c * t + t/2, cy = a.r * t + t/2;
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
            grad.addColorStop(0, 'rgba(0,0,0,1)');
            grad.addColorStop(0.7, 'rgba(0,0,0,0.8)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // Items
    ctx.font = `${t * 0.65}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const item of S.items) {
        const x = item.c * t + t/2;
        const y = item.r * t + t/2;
        // Pulsing glow
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 4 + 3 * Math.sin(S.tick * 0.15);
        ctx.fillText(ITEM_EMOJIS[item.type], x, y);
        ctx.shadowBlur = 0;
    }

    // Enemies
    for (const e of S.enemies) {
        const x = e.c * t + t/2;
        const y = e.r * t + t/2;
        const size = e.boss ? t * 0.9 : t * 0.65;
        ctx.font = `${size}px serif`;
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = e.boss ? 10 : 4;
        ctx.fillText(e.boss ? '👹' : '☠️', x, y);
        ctx.shadowBlur = 0;

        // Boss HP bar
        if (e.boss) {
            const bw = t * 0.8;
            const bx = e.c * t + (t - bw) / 2;
            const by = e.r * t - 4;
            ctx.fillStyle = '#333';
            ctx.fillRect(bx, by, bw, 3);
            ctx.fillStyle = '#ff4444';
            ctx.fillRect(bx, by, bw * (e.hp / (8 + S.wave)), 3);
        }
    }

    // Agents
    for (const type of AGENT_TYPES) {
        const a = S.agents[type];
        if (!a.alive) continue;
        const cx = a.c * t + t/2;
        const cy = a.r * t + t/2;
        const r = t * 0.38;

        // Glow
        ctx.shadowColor = AGENT_COLORS[type];
        ctx.shadowBlur = S.controlled === type ? 15 : 8;

        // Body
        ctx.fillStyle = AGENT_COLORS[type];
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Inner lighter center
        ctx.fillStyle = `rgba(255,255,255,0.3)`;
        ctx.beginPath();
        ctx.arc(cx - r*0.15, cy - r*0.15, r*0.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;

        // Shield indicator
        if (a.shield) {
            ctx.strokeStyle = '#00d4ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
            ctx.stroke();
        }

        // HP bar above agent
        const bw = t * 0.7;
        const bx = a.c * t + (t - bw) / 2;
        const by = a.r * t - 3;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx, by, bw, 2);
        ctx.fillStyle = a.hp > 50 ? '#00ff87' : (a.hp > 25 ? '#ffd700' : '#ff4444');
        ctx.fillRect(bx, by, bw * (a.hp / 100), 2);

        // Controlled indicator
        if (S.controlled === type) {
            ctx.strokeStyle = 'rgba(0,212,255,0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(a.c * t + 1, a.r * t + 1, t - 2, t - 2);
            ctx.setLineDash([]);
        }
    }

    // Particles
    for (const p of S.particles) {
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (S.running && !S.paused) S.animFrame = requestAnimationFrame(render);
}

function spawnParticles(r, c, color, count) {
    const t = S.tile;
    for (let i = 0; i < count; i++) {
        S.particles.push({
            x: c * t + t/2, y: r * t + t/2,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3,
            color, size: 1 + Math.random() * 2,
            life: 15 + Math.floor(Math.random() * 15),
            maxLife: 30,
        });
    }
}

// ==================== UI ====================

function updateAllUI() {
    for (const type of AGENT_TYPES) {
        const a = S.agents[type];
        $(`hp-${type}`).style.width = Math.max(0, a.hp) + '%';
        $(`hp-val-${type}`).textContent = Math.max(0, Math.floor(a.hp));
        $(`hunger-${type}`).style.width = Math.max(0, a.hunger) + '%';
        $(`hunger-val-${type}`).textContent = Math.max(0, Math.floor(a.hunger));
        $(`energy-${type}`).style.width = Math.max(0, a.energy) + '%';
        $(`energy-val-${type}`).textContent = Math.max(0, Math.floor(a.energy));

        if (a.alive) {
            const status = S.controlled === type ? '🎮 You' :
                (a.shield ? '🛡️ Shielded' : (a.speedBoost > 0 ? '⚡ Boosted' : 'Active'));
            $(`status-${type}`).textContent = status;
        }
    }
}

function updateLeaderboard() {
    const sorted = [...S.leaderboard].sort((a, b) => b.time - a.time);
    for (let i = 0; i < 5; i++) {
        const el = $(`lb-${i+1}`);
        if (sorted[i]) {
            el.querySelector('.lb-name').textContent = `${AGENT_EMOJIS[sorted[i].type]} ${AGENT_NAMES[sorted[i].type]}`;
            el.querySelector('.lb-time').textContent = `${Math.floor(sorted[i].time/10)}s · W${sorted[i].wave}`;
            el.classList.add('eliminated');
        }
    }
}

function log(msg, cls = '') {
    const el = $('event-log');
    const entry = document.createElement('div');
    entry.className = `log-entry ${cls}`;
    entry.textContent = msg;
    el.prepend(entry);
    if (el.children.length > 50) el.removeChild(el.lastChild);
}

// ==================== CONTROLS ====================

function bindEvents() {
    $('btn-start').addEventListener('click', startGame);
    $('btn-pause').addEventListener('click', togglePause);
    $('btn-restart').addEventListener('click', restartGame);
    $('speed-slider').addEventListener('input', e => { S.speed = parseInt(e.target.value); });

    // Agent control buttons
    document.querySelectorAll('.btn-control').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.agent;
            if (S.controlled === type) {
                S.controlled = null;
                btn.classList.remove('active');
                document.querySelectorAll('.agent-card').forEach(c => c.classList.remove('controlled'));
            } else {
                S.controlled = type;
                document.querySelectorAll('.btn-control').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.agent-card').forEach(c => c.classList.remove('controlled'));
                btn.classList.add('active');
                $(`card-${type}`).classList.add('controlled');
                log(`🎮 You are now controlling ${AGENT_NAMES[type]}!`, 'pickup');

                // Show agent info
                const infoMap = {
                    reflex: 'Simple Reflex Agent: Reacts only to adjacent cells using condition-action rules. No memory, no planning. Special: Panic Dash when HP < 25.',
                    model: 'Model-Based Agent: Maintains an internal danger map of where enemies have been. Avoids high-danger zones. Special: Danger Map visualization.',
                    goal: 'Goal-Based Agent: Uses BFS to pathfind to the nearest resource. Prioritizes healing items when HP is low. Special: Resource Radar.',
                    utility: 'Utility-Based Agent: Scores every possible move by weighing terrain safety, enemy distance, item value. Picks the optimal action. Special: Risk Analysis.',
                    learning: 'Learning Agent: Observes how other agents die and adapts. Learns to avoid lava, seek forests, and flee at greater distances. Evolves each wave. Special: Evolve.',
                };
                $('info-box').innerHTML = `<p><strong>${AGENT_NAMES[type]}</strong></p><p>${infoMap[type]}</p>`;
            }
        });
    });

    // Keyboard
    document.addEventListener('keydown', e => {
        if (!S.controlled || !S.running || S.paused) return;
        const a = S.agents[S.controlled];
        if (!a.alive) return;

        let moved = false;
        switch(e.key) {
            case 'ArrowUp': moveAgent(a, -1, 0); moved = true; break;
            case 'ArrowDown': moveAgent(a, 1, 0); moved = true; break;
            case 'ArrowLeft': moveAgent(a, 0, -1); moved = true; break;
            case 'ArrowRight': moveAgent(a, 0, 1); moved = true; break;
            case ' ':
                e.preventDefault();
                // Use special ability
                if (S.controlled === 'reflex') reflexPanicDash(a);
                break;
        }
        if (moved) e.preventDefault();
    });
}

function startGame() {
    S.running = true;
    S.paused = false;
    $('btn-start').classList.add('hidden');
    $('btn-pause').classList.remove('hidden');
    $('btn-restart').classList.remove('hidden');
    $('overlay').classList.add('hidden');

    log('🎮 Game started! Survive as long as possible!', 'wave');

    // Start game loop
    S.tickInterval = setInterval(() => {
        const ticksPerFrame = Math.max(1, Math.floor(S.speed / 2));
        for (let i = 0; i < ticksPerFrame; i++) gameTick();
    }, 50);

    render();
}

function togglePause() {
    S.paused = !S.paused;
    $('btn-pause').textContent = S.paused ? '▶ Resume' : '⏸ Pause';
    if (!S.paused) render();
}

function restartGame() {
    S.running = false;
    S.paused = false;
    S.gameOver = false;
    S.tick = 0;
    S.dayTick = 0;
    S.isNight = false;
    S.wave = 0;
    S.waveTimer = 0;
    S.nextWaveTicks = 150;
    S.enemies = [];
    S.items = [];
    S.particles = [];
    S.leaderboard = [];
    S.deathCauses = [];
    S.controlled = null;
    S.aliveCount = 5;

    if (S.tickInterval) clearInterval(S.tickInterval);
    if (S.animFrame) cancelAnimationFrame(S.animFrame);

    $('arena-wrap').classList.remove('night');
    $('time-icon').textContent = '☀️';
    $('time-label').textContent = 'DAY';
    $('wave-num').textContent = '0';
    $('alive-count').textContent = '5';
    $('overlay').classList.add('hidden');
    $('event-log').innerHTML = '';
    $('btn-pause').textContent = '⏸ Pause';

    document.querySelectorAll('.agent-card').forEach(c => { c.classList.remove('dead','controlled'); });
    document.querySelectorAll('.btn-control').forEach(b => b.classList.remove('active'));
    for (let i = 1; i <= 5; i++) {
        $(`lb-${i}`).querySelector('.lb-name').textContent = '—';
        $(`lb-${i}`).querySelector('.lb-time').textContent = '—';
        $(`lb-${i}`).classList.remove('eliminated');
    }

    for (const type of AGENT_TYPES) {
        $(`status-${type}`).textContent = 'Ready';
    }

    $('info-box').innerHTML = '<p>Press <kbd>▶ Start</kbd> to begin!</p><p class="info-hint">Use ↑↓←→ to control a selected agent. Click 🎮 Control on any agent card.</p>';

    generateTerrain();
    spawnAgents();
    spawnItems(6);
    render();

    $('btn-start').classList.remove('hidden');
    $('btn-pause').classList.add('hidden');
    $('btn-restart').classList.add('hidden');

    log('Arena reset. Press Start!', 'wave');
}

// ==================== INIT ====================
window.addEventListener('resize', () => { calcTileSize(); render(); });
init();
