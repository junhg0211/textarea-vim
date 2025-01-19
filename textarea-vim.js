const MODE_NORMAL = "NORMAL";
const MODE_INSERT = "INSERT";

function getCursorPosition(where) {
    const selectionPos = where.selectionStart;
    const previousLines = where.value.substring(0, selectionPos).split(/\n/g);

    const rows = previousLines.length;
    const cols = previousLines[rows - 1].length;

    return [rows, cols];
}

function setCursorPosition(where, rows, cols, force) {
    force = force !== undefined;

    const lines = where.value.split(/\n/g);

    // rows
    rows = Math.min(lines.length, Math.max(1, rows));

    let previousLength = 0;
    for (let i = 0; i < rows - 1; i++) {
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
    where.selectionEnd = previousLength + 1;
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
    const indentation = where.value.split(/\n/g)[rows - 1].match(/^[ \t]*/)[0].length;
    return setCursorPosition(where, rows, indentation);
}

function lineifyCursor(where) {
    where.selectionEnd = where.selectionStart;
}

function setMode(vim, mode) {
    pushStack(vim.target);
    vim.mode = mode;
    lineifyCursor(vim.target);
    vim.syncronizeLabels();
}

function removeCharacter(where, repeats) {
    const selectionPos = where.selectionStart;

    let newValue = where.value;
    let previousValue;
    for (let i = 0; i < repeats; i++) {
        previousValue = newValue;

        newValue = where.value.substring(0, selectionPos) + where.value.substring(selectionPos + 1);
        if ((where.value.match(/\n/g) || []).length !== (newValue.match(/\n/g) || []).length) {
            newValue = previousValue;
            break;
        }
    }

    pushStack(where);
    where.value = newValue;
    where.selectionStart = selectionPos;
    where.selectionEnd = selectionPos + 1;
    refreshCursorPosition(where);
}

function removeLine(where, repeats) {
    const lines = where.value.split(/\n/g);
    const [rows, cols] = getCursorPosition(where);
    lines.splice(rows - 1, repeats);

    pushStack(where);
    where.value = lines.join("\n");

    setCursorPosition(where, rows, cols);
}

const stack = [];
const MAX_STACK_SIZE = 80;

function pushStack(where) {
    while (stack.length >= MAX_STACK_SIZE) {
        stack.splice(0, 1);
    }

    const [rows, cols] = getCursorPosition(where);
    stack.push([where.value, rows, cols]);
    redoStack.length = 0;
}

function popStack(where, repeats) {
    repeats = repeats === undefined ? 1 : repeats;

    for (let i = 0; i < repeats; i++) {
        if (stack.length === 0) {
            break;
        }

        const [oRows, oCols] = getCursorPosition(where);
        backStack.push([where.value, oRows, oCols]);

        const [value, rows, cols] = stack.pop();
        where.value = value;
        setCursorPosition(where, rows, cols);
    }
}

const backStack = [];
function redoStack(where, repeats) {
    for (let i = 0; i < repeats; i++) {
        if (backStack.length === 0) {
            break;
        }

        pushStack(where);

        const [value, rows, cols] = backStack.pop();
        where.value = value;
        setCursorPosition(where, rows, cols);
    }
}

function newLineAfter(where, vim, dr) {
    dr = dr === undefined ? 0 : dr;

    const [rows_] = getCursorPosition(where);
    const lines = where.value.split(/\n/g);
    const rows = rows_ + dr;

    const previousLines = lines.splice(0, rows);
    let content = "";
    for (let i = 0; i < previousLines.length; i++) {
        content += previousLines[i] + "\n";
    }

    content += "\n";

    for (let i = 0; i < lines.length; i++) {
        content += lines[i] + "\n";
    }

    where.value = content;
    setCursorPosition(where, rows+1, 0);
    setMode(vim, MODE_INSERT)
}

function insertAtCursor(where, value) {
    const selectionPos = where.selectionStart;

    where.value =
        where.value.substring(0, selectionPos) + value + where.value.substring(selectionPos);
    where.selectionStart = selectionPos + value.length;
    where.selectionEnd = selectionPos + value.length;
}

const COMMAND_RE = /^(\d*)([\^\$AGIOSahi-loux]|dd|gg|<C-r>)|(^0)/;

const normalCommands = [
    {
        key: "gg",
        action: (w, r) => setCursorPosition(w, r, 0),
    },
    {
        key: "k",
        action: (w, r) => moveCursor(w, -r, 0),
    },
    {
        key: "0",
        action: (w, r) => moveCursor(w, 0, -Infinity),
    },
    {
        key: "^",
        action: (w, r) => homeCursor(w),
    },
    {
        key: "h",
        action: (w, r) => moveCursor(w, 0, -r),
    },
    {
        key: "l",
        action: (w, r) => moveCursor(w, 0, r),
    },
    {
        key: "$",
        action: (w, r) => moveCursor(w, 0, Infinity),
    },
    {
        key: "j",
        action: (w, r) => moveCursor(w, r, 0),
    },
    {
        key: "G",
        action: (w, r) => setCursorPosition(w, r === 1 ? Infinity : r, 0),
    },
    {
        key: "i",
        action: (w, r, v) => setMode(v, MODE_INSERT),
    },
    {
        key: "I",
        alias: "^i",
    },
    {
        key: "a",
        action: (w, r, v) => {
            moveCursor(w, 0, 1, true);
            setMode(v, MODE_INSERT);
        },
    },
    {
        key: "A",
        alias: "$a",
    },
    {
        key: "o",
        action: (w, r, v) => newLineAfter(w, v),
    },
    {
        key: "O",
        action: (w, r, v) => newLineAfter(w, v, -1),
    },
    {
        key: "S",
        alias: "ddO",
    },
    {
        key: "x",
        action: (w, r) => removeCharacter(w, r),
    },
    {
        key: "dd",
        action: (w, r) => removeLine(w, r),
    },
    {
        key: "u",
        action: (w, r) => popStack(w, r),
    },
    {
        key: "<C-r>",
        action: (w, r) => redoStack(w, r),
    },
];

function processBuffer(buffer, where, vim) {
    const originalBuffer = buffer;
    const [command, repeat, key, zero] = buffer.match(COMMAND_RE) || [];

    console.log(buffer, command, repeat, key, zero);

    if (zero !== undefined) {
        normalCommands.find((normalCommand) => normalCommand.key === "0").action(where, 1, vim);
        return buffer.substring(command.length);
    }

    if (key === undefined) {
        return buffer;
    }

    const repeats = parseInt(repeat) || 1;

    normalCommands.forEach((normalCommand) => {
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

function down(v, e) {
    if (e.key === "Escape") {
        v.buffer = "";
        v.mode = MODE_NORMAL;
        refreshCursorPosition(v.target);
    } else if (e.key === "Backspace") {
        if (v.mode === MODE_NORMAL) {
            e.preventDefault();
            v.buffer = "";
            moveCursor(v.target, 0, -1);
        }
    } else if (v.mode === MODE_NORMAL && e.key.length <= 1) {
        e.preventDefault();
        if (e.ctrlKey) {
            v.buffer += `<C-${e.key}>`;
        } else {
            v.buffer += e.key;
        }
        v.buffer = processBuffer(v.buffer, v.target, v);
    } else if (v.mode === MODE_INSERT) {
        if (e.key === "Tab") {
            e.preventDefault();
            insertAtCursor(v.target, "    ");
        }
    }

    v.syncronizeLabels();
}

function up(v, e) {
    v.syncronizeLabels();
}

class Vim {
    constructor(target, modeSpan, bufferSpan, posSpan) {
        this.target = target;
        this.modeSpan = modeSpan;
        this.bufferSpan = bufferSpan;
        this.posSpan = posSpan;

        this.mode = MODE_NORMAL;
        this.buffer = "";

        target.addEventListener("keydown", (e) => down(this, e));
        target.addEventListener("keyup", (e) => up(this, e));
    }

    syncronizeLabels() {
        if (this.bufferSpan) {
            this.bufferSpan.innerText = this.buffer;
        }
        if (this.modeSpan) {
            this.modeSpan.innerText = this.mode;
        }
        if (this.posSpan) {
            const [rows, cols] = getCursorPosition(this.target);
            this.posSpan.innerText = `${rows},${cols}`;
        }
    }
}
