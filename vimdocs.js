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
// TODO: Add keymap list to the help menu.
// TODO: Add wait after `1-9`, `operator`, to complete the motion.
// TODO: Add paragraph commands like `d i p`

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
      visual: { bg: "#FFA653", fg: "#101825" },
      "v-line": { bg: "#FFA653", fg: "#101825" },
      command: { bg: "#C08DFF", fg: "#101825" },
      wait: { bg: "#68BFB5", fg: "#101825" },
      replace: { bg: "indianred", fg: "white" },
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

    /*
     * ======================================================================================
     * KEYS
     * Key codes, simulated key dispatch, and platform-aware modifier helpers.
     * ======================================================================================
     */
    const Keys = (() => {
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
        h: 72,
        n: 78,
        p: 80,
        bracketLeft: 219,
        bracketRight: 221,
      };

      const wordModifierKey = isMac ? "alt" : "control";
      const paragraphModifierKey = isMac ? "alt" : "control";
      const clipboardModifierKey = isMac ? "meta" : "control";

      return {
        keyCodes,

        /** Returns modifier keys for word-based navigation. */
        wordMods(shift = false) {
          return { shift, [wordModifierKey]: true };
        },

        /** Returns modifier keys for paragraph-based navigation. */
        paragraphMods(shift = false) {
          return { shift, [paragraphModifierKey]: true };
        },

        /** Returns modifier keys for clipboard operations (copy/paste). */
        clipboardMods() {
          return { [clipboardModifierKey]: true };
        },

        /** Dispatches a simulated key event to the Google Docs editor. */
        send(key, mods = {}) {
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
        },
      };
    })();

    /*
     * ======================================================================================
     * STATUS LINE
     * Container for the status bar UI at the bottom of the screen.
     * Other components (Mode, Command) append their elements to this container.
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

    /**
     * ======================================================================================
     * MODE
     * Manages the current vim mode (normal, insert, visual, v-line) and intermediate
     * states (waitForFindChar, waitForFirstInput, etc.). Handles mode transitions,
     * the status-line mode indicator, and cursor style updates.
     * ======================================================================================
     */
    const Mode = {
      current: "normal",
      temp_normal: false,
      replace_char: false,
      indicator: null,
      visual_direction: "right",

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

        let color_key;
        switch (this.current) {
          case "normal":
          case "insert":
          case "visual":
          case "v-line":
          case "command":
          case "replace":
            color_key = this.current;
            this.indicator.textContent = this.current.toUpperCase();
            break;
          case "waitForFirstInput":
          case "waitForSecondInput":
          case "waitForVisualInput":
          case "waitForTextObject":
          case "multipleMotion":
          case "waitForFindChar":
          case "waitForIndent":
          case "waitForOutdent":
          case "waitForZoom":
          case "waitForGo":
            color_key = "wait";
            this.indicator.textContent = "VIM ACTION";
            break;
          default:
            color_key = "normal";
        }

        this.indicator.style.setProperty(
          "background-color",
          COLORSCHEME.mode[color_key].bg,
          "important",
        );
        this.indicator.style.setProperty(
          "color",
          COLORSCHEME.mode[color_key].fg,
          "important",
        );
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
        this.visual_direction = "right";
        Keys.send("right", { shift: true });
      },

      /**
       * Switches to visual line selection mode.
       */
      toVisualLine() {
        this.set("v-line");
        this.visual_direction = "right";
        Move.toStartOfLine();
        Select.toEndOfLine();
      },

      /**
       * Switches to normal mode.
       * @param {boolean} [skip_deselect=false] - Skip deselection (used after cut/copy).
       */
      toNormal(skip_deselect = false) {
        if (!skip_deselect && this.isVisual()) {
          Keys.send("right");
          Keys.send("left");
        }

        this.visual_direction = "right";
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

      /**
       * Switches to replace mode.
       */
      toReplace() {
        this.set("replace");
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

    /*
     * ======================================================================================
     * FIND
     * Manages all search-related state and operations: character search (f/F/t/T),
     * slash search (/ and ?), star search (* and #), and the Google Docs find bar.
     * ======================================================================================
     */
    const Find = {
      is_active: false,
      is_forward: true, // true for f and /, false for F
      is_char_search: false, // true for f/F/t/T, false for /
      is_till: false, // true for t/T
      last_search: null,

      /** Hides the Google Docs find bar and refocuses the editor. */
      hideFindBar() {
        const findWindow = GoogleDocs.getFindWindow();
        if (findWindow) findWindow.style.display = "none";

        GoogleDocs.restoreFocus(() => Mode.toNormal());
      },

      /**
       * Closes the find window, reversing search direction first if needed.
       * @param {boolean} forward - If false, reverses direction before closing.
       */
      finishSearch(forward) {
        if (!forward) {
          setTimeout(() => {
            Keys.send("g", { control: true, shift: true });
            Find.hideFindBar();
          }, 50);
        } else {
          Find.hideFindBar();
        }
      },

      /**
       * Handles vim `f` and `F` single-character search.
       * @param {string} key - The character to search for.
       */
      handleFindChar(key) {
        GoogleDocs.saveActiveElement();
        Keys.send("f", { control: true });

        setTimeout(() => {
          const activeEl = document.activeElement;
          if (activeEl && activeEl.tagName === "INPUT") {
            activeEl.value = key;
            activeEl.dispatchEvent(new Event("input", { bubbles: true }));
            Find.finishSearch(Find.is_forward);
          }
        }, 50);

        Find.is_active = true;
        Find.is_char_search = true;
        Mode.set("normal");
      },

      /**
       * Handles `/` and `?` search commands.
       * Opens Google Docs find dialog and either waits for user input or pre-fills
       * with provided text for repeat searches (n/N).
       * @param {boolean} [forward=true] - Search direction: true for forward (/), false for backward (?).
       * @param {string|null} [text=null] - Pre-fill search text for repeat searches. If null, waits for user input.
       */
      handleSlashSearch(forward = true, text = null) {
        GoogleDocs.saveActiveElement();
        Keys.send("f", { control: true });
        Find.is_forward = forward;
        Find.is_active = true;
        Find.is_char_search = false;

        setTimeout(() => {
          const findInput = document.activeElement;
          if (findInput && findInput.tagName === "INPUT") {
            if (text) {
              // Pre-fill text and immediately hide
              findInput.value = text;
              findInput.dispatchEvent(new Event("input", { bubbles: true }));
              Find.last_search = text;
              Find.finishSearch(forward);
            } else {
              // Wait for user to type and press Enter
              const handleEnter = (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  e.stopImmediatePropagation();
                  findInput.removeEventListener("keydown", handleEnter, true);
                  Find.last_search = findInput.value;
                  Find.finishSearch(forward);
                }
              };
              findInput.addEventListener("keydown", handleEnter, true);
            }
          }
        }, 50);
      },

      /**
       * Handles vim-style * and # search commands.
       * Selects the word under cursor and searches for it in the document.
       * @param {boolean} [forward=true] - Search direction: true for forward (*), false for backward (#).
       */
      handleStarSearch(forward = true) {
        GoogleDocs.saveActiveElement();
        Select.innerWord();

        setTimeout(() => {
          // Get selection from iframe
          const selection =
            iframe.contentWindow?.getSelection() || window.getSelection();
          const selectedText = selection ? selection.toString().trim() : "";
          Keys.send("right"); // Deselect

          // Open find dialog, simulate search
          if (selectedText) {
            Keys.send("f", { control: true });
            Find.is_forward = forward;
            Find.is_active = true;
            Find.is_char_search = false;

            setTimeout(() => {
              const activeEl = document.activeElement;
              if (activeEl && activeEl.tagName === "INPUT") {
                activeEl.value = selectedText;
                activeEl.dispatchEvent(new Event("input", { bubbles: true }));
                Find.hideFindBar();
              }
            }, 100);
          }
        }, 100);
      },

      /**
       * Cancels an active search, closing the find window and restoring
       * cursor position for character searches (f/F/t/T).
       */
      cancelSearch() {
        const wasTill = Find.is_till;
        const wasForward = Find.is_forward;
        Find.closeFindWindow();
        if (wasTill && !wasForward) {
          Keys.send("right");
          Keys.send("right");
        } else {
          Keys.send("left");
          if (wasTill) Keys.send("left");
        }
      },

      /** Closes the Google Docs find bar and resets search state.
       */
      closeFindWindow() {
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
        }
        Find.is_active = false;
        Find.is_forward = true;
        Find.is_char_search = false;
        Find.is_till = false;
      },
    };

    /*
     * ======================================================================================
     * SELECT
     * Selection operations: extends the current selection by line, word, or paragraph.
     * ======================================================================================
     */
    const Select = {
      /** Selects from cursor to start of line. */
      toStartOfLine() {
        Keys.send("home", { shift: true });
      },
      /** Selects from cursor to end of line. */
      toEndOfLine() {
        Keys.send("end", { shift: true });
      },
      /** Selects from cursor to start of previous word (vim `b` in visual). */
      toStartOfWord() {
        Keys.send("left", Keys.wordMods(true));
      },
      /** Selects from cursor to end of current word (vim `e`/`w` in visual). */
      toEndOfWord() {
        Keys.send("right", Keys.wordMods(true));
      },
      /** Selects from cursor to end of paragraph. */
      toEndOfPara() {
        Keys.send("down", Keys.paragraphMods(true));
      },
      /** Selects the word under cursor (vim `iw` text object). */
      innerWord() {
        Keys.send("left");
        Keys.send("left", Keys.wordMods());
        Keys.send("right", Keys.wordMods(true));
      },
    };

    /*
     * ======================================================================================
     * MOVE
     * Cursor movement and selection operations: line, word, paragraph, and document motions.
     * ======================================================================================
     */
    const Move = {
      /** Moves cursor to start of current line (vim `0`, `^`, `_`). */
      toStartOfLine() {
        Keys.send("home");
      },
      /** Moves cursor to end of current line (vim `$`). */
      toEndOfLine() {
        Keys.send("end");
      },

      /** Moves cursor to end of current word (vim `e`). */
      toEndOfWord() {
        Keys.send("right", Keys.wordMods());
      },
      /** Moves cursor to start of previous word (vim `b`). */
      toStartOfWord() {
        Keys.send("left", Keys.wordMods());
      },

      /** Moves cursor to top of document (vim `gg`). */
      toTop() {
        Keys.send("home", { control: true });
        Operate.pending = "";
      },
      /**
       * Moves cursor to end of paragraph.
       * @param {boolean} [shift=false] - Whether to select while moving.
       */
      toEndOfPara(shift = false) {
        Keys.send("down", Keys.paragraphMods(shift));
        Keys.send("right", { shift });
      },
      /**
       * Moves cursor to start of paragraph.
       * @param {boolean} [shift=false] - Whether to select while moving.
       */
      toStartOfPara(shift = false) {
        Keys.send("up", Keys.paragraphMods(shift));
      },
    };

    /*
     * ======================================================================================
     * EDIT
     * Handles editing operations: line insertion (o/O), append (a), indent/outdent (>>/<</),
     * and list formatting toggles.
     * ======================================================================================
     */
    const Edit = {
      /** Opens a new line above cursor and enters insert mode (vim `O`). */
      addLineTop() {
        Move.toStartOfLine();
        Keys.send("enter");
        Keys.send("up");
        Mode.toInsert();
      },
      /** Opens a new line below cursor and enters insert mode (vim `o`). */
      addLineBottom() {
        Move.toEndOfLine();
        Keys.send("enter");
        Mode.toInsert();
      },
      /** Moves cursor right and enters insert mode, handling line wrap (vim `a`). */
      append() {
        const cursor = GoogleDocs.getCursor();
        if (!cursor) {
          Keys.send("right");
          Mode.toInsert();
          return;
        }
        const originalTop = cursor.getBoundingClientRect().top;
        Keys.send("right");
        // Use requestAnimationFrame to wait for cursor position update
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const newTop = cursor.getBoundingClientRect().top;
            if (newTop > originalTop + 10) Keys.send("left");
            Mode.toInsert();
          });
        });
      },
      /**
       * Handles indent command (vim `>>`).
       * Also handles list formatting: >* (bullet), >- (hyphen), >n (numbered), >[ or >] (checklist).
       * @param {string} key - The key pressed after `>`.
       */
      indent(key) {
        switch (key) {
          case ">":
            // Indent current line
            Keys.send("bracketRight", { control: true });
            break;
          case "*":
          case "-":
          case "l":
            // Bullet list (Ctrl+Shift+8)
            Keys.send("eight", { control: true, shift: true });
            break;
          case "n":
            // Numbered list (Ctrl+Shift+7)
            Keys.send("seven", { control: true, shift: true });
            break;
          case "[":
          case "]":
          case "t":
            // Checklist (Ctrl+Shift+9)
            Keys.send("nine", { control: true, shift: true });
            break;
        }
        Mode.toNormal();
      },
      /**
       * Handles outdent command (vim `<<`).
       * Also handles removing list formatting with same keys as indent (toggles off).
       * @param {string} key - The key pressed after `<`.
       */
      outdent(key) {
        switch (key) {
          case "<":
            // Outdent current line
            Keys.send("bracketLeft", { control: true });
            break;
          case "*":
          case "-":
            // Toggle off bullet list (Ctrl+Shift+8)
            Keys.send("eight", { control: true, shift: true });
            break;
          case "n":
            // Toggle off numbered list (Ctrl+Shift+7)
            Keys.send("seven", { control: true, shift: true });
            break;
          case "[":
          case "]":
            // Toggle off checklist (Ctrl+Shift+9)
            Keys.send("nine", { control: true, shift: true });
            break;
        }
        Mode.toNormal();
      },
    };

    /*
     * ======================================================================================
     * OPERATE
     * Operator-pending mode logic: handles compound commands like `dw`, `ciw`, `yap`.
     * Manages the pending operator state and dispatches to motion/text-object handlers.
     * ======================================================================================
     */
    const Operate = {
      /** The pending operator key (c, d, y, etc.). */
      pending: "",

      /**
       * Executes the pending operator on the current selection.
       * @param {string} [operation=Operate.pending] - The operator to execute.
       */
      run(operation = Operate.pending) {
        switch (operation) {
          case "c":
            Menu.click(Menu.items.cut);
            Mode.toInsert();
            break;
          case "d":
            Menu.click(Menu.items.cut);
            Mode.toNormal(true);
            break;
          case "y":
            Menu.click(Menu.items.copy);
            Keys.send("left");
            Mode.toNormal(true);
            break;
          case "p":
            // Keys.send("v", Keys.clipboardMods());
            Mode.toNormal(true);
            break;
          case "v":
            break;
          case "g":
            Move.toTop();
            break;
        }
      },

      /**
       * Handles the first motion/text-object input after an operator (c, d, y).
       * @param {string} key - The motion or text-object key.
       */
      waitForFirstInput(key) {
        switch (key) {
          case "i":
            Mode.set("waitForTextObject");
            break;
          case "a":
            Mode.set("waitForTextObject");
            break;
          case "w":
            Select.toEndOfWord();
            Operate.run();
            break;
          case "p":
            Select.toEndOfPara();
            Operate.run();
            break;
          case "^":
          case "_":
          case "0":
            Select.toStartOfLine();
            Operate.run();
            break;
          case "$":
            Select.toEndOfLine();
            Operate.run();
            break;
          case Operate.pending:
            Move.toStartOfLine();
            Select.toEndOfLine();
            Operate.run();
            break;
          default:
            Mode.toNormal();
        }
      },

      /**
       * Handles the second input for compound motions (e.g., `daw` needs `a` then `w`).
       * @param {string} key - The key pressed.
       */
      waitForSecondInput(key) {
        switch (key) {
          case "w":
            Move.toStartOfWord();
            Operate.waitForFirstInput(key);
            break;
          case "p":
            Move.toStartOfPara();
            Operate.waitForFirstInput(key);
            break;
          default:
            Mode.toNormal();
            break;
        }
      },

      /**
       * Handles text object selection after `i` or `a` (e.g., `ciw`, `daw`).
       * @param {string} key - The text object key (w for word, etc.).
       */
      waitForTextObject(key) {
        switch (key) {
          case "w":
            Select.innerWord();
            Operate.run();
            break;
          default:
            Mode.toNormal();
            break;
        }
      },

      /**
       * Handles text object selection in visual mode (e.g., `viw`, `vap`).
       * @param {string} key - The text object key.
       */
      waitForVisualInput(key) {
        switch (key) {
          case "w":
            Keys.send("left", { control: true });
            Move.toStartOfWord();
            Select.toEndOfWord();
            break;
          case "p":
            Move.toStartOfPara();
            Move.toEndOfPara(true);
            break;
        }
        Mode.set("v-line");
      },
    };

    /*
     * ======================================================================================
     * VIM
     * Core vim event loop: main keydown handler, per-mode dispatch, count-repeat,
     * and compound command handlers (g-prefix, z-prefix).
     * ======================================================================================
     */
    const Vim = {
      /** State for count-prefixed motions (e.g., `5j`). */
      _repeat: {
        times: 0,
        mode: "normal",
      },

      /** Mode-to-handler dispatch table. */
      _dispatch: {
        normal: (key) => Vim.handleNormal(key),
        command: (key) => Vim.handleNormal(key),
        visual: (key) => Vim.handleVisualLine(key),
        "v-line": (key) => Vim.handleVisualLine(key),
        waitForFirstInput: (key) => Operate.waitForFirstInput(key),
        waitForSecondInput: (key) => Operate.waitForSecondInput(key),
        waitForVisualInput: (key) => Operate.waitForVisualInput(key),
        waitForTextObject: (key) => Operate.waitForTextObject(key),
        multipleMotion: (key) => Vim.handleMultipleMotion(key),
        waitForFindChar: (key) => Find.handleFindChar(key),
        waitForIndent: (key) => Edit.indent(key),
        waitForOutdent: (key) => Edit.outdent(key),
        waitForZoom: (key) => Vim.handleZoom(key),
        waitForGo: (key) => Vim.handleGo(key),
      },

      /**
       * Repeats a handler function multiple times.
       * @param {Function} handler - The handler function to repeat.
       * @param {number} times - Number of times to repeat.
       * @param {string} key - The key to pass to the handler.
       */
      repeatMotion(handler, times, key) {
        for (let i = 0; i < times; i++) handler(key);
      },

      /**
       * Handles count prefix for motions (e.g., `5j` moves down 5 lines).
       * @param {string} key - The next key after the count digits.
       */
      handleMultipleMotion(key) {
        if (/[0-9]/.test(key)) {
          Vim._repeat.times = Number(String(Vim._repeat.times) + key);
          return;
        }
        switch (Vim._repeat.mode) {
          case "normal":
            Vim.repeatMotion(Vim.handleNormal, Vim._repeat.times, key);
            break;
          case "v-line":
          case "visual":
            Vim.repeatMotion(Vim.handleVisualLine, Vim._repeat.times, key);
            break;
        }
        Mode.set(Vim._repeat.mode);
      },

      /**
       * Handles Ctrl-modified shortcuts.
       * @param {KeyboardEvent} e - The keyboard event.
       * @returns {boolean} True if the event was consumed.
       */
      handleCtrl(e) {
        if (!e.ctrlKey) return false;

        // Ctrl+Space: Toggle checkbox (any mode)
        if (e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          Keys.send("enter", { control: true, alt: true });
          return true;
        }

        // Ctrl+O in insert: temporary normal mode
        if (Mode.current === "insert" && e.key === "o") {
          e.preventDefault();
          e.stopImmediatePropagation();
          Mode.toNormal();
          Mode.temp_normal = true;
          return true;
        }

        // Ctrl+U/D/R in normal mode
        if (Mode.current === "normal") {
          const ctrlNormal = { u: "pageup", d: "pagedown" };
          if (ctrlNormal[e.key]) {
            e.preventDefault();
            Keys.send(ctrlNormal[e.key]);
            return true;
          }
          if (e.key === "r") {
            e.preventDefault();
            Menu.click(Menu.items.redo);
            return true;
          }
        }

        return false;
      },

      /**
       * Handles replace-char mode (vim `r`).
       * @param {KeyboardEvent} e - The keyboard event.
       * @returns {boolean} True if the event was consumed.
       */
      handleReplaceChar(e) {
        if (Mode.current === "replace") {
          if (e.key === "Escape") {
            e.preventDefault();
            Mode.toNormal();
            return true;
          }
          if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
            Keys.send("delete");
            return true;
          }
          return false;
        }
        if (Mode.current !== "insert" || !Mode.replace_char) return false;

        if (e.key === "Escape") {
          e.preventDefault();
          Mode.toNormal();
          return true;
        }
        if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
          Keys.send("delete");
          requestAnimationFrame(() => {
            Keys.send("left");
            Mode.toNormal();
          });
          return true;
        }
        return false;
      },

      /**
       * Handles Escape key: cancels active search, exits visual mode, returns to normal.
       */
      handleEscape() {
        if (Find.is_active) Find.cancelSearch();
        if (Mode.isVisual()) {
          const direction = Mode.visual_direction === "left" ? "left" : "right";
          Keys.send(direction);
          Mode.toNormal(true);
          return;
        }
        Mode.toNormal();
      },

      /**
       * Main keyboard event handler. Routes keys to appropriate mode handlers.
       * @param {KeyboardEvent} e - The keyboard event from the editor iframe.
       */
      onKeyDown(e) {
        if (["Shift", "Meta", "Control", "Alt", ""].includes(e.key)) return;
        if (Vim.handleCtrl(e)) return;
        if (Vim.handleReplaceChar(e)) return;
        if (e.altKey || e.ctrlKey || e.metaKey) return;

        if (e.key === "Escape") {
          e.preventDefault();
          Vim.handleEscape();
          return;
        }

        const handler = Vim._dispatch[Mode.current];
        if (handler) {
          e.preventDefault();
          e.stopPropagation();
          handler(e.key);
        }
      },

      /**
       * Handles zoom commands (vim `z-`, `z=`, `zz`).
       * @param {string} key - The key pressed after `z`.
       */
      handleZoom(key) {
        switch (key) {
          case "-":
            // Zoom out (Ctrl + -)
            Keys.send("minus", { control: true });
            break;
          case "=":
            // Zoom in (Ctrl + =)
            Keys.send("equal", { control: true });
            break;
          case "z":
            // Reset zoom to 100% (Ctrl + 0)
            Keys.send("zero", { control: true });
            break;
        }
        Mode.toNormal();
      },

      /**
       * Handles go commands (vim `g` prefix).
       * @param {string} key - The key pressed after `g`.
       */
      handleGo(key) {
        switch (key) {
          case "g":
            // Go to top of document (gg)
            Move.toTop();
            break;
          case "f":
            // Follow link at cursor (Alt + Enter)
            Keys.send("enter", { alt: true });
            break;
          case "m":
          case "/":
            // Open menu search (Alt + /)
            Keys.send("slash", { alt: true });
            break;
          case "h":
            // Go to next heading (Ctrl+Alt+N, then Ctrl+Alt+H)
            Keys.send("n", { control: true, alt: true });
            setTimeout(() => Keys.send("h", { control: true, alt: true }), 10);
            break;
          case "H":
            // Go to previous heading (Ctrl+Alt+P, then Ctrl+Alt+H)
            Keys.send("p", { control: true, alt: true });
            setTimeout(() => Keys.send("h", { control: true, alt: true }), 10);
            break;
          case "?":
            // Show help
            Command.showHelp();
            break;
          case "T":
            // Go to previous tab (Ctrl+Shift+PgUp)
            Keys.send("pageup", { control: true, shift: true });
            break;
          case "t":
            // Go to next tab (Ctrl+Shift+PgDown)
            Keys.send("pagedown", { control: true, shift: true });
            break;
        }
        Mode.toNormal();
      },

      /**
       * Handles key events in normal mode.
       * @param {string} key - The key pressed.
       */
      handleNormal(key) {
        if (/[1-9]/.test(key)) {
          Mode.set("multipleMotion");
          Vim._repeat.mode = "normal";
          Vim._repeat.times = Number(key);
          return;
        }

        // Cancel search if key isn't the cycling key for that search type
        if (Find.is_active) {
          const isCharCycleKey =
            Find.is_char_search &&
            (key === "f" ||
              key === "F" ||
              key === "t" ||
              key === "T" ||
              key === ";" ||
              key === ",");
          const isSlashCycleKey =
            !Find.is_char_search && (key === "n" || key === "N");
          if (!isCharCycleKey && !isSlashCycleKey) {
            Find.cancelSearch();
          }
        }

        switch (key) {
          case "h":
            Keys.send("left");
            break;
          case "j":
            Keys.send("down");
            break;
          case "k":
            Keys.send("up");
            break;
          case "l":
            Keys.send("right");
            break;
          case "}":
            Move.toEndOfPara();
            break;
          case "{":
            Move.toStartOfPara();
            break;
          case "b":
          case "B":
            Move.toStartOfWord();
            break;
          case "e":
          case "E":
            Move.toEndOfWord();
            break;
          case "w":
          case "W":
            Move.toEndOfWord();
            Move.toEndOfWord();
            Move.toStartOfWord();
            break;
          case "g":
            Mode.set("waitForGo");
            return;
          case "G":
            Keys.send("end", { control: true });
            break;
          case "c":
          case "d":
          case "y":
            Operate.pending = key;
            Mode.set("waitForFirstInput");
            break;
          case "p":
            //FIX: Keys.send("v", Keys.clipboardMods());
            break;
          case "a":
            Edit.append();
            break;
          case "A":
            Move.toEndOfLine();
            Mode.toInsert();
            break;
          case "i":
            Mode.toInsert();
            break;
          case "I":
            Move.toStartOfLine();
            Mode.toInsert();
            break;
          case "^":
          case "_":
          case "0":
            Move.toStartOfLine();
            break;
          case "$":
            Move.toEndOfLine();
            break;
          case "C":
            Select.toEndOfLine();
            Menu.click(Menu.items.cut);
            Mode.toInsert();
            break;
          case "D":
            Select.toEndOfLine();
            Menu.click(Menu.items.cut);
            break;
          case "v":
            Mode.toVisual();
            break;
          case "V":
            Mode.toVisualLine();
            break;
          case "o":
            Edit.addLineBottom();
            break;
          case "O":
            Edit.addLineTop();
            break;
          case "u":
            Menu.click(Menu.items.undo);
            break;
          case "r":
            Mode.replace_char = true;
            Mode.toInsert();
            break;
          case "R":
            Mode.toReplace();
            break;
          case "f":
            if (Find.is_active && Find.is_char_search) {
              Keys.send("g", { control: true, shift: !Find.is_forward });
            } else {
              Find.is_forward = true;
              Find.is_till = false;
              Mode.set("waitForFindChar");
            }
            return;
          case "F":
            if (Find.is_active && Find.is_char_search) {
              Keys.send("g", { control: true, shift: Find.is_forward });
            } else {
              Find.is_forward = false;
              Find.is_till = false;
              Mode.set("waitForFindChar");
            }
            return;
          case "t":
            if (Find.is_active && Find.is_char_search) {
              Keys.send("g", { control: true, shift: !Find.is_forward });
            } else {
              Find.is_forward = true;
              Find.is_till = true;
              Mode.set("waitForFindChar");
            }
            return;
          case "T":
            if (Find.is_active && Find.is_char_search) {
              Keys.send("g", { control: true, shift: !Find.is_forward });
            } else {
              Find.is_forward = false;
              Find.is_till = true;
              Mode.set("waitForFindChar");
            }
            return;
          case ";":
            if (Find.is_active && Find.is_char_search) {
              Keys.send("g", { control: true, shift: !Find.is_forward });
            }
            return;
          case ",":
            if (Find.is_active && Find.is_char_search) {
              Keys.send("g", { control: true, shift: Find.is_forward });
            }
            return;
          case "/":
            Find.handleSlashSearch(true);
            return;
          case "?":
            Find.handleSlashSearch(false);
            return;
          case "*":
            Find.handleStarSearch(true);
            return;
          case "#":
            Find.handleStarSearch(false);
            return;
          case "n":
            if (Find.is_active && !Find.is_char_search) {
              Keys.send("g", { control: true, shift: !Find.is_forward });
            } else if (!Find.is_active && Find.last_search) {
              Find.handleSlashSearch(true, Find.last_search);
            }
            return;
          case "N":
            if (Find.is_active && !Find.is_char_search) {
              Keys.send("g", { control: true, shift: Find.is_forward });
            } else if (!Find.is_active && Find.last_search) {
              Find.handleSlashSearch(false, Find.last_search);
            }
            return;
          case "x":
            Keys.send("delete");
            break;
          case ".":
            // Repeat last action (redo)
            Keys.send("y", { control: true });
            break;
          case ">":
            Mode.set("waitForIndent");
            return;
          case "<":
            Mode.set("waitForOutdent");
            return;
          case "z":
            Mode.set("waitForZoom");
            return;
          case ":":
            Mode.set("command");
            Command.open();
            return;
          case "Enter":
            if (Find.is_active) Find.closeFindWindow();
            return;
          case "Backspace":
            Keys.send("left");
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
      },

      /**
       * Handles key events in visual and visual-line modes.
       * @param {string} key - The key pressed.
       */
      handleVisualLine(key) {
        if (/[1-9]/.test(key)) {
          Mode.set("multipleMotion");
          Vim._repeat.mode = "v-line";
          Vim._repeat.times = Number(key);
          return;
        }
        switch (key) {
          case "":
            break;
          case "h":
            Mode.visual_direction = "left";
            Keys.send("left", { shift: true });
            break;
          case "j":
            Keys.send("down", { shift: true });
            break;
          case "k":
            Keys.send("up", { shift: true });
            break;
          case "l":
            Mode.visual_direction = "right";
            Keys.send("right", { shift: true });
            break;
          case "p":
            //FIX: Keys.send("v", Keys.clipboardMods());
            Mode.toNormal(true);
            break;
          case "}":
            Move.toEndOfPara(true);
            break;
          case "{":
            Move.toStartOfPara(true);
            break;
          case "b":
            Select.toStartOfWord();
            break;
          case "e":
          case "w":
            Select.toEndOfWord();
            break;
          case "^":
          case "_":
          case "0":
            Select.toStartOfLine();
            break;
          case "$":
            Select.toEndOfLine();
            break;
          case "G":
            Keys.send("end", { control: true, shift: true });
            break;
          case "g":
            Keys.send("home", { control: true, shift: true });
            break;
          case "c":
          case "d":
          case "y":
            Operate.run(key);
            break;
          case "i":
          case "a":
            Mode.set("waitForVisualInput");
            break;
          case "x":
            Menu.click(Menu.items.cut);
            Mode.toNormal(true);
            break;
          case ">":
            // Indent selection
            Keys.send("bracketRight", { control: true });
            Mode.toNormal(true);
            break;
          case "<":
            // Outdent selection
            Keys.send("bracketLeft", { control: true });
            Mode.toNormal(true);
            break;
        }
      },
    };

    /*
     * ======================================================================================
     * MENU
     * Google Docs menu interaction: finds, caches, and clicks menu items by simulating
     * mouse events on the native menu bar.
     * ======================================================================================
     */
    const Menu = {
      /** Cached DOM elements for menu items, keyed by caption. */
      _cache: {},

      /** Menu item definitions keyed by action name. */
      items: {
        copy: { parent: "Edit", caption: "Copy" },
        cut: { parent: "Edit", caption: "Cut" },
        paste: { parent: "Edit", caption: "Paste" },
        redo: { parent: "Edit", caption: "Redo" },
        undo: { parent: "Edit", caption: "Undo" },
        find: { parent: "Edit", caption: "Find" },
      },

      /**
       * Clicks a Google Docs menu item by its definition.
       * @param {Object} itemCaption - Menu item definition with parent and caption.
       */
      click(itemCaption) {
        const item = Menu.get(itemCaption);
        if (item) Menu.simulateClick(item);
      },

      /**
       * Gets a cached menu item element or finds and caches it.
       * @param {Object} menuItem - Menu item definition with parent and caption.
       * @param {boolean} [silenceWarning=false] - Suppress console warning if not found.
       * @returns {Element|null} The menu item element or null if not found.
       */
      get(menuItem, silenceWarning = false) {
        const caption = menuItem.caption;
        let el = Menu._cache[caption];
        if (el) return el;
        el = Menu.find(menuItem);
        if (!el) {
          if (!silenceWarning)
            console.error(
              "VimDocs: Could not find menu item",
              menuItem.caption,
            );
          return null;
        }
        return (Menu._cache[caption] = el);
      },

      /**
       * Finds a menu item element by activating its parent menu and searching.
       * @param {Object} menuItem - Menu item definition with parent and caption.
       * @returns {Element|null} The menu item element or null if not found.
       */
      find(menuItem) {
        Menu.activateTopLevel(menuItem.parent);
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
      },

      /**
       * Simulates a full mouse click sequence on an element.
       * @param {Element} el - The element to click.
       * @param {number} [x=0] - X coordinate for the click.
       * @param {number} [y=0] - Y coordinate for the click.
       */
      simulateClick(el, x = 0, y = 0) {
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
      },

      /**
       * Activates a top-level menu in Google Docs (File, Edit, etc.).
       * @param {string} menuCaption - The menu name to activate.
       */
      activateTopLevel(menuCaption) {
        const buttons = Array.from(document.querySelectorAll(".menu-button"));
        const button = buttons.find(
          (el) => el.innerText.trim() === menuCaption,
        );
        if (!button) {
          console.error(
            `VimDocs: Couldn't find top-level button ${menuCaption}`,
          );
          return;
        }
        Menu.simulateClick(button);
        Menu.simulateClick(button);
      },
    };

    iframe.contentDocument.addEventListener("keydown", Vim.onKeyDown, true);
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
