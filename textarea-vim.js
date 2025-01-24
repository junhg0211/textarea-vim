const MODE_NORMAL = "NORMAL";
const MODE_INSERT = "INSERT";

function getCursorPosition(where) {
    const selectionPos = where.selectionStart;
    const previousLines = where.value.substring(0, selectionPos).split(/\n/g);

    const rows = previousLines.length;
    const cols = previousLines[rows - 1].length;

    return [rows, cols];
}

function setCursorPosition(where, rows, cols, force, isInsertMode) {
    force = force !== undefined;
    isInsertMode = isInsertMode !== undefined;

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
    where.selectionEnd = previousLength + (isInsertMode ? 0 : 1);
}

function refreshCursorPosition(where, dc) {
    dc = dc === undefined ? 0 : dc;
    const [rows, cols] = getCursorPosition(where);
    return setCursorPosition(where, rows, cols + dc);
}

function moveCursor(where, dr, dc, force, isInsertMode) {
    force = force === undefined ? undefined : true;
    isInsertMode = isInsertMode === undefined ? undefined : true;
    const [rows, cols] = getCursorPosition(where);
    return setCursorPosition(where, rows + dr, cols + dc, force, isInsertMode);
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
    if (vim.mode === mode) {
        return;
    }

    if (vim.mode === MODE_NORMAL) {
        pushStack(vim.target);
    }

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

        newValue = newValue.substring(0, selectionPos) + newValue.substring(selectionPos + 1);
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
    setCursorPosition(where, rows + 1, 0);
    setMode(vim, MODE_INSERT);
}

function insertAtCursor(where, value) {
    const selectionPos = where.selectionStart;

    where.value =
        where.value.substring(0, selectionPos) + value + where.value.substring(selectionPos);
    where.selectionStart = selectionPos + value.length;
    where.selectionEnd = selectionPos + value.length;
}

const LEFT = "LEFT";
const RIGHT = "RIGHT";
function processDelete(where, repeats, vim, mRepeats, mKey) {
    if (mKey === "gg") {
        const [rows] = getCursorPosition(where);
        processBuffer(`gg${rows}dd`, where, vim);
        return LEFT;
    }

    if (mKey === "k") {
        processBuffer(`${repeats * mRepeats}${mKey}${repeats * mRepeats + 1}dd`, where, vim);
        return RIGHT;
    }

    if (mKey === "0") {
        const [_, cols] = getCursorPosition(where);
        processBuffer(`0${cols - 1}x`, where, vim);
        return LEFT;
    }

    if (mKey === "^") {
        const [rows, cols] = getCursorPosition(where);
        const indentation = where.value.split(/\n/g)[rows - 1].match(/^[ \t]+/)[0].length;
        if (cols > indentation) {
            processBuffer(`^${cols - indentation}x`, where, vim);
            return LEFT;
        } else {
            processBuffer(`^${indentation - cols}dh`, where, vim);
            return RIGHT;
        }
    }

    if (mKey === "h") {
        processBuffer(`${repeats * mRepeats}${mKey}${repeats * mRepeats}x`, where, vim);
        return LEFT;
    }

    if (mKey === "l") {
        processBuffer(`${repeats * mRepeats}x`, where, vim);
        return RIGHT;
    }

    if (mKey === "$") {
        const [rows, cols] = getCursorPosition(where);
        const charCount = where.value.split(/\n/g)[rows - 1].length;
        processBuffer(`${charCount - cols}x`, where, vim);
        return RIGHT;
    }

    if (mKey === "j") {
        processBuffer(`${repeats * mRepeats + 1}dd`, where, vim);
        return RIGHT;
    }

    if (mKey === "G") {
        const [rows] = getCursorPosition(where);
        const lineCount = where.value.split(/\n/g).length;
        processBuffer(`${lineCount - rows + 1}dd0`, where, vim);
        return RIGHT;
    }

    if (mKey === "w" || mKey === "W" || mKey === "e" || mKey === "E") {
        const isEnd = mKey.toLowerCase() === "e";
        const isWORD = mKey.toUpperCase() === mKey;
        const wordPosition = getWordPosition(where, mRepeats, isWORD, isEnd) + (isEnd ? 1 : 0);

        const left = where.value.substring(0, where.selectionStart);
        const content = left + where.value.substring(wordPosition);
        pushStack(where);
        where.value = content;
        where.selectionStart = left.length;
        where.selectionEnd = left.length + 1;

        return LEFT;
    }

    if (mKey[0] === "f" || mKey[0] === "t") {
        const isF = mKey[0] === "f";
        const target = mKey[1];
        
        const [rows, cols] = getCursorPosition(where);
        const lines = where.value.split(/\n/g);
        const line = lines[rows-1];

        let i;
        let found = false;
        let count = 0;
        for (i = cols; i < line.length; i++) {
            if (line[i] === target) {
                count++;
            }

            if (count === repeats * mRepeats) {
                found = true;
                break;
            }
        }

        if (!found) {
            return LEFT;
        }

        const newLine = line.substring(0, cols) + line.substring(i + (isF ? 1 : 0));
        const previousLines = lines.splice(0, rows-1);
        const nextLines = lines.splice(1);
        const newLines = [...previousLines, newLine, ...nextLines];
        const newContent = newLines.join("\n");

        const selectionPos = where.selectionStart;
        pushStack(where);
        where.value = newContent;
        where.selectionStart = selectionPos;
        where.selectionEnd = selectionPos + 1;
    }

    if (mKey === "iw") {
        processBuffer(`wbc${mRepeats}e`, where, vim);
        return LEFT;
    }

    if (mKey === "iW") {
        processBuffer(`WBc${mRepeats}E`, where, vim);
        return LEFT;
    }

    if (mKey === "aw") {
        processBuffer(`wbc${mRepeats}w`, where, vim);
        return LEFT;
    }

    if (mKey === "aW") {
        processBuffer(`WBc${mRepeats}W`, where, vim);
        return LEFT;
    }

    if (mKey === "i(" || mKey === "i)" || mKey === "a(" || mKey === "a)") {
        const isIn = mKey[0] === 'i';

        // -- if cursor is in parenthesis
        const selectionEnd = where.selectionEnd;
        const parenthesisStack = [];
        for (let i = 0; i < where.value.length; i++) {
            if (where.value[i] === "(" && i < selectionEnd) {
                parenthesisStack.push(i);
            } else if (where.value[i] === ")") {
                if (i > selectionEnd) {
                    if (parenthesisStack.length === 0) {
                        break;
                    }

                    const [start, end] = [parenthesisStack.pop(), i];

                    pushStack(where);
                    where.value =
                        where.value.substring(0, start + (isIn ? 1 : 0)) +
                        where.value.substring(end + (isIn ? 0 : 1));
                    where.selectionStart = start + (isIn ? 1 : 0);
                    where.selectionEnd = start + (isIn ? 2 : 1);

                    return LEFT;
                }

                parenthesisStack.pop();
            }
        }

        // -- if line afterwards contains parenthesis
        const lines = where.value.split(/\n/g);
        const [rows, cols] = getCursorPosition(where);
        const line = lines[rows-1];

        const left = line.substring(0, cols);
        const right = line.substring(cols);

        const match = right.match(/^([^\(]*\()([^)]*)(\).*)$/);
        
        if (match === null) {
            return LEFT;
        }

        const [_match, mid1, _content, mid2] = match;
        const middle =
            left + mid1.substring(0, mid1.length - (isIn ? 0 : 1)) + mid2.substring(isIn ? 0 : 1);
        
        const previous = lines.splice(0, rows-1);
        const next = lines.splice(1);
        const newLines = [...previous, middle, ...next]

        let selectionStart = left.length + mid1.length;
        previous.forEach((line) => (selectionStart += line.length + 1));

        const newContent = newLines.join("\n");
        pushStack(where);
        where.value = newContent;
        where.selectionStart = selectionStart;
        where.selectionEnd = selectionStart + 1;

        return LEFT;
    }

    // console.log(repeats, "d", mRepeats, mKey);
}

function replaceCharacter(where, repeats, args) {
    const [rows, cols] = getCursorPosition(where);
    let lines = where.value.split(/\n/g);

    const line = lines[rows - 1];
    if (cols + repeats > line.length) {
        return;
    }

    const newLine = line.substring(0, cols) + args.repeat(repeats) + line.substring(cols + repeats);
    lines[rows - 1] = newLine;

    let previousLength = 0;
    for (let i = 0; i < rows - 1; i++) {
        previousLength += lines[i].length + 1;
    }
    previousLength += cols + repeats - 1;

    pushStack(where);
    where.value = lines.join("\n");
    where.selectionStart = previousLength;
    where.selectionEnd = previousLength + 1;
}

const Word_RE =
    /([^ \n\t\r`~!@#$%^&*()+\-=,.<>/?;:'"[{\]}]+|[\n\t\r`~!@#$%^&*()+\-=,.<>/?;:'"[{\]}]+)/g;
const WORD_RE = /[^ \n\t]+/g;

function getWordPosition(where, repeats, isWORD, toEnd) {
    const words = [...where.value.matchAll(isWORD ? WORD_RE : Word_RE)];
    const selectionPos = where.selectionStart;

    let index;
    for (index = 0; index < words.length; index++) {
        const word = words[index];
        if (word.index + (toEnd ? word[0].length - 1 : 0) > selectionPos) {
            break;
        }
    }

    repeats--;

    return words[index + repeats].index + (toEnd ? words[index + repeats][0].length - 1 : 0);
}

function moveWord(where, repeats, isWORD, toEnd) {
    const previousSelectionStart = where.selectionStart;

    const position = getWordPosition(where, repeats, isWORD, toEnd);
    where.selectionStart = position;
    where.selectionEnd = position + 1;
    refreshCursorPosition(where);

    if (previousSelectionStart === where.selectionStart) {
        if (repeats > 0) {
            where.selectionStart++;
            where.selectionEnd++;
        } else {
            where.selectionStart--;
            where.selectionEnd--;
        }
        return moveWord(where, repeats, isWORD, toEnd);
    }
}

function changeCaps(where, repeats) {
    const [rows, cols] = getCursorPosition(where);

    const lines = where.value.split(/\n/g);
    const previousLines = lines.splice(0, rows - 1);
    const nextLines = lines.splice(1);
    const currentLine = lines[0];

    const left = currentLine.substring(0, cols);
    const middle = currentLine.substring(cols, cols + repeats);
    const right = currentLine.substring(cols + repeats);

    let changes = "";
    for (let i = 0; i < middle.length; i++) {
        if ("a" <= middle[i] && middle[i] <= "z") {
            changes += middle[i].toUpperCase();
            continue;
        }

        if ("A" <= middle[i] && middle[i] <= "Z") {
            changes += middle[i].toLowerCase();
            continue;
        }
    }
    const newLine = left + changes + right;

    const newContent = [...previousLines, newLine, ...nextLines].join("\n");
    pushStack(where);
    where.value = newContent;
    setCursorPosition(where, rows, cols + repeats);
}

function processChange(where, repeats, vim, mRepeats, mKey) {
    const direction = processDelete(where, repeats, vim, mRepeats, mKey);
    setMode(vim, MODE_INSERT);
    if (direction === RIGHT) {
        moveCursor(where, 0, 1, true, true);
    }
}

function moveFind(where, repeats, args, isT) {
    isT = isT !== undefined;

    const [rows, cols] = getCursorPosition(where);
    const lines = where.value.split(/\n/g);
    const line = lines[rows-1];
    const right = line.substring(cols);

    let count = 0;
    let i;
    let found = false;
    for (i = 1; i < right.length; i++) {
        if (right[i] === args) {
            count++;
        }

        if (count === repeats) {
            found = true;
            break;
        }
    }

    if (!found) {
        return;
    }

    moveCursor(where, 0, i - (isT ? 1 : 0));
}

const COMMAND_RE =
    /^([1-9]\d*)?((dd|[~\$\^A-EGIOSWa-fhi-lort-uw-x]|gg|<C-r>)|(^0))(([1-9]\d*)?(gg|[ia][()Ww]|[tf].|[\$\^0D-EGWehj-lw])|.)?/;

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
        action: (w) => moveCursor(w, 0, -Infinity),
    },
    {
        key: "^",
        action: (w) => homeCursor(w),
    },
    {
        key: "b",
        action: (w, r) => moveWord(w, -r + 1),
    },
    {
        key: "B",
        action: (w, r) => moveWord(w, -r + 1, true),
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
        key: "w",
        action: (w, r) => moveWord(w, r),
    },
    {
        key: "e",
        action: (w, r) => moveWord(w, r, false, true),
    },
    {
        key: "W",
        action: (w, r) => moveWord(w, r, true),
    },
    {
        key: "E",
        action: (w, r) => moveWord(w, r, true, true),
    },
    {
        key: "t",
        action: (w, r, v, a) => moveFind(w, r, a, true),
        requireArg: true,
    },
    {
        key: "f",
        action: (w, r, v, a) => moveFind(w, r, a),
        requireArg: true,
    },
    {
        key: "$",
        action: (w) => moveCursor(w, 0, Infinity),
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
        key: "r",
        action: (w, r, v, a) => replaceCharacter(w, r, a),
        requireArg: true,
    },
    {
        key: "c",
        action: (w, r, v, a, mr, mk) => processChange(w, r, v, mr, mk),
        requireArgs: true,
    },
    {
        key: "C",
        action: (w, r, v) => processBuffer("Da", w, v),
    },
    {
        key: "~",
        action: (w, r) => changeCaps(w, r),
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
        key: "d",
        action: (w, r, v, a, mr, mk) => processDelete(w, r, v, mr, mk),
        requireArgs: true,
    },
    {
        key: "D",
        action: (w, r, v) => processBuffer("d$", w, v),
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
    const [command, repeat, _a, key, zero, arg, mr, mk] = buffer.match(COMMAND_RE) || [];
    const repeats = parseInt(repeat) || 1;
    const args = arg === undefined ? "" : arg;
    const mRepeat = mr === undefined ? "" : mr;
    const mRepeats = parseInt(mRepeat) || 1;
    const mKey = mk === undefined ? "" : mk;

    /*
    if (command !== undefined) {
        console.log([command, repeat, key, args, mRepeat, mKey]);
    }
    */

    if (zero !== undefined) {
        normalCommands.find((normalCommand) => normalCommand.key === "0").action(where, 1, vim);
        return buffer.substring(command.length);
    }

    if (key === undefined) {
        return buffer;
    }

    let run = false;
    normalCommands.forEach((normalCommand) => {
        if (normalCommand.key !== key) {
            return;
        }

        if (run) {
            return;
        }

        const extraLength = args.length + mRepeat.length + mKey.length;

        if (normalCommand.requireArgs || normalCommand.requireArg) {
            if (mKey.length > 0 || (normalCommand.requireArg && args.length > 0)) {
                buffer = buffer.substring(command.length);
                run = true;
                return normalCommand.action(where, repeats, vim, args, mRepeats, mKey);
            }
        } else if (normalCommand.alias && normalCommand.alias.length > 0) {
            buffer =
                `${repeats === 1 ? "" : repeats}${normalCommand.alias}` +
                `${buffer.substring(command.length - extraLength)}`;
            run = true;
            return processBuffer(buffer, where, vim);
        } else {
            buffer = buffer.substring(command.length - extraLength);
            run = true;
            return normalCommand.action(where, repeats, vim);
        }
    });

    if (buffer === originalBuffer) {
        return buffer;
    }

    return processBuffer(buffer, where, vim);
}

function down(v, e) {
    if (e.key === "Escape") {
        const nowMode = v.mode;
        setMode(v, MODE_NORMAL);
        v.buffer = "";
        refreshCursorPosition(v.target, nowMode === MODE_NORMAL ? 0 : -1);
    } else if (e.key === "Backspace") {
        if (v.mode === MODE_NORMAL) {
            e.preventDefault();
            v.buffer = "";
            moveCursor(v.target, 0, -1);
        }
    } else if (e.key === "Enter") {
        if (v.mode === MODE_NORMAL) {
            e.preventDefault();
            v.buffer = "";
            moveCursor(v.target, 1, 0);
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

        refreshCursorPosition(this.target);
        this.syncronizeLabels();
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
