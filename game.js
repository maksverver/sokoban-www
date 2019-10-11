// This function should only be called once.
function initialize() {
    loadLevels(initializeLevelsSelect);
}

function loadLevels(callback) {
    var levelsRequest = new XMLHttpRequest();
    levelsRequest.addEventListener("load", () => {
        const levelText = levelsRequest.responseText
                .replace(/^;.*$/gm, '')
                .replace(/^\n+/, '')
                .replace(/\n+$/, '');
        const levels = levelText.split(/\n{2,}/);
        callback(levels);
    });
    levelsRequest.open("GET", "levels.txt");
    levelsRequest.send();
}

function initializeLevelsSelect(levels) {
    const selectedLevelIndex = 0;
    const levelsSelect = document.getElementById('levels-select');
    const levelTextArea = document.getElementById('level-definition');
    clearChildren(levelsSelect);
    for (let i = 0; i < levels.length; ++i) {
        let option = document.createElement('option');
        option.value = i;
        option.selected = i == selectedLevelIndex;
        option.appendChild(document.createTextNode('Level ' + (i + 1)));
        levelsSelect.appendChild(option)
    }
    if (selectedLevelIndex < levels.length) {
        levelTextArea.value = levels[selectedLevelIndex];
    }
    levelsSelect.onchange = () => {
        levelTextArea.value = levels[levelsSelect.value];
    };
}

function start() {
    const levelText = document.getElementById('level-definition').value;
    let level = parseLevel(levelText);
    if (!level) {
        alert('Invalid level definition!');
        return;
    }
    console.info('Loaded level', level);
    startLevel(level);
}

function parseLevel(levelText) {
    const lines = levelText.split('\n');
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    for (let r = 0; r < lines.length; ++r) {
        for (let c = 0; c < lines[r].length; ++c) {
            if ('#.$*@'.indexOf(lines[r][c]) >= 0) {
                minR = Math.min(minR, r);
                maxR = Math.max(maxR, r);
                minC = Math.min(minC, c);
                maxC = Math.max(maxC, c);
            }
        }
    }
    if (minR > maxR) {
        return null;  // empty bounding box
    }
    const height = maxR - minR + 1;
    const width = maxC - minC + 1;
    const walls = [];
    const goals = [];
    const boxes = [];
    let playerR = -Infinity, playerC = -Infinity;
    for (let r = minR; r <= maxR; ++r) {
        walls.push([]);
        boxes.push([]);
        goals.push([]);
        for (let c = minC; c <= maxC; ++c) {
            let wall = false;
            let goal = false;
            let box = false;
            let player = false;
            switch (lines[r][c]) {
                case '#':
                    wall = true;
                    break;
                case '.':
                    goal = true;
                    break;
                case '$':
                    box = true;
                    break;
                case '*':
                    goal = true;
                    box = true;
                    break;
                case '@':
                    player = true;
                    break;
            }
            if (player) {
                if (playerR >= 0) {
                    return null;  // multiple starting positions
                }
                playerR = r - minR;
                playerC = c - minC;
            }
            walls[r - minR].push(wall);
            goals[r - minR].push(goal);
            boxes[r - minR].push(box);
        }
    }
    if (playerR < 0) {
        return null;  // no starting position found
    }
    return {
        height: height,
        width: width,
        playerR: playerR,
        playerC: playerC,
        walls: walls,
        goals: goals,
        boxes: boxes,
    };
}

function createSvgElement(tag, attrs) {
    let elem = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (let [key, value] of Object.entries(attrs)) {
        elem.setAttribute(key, value);
    }
    return elem;
}

function createSvgUse(href, x, y) {
    return createSvgElement('use', {href: '#' + href, transform: 'translate(' + x + ' ' + y + ')'});
}

function clearChildren(elem) {
    while (elem.lastChild) {
        elem.removeChild(elem.lastChild);
    }
}

// This function should only be called once.
function startLevel(level) {
    document.addEventListener('keydown', event => {
        //console.log(event);
        let handled = false;
        switch (event.key) {
        case 'ArrowLeft':
            tryMove( 0, -1);
            handled = true;
            break;
        case 'ArrowUp':
            tryMove(-1,  0);
            handled = true;
            break;
        case 'ArrowRight':
            tryMove( 0, +1);
            handled = true;
            break;
        case 'ArrowDown':
            tryMove(+1,  0);
            handled = true;
            break;
        case 'z':
        case 'Z':
            if (event.ctrlKey) {
                if (event.shiftKey) {
                    tryRedo();
                } else {
                    tryUndo();
                }
                handled = true;
            }
            break;
        }
        if (handled) {
            event.stopPropagation();
            event.preventDefault();
        }
    });

    document.getElementById('setup-view').style.display = 'none';
    document.getElementById('game-view').style.display = 'flex';
    const svg = document.getElementById('play-area');
    svg.setAttribute('viewBox', '-0.1 -0.1 ' + level.width + '.2 ' + level.height + '.2');
    const gGrid = document.getElementById('game-grid');
    const gWalls = document.getElementById('game-walls');
    const gGoals = document.getElementById('game-goals');
    const gBoxes = document.getElementById('game-boxes');
    const gPlayer = document.getElementById('game-player');
    for (let r = 0; r < level.height; ++r) {
        for (let c = 0; c < level.width; ++c) {
            if (level.walls[r][c]) {
                gWalls.appendChild(createSvgUse('wall-cell', c, r));
            } else {
                gGrid.appendChild(createSvgUse('grid-cell', c, r));
            }
            if (level.goals[r][c]) {
                gGoals.appendChild(createSvgUse('goal-cell', c, r));
            }
        }
    }

    function updateCells() {
        clearChildren(gPlayer);
        gPlayer.appendChild(createSvgUse('player-cell', level.playerC, level.playerR));
        clearChildren(gBoxes);
        for (let r = 0; r < level.height; ++r) {
            for (let c = 0; c < level.width; ++c) {
                if (level.boxes[r][c]) {
                    gBoxes.appendChild(createSvgUse('box-cell', c, r));
                }
            }
        }
    }

    updateCells();

    const history = {
        index: 0,
        data: [{lastMove: null, levelJson: JSON.stringify(level)}],
    }

    function changeHistoryIndex(i) {
        if (i < 0 || i >= history.data.length) return false;
        history.index = i;
        level = JSON.parse(history.data[i].levelJson);
        updateCells();
        return true;
    }

    function tryMove(dr, dc) {
        const nr1 = level.playerR + dr;
        const nc1 = level.playerC + dc;
        if (level.walls[nr1][nc1]) {
            return false;
        }
        let push = false;
        if (level.boxes[nr1][nc1]) {
            const nr2 = nr1 + dr;
            const nc2 = nc1 + dc;
            if (level.walls[nr2][nc2] || level.boxes[nr2][nc2]) {
                return false;
            }
            level.boxes[nr2][nc2] = true;
            level.boxes[nr1][nc1] = false;
            push = true;
        }
        level.playerR = nr1;
        level.playerC = nc1;
        history.data.length = ++history.index;
        history.data.push({
            lastMove: {dr: dr, dc: dc, push: push},
            levelJson: JSON.stringify(level),
        });
        updateCells();
        return true;
    }

    function tryUndo() {
        return changeHistoryIndex(history.index - 1);
    }

    function tryRedo() {
        return changeHistoryIndex(history.index + 1);
    }
}
