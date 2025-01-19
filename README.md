# textarea-vim

> Javascript CDN for using textarea as like it's vim.

The purpose of this project is to make Javascript vim implementation on textarea tag as perfect as can. It is impossible to implement full vim feature on textarea, as there have lacks of system access, however, using vim on textarea conditionally is literally possible.

The project is under construction. Some intended feature could not work properly.

## Usage

### Using CDN

1. attach the code below inside of an `head` tag.

```html
<script src="https://github.com/junhg0211/textarea-vim/blob/master/textarea-vim.js"></script>
```

2. `vimify` `textarea`.

```html
<textarea id="vim"></textarea>

<script>
    const vim = document.querySelector("#vim");
    new Vim(vim);
</script>
```

3. (optional) you can use optional information windows such as mode, cursor position or buffer contents.

```html
<textarea id="vim"></textarea>
<div id="vim-mode">NORMAL</div>
<div id="vim-pos"></div>
<div id="vim-buffer"></div>

<script>
    const vim = document.querySelector("#vim");
    const mode = document.querySelector("#vim-mode");
    const buffer = document.querySelector("#vim-buffer");
    const pos = document.querySelector("#vim-pos");
    new Vim(vim, mode, buffer, pos);
</script>
```

### Using Local Javascript File

1. Download `textarea-vim.js` and place it inside of your project directory.
2. attach the code below inside of the `head` tag.

```html
<script src="/path/to/textarea-vim.js"></script>
```

3. follow instructions in **Using CDN** 2-3.
