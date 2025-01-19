const MODE_NORMAL = "NORMAL";

function getCursorPosition(where) {
    const selectionEnd = where.selectionEnd;
    const previousLines = where.value
        .substring(0, selectionEnd).split(/\n/g);
    
    const rows = previousLines.length;
    const cols = previousLines[rows-1].length;

    return [rows, cols];
}

function setCursorPosition(where, rows, cols) {
    const lines = where.value.split(/\n/g);

    // rows
    rows = Math.min(lines.length, Math.max(1, rows));

    let previousLength = 0;
    for (let i = 0; i < rows-1; i++) {
        previousLength += lines[i].length + 1;
    }

    // cols
    cols = Math.min(lines[rows-1].length, Math.max(0, cols));

    previousLength += cols;

    // set position
    where.selectionStart = previousLength;
    where.selectionEnd = previousLength;
}

function moveCursor(where, dr, dc) {
    const [rows, cols] = getCursorPosition(where);
    setCursorPosition(where, rows + dr, cols + dc)
}

function homeCursor(where) {
    const [rows] = getCursorPosition(where);
    const indentation = where.value.split(/\n/g)[rows-1].match(/^[ \t]*/)[0].length;
    return setCursorPosition(where, rows, indentation);
}

const COMMAND_RE = /^(\d*)([0\^\$hj-l])/;

const normalCommands = [
    {
        key: "k",
        alias: "",
        action: (w, r) => moveCursor(w, -r, 0)
    },
    {
        key: "0",
        alias: "",
        action: (w, r) => moveCursor(w, 0, -Infinity)
    },
    {
        key: "^",
        alias: "",
        action: (w, r) => homeCursor(w)
    },
    {
        key: "h",
        alias: "",
        action: (w, r) => moveCursor(w, 0, -r)
    },
    {
        key: "l",
        alias: "",
        action: (w, r) => moveCursor(w, 0, r)
    },
    {
        key: "$",
        alias: "",
        action: (w, r) => moveCursor(w, 0, Infinity)
    },
    {
        key: "j",
        alias: "",
        action: (w, r) => moveCursor(w, r, 0)
    },
]

function processBuffer(buffer, where) {
    const originalBuffer = buffer;
    const [command, repeat, key] = buffer.match(COMMAND_RE) || [];

    if (key === undefined) {
        return buffer;
    }

    const repeats = parseInt(repeat) || 1;

    normalCommands.forEach(normalCommand => {
        if (normalCommand.key !== key) {
            return;
        }

        if (normalCommand.alias.length > 0) {
            buffer = `${repeat}${normalCommand.alias}${buffer.substring(command.length)}`;
            return processBuffer(buffer, where);
        }

        buffer = buffer.substring(command.length);
        return normalCommand.action(where, repeats);
    });

    if (buffer === originalBuffer) {
        return buffer;
    }

    return processBuffer(buffer, where);
}

function vimify(target, modeSpan, bufferSpan) {
    let mode = MODE_NORMAL;
    let buffer = "";

    function press(e) {
        buffer += String.fromCharCode(e.charCode);

        if (mode === MODE_NORMAL) {
            e.preventDefault();
            buffer = processBuffer(buffer, target);
        }

        bufferSpan.innerText = buffer;
        modeSpan.innerText = mode;
    }

    function down(e) {
        if (e.key === "Escape") {
            buffer = "";
            mode = MODE_NORMAL;
        }

        if (e.key === "Backspace") {
            if (mode === MODE_NORMAL) {
                e.preventDefault();
                buffer = "";
                moveCursor(target, 0, -1);
            }
        }

        bufferSpan.innerText = buffer;
        modeSpan.innerText = mode;
    }

    target.addEventListener("keypress", press);
    target.addEventListener("keydown", down);
}