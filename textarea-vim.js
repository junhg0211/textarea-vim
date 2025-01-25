const MODE_NORMAL = "NORMAL";
const MODE_INSERT = "INSERT";
const MODE_VISUAL = "VISUAL";
const MODE_VISUAL_LINE = "VISUAL LINE";

function getSelectionPosition(where, vim) {
    if (vim.mode === MODE_NORMAL || vim.mode === MODE_INSERT) {
        return where.selectionStart;
    }

    if (vim.mode === MODE_VISUAL || vim.mode === MODE_VISUAL_LINE) {
        return visualStart === where.selectionStart ? where.selectionEnd - 1 : where.selectionStart;
    }
}

function getCursorPosition(where, vim) {
    const selectionPos = getSelectionPosition(where, vim);
    const previousLines = where.value.substring(0, selectionPos).split(/\n/g);

    const rows = previousLines.length;
    const cols = previousLines[rows - 1].length;

    return [rows, cols];
}

function setCursorPosition(where, rows, cols, vim, force, isInsertMode) {
    force = force === undefined ? undefined : true;
    isInsertMode = isInsertMode === undefined ? undefined : true;

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
    if (vim.mode === MODE_NORMAL || vim.mode === MODE_INSERT) {
        where.selectionStart = previousLength;
        where.selectionEnd = previousLength + (vim.mode === MODE_INSERT ? 0 : 1);
    } else if (vim.mode === MODE_VISUAL) {
        where.selectionStart = Math.min(visualStart, previousLength);
        where.selectionEnd = Math.max(visualStart, previousLength) + 1;
    } else if (vim.mode === MODE_VISUAL_LINE) {
        const left = Math.min(visualStart, previousLength);
        const right = Math.max(visualStart, previousLength);
        const lineStart = where.value.substring(0, left).lastIndexOf("\n") + 1;
        const lineEnd = where.value.substring(right).indexOf("\n") + right + 1;

        where.selectionStart = lineStart;
        where.selectionEnd = lineEnd;
    }
}

function refreshCursorPosition(where, vim, dc) {
    dc = dc === undefined ? 0 : dc;
    const [rows, cols] = getCursorPosition(where, vim);
    return setCursorPosition(where, rows, cols + dc, vim);
}

function moveCursor(where, dr, dc, vim, force, isInsertMode) {
    force = force === undefined ? undefined : true;
    isInsertMode = isInsertMode === undefined ? undefined : true;
    const [rows, cols] = getCursorPosition(where, vim);
    return setCursorPosition(where, rows + dr, cols + dc, vim, force, isInsertMode);
}

function homeCursor(where, vim) {
    const [rows] = getCursorPosition(where, vim);
    const indentation = where.value.split(/\n/g)[rows - 1].match(/^[ \t]*/)[0].length;
    return setCursorPosition(where, rows, indentation, vim);
}

function lineifyCursor(where) {
    where.selectionEnd = where.selectionStart;
}

let visualStart;
function setMode(vim, mode) {
    if (vim.mode === mode) {
        return;
    }

    if (mode === MODE_VISUAL) {
        visualStart = vim.target.selectionStart;
    }

    if (mode === MODE_VISUAL_LINE) {
        const [rows] = getCursorPosition(vim.target, vim);
        const lines = vim.target.value.split(/\n/g);
        const lineStart =
            vim.target.value.substring(0, vim.target.selectionStart).lastIndexOf("\n") + 1;
        const lineEnd =
            vim.target.value.substring(vim.target.selectionEnd).indexOf("\n") +
            vim.target.selectionEnd;

        let selectionStart = lineStart;
        let selectionEnd = lineEnd;
        if (lines[rows - 1].length === 0) {
            selectionEnd -= lines[rows].length;
        }

        vim.target.selectionStart = selectionStart;
        vim.target.selectionEnd = selectionEnd;

        visualStart = selectionStart;
    }

    if (mode === MODE_INSERT) {
        lineifyCursor(vim.target);
    }

    vim.mode = mode;
    vim.syncronizeLabels();
}

function removeCharacter(where, repeats, vim) {
    const selectionPos = getSelectionPosition(where, vim);

    let newValue = where.value;
    let previousValue;
    let clipboard = "";
    for (let i = 0; i < repeats; i++) {
        previousValue = newValue;

        newValue = newValue.substring(0, selectionPos) + newValue.substring(selectionPos + 1);
        clipboard += previousValue[selectionPos];
        if ((where.value.match(/\n/g) || []).length !== (newValue.match(/\n/g) || []).length) {
            newValue = previousValue;
            break;
        }
    }
    copy(clipboard);

    where.value = newValue;
    where.selectionStart = selectionPos;
    where.selectionEnd = selectionPos + 1;
    refreshCursorPosition(where, vim);
}

function removeLine(where, repeats, vim) {
    const lines = where.value.split(/\n/g);
    const [rows, cols] = getCursorPosition(where, vim);
    copy(lines.splice(rows - 1, repeats).join("\n") + "\n");

    where.value = lines.join("\n");

    setCursorPosition(where, rows, cols, vim);
}

const stack = [];
const MAX_STACK_SIZE = 80;

function pushStack(where, vim) {
    while (stack.length >= MAX_STACK_SIZE) {
        stack.splice(0, 1);
    }

    const [rows, cols] = getCursorPosition(where, vim);
    stack.push([where.value, rows, cols]);
}

function popStack(where, repeats, vim) {
    repeats = repeats === undefined ? 1 : repeats;

    for (let i = 0; i < repeats; i++) {
        if (stack.length === 0) {
            break;
        }

        const [oRows, oCols] = getCursorPosition(where, vim);
        backStack.push([where.value, oRows, oCols]);

        const [value, rows, cols] = stack.pop();
        where.value = value;
        setCursorPosition(where, rows, cols, vim);
    }
}

const backStack = [];
function redoStack(where, repeats, vim) {
    for (let i = 0; i < repeats; i++) {
        if (backStack.length === 0) {
            break;
        }

        const [value, rows, cols] = backStack.pop();
        where.value = value;
        setCursorPosition(where, rows, cols, vim);
    }
}

function newLineAfter(where, vim, dr) {
    dr = dr === undefined ? 0 : dr;

    const [rows_] = getCursorPosition(where, vim);
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
    setMode(vim, MODE_INSERT);
    setCursorPosition(where, rows + 1, 0, vim, undefined, true);
}

function insertAtCursor(where, value, vim) {
    const selectionPos = getSelectionPosition(where, vim);

    where.value =
        where.value.substring(0, selectionPos) + value + where.value.substring(selectionPos);
    where.selectionStart = selectionPos + value.length;
    where.selectionEnd = selectionPos + value.length;
}

const LEFT = "LEFT";
const RIGHT = "RIGHT";
function processDelete(where, repeats, vim, mRepeats, mKey) {
    if (vim.mode === MODE_VISUAL || vim.mode === MODE_VISUAL_LINE) {
        const selectionStart = where.selectionStart;
        const selectionEnd = where.selectionEnd;
        const content =
            where.value.substring(0, selectionStart) + where.value.substring(selectionEnd);

        copy(where.value.substring(selectionStart, selectionEnd));

        where.value = content;
        where.selectionStart = selectionStart;
        where.selectionEnd = selectionStart + 1;
        setMode(vim, MODE_NORMAL);
        return LEFT;
    }

    if (mKey === "gg") {
        const [rows] = getCursorPosition(where, vim);
        processBuffer(`gg${rows}dd`, where, vim);
        return LEFT;
    }

    if (mKey === "k") {
        processBuffer(`${repeats * mRepeats}${mKey}${repeats * mRepeats + 1}dd`, where, vim);
        return RIGHT;
    }

    if (mKey === "0") {
        const [_, cols] = getCursorPosition(where, vim);
        processBuffer(`0${cols - 1}x`, where, vim);
        return LEFT;
    }

    if (mKey === "^") {
        const [rows, cols] = getCursorPosition(where, vim);
        const indentation = where.value.split(/\n/g)[rows - 1].match(/^[ \t]+/)[0].length;
        if (cols > indentation) {
            processBuffer(`^${cols - indentation}x`, where, vim);
        } else {
            processBuffer(`^${indentation - cols}dh`, where, vim);
        }
        return LEFT;
    }

    if (mKey === "h") {
        processBuffer(`${repeats * mRepeats}${mKey}${repeats * mRepeats}x`, where, vim);
        return LEFT;
    }

    if (mKey === "l") {
        processBuffer(`${repeats * mRepeats}x`, where, vim);
        return LEFT;
    }

    if (mKey === "$") {
        const [rows, cols] = getCursorPosition(where, vim);
        const charCount = where.value.split(/\n/g)[rows - 1].length;
        processBuffer(`${charCount - cols}x`, where, vim);
        return RIGHT;
    }

    if (mKey === "j") {
        processBuffer(`${repeats * mRepeats + 1}dd`, where, vim);
        return RIGHT;
    }

    if (mKey === "G") {
        const [rows] = getCursorPosition(where, vim);
        const lineCount = where.value.split(/\n/g).length;
        processBuffer(`${lineCount - rows + 1}dd0`, where, vim);
        return RIGHT;
    }

    if (mKey === "w" || mKey === "W" || mKey === "e" || mKey === "E") {
        const isEnd = mKey.toLowerCase() === "e";
        const isWORD = mKey.toUpperCase() === mKey;
        const wordPosition = getWordPosition(where, mRepeats, vim, isWORD, isEnd) + (isEnd ? 1 : 0);

        copy(where.value.substring(where.selectionStart, wordPosition));

        const left = where.value.substring(0, where.selectionStart);
        const content = left + where.value.substring(wordPosition);
        where.value = content;
        where.selectionStart = left.length;
        where.selectionEnd = left.length + 1;

        return LEFT;
    }

    if (mKey[0] === "f" || mKey[0] === "t") {
        const isF = mKey[0] === "f";
        const target = mKey[1];

        const [rows, cols] = getCursorPosition(where, vim);
        const lines = where.value.split(/\n/g);
        const line = lines[rows - 1];

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

        copy(line.substring(cols, i + (isF ? 1 : 0)));

        const newLine = line.substring(0, cols) + line.substring(i + (isF ? 1 : 0));
        const previousLines = lines.splice(0, rows - 1);
        const nextLines = lines.splice(1);
        const newLines = [...previousLines, newLine, ...nextLines];
        const newContent = newLines.join("\n");

        const selectionPos = getSelectionPosition(where, vim);
        where.value = newContent;
        where.selectionStart = selectionPos;
        where.selectionEnd = selectionPos + 1;
    }

    if (mKey === "iw") {
        processBuffer(`wbd${mRepeats}e`, where, vim);
        return LEFT;
    }

    if (mKey === "iW") {
        processBuffer(`WBd${mRepeats}E`, where, vim);
        return LEFT;
    }

    if (mKey === "aw") {
        processBuffer(`wbd${mRepeats}w`, where, vim);
        return LEFT;
    }

    if (mKey === "aW") {
        processBuffer(`WBd${mRepeats}W`, where, vim);
        return LEFT;
    }

    if (
        mKey === "i(" ||
        mKey === "i)" ||
        mKey === "a(" ||
        mKey === "a)" ||
        mKey === "i{" ||
        mKey === "i}" ||
        mKey === "a{" ||
        mKey === "a}" ||
        mKey === "i[" ||
        mKey === "i]" ||
        mKey === "a[" ||
        mKey === "a]" ||
        mKey === "i<" ||
        mKey === "i>" ||
        mKey === "a<" ||
        mKey === "a>"
    ) {
        const isIn = mKey[0] === "i";

        let openingParenthesis, closingParenthesis;
        if (mKey[1] === "(" || mKey[1] === ")") {
            openingParenthesis = "(";
            closingParenthesis = ")";
        } else if (mKey[1] === "{" || mKey[1] === "}") {
            openingParenthesis = "{";
            closingParenthesis = "}";
        } else if (mKey[1] === "[" || mKey[1] === "]") {
            openingParenthesis = "[";
            closingParenthesis = "]";
        } else if (mKey[1] === "<" || mKey[1] === ">") {
            openingParenthesis = "<";
            closingParenthesis = ">";
        }

        // -- if cursor is in parenthesis
        const selectionEnd = where.selectionEnd;
        const parenthesisStack = [];
        for (let i = 0; i < where.value.length; i++) {
            if (where.value[i] === openingParenthesis && i < selectionEnd) {
                parenthesisStack.push(i);
            } else if (where.value[i] === closingParenthesis) {
                if (i > selectionEnd) {
                    if (parenthesisStack.length === 0) {
                        break;
                    }

                    const [start, end] = [parenthesisStack.pop(), i];

                    copy(where.value.substring(start + (isIn ? 1 : 0), end + (isIn ? 0 : 1)));

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
        const [rows, cols] = getCursorPosition(where, vim);
        const line = lines[rows - 1];

        const left = line.substring(0, cols);
        const right = line.substring(cols);

        let match;
        // const match = right.match(/^([^\(]*\()([^)]*)(\).*)$/);
        if (openingParenthesis === "(") {
            match = right.match(/^([^\(]*\()([^)]*)(\).*)$/);
        } else if (openingParenthesis === "{") {
            match = right.match(/^([^\{]*\{)([^\}]*)(\}.*)$/);
        } else if (openingParenthesis === "[") {
            match = right.match(/^([^\[]*\[)([^\]]*)(\].*)$/);
        } else if (openingParenthesis === "<") {
            match = right.match(/^([^\>]*\<)([^\>]*)(\>.*)$/);
        }

        if (match === null) {
            return LEFT;
        }

        const [_match, mid1, content, mid2] = match;
        const middle =
            left + mid1.substring(0, mid1.length - (isIn ? 0 : 1)) + mid2.substring(isIn ? 0 : 1);

        copy(mid1.substring(mid1.length - (isIn ? 0 : 1), mid1.length) + content + mid2.substring(0, isIn ? 0 : 1));

        const previous = lines.splice(0, rows - 1);
        const next = lines.splice(1);
        const newLines = [...previous, middle, ...next];

        let selectionStart = left.length + mid1.length;
        previous.forEach((line) => (selectionStart += line.length + 1));

        const newContent = newLines.join("\n");
        where.value = newContent;
        where.selectionStart = selectionStart;
        where.selectionEnd = selectionStart + 1;

        return LEFT;
    }

    // console.log(repeats, "d", mRepeats, mKey);
}

function replaceCharacter(where, repeats, vim, args) {
    const [rows, cols] = getCursorPosition(where, vim);
    let lines = where.value.split(/\n/g);

    const line = lines[rows - 1];
    if (cols + repeats > line.length) {
        return;
    }

    copy(line[cols]);

    const newLine = line.substring(0, cols) + args.repeat(repeats) + line.substring(cols + repeats);
    lines[rows - 1] = newLine;

    let previousLength = 0;
    for (let i = 0; i < rows - 1; i++) {
        previousLength += lines[i].length + 1;
    }
    previousLength += cols + repeats - 1;

    where.value = lines.join("\n");
    where.selectionStart = previousLength;
    where.selectionEnd = previousLength + 1;
}

const Word_RE =
    /([^ \n\t\r`~!@#$%^&*()+\-=,.<>/?;:'"[{\]}]+|[\n\t\r`~!@#$%^&*()+\-=,.<>/?;:'"[{\]}]+)/g;
const WORD_RE = /[^ \n\t]+/g;

function getWordPosition(where, repeats, vim, isWORD, toEnd) {
    const words = [...where.value.matchAll(isWORD ? WORD_RE : Word_RE)];
    const selectionPos = getSelectionPosition(where, vim);

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

function moveWord(where, repeats, vim, isWORD, toEnd) {
    const previousSelectionStart = where.selectionStart;
    const previousSelectionPos = getSelectionPosition(where, vim);

    const position = getWordPosition(where, repeats, vim, isWORD, toEnd);
    where.selectionStart = position;
    where.selectionEnd = position + 1;
    refreshCursorPosition(where, vim);

    if (mode === MODE_NORMAL && previousSelectionStart === where.selectionStart) {
        if (repeats > 0) {
            where.selectionStart++;
            where.selectionEnd++;
        } else {
            where.selectionStart--;
            where.selectionEnd--;
        }
        return moveWord(where, repeats, vim, isWORD, toEnd);
    }

    if (mode === MODE_VISUAL && previousSelectionPos === getSelectionPosition(where, vim)) {
        if (repeats > 0) {
            if (visualStart === where.selectionStart) {
                where.selectionEnd++;
            } else {
                where.selectionStart++;
            }
        } else {
            if (visualStart === where.selectionStart) {
                where.selectionEnd--;
            } else {
                where.selectionStart--;
            }
        }
        return moveWord(where, repeats, vim, isWORD, toEnd);
    }
}

function changeCaps(where, repeats, vim) {
    const [rows, cols] = getCursorPosition(where, vim);

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
    where.value = newContent;
    setCursorPosition(where, rows, cols + repeats, vim);
}

function processChange(where, repeats, vim, mRepeats, mKey) {
    const direction = processDelete(where, repeats, vim, mRepeats, mKey);
    setMode(vim, MODE_INSERT);
    if (direction === RIGHT) {
        moveCursor(where, 0, 1, vim, true, true);
    }
}

function moveFind(where, repeats, vim, args, isT) {
    isT = isT === undefined ? undefined : true;

    const [rows, cols] = getCursorPosition(where, vim);
    const lines = where.value.split(/\n/g);
    const line = lines[rows - 1];
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

    moveCursor(where, 0, i - (isT ? 1 : 0), vim);
}

function changeIndent(where, repeats, vim) {
    const lines = where.value.split(/\n/g);
    const [rows] = getCursorPosition(where, vim);
    const previousLines = lines.splice(0, rows - 1);
    const nextLines = lines.splice(repeats * (repeats < 0 ? -1 : 1));

    const newlines = [];
    for (let i = 0; i < repeats * (repeats < 0 ? -1 : 1); i++) {
        const line = lines[i];

        if (repeats >= 1) {
            newlines.push("    " + line);
        } else {
            const match = line.match(/^ +/);
            if (match === null) {
                return;
            }

            const indents = match[0].length;
            const subtracts = Math.min(4, indents);
            newlines.push(line.substring(subtracts));
        }
    }

    const newLines = [...previousLines, ...newlines, ...nextLines];
    const newContent = newLines.join("\n");

    const selectionPos = getSelectionPosition(where, vim);
    where.value = newContent;
    where.selectionStart = selectionPos;
    where.selectionEnd = selectionPos + 1;
}

function joinLines(where, repeats, vim) {
    if (vim.mode === MODE_VISUAL_LINE) {
        const lines = where.value.split(/\n/g);

        const selectionStartLine = (
            vim.target.value.substring(0, vim.target.selectionStart).match(/\n/g) || []
        ).length;
        const selectionEndLine = Math.max(
            selectionStartLine + 1,
            (vim.target.value.substring(0, vim.target.selectionEnd).match(/\n/g) || []).length - 1
        );

        const previousLines = lines.splice(0, selectionStartLine);
        const nextLines = lines.splice(selectionEndLine - selectionStartLine + 1);

        for (let i = 1; i < lines.length; i++) {
            lines[i] = lines[i].trim();
        }

        const middleLines = lines.join(" ").trimEnd();
        const cols = middleLines.length - lines[lines.length - 1].trim().length - 1;

        const newLines = [...previousLines, middleLines, ...nextLines];
        const newContent = newLines.join("\n");

        where.value = newContent;
        setMode(vim, MODE_NORMAL);
        setCursorPosition(where, selectionEndLine - lines.length + 2, cols, vim);
        return;
    }

    const [rows, cols] = getCursorPosition(where, vim);
    const lines = where.value.split(/\n/g);
    const previousLines = lines.splice(0, rows - 1);
    const nextLines = lines.splice(repeats + 1);

    for (let i = 1; i < lines.length; i++) {
        lines[i] = lines[i].trim();
    }

    const newLines = [...previousLines, lines.join(" ").trimEnd(), ...nextLines];
    const newContent = newLines.join("\n");
    
    where.value = newContent;
    setCursorPosition(where, rows, cols, vim);
}

let clipboard;
function copy(content) {
    clipboard = content;
    navigator.clipboard.writeText(content);
}

async function paste(where, repeats, vim, previous) {
    previous = previous === undefined ? undefined : true;

    const [rows, cols] = getCursorPosition(where, vim);
    const lines = where.value.split(/\n/g);
    const previousLines = lines.splice(0, rows - 1);
    const nextLines = lines.splice(1);

    let c;
    try {
        c = await navigator.clipboard.readText();
    } catch (e) {
        c = clipboard;
    }

    if (c.indexOf("\n") !== -1) {
        let newClipboard = c;
        while (newClipboard.endsWith("\n")) {
            newClipboard = newClipboard.substring(0, newClipboard.length - 1);
        }
        while (newClipboard.startsWith("\n")) {
            newClipboard = newClipboard.substring(1);
        }

        let newLines;
        if (previous) {
            newLines = [...previousLines, newClipboard, lines[0], ...nextLines];
        } else {
            newLines = [...previousLines, lines[0], newClipboard, ...nextLines];
        }
        const newContent = newLines.join("\n");
        where.value = newContent;
        setCursorPosition(where, rows + (previous ? 0 : 1), cols, vim);
    } else {
        const line = lines[0];
        const left = line.substring(0, cols + (previous ? 0 : 1));
        const right = line.substring(cols + (previous ? 0 : 1));
        const newLine = left + c.repeat(repeats) + right;

        const newLines = [...previousLines, newLine, ...nextLines];
        const newContent = newLines.join("\n");
        where.value = newContent;
        setCursorPosition(
            where,
            rows,
            cols + c.length * repeats - (previous ? 1 : 0),
            vim
        );
    }
}

const COMMAND_RE =
    /^([1-9]\d*)?((dd|>>|<<|[~\$\^A-EGI-JO-PSV-Wa-fhi-lo-pr-y]|gg|<C-r>)|(^0))(([1-9]\d*)?(gg|[ia][(){}[\]<>Ww]|[tf].|[\$\^0D-EGWehj-lw])|.)?/;

const normalCommands = [
    {
        key: "gg",
        action: (w, r, v) => setCursorPosition(w, r, 0, v),
        ignoreStack: true,
    },
    {
        key: "k",
        action: (w, r, v) => moveCursor(w, -r, 0, v),
        ignoreStack: true,
    },
    {
        key: "0",
        action: (w, r, v) => moveCursor(w, 0, -Infinity, v),
        ignoreStack: true,
    },
    {
        key: "^",
        action: (w, r, v) => homeCursor(w, v),
        ignoreStack: true,
    },
    {
        key: "b",
        action: (w, r, v) => moveWord(w, -r, v),
        ignoreStack: true,
    },
    {
        key: "B",
        action: (w, r, v) => moveWord(w, -r, v, true),
        ignoreStack: true,
    },
    {
        key: "h",
        action: (w, r, v) => moveCursor(w, 0, -r, v),
        ignoreStack: true,
    },
    {
        key: "l",
        action: (w, r, v) => moveCursor(w, 0, r, v),
        ignoreStack: true,
    },
    {
        key: "w",
        action: (w, r, v) => moveWord(w, r, v),
        ignoreStack: true,
    },
    {
        key: "e",
        action: (w, r, v) => moveWord(w, r, v, false, true),
        ignoreStack: true,
    },
    {
        key: "W",
        action: (w, r, v) => moveWord(w, r, v, true),
        ignoreStack: true,
    },
    {
        key: "E",
        action: (w, r, v) => moveWord(w, r, v, true, true),
        ignoreStack: true,
    },
    {
        key: "t",
        action: (w, r, v, a) => moveFind(w, r, v, a, true),
        requireArg: true,
        ignoreStack: true,
    },
    {
        key: "f",
        action: (w, r, v, a) => moveFind(w, r, v, a),
        requireArg: true,
        ignoreStack: true,
    },
    {
        key: "$",
        action: (w, r, v) => moveCursor(w, 0, Infinity, v),
        ignoreStack: true,
    },
    {
        key: "j",
        action: (w, r, v) => moveCursor(w, r, 0, v),
        ignoreStack: true,
    },
    {
        key: "G",
        action: (w, r, v) => setCursorPosition(w, r === 1 ? Infinity : r, 0, v),
        ignoreStack: true,
    },
    {
        key: "r",
        action: (w, r, v, a) => replaceCharacter(w, r, v, a),
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
        action: (w, r, v) => changeCaps(w, r, v),
    },
    {
        key: ">>",
        action: (w, r, v) => changeIndent(w, r, v),
    },
    {
        key: "<<",
        action: (w, r, v) => changeIndent(w, -r, v),
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
            moveCursor(w, 0, 1, v, true);
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
        key: "s",
        alias: "cl",
    },
    {
        key: "S",
        alias: "ddO",
    },
    {
        key: "x",
        action: (w, r, v) => removeCharacter(w, r, v),
    },
    {
        key: "J",
        action: (w, r, v) => joinLines(w, r, v),
    },
    {
        key: "dd",
        action: (w, r, v) => removeLine(w, r, v),
    },
    {
        key: "d",
        action: (w, r, v, a, mr, mk) => processDelete(w, r, v, mr, mk),
        requireArgs: true,
    },
    {
        key: "D",
        alias: "d$",
    },
    {
        key: "u",
        action: (w, r, v) => popStack(w, r, v),
        ignoreStack: true,
    },
    {
        key: "<C-r>",
        action: (w, r, v) => redoStack(w, r, v),
    },
    {
        key: "y",
        action: (w, r, v, a, mr, mk) => {
            processDelete(w, r, v, mr, mk);
            popStack(w, r, v);
        },
        requireArgs: true,
    },
    {
        key: "p",
        action: (w, r, v) => paste(w, r, v),
    },
    {
        key: "P",
        action: (w, r, v) => paste(w, r, v, true),
    },
    {
        key: "v",
        action: (w, r, v) => setMode(v, MODE_VISUAL),
    },
    {
        key: "V",
        action: (w, r, v) => setMode(v, MODE_VISUAL_LINE),
    },
];

function processBuffer(buffer, where, vim, recordStack) {
    recordStack = recordStack === undefined ? undefined : true;

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
    let pushed = false;
    normalCommands.forEach((normalCommand) => {
        if (normalCommand.key !== key) {
            return;
        }

        if (run) {
            return;
        }

        if (!pushed && recordStack && !normalCommand.ignoreStack) {
            pushStack(where, vim);
            pushed = true;
        }

        const extraLength = args.length;

        if (normalCommand.requireArgs || normalCommand.requireArg) {
            if (
                vim.mode === MODE_VISUAL ||
                vim.mode === MODE_VISUAL_LINE ||
                mKey.length > 0 ||
                (normalCommand.requireArg && args.length > 0)
            ) {
                buffer = buffer.substring(command.length);
                run = true;
                return normalCommand.action(where, repeats, vim, args, mRepeats, mKey);
            }
        } else if (normalCommand.alias && normalCommand.alias.length > 0) {
            buffer =
                `${repeats === 1 ? "" : repeats}${normalCommand.alias}` +
                `${buffer.substring(command.length - extraLength)}`;
            run = true;
        } else {
            buffer = buffer.substring(command.length - extraLength);
            run = true;
            return normalCommand.action(where, repeats, vim);
        }

        if (!run) {
            popStack(where, 1, vim);
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
        refreshCursorPosition(v.target, v, nowMode !== MODE_INSERT ? 0 : -1);
    } else if (e.key === "Backspace") {
        if (v.mode !== MODE_INSERT) {
            e.preventDefault();
            v.buffer = "";
            moveCursor(v.target, 0, -1, v);
        }
    } else if (e.key === "Enter") {
        if (v.mode === MODE_NORMAL) {
            e.preventDefault();
            v.buffer = "";
            moveCursor(v.target, 1, 0, v);
        }
    } else if (v.mode !== MODE_INSERT && e.key.length <= 1) {
        e.preventDefault();
        if (e.ctrlKey) {
            v.buffer += `<C-${e.key}>`;
        } else {
            v.buffer += e.key;
        }
        v.buffer = processBuffer(v.buffer, v.target, v, true);
    } else if (v.mode === MODE_INSERT) {
        if (e.key === "Tab") {
            e.preventDefault();
            insertAtCursor(v.target, "    ", v);
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

        refreshCursorPosition(this.target, this);
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
            const [rows, cols] = getCursorPosition(this.target, this);
            this.posSpan.innerText = `${rows},${cols}`;
        }
    }
}
