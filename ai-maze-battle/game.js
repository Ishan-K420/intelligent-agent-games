/* ============================================================
   AI Maze Battle – Smart Agent vs Opponent
   Core game engine: Maze generation, Search algorithms, AI agents
   ============================================================ */

// ==================== STATE ====================
const state = {
    maze: [],
    rows: 15,
    cols: 15,
    start: null,
    goal: null,
    mode: 'pvai',         // 'pvai' | 'aivai'
    running: false,
    playerPos: null,
    playerSteps: 0,
    ai1Pos: null,
    ai1Steps: 0,
    ai1Algo: 'astar',
    ai1Explored: 0,
    ai1PathLen: 0,
    ai2Pos: null,
    ai2Steps: 0,
    ai2Algo: 'bfs',
    ai2Explored: 0,
    ai2PathLen: 0,
    aiSpeed: 5,
    showVisited: true,
    wins: 0,
    aiWins: 0,
    rounds: 0,
    ai1Timer: null,
    ai2Timer: null,
    ai1Path: [],
    ai2Path: [],
    ai1PathIdx: 0,
    ai2PathIdx: 0,
    gameOver: false,
};

// ==================== DOM ELEMENTS ====================
const $grid = document.getElementById('maze-grid');
const $mazeSize = document.getElementById('maze-size');
const $mazeSizeVal = document.getElementById('maze-size-val');
const $aiSpeed = document.getElementById('ai-speed');
const $aiSpeedVal = document.getElementById('ai-speed-val');
const $ai1Algo = document.getElementById('ai1-algo');
const $ai2Algo = document.getElementById('ai2-algo');
const $ai2Group = document.getElementById('ai2-group');
const $ai2Stats = document.getElementById('ai2-stats');
const $playerStats = document.getElementById('player-stats');
const $showVisited = document.getElementById('show-visited');
const $btnStart = document.getElementById('btn-start');
const $btnReset = document.getElementById('btn-reset');
const $btnNewMaze = document.getElementById('btn-new-maze');
const $btnPvai = document.getElementById('btn-pvai');
const $btnAivai = document.getElementById('btn-aivai');
const $gameMessage = document.getElementById('game-message');
const $messageText = document.getElementById('message-text');
const $controlsHint = document.getElementById('controls-hint');
const $algoInfo = document.getElementById('algo-info');

// Stat elements
const $playerSteps = document.getElementById('player-steps');
const $playerStatus = document.getElementById('player-status');
const $ai1Name = document.getElementById('ai1-name');
const $ai1Type = document.getElementById('ai1-type');
const $ai1Explored = document.getElementById('ai1-explored');
const $ai1Path = document.getElementById('ai1-path');
const $ai1Steps = document.getElementById('ai1-steps');
const $ai1Status = document.getElementById('ai1-status');
const $ai2Name = document.getElementById('ai2-name');
const $ai2Type = document.getElementById('ai2-type');
const $ai2Explored = document.getElementById('ai2-explored');
const $ai2Path = document.getElementById('ai2-path');
const $ai2Steps = document.getElementById('ai2-steps');
const $ai2Status = document.getElementById('ai2-status');
const $playerWins = document.getElementById('player-wins');
const $aiWins = document.getElementById('ai-wins');
const $totalRounds = document.getElementById('total-rounds');

// ==================== ALGORITHM INFO ====================
const ALGO_INFO = {
    bfs: {
        name: 'BFS',
        type: 'Goal-Based',
        desc: '<b>Breadth-First Search (BFS)</b> — Uses a <em>Queue (FIFO)</em>. Explores all neighbors at the current depth before going deeper. <b>Guarantees the shortest path</b> in an unweighted graph. This agent is <b>Goal-Based</b>: it knows the goal and searches systematically.',
    },
    dfs: {
        name: 'DFS',
        type: 'Explorer',
        desc: '<b>Depth-First Search (DFS)</b> — Uses a <em>Stack (LIFO)</em>. Explores as deep as possible before backtracking. May find longer paths but uses less memory. This agent is an <b>Explorer</b>: it dives deep into unknown territory.',
    },
    astar: {
        name: 'A*',
        type: 'Smart Agent',
        desc: '<b>A* Search</b> — Uses a <em>Priority Queue</em> with f(n) = g(n) + h(n). Combines actual cost with a Manhattan distance heuristic. <b>Optimal and efficient</b>. This is a <b>Smart Agent</b>: it uses informed search to find the best path.',
    },
    random: {
        name: 'Random',
        type: 'Simple Reflex',
        desc: '<b>Random Walk</b> — Moves to a random neighbor each step. No strategy, no memory. This is a <b>Simple Reflex Agent</b>: it only reacts to its current percept (adjacent cells) with no planning.',
    },
};

// ==================== MAZE GENERATION ====================
// Recursive backtracker (DFS-based) maze generation
function generateMaze(rows, cols) {
    // Initialize grid: all walls
    const grid = Array.from({ length: rows }, () => Array(cols).fill(1));

    function carve(r, c) {
        grid[r][c] = 0;
        const dirs = shuffle([
            [-2, 0], [2, 0], [0, -2], [0, 2]
        ]);
        for (const [dr, dc] of dirs) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr > 0 && nr < rows - 1 && nc > 0 && nc < cols - 1 && grid[nr][nc] === 1) {
                grid[r + dr / 2][c + dc / 2] = 0; // knock wall
                carve(nr, nc);
            }
        }
    }

    carve(1, 1);

    // Ensure start and goal are open
    const start = [1, 1];
    const goal = [rows - 2, cols - 2];
    grid[start[0]][start[1]] = 0;
    grid[goal[0]][goal[1]] = 0;

    return { grid, start, goal };
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ==================== SEARCH ALGORITHMS ====================

function getNeighbors(grid, r, c) {
    const neighbors = [];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < grid.length && nc >= 0 && nc < grid[0].length && grid[nr][nc] === 0) {
            neighbors.push([nr, nc]);
        }
    }
    return neighbors;
}

function key(r, c) { return `${r},${c}`; }

// BFS — returns { visited (in order), path }
function bfs(grid, start, goal) {
    const queue = [start];
    const visited = [];
    const parent = {};
    const seen = new Set();
    seen.add(key(start[0], start[1]));

    while (queue.length > 0) {
        const [r, c] = queue.shift();
        visited.push([r, c]);

        if (r === goal[0] && c === goal[1]) {
            return { visited, path: reconstructPath(parent, start, goal) };
        }

        for (const [nr, nc] of getNeighbors(grid, r, c)) {
            const k = key(nr, nc);
            if (!seen.has(k)) {
                seen.add(k);
                parent[k] = [r, c];
                queue.push([nr, nc]);
            }
        }
    }
    return { visited, path: [] };
}

// DFS — returns { visited (in order), path }
function dfs(grid, start, goal) {
    const stack = [start];
    const visited = [];
    const parent = {};
    const seen = new Set();
    seen.add(key(start[0], start[1]));

    while (stack.length > 0) {
        const [r, c] = stack.pop();
        visited.push([r, c]);

        if (r === goal[0] && c === goal[1]) {
            return { visited, path: reconstructPath(parent, start, goal) };
        }

        for (const [nr, nc] of getNeighbors(grid, r, c)) {
            const k = key(nr, nc);
            if (!seen.has(k)) {
                seen.add(k);
                parent[k] = [r, c];
                stack.push([nr, nc]);
            }
        }
    }
    return { visited, path: [] };
}

// A* — returns { visited (in order), path }
function astar(grid, start, goal) {
    const openSet = new MinHeap();
    const gScore = {};
    const parent = {};
    const visited = [];
    const closed = new Set();

    const sk = key(start[0], start[1]);
    gScore[sk] = 0;
    openSet.push({ r: start[0], c: start[1], f: heuristic(start, goal) });

    while (openSet.size() > 0) {
        const { r, c } = openSet.pop();
        const ck = key(r, c);

        if (closed.has(ck)) continue;
        closed.add(ck);
        visited.push([r, c]);

        if (r === goal[0] && c === goal[1]) {
            return { visited, path: reconstructPath(parent, start, goal) };
        }

        for (const [nr, nc] of getNeighbors(grid, r, c)) {
            const nk = key(nr, nc);
            if (closed.has(nk)) continue;

            const tentG = (gScore[ck] || 0) + 1;
            if (tentG < (gScore[nk] ?? Infinity)) {
                gScore[nk] = tentG;
                parent[nk] = [r, c];
                openSet.push({ r: nr, c: nc, f: tentG + heuristic([nr, nc], goal) });
            }
        }
    }
    return { visited, path: [] };
}

// Random walk — returns step-by-step path (no visited visualization)
function randomWalk(grid, start, goal, maxSteps = 5000) {
    const path = [start];
    let [r, c] = start;
    const visited = [];
    let steps = 0;

    while (steps < maxSteps) {
        visited.push([r, c]);
        if (r === goal[0] && c === goal[1]) {
            return { visited, path };
        }

        const neighbors = getNeighbors(grid, r, c);
        if (neighbors.length === 0) break;

        const [nr, nc] = neighbors[Math.floor(Math.random() * neighbors.length)];
        r = nr;
        c = nc;
        path.push([r, c]);
        steps++;
    }
    return { visited, path };
}

function heuristic(a, b) {
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function reconstructPath(parent, start, goal) {
    const path = [];
    let cur = goal;
    while (cur) {
        path.unshift(cur);
        const k = key(cur[0], cur[1]);
        cur = parent[k] || null;
        if (cur && cur[0] === start[0] && cur[1] === start[1]) {
            path.unshift(start);
            break;
        }
    }
    return path;
}

// MinHeap for A*
class MinHeap {
    constructor() { this.data = []; }
    size() { return this.data.length; }
    push(val) {
        this.data.push(val);
        this._bubbleUp(this.data.length - 1);
    }
    pop() {
        const top = this.data[0];
        const last = this.data.pop();
        if (this.data.length > 0) {
            this.data[0] = last;
            this._sinkDown(0);
        }
        return top;
    }
    _bubbleUp(i) {
        while (i > 0) {
            const p = Math.floor((i - 1) / 2);
            if (this.data[p].f <= this.data[i].f) break;
            [this.data[p], this.data[i]] = [this.data[i], this.data[p]];
            i = p;
        }
    }
    _sinkDown(i) {
        const n = this.data.length;
        while (true) {
            let smallest = i;
            const l = 2 * i + 1, r = 2 * i + 2;
            if (l < n && this.data[l].f < this.data[smallest].f) smallest = l;
            if (r < n && this.data[r].f < this.data[smallest].f) smallest = r;
            if (smallest === i) break;
            [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
            i = smallest;
        }
    }
}

// ==================== RENDERING ====================

function renderMaze() {
    const { grid, start, goal } = { grid: state.maze, start: state.start, goal: state.goal };
    const rows = grid.length;
    const cols = grid[0].length;

    // Calculate cell size based on viewport, not container (which may be unsized)
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    // Reserve space: ~160px header/footer, ~280px per side panel, some padding
    const availW = Math.max(300, viewportW - 620);
    const availH = Math.max(300, viewportH - 220);
    const maxDim = Math.min(availW, availH, 600);
    const cellSize = Math.max(8, Math.floor(maxDim / Math.max(rows, cols)));

    $grid.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
    $grid.style.gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;
    $grid.innerHTML = '';

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.id = `cell-${r}-${c}`;

            if (r === start[0] && c === start[1]) {
                cell.classList.add('start');
            } else if (r === goal[0] && c === goal[1]) {
                cell.classList.add('goal');
            } else if (grid[r][c] === 1) {
                cell.classList.add('wall');
            } else {
                cell.classList.add('path');
            }

            $grid.appendChild(cell);
        }
    }
}

function updateCell(r, c, addClass, removeClass) {
    const cell = document.getElementById(`cell-${r}-${c}`);
    if (!cell) return;
    if (removeClass) {
        if (Array.isArray(removeClass)) removeClass.forEach(cls => cell.classList.remove(cls));
        else cell.classList.remove(removeClass);
    }
    if (addClass) {
        if (Array.isArray(addClass)) addClass.forEach(cls => cell.classList.add(cls));
        else cell.classList.add(addClass);
    }
}

function clearCell(r, c) {
    const cell = document.getElementById(`cell-${r}-${c}`);
    if (!cell) return;
    cell.className = 'cell';
    if (state.maze[r][c] === 1) cell.classList.add('wall');
    else cell.classList.add('path');

    if (r === state.start[0] && c === state.start[1]) cell.classList.add('start');
    if (r === state.goal[0] && c === state.goal[1]) cell.classList.add('goal');
}

// ==================== GAME LOGIC ====================

function newMaze() {
    stopGame();
    state.rows = parseInt($mazeSize.value);
    state.cols = state.rows;
    const { grid, start, goal } = generateMaze(state.rows, state.cols);
    state.maze = grid;
    state.start = start;
    state.goal = goal;
    state.playerPos = [...start];
    state.ai1Pos = [...start];
    state.ai2Pos = [...start];
    state.playerSteps = 0;
    state.ai1Steps = 0;
    state.ai2Steps = 0;
    state.ai1Explored = 0;
    state.ai2Explored = 0;
    state.ai1PathLen = 0;
    state.ai2PathLen = 0;
    state.ai1Path = [];
    state.ai2Path = [];
    state.ai1PathIdx = 0;
    state.ai2PathIdx = 0;
    state.gameOver = false;

    renderMaze();
    updateStats();
    hideMessage();

    $btnStart.classList.remove('hidden');
    $btnReset.classList.add('hidden');
}

function startGame() {
    if (state.running) return;

    state.running = true;
    state.gameOver = false;
    state.ai1Algo = $ai1Algo.value;
    state.ai2Algo = $ai2Algo.value;
    state.aiSpeed = parseInt($aiSpeed.value);
    state.showVisited = $showVisited.checked;

    $btnStart.classList.add('hidden');
    $btnReset.classList.remove('hidden');

    // Update algo info
    const info = ALGO_INFO[state.ai1Algo];
    $ai1Name.textContent = info.name;
    $ai1Type.textContent = info.type;
    $ai1Status.textContent = 'Searching...';
    $algoInfo.innerHTML = info.desc;

    if (state.mode === 'pvai') {
        $playerStatus.textContent = 'Moving...';
        // Place player
        updateCell(state.playerPos[0], state.playerPos[1], 'player-pos');

        // AI searches and then walks
        runAI(1);
    } else {
        // AI vs AI
        const info2 = ALGO_INFO[state.ai2Algo];
        $ai2Name.textContent = info2.name;
        $ai2Type.textContent = info2.type;
        $ai2Status.textContent = 'Searching...';

        runAI(1);
        runAI(2);
    }
}

function stopGame() {
    state.running = false;
    if (state.ai1Timer) clearTimeout(state.ai1Timer);
    if (state.ai2Timer) clearTimeout(state.ai2Timer);
    state.ai1Timer = null;
    state.ai2Timer = null;
}

function resetGame() {
    stopGame();
    newMaze();
}

function runAI(agentNum) {
    const algo = agentNum === 1 ? state.ai1Algo : state.ai2Algo;
    let result;

    switch (algo) {
        case 'bfs':
            result = bfs(state.maze, state.start, state.goal);
            break;
        case 'dfs':
            result = dfs(state.maze, state.start, state.goal);
            break;
        case 'astar':
            result = astar(state.maze, state.start, state.goal);
            break;
        case 'random':
            result = randomWalk(state.maze, state.start, state.goal);
            break;
        default:
            result = bfs(state.maze, state.start, state.goal);
    }

    const { visited, path } = result;

    if (agentNum === 1) {
        state.ai1Explored = visited.length;
        state.ai1PathLen = path.length;
        state.ai1Path = path;
        state.ai1PathIdx = 0;
    } else {
        state.ai2Explored = visited.length;
        state.ai2PathLen = path.length;
        state.ai2Path = path;
        state.ai2PathIdx = 0;
    }

    updateStats();

    // Animate: first show search visualization, then walk the path
    if (state.showVisited && algo !== 'random') {
        animateSearch(agentNum, visited, path);
    } else {
        animateWalk(agentNum, path, 0);
    }
}

function animateSearch(agentNum, visited, path) {
    const suffix = agentNum === 1 ? 'ai1' : 'ai2';
    const delay = Math.max(5, 100 - state.aiSpeed * 10);
    let idx = 0;

    function step() {
        if (!state.running || state.gameOver) return;

        if (idx < visited.length) {
            const [r, c] = visited[idx];
            // Don't overwrite start/goal
            if (!(r === state.start[0] && c === state.start[1]) &&
                !(r === state.goal[0] && c === state.goal[1])) {
                updateCell(r, c, `visited-${suffix}`);
            }

            // Update explored count live
            if (agentNum === 1) {
                state.ai1Explored = idx + 1;
                $ai1Explored.textContent = state.ai1Explored;
            } else {
                state.ai2Explored = idx + 1;
                $ai2Explored.textContent = state.ai2Explored;
            }

            idx++;

            // Show multiple nodes per frame for faster visualization
            const nodesPerFrame = Math.max(1, Math.floor(state.aiSpeed / 2));
            for (let i = 0; i < nodesPerFrame - 1 && idx < visited.length; i++) {
                const [vr, vc] = visited[idx];
                if (!(vr === state.start[0] && vc === state.start[1]) &&
                    !(vr === state.goal[0] && vc === state.goal[1])) {
                    updateCell(vr, vc, `visited-${suffix}`);
                }
                idx++;
            }

            if (agentNum === 1) state.ai1Timer = setTimeout(step, delay);
            else state.ai2Timer = setTimeout(step, delay);
        } else {
            // Search done, now show path and walk
            if (agentNum === 1) {
                $ai1Status.textContent = 'Walking...';
                $ai1Path.textContent = path.length;
            } else {
                $ai2Status.textContent = 'Walking...';
                $ai2Path.textContent = path.length;
            }
            // Highlight the found path
            for (const [pr, pc] of path) {
                if (!(pr === state.start[0] && pc === state.start[1]) &&
                    !(pr === state.goal[0] && pc === state.goal[1])) {
                    updateCell(pr, pc, `path-${suffix}`, `visited-${suffix}`);
                }
            }
            // Small pause then walk
            setTimeout(() => animateWalk(agentNum, path, 0), 300);
        }
    }

    step();
}

function animateWalk(agentNum, path, idx) {
    if (!state.running || state.gameOver || idx >= path.length) return;

    const suffix = agentNum === 1 ? 'ai1' : 'ai2';
    const posKey = agentNum === 1 ? 'ai1Pos' : 'ai2Pos';
    const stepsKey = agentNum === 1 ? 'ai1Steps' : 'ai2Steps';
    const $steps = agentNum === 1 ? $ai1Steps : $ai2Steps;
    const posClass = `${suffix}-pos`;

    const walkDelay = Math.max(20, 150 - state.aiSpeed * 14);

    // Remove old position marker
    const [oldR, oldC] = state[posKey];
    updateCell(oldR, oldC, null, posClass);

    // Set new position
    const [r, c] = path[idx];
    state[posKey] = [r, c];
    state[stepsKey]++;
    $steps.textContent = state[stepsKey];
    updateCell(r, c, posClass);

    // Check win
    if (r === state.goal[0] && c === state.goal[1]) {
        handleAIWin(agentNum);
        return;
    }

    if (agentNum === 1) {
        state.ai1PathIdx = idx;
        state.ai1Timer = setTimeout(() => animateWalk(agentNum, path, idx + 1), walkDelay);
    } else {
        state.ai2PathIdx = idx;
        state.ai2Timer = setTimeout(() => animateWalk(agentNum, path, idx + 1), walkDelay);
    }
}

function handleAIWin(agentNum) {
    state.gameOver = true;
    state.running = false;
    state.rounds++;

    if (state.mode === 'pvai') {
        state.aiWins++;
        showMessage('🤖 AI WINS!', 'lose');
        $playerStatus.textContent = 'Lost';
        $ai1Status.textContent = '🏆 Winner!';
    } else {
        if (agentNum === 1) {
            state.wins++; // AI 1 wins count as "wins" column
            showMessage(`🤖 AI 1 (${ALGO_INFO[state.ai1Algo].name}) WINS!`, 'info');
            $ai1Status.textContent = '🏆 Winner!';
            $ai2Status.textContent = 'Lost';
        } else {
            state.aiWins++;
            showMessage(`🤖 AI 2 (${ALGO_INFO[state.ai2Algo].name}) WINS!`, 'info');
            $ai2Status.textContent = '🏆 Winner!';
            $ai1Status.textContent = 'Lost';
        }
    }

    // Stop the other AI
    if (state.ai1Timer) clearTimeout(state.ai1Timer);
    if (state.ai2Timer) clearTimeout(state.ai2Timer);

    updateScoreboard();
}

function handlePlayerWin() {
    state.gameOver = true;
    state.running = false;
    state.wins++;
    state.rounds++;

    showMessage('🎉 YOU WIN!', 'win');
    $playerStatus.textContent = '🏆 Winner!';
    $ai1Status.textContent = 'Lost';

    if (state.ai1Timer) clearTimeout(state.ai1Timer);
    if (state.ai2Timer) clearTimeout(state.ai2Timer);

    updateScoreboard();
}

// ==================== PLAYER MOVEMENT ====================

function movePlayer(dr, dc) {
    if (!state.running || state.gameOver || state.mode !== 'pvai') return;

    const [r, c] = state.playerPos;
    const nr = r + dr;
    const nc = c + dc;

    if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) return;
    if (state.maze[nr][nc] === 1) return;

    // Remove old position
    updateCell(r, c, null, 'player-pos');

    // Move
    state.playerPos = [nr, nc];
    state.playerSteps++;
    $playerSteps.textContent = state.playerSteps;
    updateCell(nr, nc, 'player-pos');

    // Check win
    if (nr === state.goal[0] && nc === state.goal[1]) {
        handlePlayerWin();
    }
}

// ==================== UI UPDATES ====================

function updateStats() {
    $ai1Explored.textContent = state.ai1Explored;
    $ai1Path.textContent = state.ai1PathLen;
    $ai1Steps.textContent = state.ai1Steps;
    $playerSteps.textContent = state.playerSteps;
    $ai2Explored.textContent = state.ai2Explored;
    $ai2Path.textContent = state.ai2PathLen;
    $ai2Steps.textContent = state.ai2Steps;
}

function updateScoreboard() {
    $playerWins.textContent = state.wins;
    $aiWins.textContent = state.aiWins;
    $totalRounds.textContent = state.rounds;
}

function showMessage(text, type) {
    $messageText.textContent = text;
    $gameMessage.className = `game-message ${type}`;
    $gameMessage.classList.remove('hidden');
}

function hideMessage() {
    $gameMessage.classList.add('hidden');
}

function updateModeUI() {
    if (state.mode === 'pvai') {
        $btnPvai.classList.add('active');
        $btnAivai.classList.remove('active');
        $ai2Group.classList.add('hidden');
        $ai2Stats.classList.add('hidden');
        $playerStats.classList.remove('hidden');
        $controlsHint.classList.remove('hidden');
        // Re-label scoreboard
        document.querySelector('.score-card .stat-row:first-child .stat-label').textContent = 'Player Wins';
        document.querySelector('.score-card .stat-row:nth-child(2) .stat-label').textContent = 'AI Wins';
    } else {
        $btnAivai.classList.add('active');
        $btnPvai.classList.remove('active');
        $ai2Group.classList.remove('hidden');
        $ai2Stats.classList.remove('hidden');
        $playerStats.classList.add('hidden');
        $controlsHint.classList.add('hidden');
        document.querySelector('.score-card .stat-row:first-child .stat-label').textContent = 'AI 1 Wins';
        document.querySelector('.score-card .stat-row:nth-child(2) .stat-label').textContent = 'AI 2 Wins';
    }
}

// ==================== EVENT LISTENERS ====================

$mazeSize.addEventListener('input', () => {
    $mazeSizeVal.textContent = `${$mazeSize.value} × ${$mazeSize.value}`;
});

$aiSpeed.addEventListener('input', () => {
    $aiSpeedVal.textContent = $aiSpeed.value;
    state.aiSpeed = parseInt($aiSpeed.value);
});

$btnPvai.addEventListener('click', () => {
    state.mode = 'pvai';
    updateModeUI();
    newMaze();
});

$btnAivai.addEventListener('click', () => {
    state.mode = 'aivai';
    updateModeUI();
    newMaze();
});

$btnNewMaze.addEventListener('click', newMaze);
$btnStart.addEventListener('click', startGame);
$btnReset.addEventListener('click', resetGame);

$ai1Algo.addEventListener('change', () => {
    const info = ALGO_INFO[$ai1Algo.value];
    $ai1Name.textContent = info.name;
    $ai1Type.textContent = info.type;
    $algoInfo.innerHTML = info.desc;
});

$ai2Algo.addEventListener('change', () => {
    const info = ALGO_INFO[$ai2Algo.value];
    $ai2Name.textContent = info.name;
    $ai2Type.textContent = info.type;
});

document.addEventListener('keydown', (e) => {
    switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); movePlayer(-1, 0); break;
        case 'ArrowDown':  e.preventDefault(); movePlayer(1, 0);  break;
        case 'ArrowLeft':  e.preventDefault(); movePlayer(0, -1); break;
        case 'ArrowRight': e.preventDefault(); movePlayer(0, 1);  break;
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    if (state.maze.length > 0) renderMaze();
});

// ==================== INIT ====================

function init() {
    updateModeUI();
    const info = ALGO_INFO[$ai1Algo.value];
    $ai1Name.textContent = info.name;
    $ai1Type.textContent = info.type;
    $algoInfo.innerHTML = info.desc;
    newMaze();
}

init();
