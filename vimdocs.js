// vimdocs.js

// ==UserScript==
// @name        VimDocs (Vim for Google Docs)
// @namespace   http://tampermonkey.net/
// @version     1.3.4
// @description Vim-style keyboard shortcuts for Google Docs. Ported from the DocsKeys extension.
// @author      uhs-robert
// @license     MIT
// @match       https://docs.google.com/document/*
// @grant       none
// @run-at      document-idle
// @downloadURL https://update.greasyfork.org/scripts/562026/VimDocs%20%28Vim%20for%20Google%20Docs%29.user.js
// @updateURL https://update.greasyfork.org/scripts/562026/VimDocs%20%28Vim%20for%20Google%20Docs%29.meta.js
// ==/UserScript==

// TODO: Add more `:` commands (e.g., :q, :run (open alt+/), :$s/text/replace/gc etc.)
// TODO: `g` remaining options: gu=lowercase, gU=uppercase, g[=previousTab, g]=nextTab

/** TODO:
 * Good candidates for modularization:
  Object: Keys
  What it would contain: keyCodes, sendKeyEvent(), modifier helpers (wordMods, paragraphMods, clipboardMods)

  Object: Move
  What it would contain: goToStartOfLine, goToEndOfLine, goToStartOfWord, goToEndOfWord, goToStartOfPara, goToEndOfPara, goToTop

  Object: Select
  What it would contain: selectToStartOfLine, selectToEndOfLine, selectToStartOfWord, selectToEndOfWord, selectToEndOfPara, selectInnerWord

  Object: Find
  What it would contain: STATE.search.*, handleFindChar, handleSlashSearch, handleStarSearch, closeFindWindow, hideFindWindowAndRefocus

  Object: Operator
  What it would contain: STATE.longStringOp, runLongStringOp, waitForFirstInput, waitForSecondInput, waitForTextObject, waitForVisualInput

  Object: Menu
  What it would contain: menuItems, menuItemElements, clickMenu, getMenuItem,findMenuItem, activateTopLevelMenu, simulateClick
 * */

(function () {
  "use strict";

  /*
   * ======================================================================================
   * COLORSCHEME
   * Set your preferred theme for vim cursor and modes here.
   * ======================================================================================
   */
  const COLORSCHEME = {
    cursor: "khaki",
    bg: {
      core: "#101825",
      mantle: "#1A283F",
      surface: "#22385C",
    },
    mode: {
      normal: { bg: "#1670AD", fg: "white" },
      insert: { bg: "#2B8A5E", fg: "white" },
      visual: { bg: "#FFA653", fg: "white" },
      "v-line": { bg: "#FFA653", fg: "white" },
      wait: { bg: "indianred", fg: "white" },
    },
  };

  /*
   * ======================================================================================
   * GOOGLE DOCS ELEMENTS
   * Update DOM elements here. If something isn't working, start here.
   * ======================================================================================
   */
  const GoogleDocs = {
    last_active_element: null,

    getCursor: () => {
      const cursor =
        document.getElementById("kix-current-user-cursor-caret") || null;
      if (cursor) {
        cursor.style.setProperty(
          "border-color",
          COLORSCHEME["cursor"],
          "important",
        );
      }
      return cursor;
    },
    getFindWindow: () => {
      return document.getElementById("docs-findbar-id") || null;
    },
    getEditorIframe: () => {
      return document.querySelector("iframe.docs-texteventtarget-iframe");
    },
    saveActiveElement: () => {
      const iframe = GoogleDocs.getEditorIframe();
      GoogleDocs.last_active_element = iframe?.contentDocument?.activeElement;
    },
    restoreFocus: (callback) => {
      setTimeout(() => {
        if (
          GoogleDocs.last_active_element &&
          typeof GoogleDocs.last_active_element.focus === "function"
        ) {
          GoogleDocs.last_active_element.focus();
        }
        if (callback) callback();
      }, 50);
    },
    focusEditor: () => {
      const iframe = GoogleDocs.getEditorIframe();
      if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
        iframe.contentDocument.body.focus();
      }
    },
  };

  /*
   * ======================================================================================
   * PART 1: INJECTED PAGE SCRIPT
   * This logic runs in the main page context to simulate keystrokes on the Docs iframe.
   * ======================================================================================
   */
  function getPageContextScript() {
    /**
     * Gets the active editor element from the Google Docs iframe.
     * @returns {Element|null} The active element inside the editor iframe, or null if not found.
     */
    function getEditor() {
      const iframe = document.querySelector(".docs-texteventtarget-iframe");
      if (iframe && iframe.contentDocument) {
        return iframe.contentDocument.activeElement;
      }
      return null;
    }

    /**
     * Simulates a keyboard event on a DOM element.
     * @param {string} eventType - The type of keyboard event (e.g., "keydown", "keyup").
     * @param {Element} el - The DOM element to dispatch the event on.
     * @param {Object} args - Event arguments.
     * @param {number} args.keyCode - The key code for the event.
     * @param {Object} [args.mods] - Modifier key states.
     * @param {boolean} [args.mods.shift] - Whether Shift is pressed.
     * @param {boolean} [args.mods.control] - Whether Control is pressed.
     * @param {boolean} [args.mods.alt] - Whether Alt is pressed.
     * @param {boolean} [args.mods.meta] - Whether Meta is pressed.
     */
    const simulateKeyEvent = function (eventType, el, args) {
      const mods = args.mods || {};
      const event = new KeyboardEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: document.defaultView,
        keyCode: args.keyCode,
        which: args.keyCode,
        shiftKey: !!mods.shift,
        ctrlKey: !!mods.control,
        altKey: !!mods.alt,
        metaKey: !!mods.meta,
      });
      // Override keyCode/which since KeyboardEvent constructor doesn't set them reliably
      Object.defineProperties(event, {
        keyCode: { value: args.keyCode },
        which: { value: args.keyCode },
      });
      el.dispatchEvent(event);
    };
    /**
     * Listens for custom keypress simulation events dispatched from the content script.
     * Simulates both keydown and keyup events on the editor element.
     * @listens doc-keys-simulate-keypress
     * @param {CustomEvent} event - The custom event containing keypress details.
     * @param {Object} event.detail - The event arguments passed to simulateKeyEvent.
     */
    window.addEventListener("doc-keys-simulate-keypress", function (event) {
      const args = event.detail;
      const editor_el = getEditor();
      if (editor_el) {
        simulateKeyEvent("keydown", editor_el, args);
        simulateKeyEvent("keyup", editor_el, args);
      }
    });
  }

  // Inject the page script
  const script_el = document.createElement("script");
  script_el.textContent = "(" + getPageContextScript.toString() + ")();";
  document.documentElement.appendChild(script_el);

  /*
   * ======================================================================================
   * PART 2: CONTENT SCRIPT LOGIC
   * Handles Vim state, mode indication, and logic processing.
   * ======================================================================================
   */

  /**
   * Initializes VimDocs functionality once the Google Docs editor iframe is ready.
   * Sets up event listeners, state management, and UI elements for vim emulation.
   */
  function initVimDocs() {
    const iframe = document.querySelector("iframe.docs-texteventtarget-iframe");

    if (!iframe || !iframe.contentDocument || !iframe.contentDocument.body) {
      setTimeout(initVimDocs, 500);

      return;
    }

    console.debug("VimDocs: Initializing...");
    iframe.contentDocument.addEventListener("keydown", eventHandler, true);

    const isMac = /Mac/.test(navigator.platform || navigator.userAgent);

    const keyCodes = {
      backspace: 8,
      enter: 13,
      space: 32,
      esc: 27,
      pageup: 33,
      pagedown: 34,
      end: 35,
      home: 36,
      left: 37,
      up: 38,
      right: 39,
      down: 40,
      delete: 46,
      f: 70,
      g: 71,
      v: 86,
      y: 89,
      zero: 48,
      seven: 55,
      eight: 56,
      nine: 57,
      minus: 189,
      equal: 187,
      slash: 191,
      bracketLeft: 219,
      bracketRight: 221,
    };

    const wordModifierKey = isMac ? "alt" : "control";
    const paragraphModifierKey = isMac ? "alt" : "control";
    const clipboardModifierKey = isMac ? "meta" : "control";

    /**
     * Returns modifier keys for word-based navigation.
     * @param {boolean} [shift=false] - Whether to include shift for selection.
     * @returns {Object} Modifier key object for word navigation.
     */
    function wordMods(shift = false) {
      return { shift, [wordModifierKey]: true };
    }

    /**
     * Returns modifier keys for paragraph-based navigation.
     * @param {boolean} [shift=false] - Whether to include shift for selection.
     * @returns {Object} Modifier key object for paragraph navigation.
     */
    function paragraphMods(shift = false) {
      return { shift, [paragraphModifierKey]: true };
    }

    /**
     * Returns modifier keys for clipboard operations (copy/paste).
     * @returns {Object} Modifier key object for clipboard operations.
     */
    function clipboardMods() {
      return { [clipboardModifierKey]: true };
    }

    /**
     * Dispatches a simulated key event to the Google Docs editor.
     * @param {string} key - The key name from keyCodes map.
     * @param {Object} [mods={}] - Modifier keys (shift, control, alt, meta).
     */
    function sendKeyEvent(key, mods = {}) {
      const keyCode = keyCodes[key];
      const defaultMods = {
        shift: false,
        control: false,
        alt: false,
        meta: false,
      };
      const args = { keyCode, mods: { ...defaultMods, ...mods } };

      let detailData = args;
      // Firefox only
      if (typeof cloneInto === "function") {
        detailData = cloneInto(args, window);
      }

      window.dispatchEvent(
        new CustomEvent("doc-keys-simulate-keypress", {
          detail: detailData,
        }),
      );
    }

    /*
     * ======================================================================================
     * MODE MANAGEMENT
     * Centralizes all vim mode state and transitions.
     * ======================================================================================
     */
    /**
     * StatusLine - Container for the status bar UI at the bottom of the screen.
     * Other components (Mode, CommandMode) append their elements to this container.
     */
    const StatusLine = {
      container: null,

      /**
       * Initializes the status line container.
       */
      init() {
        // Remove existing status line if present to prevent duplicates on re-init
        const existing = document.getElementById("vim-status-line");
        if (existing) existing.remove();

        this.container = document.createElement("div");
        this.container.id = "vim-status-line";
        this.container.style.position = "fixed";
        this.container.style.bottom = "0px";
        this.container.style.left = "20px";
        this.container.style.display = "flex";
        this.container.style.alignItems = "center";
        this.container.style.gap = "8px";
        this.container.style.padding = "8px";
        this.container.style.zIndex = "9999";
        document.body.appendChild(this.container);
      },
    };

    const Mode = {
      current: "normal",
      temp_normal: false,
      replace_char: false,
      indicator: null,

      /**
       * Initializes the mode indicator element.
       */
      init() {
        // Inject style for disabling cursor animation in insert mode
        const existingStyle = document.getElementById("vimdocs-style");
        if (existingStyle) existingStyle.remove();
        const style_el = document.createElement("style");
        style_el.id = "vimdocs-style";
        style_el.textContent =
          ".vim-no-cursor-animation { animation: none !important; }";
        document.head.appendChild(style_el);

        // Create mode indicator
        this.indicator = document.createElement("div");
        this.indicator.id = "vim-mode-indicator";
        this.indicator.style.padding = "8px 16px";
        this.indicator.style.borderRadius = "4px";
        this.indicator.style.boxSizing = "border-box";
        this.indicator.style.height = "36px";
        this.indicator.style.display = "flex";
        this.indicator.style.alignItems = "center";
        this.indicator.style.fontFamily =
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        this.indicator.style.fontSize = "14px";
        this.indicator.style.fontWeight = "500";
        StatusLine.container.appendChild(this.indicator);
      },

      /**
       * Updates the mode indicator UI with the current mode.
       */
      updateIndicator() {
        if (!this.indicator) return;
        this.indicator.textContent = this.current.toUpperCase();

        let color_key;
        switch (this.current) {
          case "normal":
          case "insert":
          case "visual":
          case "v-line":
            color_key = this.current;
            break;
          case "waitForFirstInput":
          case "waitForSecondInput":
          case "waitForVisualInput":
          case "waitForTextObject":
          case "waitForFindChar":
          case "multipleMotion":
            color_key = "wait";
            break;
          default:
            color_key = "normal";
        }

        this.indicator.style.backgroundColor = COLORSCHEME.mode[color_key].bg;
        this.indicator.style.color = COLORSCHEME.mode[color_key].fg;
      },

      /**
       * Sets the current mode and updates the indicator.
       * @param {string} mode - The mode to switch to.
       */
      set(mode) {
        this.current = mode;
        this.updateIndicator();
      },

      /**
       * Checks if the current mode is one of the visual modes.
       * @returns {boolean} True if in visual or v-line mode.
       */
      isVisual() {
        return this.current === "visual" || this.current === "v-line";
      },

      /**
       * Checks if the current mode is one of the wait modes.
       * @returns {boolean} True if waiting for additional input.
       */
      isWaiting() {
        return (
          this.current === "waitForFirstInput" ||
          this.current === "waitForSecondInput" ||
          this.current === "waitForVisualInput" ||
          this.current === "waitForTextObject" ||
          this.current === "waitForFindChar" ||
          this.current === "waitForIndent" ||
          this.current === "waitForOutdent" ||
          this.current === "waitForZoom" ||
          this.current === "waitForGo" ||
          this.current === "multipleMotion"
        );
      },

      /**
       * Switches to visual (character) selection mode.
       */
      toVisual() {
        this.set("visual");
        sendKeyEvent("right", { shift: true });
      },

      /**
       * Switches to visual line selection mode.
       */
      toVisualLine() {
        this.set("v-line");
        goToStartOfLine();
        selectToEndOfLine();
      },

      /**
       * Switches to normal mode.
       * @param {boolean} [skip_deselect=false] - Skip deselection (used after cut/copy).
       */
      toNormal(skip_deselect = false) {
        if (!skip_deselect && this.isVisual()) {
          sendKeyEvent("right");
          sendKeyEvent("left");
        }

        this.set("normal");
        this.replace_char = false;

        const cursor = GoogleDocs.getCursor();
        if (cursor) {
          cursor.style.opacity = 1;
          cursor.style.display = "block";
          const parent = cursor.parentElement;
          if (parent) parent.classList.remove("vim-no-cursor-animation");
        }

        setTimeout(() => {
          GoogleDocs.focusEditor();
        }, 0);
      },

      /**
       * Switches to insert mode.
       */
      toInsert() {
        this.set("insert");
        const cursor = GoogleDocs.getCursor();
        if (cursor) {
          const parent = cursor.parentElement;
          if (parent) parent.classList.add("vim-no-cursor-animation");
        }
      },
    };

    /*
     * ======================================================================================
     * COMMAND MODE
     * Handles vim-style : commands.
     * ======================================================================================
     */
    const Command = {
      container: null,
      input: null,

      /**
       * Available commands registry.
       * Each command has a name and an execute function.
       */
      commands: {
        help: {
          description: "Show available commands",
          execute: () => {
            Command.showHelp();
          },
        },
      },

      /**
       * Initializes the command input elements.
       */
      init() {
        this.container = document.createElement("div");
        this.container.id = "vim-command-input";
        this.container.style.display = "none";

        this.input = document.createElement("input");
        this.input.type = "text";
        this.input.style.padding = "6px 12px";
        this.input.style.borderRadius = "4px";
        this.input.style.border = "2px solid " + COLORSCHEME.mode.normal.bg;
        this.input.style.boxSizing = "border-box";
        this.input.style.height = "36px";
        this.input.style.fontFamily = "monospace";
        this.input.style.fontSize = "14px";
        this.input.style.width = "200px";
        this.input.style.outline = "none";
        this.input.style.backgroundColor = "#1a1a1a";
        this.input.style.color = "white";
        this.input.placeholder = ":";

        this.container.appendChild(this.input);
        StatusLine.container.appendChild(this.container);
      },

      /**
       * Shows the help panel with available commands.
       */
      showHelp() {
        let helpEl = document.getElementById("vim-command-help");
        if (!helpEl) {
          helpEl = document.createElement("div");
          helpEl.id = "vim-command-help";
          helpEl.tabIndex = -1;
          helpEl.style.position = "fixed";
          helpEl.style.top = "50%";
          helpEl.style.left = "50%";
          helpEl.style.transform = "translate(-50%, -50%)";
          helpEl.style.padding = "24px";
          helpEl.style.borderRadius = "8px";
          helpEl.style.fontFamily = "monospace";
          helpEl.style.fontSize = "14px";
          helpEl.style.backgroundColor = "#1a1a1a";
          helpEl.style.color = "white";
          helpEl.style.zIndex = "10000";
          helpEl.style.minWidth = "300px";
          helpEl.style.boxShadow = "0 4px 20px rgba(0,0,0,0.5)";
          helpEl.style.border = "1px solid #333";
          helpEl.style.outline = "none";
          document.body.appendChild(helpEl);
        }

        // Build help content
        const cmdList = Object.entries(this.commands)
          .map(([name, cmd]) => `  :${name.padEnd(12)} ${cmd.description}`)
          .join("\n");

        helpEl.innerHTML = `
          <div style="margin-bottom: 16px; font-size: 16px; font-weight: bold; color: ${COLORSCHEME.mode.normal.bg};">
            VimDocs Commands
          </div>
          <pre style="margin: 0; color: #ccc;">${cmdList}</pre>
          <div style="margin-top: 16px; color: #666; font-size: 12px;">
            Press Escape or Enter to close
          </div>
        `;
        helpEl.style.display = "block";
        helpEl.focus();

        // Close on Escape or Enter
        const closeHelp = (e) => {
          if (e.key === "Escape" || e.key === "Enter") {
            e.preventDefault();
            helpEl.style.display = "none";
            helpEl.removeEventListener("keydown", closeHelp);
            GoogleDocs.restoreFocus(() => Mode.toNormal());
          }
        };
        helpEl.addEventListener("keydown", closeHelp);
      },

      /**
       * Opens the command input and focuses it.
       */
      open() {
        GoogleDocs.saveActiveElement();

        this.container.style.display = "block";
        this.input.value = "";
        this.input.focus();

        // Set up event listeners
        this._handleKeydown = (e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            this.close();
            GoogleDocs.restoreFocus(() => Mode.toNormal());
          } else if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            const cmd = this.input.value.trim();
            this.close();
            if (cmd) {
              this.execute(cmd);
            } else {
              GoogleDocs.restoreFocus(() => Mode.toNormal());
            }
          }
        };

        this.input.addEventListener("keydown", this._handleKeydown);
      },

      /**
       * Closes the command input. Does not restore focus - callers handle that.
       */
      close() {
        this.container.style.display = "none";
        this.input.value = "";
        if (this._handleKeydown) {
          this.input.removeEventListener("keydown", this._handleKeydown);
          this._handleKeydown = null;
        }
      },

      /**
       * Executes a command string.
       * @param {string} cmdString - The command string entered by the user.
       */
      execute(cmdString) {
        const parts = cmdString.split(/\s+/);
        const cmdName = parts[0];
        const args = parts.slice(1);

        if (this.commands[cmdName]) {
          this.commands[cmdName].execute(args);
        } else {
          this.showMessage(
            `Unknown command: "${cmdName}". Type :help for available commands.`,
          );
          GoogleDocs.restoreFocus(() => Mode.toNormal());
        }
      },

      /**
       * Shows a temporary message to the user.
       * @param {string} message - The message to display.
       */
      showMessage(message) {
        // Create or reuse message element
        let msgEl = document.getElementById("vim-command-message");
        if (!msgEl) {
          msgEl = document.createElement("div");
          msgEl.id = "vim-command-message";
          msgEl.style.position = "fixed";
          msgEl.style.bottom = "60px";
          msgEl.style.left = "20px";
          msgEl.style.padding = "8px 16px";
          msgEl.style.borderRadius = "4px";
          msgEl.style.fontFamily = "monospace";
          msgEl.style.fontSize = "13px";
          msgEl.style.backgroundColor = "#333";
          msgEl.style.color = "#ff6b6b";
          msgEl.style.zIndex = "9999";
          msgEl.style.maxWidth = "400px";
          document.body.appendChild(msgEl);
        }

        msgEl.textContent = message;
        msgEl.style.display = "block";

        // Auto-hide after 3 seconds
        setTimeout(() => {
          msgEl.style.display = "none";
        }, 3000);
      },
    };

    // Initialize status line and its components
    StatusLine.init();
    Mode.init();
    Command.init();

    const STATE = {
      search: {
        active: false,
        forward: true, // true for f and /, false for F
        isCharSearch: false, // true for f/F, false for /
        lastSearch: null,
      },
      multipleMotion: {
        times: 0,
        mode: "normal",
      },
      longStringOp: "",
    };

    /**
     * Repeats a motion function multiple times.
     * @param {Function} motion - The motion handler function to repeat.
     * @param {number} times - Number of times to repeat.
     * @param {string} key - The key to pass to the motion handler.
     */
    function repeatMotion(motion, times, key) {
      for (let i = 0; i < times; i++) motion(key);
    }

    /** Moves cursor to start of current line (vim `0`, `^`, `_`). */
    function goToStartOfLine() {
      sendKeyEvent("home");
    }
    /** Moves cursor to end of current line (vim `$`). */
    function goToEndOfLine() {
      sendKeyEvent("end");
    }
    /** Selects from cursor to start of line. */
    function selectToStartOfLine() {
      sendKeyEvent("home", { shift: true });
    }
    /** Selects from cursor to end of line. */
    function selectToEndOfLine() {
      sendKeyEvent("end", { shift: true });
    }
    /** Selects from cursor to start of previous word (vim `b` in visual). */
    function selectToStartOfWord() {
      sendKeyEvent("left", wordMods(true));
    }
    /** Selects from cursor to end of current word (vim `e`/`w` in visual). */
    function selectToEndOfWord() {
      sendKeyEvent("right", wordMods(true));
    }
    /** Moves cursor to end of current word (vim `e`). */
    function goToEndOfWord() {
      sendKeyEvent("right", wordMods());
    }
    /** Moves cursor to start of previous word (vim `b`). */
    function goToStartOfWord() {
      sendKeyEvent("left", wordMods());
    }
    /** Selects the word under cursor (vim `iw` text object). */
    function selectInnerWord() {
      sendKeyEvent("left");
      sendKeyEvent("left", wordMods());
      sendKeyEvent("right", wordMods(true));
    }
    /** Moves cursor to top of document (vim `gg`). */
    function goToTop() {
      sendKeyEvent("home", { control: true });
      STATE.longStringOp = "";
    }
    /** Selects from cursor to end of paragraph. */
    function selectToEndOfPara() {
      sendKeyEvent("down", paragraphMods(true));
    }
    /**
     * Moves cursor to end of paragraph.
     * @param {boolean} [shift=false] - Whether to select while moving.
     */
    function goToEndOfPara(shift = false) {
      sendKeyEvent("down", paragraphMods(shift));
      sendKeyEvent("right", { shift });
    }
    /**
     * Moves cursor to start of paragraph.
     * @param {boolean} [shift=false] - Whether to select while moving.
     */
    function goToStartOfPara(shift = false) {
      sendKeyEvent("up", paragraphMods(shift));
    }
    /** Opens a new line above cursor and enters insert mode (vim `O`). */
    function addLineTop() {
      goToStartOfLine();
      sendKeyEvent("enter");
      sendKeyEvent("up");
      Mode.toInsert();
    }
    /** Opens a new line below cursor and enters insert mode (vim `o`). */
    function addLineBottom() {
      goToEndOfLine();
      sendKeyEvent("enter");
      Mode.toInsert();
    }
    /** Moves cursor right and enters insert mode, handling line wrap (vim `a`). */
    function handleAppend() {
      const cursor = GoogleDocs.getCursor();
      if (!cursor) {
        sendKeyEvent("right");
        Mode.toInsert();
        return;
      }
      const originalTop = cursor.getBoundingClientRect().top;
      sendKeyEvent("right");
      // Use requestAnimationFrame to wait for cursor position update
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const newTop = cursor.getBoundingClientRect().top;
          if (newTop > originalTop + 10) sendKeyEvent("left");
          Mode.toInsert();
        });
      });
    }
    /**
     * Executes the pending operator (c, d, y, p, g) on the current selection.
     * @param {string} [operation=STATE.longStringOp] - The operator to execute.
     */
    function runLongStringOp(operation = STATE.longStringOp) {
      switch (operation) {
        case "c":
          clickMenu(menuItems.cut);
          Mode.toInsert();
          break;
        case "d":
          clickMenu(menuItems.cut);
          Mode.toNormal(true);
          break;
        case "y":
          clickMenu(menuItems.copy);
          sendKeyEvent("left");
          Mode.toNormal(true);
          break;
        case "p":
          // sendKeyEvent("v", clipboardMods());
          Mode.toNormal(true);
          break;
        case "v":
          break;
        case "g":
          goToTop();
          break;
      }
    }

    /**
     * Handles the second input for compound motions (e.g., `daw` needs `a` then `w`).
     * @param {string} key - The key pressed.
     */
    function waitForSecondInput(key) {
      switch (key) {
        case "w":
          goToStartOfWord();
          waitForFirstInput(key);
          break;
        case "p":
          goToStartOfPara();
          waitForFirstInput(key);
          break;
        default:
          Mode.toNormal();
          break;
      }
    }

    /**
     * Handles text object selection after `i` or `a` (e.g., `ciw`, `daw`).
     * @param {string} key - The text object key (w for word, etc.).
     */
    function waitForTextObject(key) {
      switch (key) {
        case "w":
          selectInnerWord();
          runLongStringOp();
          break;
        default:
          Mode.toNormal();
          break;
      }
    }

    /**
     * Handles the first motion/text-object input after an operator (c, d, y).
     * @param {string} key - The motion or text-object key.
     */
    function waitForFirstInput(key) {
      switch (key) {
        case "i":
          Mode.current = "waitForTextObject";
          break;
        case "a":
          Mode.current = "waitForTextObject";
          break;
        case "w":
          selectToEndOfWord();
          runLongStringOp();
          break;
        case "p":
          selectToEndOfPara();
          runLongStringOp();
          break;
        case "^":
        case "_":
        case "0":
          selectToStartOfLine();
          runLongStringOp();
          break;
        case "$":
          selectToEndOfLine();
          runLongStringOp();
          break;
        case STATE.longStringOp:
          goToStartOfLine();
          selectToEndOfLine();
          runLongStringOp();
          break;
        default:
          Mode.toNormal();
      }
    }

    /**
     * Handles text object selection in visual mode (e.g., `viw`, `vap`).
     * @param {string} key - The text object key.
     */
    function waitForVisualInput(key) {
      switch (key) {
        case "w":
          sendKeyEvent("left", { control: true });
          goToStartOfWord();
          selectToEndOfWord();
          break;
        case "p":
          goToStartOfPara();
          goToEndOfPara(true);
          break;
      }
      Mode.current = "v-line";
    }

    /**
     * Handles count prefix for motions (e.g., `5j` moves down 5 lines).
     * @param {string} key - The next key after the count digits.
     */
    function handleMultipleMotion(key) {
      if (/[0-9]/.test(key)) {
        STATE.multipleMotion.times = Number(
          String(STATE.multipleMotion.times) + key,
        );
        return;
      }
      switch (STATE.multipleMotion.mode) {
        case "normal":
          repeatMotion(handleKeyEventNormal, STATE.multipleMotion.times, key);
          break;
        case "v-line":
        case "visual":
          repeatMotion(
            handleKeyEventVisualLine,
            STATE.multipleMotion.times,
            key,
          );
          break;
      }
      Mode.current = STATE.multipleMotion.mode;
    }

    /**
     * Main keyboard event handler. Routes keys to appropriate mode handlers.
     * @param {KeyboardEvent} e - The keyboard event from the editor iframe.
     */
    function eventHandler(e) {
      if (["Shift", "Meta", "Control", "Alt", ""].includes(e.key)) return;

      // Ctrl+Space: Toggle checkbox (sends Ctrl+Alt+Enter)
      if (e.ctrlKey && e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        sendKeyEvent("enter", { control: true, alt: true });
        return;
      }

      if (e.ctrlKey && Mode.current === "normal") {
        if (e.key === "u") {
          e.preventDefault();
          sendKeyEvent("pageup");
          return;
        }
        if (e.key === "d") {
          e.preventDefault();
          sendKeyEvent("pagedown");
          return;
        }
        if (e.key === "r") {
          e.preventDefault();
          clickMenu(menuItems.redo);
          return;
        }
      }

      if (e.ctrlKey && Mode.current === "insert" && e.key === "o") {
        e.preventDefault();
        e.stopImmediatePropagation();
        Mode.toNormal();
        Mode.temp_normal = true;
        return;
      }

      if (Mode.current === "insert" && Mode.replace_char) {
        if (e.key === "Escape") {
          e.preventDefault();
          Mode.toNormal();
          return;
        }
        if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
          sendKeyEvent("delete");

          // Use requestAnimationFrame to wait for delete to process
          requestAnimationFrame(() => {
            sendKeyEvent("left");
            Mode.toNormal();
          });

          return;
        }
      }

      if (e.altKey || e.ctrlKey || e.metaKey) return;

      if (e.key === "Escape") {
        e.preventDefault();
        if (STATE.search.active) closeFindWindow();
        if (Mode.current === "v-line" || Mode.current === "visual")
          sendKeyEvent("right");
        Mode.toNormal();
        return;
      }

      if (Mode.current != "insert") {
        e.preventDefault();
        e.stopPropagation();
        switch (Mode.current) {
          case "normal":
            handleKeyEventNormal(e.key);
            break;
          case "visual":
          case "v-line":
            handleKeyEventVisualLine(e.key);
            break;
          case "waitForFirstInput":
            waitForFirstInput(e.key);
            break;
          case "waitForSecondInput":
            waitForSecondInput(e.key);
            break;
          case "waitForVisualInput":
            waitForVisualInput(e.key);
            break;
          case "waitForTextObject":
            waitForTextObject(e.key);
            break;
          case "multipleMotion":
            handleMultipleMotion(e.key);
            break;
          case "waitForFindChar":
            handleFindChar(e.key);
            break;
          case "waitForIndent":
            handleIndent(e.key);
            break;
          case "waitForOutdent":
            handleOutdent(e.key);
            break;
          case "waitForZoom":
            handleZoom(e.key);
            break;
          case "waitForGo":
            handleGo(e.key);
            break;
        }
      }
    }

    /**
     * Hides the Google Docs find bar and refocuses the editor.
     */
    function hideFindWindowAndRefocus() {
      const findWindow = GoogleDocs.getFindWindow();
      if (findWindow) findWindow.style.display = "none";

      GoogleDocs.restoreFocus(() => Mode.toNormal());
    }

    /**
     * Handles vim `f` and `F` single-character search.
     * @param {string} key - The character to search for.
     */
    function handleFindChar(key) {
      GoogleDocs.saveActiveElement();
      sendKeyEvent("f", { control: true });

      setTimeout(() => {
        const activeEl = document.activeElement;
        if (activeEl && activeEl.tagName === "INPUT") {
          activeEl.value = key;
          activeEl.dispatchEvent(new Event("input", { bubbles: true }));
          hideFindWindowAndRefocus();
        }
      }, 100);

      STATE.search.active = true;
      STATE.search.isCharSearch = true;
      Mode.current = "normal";
    }

    /**
     * Handles `/` and `?` search commands.
     * Opens Google Docs find dialog and either waits for user input or pre-fills
     * with provided text for repeat searches (n/N).
     * @param {boolean} [forward=true] - Search direction: true for forward (/), false for backward (?).
     * @param {string|null} [text=null] - Pre-fill search text for repeat searches. If null, waits for user input.
     */
    function handleSlashSearch(forward = true, text = null) {
      GoogleDocs.saveActiveElement();
      sendKeyEvent("f", { control: true });
      STATE.search.forward = forward;
      STATE.search.active = true;
      STATE.search.isCharSearch = false;

      setTimeout(() => {
        const findInput = document.activeElement;
        if (findInput && findInput.tagName === "INPUT") {
          if (text) {
            // Pre-fill text and immediately hide
            findInput.value = text;
            findInput.dispatchEvent(new Event("input", { bubbles: true }));
            STATE.search.lastSearch = text;
            hideFindWindowAndRefocus();
          } else {
            // Wait for user to type and press Enter
            const handleEnter = (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                findInput.removeEventListener("keydown", handleEnter, true);
                STATE.search.lastSearch = findInput.value;
                hideFindWindowAndRefocus();
              }
            };
            findInput.addEventListener("keydown", handleEnter, true);
          }
        }
      }, 100);
    }

    /**
     * Handles vim-style * and # search commands.
     * Selects the word under cursor and searches for it in the document.
     * @param {boolean} [forward=true] - Search direction: true for forward (*), false for backward (#).
     */
    function handleStarSearch(forward = true) {
      GoogleDocs.saveActiveElement();
      selectInnerWord();

      setTimeout(() => {
        // Get selection from iframe
        const selection =
          iframe.contentWindow?.getSelection() || window.getSelection();
        const selectedText = selection ? selection.toString().trim() : "";
        sendKeyEvent("right"); // Deselect

        // Open find dialog, simulate search
        if (selectedText) {
          sendKeyEvent("f", { control: true });
          STATE.search.forward = forward;
          STATE.search.active = true;
          STATE.search.isCharSearch = false;

          setTimeout(() => {
            const activeEl = document.activeElement;
            if (activeEl && activeEl.tagName === "INPUT") {
              activeEl.value = selectedText;
              activeEl.dispatchEvent(new Event("input", { bubbles: true }));
              hideFindWindowAndRefocus();
            }
          }, 100);
        }
      }, 100);
    }

    /** Closes the Google Docs find bar and resets search state. */
    function closeFindWindow() {
      const find_window = GoogleDocs.getFindWindow();
      if (find_window && find_window.style.display === "none") {
        find_window.style.display = "block";
        // Find the input inside the find bar and dispatch Escape on it
        const find_input = find_window.querySelector("input");
        if (find_input) {
          find_input.focus();
          const escEvent = new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Escape",
            code: "Escape",
            keyCode: 27,
            which: 27,
          });
          find_input.dispatchEvent(escEvent);
        }
        STATE.search.active = false;
        STATE.search.forward = true;
        STATE.search.isCharSearch = false;
      }
    }

    /**
     * Handles indent command (vim `>>`).
     * Also handles list formatting: >* (bullet), >- (hyphen), >n (numbered), >[ or >] (checklist).
     * @param {string} key - The key pressed after `>`.
     */
    function handleIndent(key) {
      switch (key) {
        case ">":
          // Indent current line
          sendKeyEvent("bracketRight", { control: true });
          break;
        case "*":
        case "-":
        case "l":
          // Bullet list (Ctrl+Shift+8)
          sendKeyEvent("eight", { control: true, shift: true });
          break;
        case "n":
          // Numbered list (Ctrl+Shift+7)
          sendKeyEvent("seven", { control: true, shift: true });
          break;
        case "[":
        case "]":
        case "t":
          // Checklist (Ctrl+Shift+9)
          sendKeyEvent("nine", { control: true, shift: true });
          break;
      }
      Mode.toNormal();
    }

    /**
     * Handles outdent command (vim `<<`).
     * Also handles removing list formatting with same keys as indent (toggles off).
     * @param {string} key - The key pressed after `<`.
     */
    function handleOutdent(key) {
      switch (key) {
        case "<":
          // Outdent current line
          sendKeyEvent("bracketLeft", { control: true });
          break;
        case "*":
        case "-":
          // Toggle off bullet list (Ctrl+Shift+8)
          sendKeyEvent("eight", { control: true, shift: true });
          break;
        case "n":
          // Toggle off numbered list (Ctrl+Shift+7)
          sendKeyEvent("seven", { control: true, shift: true });
          break;
        case "[":
        case "]":
          // Toggle off checklist (Ctrl+Shift+9)
          sendKeyEvent("nine", { control: true, shift: true });
          break;
      }
      Mode.toNormal();
    }

    /**
     * Handles zoom commands (vim `z-`, `z=`, `zz`).
     * @param {string} key - The key pressed after `z`.
     */
    function handleZoom(key) {
      switch (key) {
        case "-":
          // Zoom out (Ctrl + -)
          sendKeyEvent("minus", { control: true });
          break;
        case "=":
          // Zoom in (Ctrl + =)
          sendKeyEvent("equal", { control: true });
          break;
        case "z":
          // Reset zoom to 100% (Ctrl + 0)
          sendKeyEvent("zero", { control: true });
          break;
      }
      Mode.toNormal();
    }

    /**
     * Handles go commands (vim `g` prefix).
     * @param {string} key - The key pressed after `g`.
     */
    function handleGo(key) {
      switch (key) {
        case "g":
          // Go to top of document (gg)
          goToTop();
          break;
        case "f":
          // Follow link at cursor (Alt + Enter)
          sendKeyEvent("enter", { alt: true });
          break;
        case "m":
        case "/":
          // Open menu search (Alt + /)
          sendKeyEvent("slash", { alt: true });
          break;
        case "h":
          // Show help
          Command.showHelp();
          break;
      }
      Mode.toNormal();
    }

    /**
     * Handles key events in normal mode.
     * @param {string} key - The key pressed.
     */
    function handleKeyEventNormal(key) {
      if (/[1-9]/.test(key)) {
        Mode.current = "multipleMotion";
        STATE.multipleMotion.mode = "normal";
        STATE.multipleMotion.times = Number(key);
        return;
      }

      // Cancel search if key isn't the cycling key for that search type
      if (STATE.search.active) {
        const isCharCycleKey =
          STATE.search.isCharSearch && (key === "f" || key === "F");
        const isSlashCycleKey =
          !STATE.search.isCharSearch && (key === "n" || key === "N");
        if (!isCharCycleKey && !isSlashCycleKey) {
          closeFindWindow();
        }
      }

      switch (key) {
        case "h":
          sendKeyEvent("left");
          break;
        case "j":
          sendKeyEvent("down");
          break;
        case "k":
          sendKeyEvent("up");
          break;
        case "l":
          sendKeyEvent("right");
          break;
        case "}":
          goToEndOfPara();
          break;
        case "{":
          goToStartOfPara();
          break;
        case "b":
        case "B":
          goToStartOfWord();
          break;
        case "e":
        case "E":
          goToEndOfWord();
          break;
        case "w":
        case "W":
          goToEndOfWord();
          goToEndOfWord();
          goToStartOfWord();
          break;
        case "g":
          Mode.current = "waitForGo";
          return;
        case "G":
          sendKeyEvent("end", { control: true });
          break;
        case "c":
        case "d":
        case "y":
          STATE.longStringOp = key;
          Mode.current = "waitForFirstInput";
          break;
        case "p":
          //FIX: sendKeyEvent("v", clipboardMods());
          break;
        case "a":
          handleAppend();
          break;
        case "i":
          Mode.toInsert();
          break;
        case "^":
        case "_":
        case "0":
          goToStartOfLine();
          break;
        case "$":
          goToEndOfLine();
          break;
        case "I":
          goToStartOfLine();
          Mode.toInsert();
          break;
        case "A":
          goToEndOfLine();
          Mode.toInsert();
          break;
        case "C":
          selectToEndOfLine();
          clickMenu(menuItems.cut);
          Mode.toInsert();
          break;
        case "v":
          Mode.toVisual();
          break;
        case "V":
          Mode.toVisualLine();
          break;
        case "o":
          addLineBottom();
          break;
        case "O":
          addLineTop();
          break;
        case "u":
          clickMenu(menuItems.undo);
          break;

        case "r":
          Mode.replace_char = true;
          Mode.toInsert();
          break;

        case "f":
          if (STATE.search.active && STATE.search.isCharSearch) {
            sendKeyEvent("g", { control: true, shift: !STATE.search.forward });
          } else {
            STATE.search.forward = true;
            Mode.current = "waitForFindChar";
          }
          return;
        case "F":
          if (STATE.search.active && STATE.search.isCharSearch) {
            sendKeyEvent("g", { control: true, shift: STATE.search.forward });
          } else {
            STATE.search.forward = false;
            Mode.current = "waitForFindChar";
          }
          return;
        case "/":
          handleSlashSearch(true);
          return;
        case "?":
          handleSlashSearch(false);
          return;
        case "*":
          handleStarSearch(true);
          return;
        case "#":
          handleStarSearch(false);
          return;
        case "n":
          if (STATE.search.active && !STATE.search.isCharSearch) {
            sendKeyEvent("g", { control: true, shift: !STATE.search.forward });
          } else if (!STATE.search.active && STATE.search.lastSearch) {
            handleSlashSearch(true, STATE.search.lastSearch);
          }
          return;
        case "N":
          if (STATE.search.active && !STATE.search.isCharSearch) {
            sendKeyEvent("g", { control: true, shift: STATE.search.forward });
          } else if (!STATE.search.active && STATE.search.lastSearch) {
            handleSlashSearch(false, STATE.search.lastSearch);
          }
          return;
        case "x":
          sendKeyEvent("delete");
          break;
        case ".":
          // Repeat last action (redo)
          sendKeyEvent("y", { control: true });
          break;
        case ">":
          Mode.current = "waitForIndent";
          return;
        case "<":
          Mode.current = "waitForOutdent";
          return;
        case "z":
          Mode.current = "waitForZoom";
          return;
        case ":":
          Command.open();
          return;
        case "Enter":
          if (STATE.search.active) closeFindWindow();
          return;
        case "Backspace":
          sendKeyEvent("left");
          break;
        default:
          return;
      }
      if (Mode.temp_normal) {
        Mode.temp_normal = false;
        if (
          Mode.current != "visual" &&
          Mode.current != "v-line" &&
          Mode.current != "waitForFirstInput" &&
          Mode.current != "waitForTextObject"
        ) {
          Mode.toInsert();
        }
      }
    }

    /**
     * Handles key events in visual and visual-line modes.
     * @param {string} key - The key pressed.
     */
    function handleKeyEventVisualLine(key) {
      if (/[1-9]/.test(key)) {
        Mode.current = "multipleMotion";
        STATE.multipleMotion.mode = "v-line";
        STATE.multipleMotion.times = Number(key);
        return;
      }
      switch (key) {
        case "":
          break;
        case "h":
          sendKeyEvent("left", { shift: true });
          break;
        case "j":
          sendKeyEvent("down", { shift: true });
          break;
        case "k":
          sendKeyEvent("up", { shift: true });
          break;
        case "l":
          sendKeyEvent("right", { shift: true });
          break;
        case "p":
          //FIX: sendKeyEvent("v", clipboardMods());
          Mode.toNormal(true);
          break;
        case "}":
          goToEndOfPara(true);
          break;
        case "{":
          goToStartOfPara(true);
          break;
        case "b":
          selectToStartOfWord();
          break;
        case "e":
        case "w":
          selectToEndOfWord();
          break;
        case "^":
        case "_":
        case "0":
          selectToStartOfLine();
          break;
        case "$":
          selectToEndOfLine();
          break;
        case "G":
          sendKeyEvent("end", { control: true, shift: true });
          break;
        case "g":
          sendKeyEvent("home", { control: true, shift: true });
          break;
        case "c":
        case "d":
        case "y":
          runLongStringOp(key);
          break;
        case "i":
        case "a":
          Mode.current = "waitForVisualInput";
          break;
        case "x":
          clickMenu(menuItems.cut);
          Mode.toNormal(true);
          break;
        case ">":
          // Indent selection
          sendKeyEvent("bracketRight", { control: true });
          Mode.toNormal(true);
          break;
        case "<":
          // Outdent selection
          sendKeyEvent("bracketLeft", { control: true });
          Mode.toNormal(true);
          break;
      }
    }

    let menuItemElements = {};
    let menuItems = {
      copy: { parent: "Edit", caption: "Copy" },
      cut: { parent: "Edit", caption: "Cut" },
      paste: { parent: "Edit", caption: "Paste" },
      redo: { parent: "Edit", caption: "Redo" },
      undo: { parent: "Edit", caption: "Undo" },
      find: { parent: "Edit", caption: "Find" },
    };

    /**
     * Clicks a Google Docs menu item by its definition.
     * @param {Object} itemCaption - Menu item definition with parent and caption.
     */
    function clickMenu(itemCaption) {
      const item = getMenuItem(itemCaption);
      if (item) simulateClick(item);
    }

    /**
     * Gets a cached menu item element or finds and caches it.
     * @param {Object} menuItem - Menu item definition with parent and caption.
     * @param {boolean} [silenceWarning=false] - Suppress console warning if not found.
     * @returns {Element|null} The menu item element or null if not found.
     */
    function getMenuItem(menuItem, silenceWarning = false) {
      const caption = menuItem.caption;
      let el = menuItemElements[caption];
      if (el) return el;
      el = findMenuItem(menuItem);
      if (!el) {
        if (!silenceWarning)
          console.error("VimDocs: Could not find menu item", menuItem.caption);
        return null;
      }
      return (menuItemElements[caption] = el);
    }

    /**
     * Finds a menu item element by activating its parent menu and searching.
     * @param {Object} menuItem - Menu item definition with parent and caption.
     * @returns {Element|null} The menu item element or null if not found.
     */
    function findMenuItem(menuItem) {
      activateTopLevelMenu(menuItem.parent);
      const menuItemEls = document.querySelectorAll(".goog-menuitem");
      const caption = menuItem.caption;
      const isRegexp = caption instanceof RegExp;
      for (const el of Array.from(menuItemEls)) {
        const label = el.innerText;
        if (!label) continue;
        if (isRegexp) {
          if (caption.test(label)) return el;
        } else {
          if (label.startsWith(caption)) return el;
        }
      }
      return null;
    }

    /**
     * Simulates a full mouse click sequence on an element.
     * @param {Element} el - The element to click.
     * @param {number} [x=0] - X coordinate for the click.
     * @param {number} [y=0] - Y coordinate for the click.
     */
    function simulateClick(el, x = 0, y = 0) {
      const eventSequence = ["mouseover", "mousedown", "mouseup", "click"];
      for (const eventName of eventSequence) {
        const event = new MouseEvent(eventName, {
          bubbles: true,
          cancelable: true,
          view: window,
          detail: 1,
          screenX: x,
          screenY: y,
          clientX: x,
          clientY: y,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          metaKey: false,
          button: 0,
          relatedTarget: null,
        });
        el.dispatchEvent(event);
      }
    }

    /**
     * Activates a top-level menu in Google Docs (File, Edit, etc.).
     * @param {string} menuCaption - The menu name to activate.
     */
    function activateTopLevelMenu(menuCaption) {
      const buttons = Array.from(document.querySelectorAll(".menu-button"));
      const button = buttons.find((el) => el.innerText.trim() === menuCaption);
      if (!button) {
        console.error(`VimDocs: Couldn't find top-level button ${menuCaption}`);
        return;
      }
      simulateClick(button);
      simulateClick(button);
    }

    Mode.toNormal();
  }

  /** Waits for Google Docs editor to be ready, then initializes VimDocs. */
  function waitForDocs() {
    const editor = document.querySelector(".docs-texteventtarget-iframe");
    if (editor) initVimDocs();
    else setTimeout(waitForDocs, 500);
  }

  waitForDocs();
})();
