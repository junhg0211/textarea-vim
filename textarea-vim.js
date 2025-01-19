const MODE_NORMAL = "NORMAL";
const MODE_INSERT = "INSERT";

function getCursorPosition(where) {
    const selectionEnd = where.selectionEnd;
    const previousLines = where.value
        .substring(0, selectionEnd).split(/\n/g);
    
    const rows = previousLines.length;
    const cols = previousLines[rows-1].length;

    return [rows, cols];
}

function setCursorPosition(where, rows, cols, force) {
    force = force !== undefined;

    const lines = where.value.split(/\n/g);

    // rows
    rows = Math.min(lines.length, Math.max(1, rows));

    let previousLength = 0;
    for (let i = 0; i < rows-1; i++) {
        previousLength += lines[i].length + 1;
    }

    // cols
    cols = Math.min(
        lines[rows - 1].length - (force || lines[rows - 1].length === 0 ? 0 : 1),
        Math.max(0, cols)
    );
    

    previousLength += cols;

    // set position
    where.selectionStart = previousLength;
    where.selectionEnd = previousLength;
}

function refreshCursorPosition(where) {
    const [rows, cols] = getCursorPosition(where);
    return setCursorPosition(where, rows, cols);
}

function moveCursor(where, dr, dc, force) {
    force = force === undefined ? undefined : true;
    const [rows, cols] = getCursorPosition(where);
    return setCursorPosition(where, rows + dr, cols + dc, force);
}

function homeCursor(where) {
    const [rows] = getCursorPosition(where);
    const indentation = where.value.split(/\n/g)[rows-1].match(/^[ \t]*/)[0].length;
    return setCursorPosition(where, rows, indentation);
}

function setMode(vim, mode) {
    vim.mode = mode;
    vim.syncronizeLabels();
}

const COMMAND_RE = /^(\d*)([\^\$AGIahi-l]|gg)|(^0)/;

const normalCommands = [
    {
        key: "gg",
        action: (w, r) => setCursorPosition(w, r, 0)
    },
    {
        key: "k",
        action: (w, r) => moveCursor(w, -r, 0)
    },
    {
        key: "0",
        action: (w, r) => moveCursor(w, 0, -Infinity)
    },
    {
        key: "^",
        action: (w, r) => homeCursor(w)
    },
    {
        key: "h",
        action: (w, r) => moveCursor(w, 0, -r)
    },
    {
        key: "l",
        action: (w, r) => moveCursor(w, 0, r)
    },
    {
        key: "$",
        action: (w, r) => moveCursor(w, 0, Infinity)
    },
    {
        key: "j",
        action: (w, r) => moveCursor(w, r, 0)
    },
    {
        key: "G",
        action: (w, r) => setCursorPosition(w, r === 1 ? Infinity : r, 0)
    },
    {
        key: "i",
        action: (w, r, v) => setMode(v, MODE_INSERT)
    },
    {
        key: "I",
        alias: "^i"
    },
    {
        key: "a",
        action: (w, r, v) => {
            moveCursor(w, 0, 1, true);
            setMode(v, MODE_INSERT);
        }
    },
    {
        key: "A",
        alias: "$a"
    }
]

function processBuffer(buffer, where, vim) {
    const originalBuffer = buffer;
    const [command, repeat, key, zero] = buffer.match(COMMAND_RE) || [];

    if (zero !== undefined) {
        normalCommands.find(normalCommand => normalCommand.key === "0").action(where, 1, vim);
        return buffer.substring(command.length);
    }

    if (key === undefined) {
        return buffer;
    }

    const repeats = parseInt(repeat) || 1;

    normalCommands.forEach(normalCommand => {
        if (normalCommand.key !== key) {
            return;
        }

        if (normalCommand.alias && normalCommand.alias.length > 0) {
            buffer = `${repeat}${normalCommand.alias}${buffer.substring(command.length)}`;
            return processBuffer(buffer, where, vim);
        }

        buffer = buffer.substring(command.length);
        return normalCommand.action(where, repeats, vim);
    });

    if (buffer === originalBuffer) {
        return buffer;
    }

    return processBuffer(buffer, where, vim);
}

function press(v, e) {
    if (v.mode === MODE_NORMAL) {
        v.buffer += String.fromCharCode(e.charCode);
        e.preventDefault();
        v.buffer = processBuffer(v.buffer, v.target, v);
    }

    v.syncronizeLabels();
}

function down(v, e) {
    if (e.key === "Escape") {
        v.buffer = "";
        v.mode = MODE_NORMAL;
        refreshCursorPosition(v.target);
    }

    if (e.key === "Backspace") {
        if (v.mode === MODE_NORMAL) {
            e.preventDefault();
            v.buffer = "";
            moveCursor(v.target, 0, -1);
        }
    }

    v.syncronizeLabels();
}

class Vim {
    constructor(target, modeSpan, bufferSpan) {
        this.target = target;
        this.modeSpan = modeSpan;
        this.bufferSpan = bufferSpan;

        this.mode = MODE_NORMAL;
        this.buffer = "";

        target.addEventListener("keypress", e => press(this, e));
        target.addEventListener("keydown", e => down(this, e));
    }

    syncronizeLabels() {
        this.bufferSpan.innerText = this.buffer;
        this.modeSpan.innerText = this.mode;
    }
}