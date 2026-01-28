// vim-keys-google-docs.js

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
    getCursor: () => {
      return document.getElementById("kix-current-user-cursor-caret") || null;
    },
    getFindWindow: () => {
      return document.getElementById("docs-findbar-id") || null;
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
    };

    const wordModifierKey = isMac ? "alt" : "control";
    const paragraphModifierKey = isMac ? "alt" : "control";

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
    const Mode = {
      current: "normal",
      temp_normal: false,
      replace_char: false,
      indicator: null,

      /**
       * Initializes the mode indicator UI element.
       */
      initIndicator() {
        // Inject style for disabling cursor animation in insert mode
        const existingStyle = document.getElementById("vim-docs-style");
        if (existingStyle) existingStyle.remove();
        const style_el = document.createElement("style");
        style_el.id = "vim-docs-style";
        style_el.textContent =
          ".vim-no-cursor-animation { animation: none !important; }";
        document.head.appendChild(style_el);

        // Remove existing indicator if present to prevent duplicates on re-init
        const existingIndicator = document.getElementById("vim-mode-indicator");
        if (existingIndicator) existingIndicator.remove();

        // Stylize indicator
        this.indicator = document.createElement("div");
        this.indicator.id = "vim-mode-indicator";
        this.indicator.style.position = "fixed";
        this.indicator.style.bottom = "20px";
        this.indicator.style.right = "20px";
        this.indicator.style.padding = "8px 16px";
        this.indicator.style.borderRadius = "4px";
        this.indicator.style.fontFamily =
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        this.indicator.style.fontSize = "14px";
        this.indicator.style.fontWeight = "500";
        this.indicator.style.zIndex = "9999";
        document.body.appendChild(this.indicator);
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
          cursor.style.setProperty(
            "border-color",
            COLORSCHEME["cursor"],
            "important",
          );
          const parent = cursor.parentElement;
          if (parent) parent.classList.remove("vim-no-cursor-animation");
        }

        // Refocus the editor
        setTimeout(() => {
          if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
            iframe.contentDocument.body.focus();
          }
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

    // Initialize the mode indicator
    Mode.initIndicator();

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
      sendKeyEvent("home", { control: true, shift: true });
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
          sendKeyEvent("v", clipboardMods());
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
        }
      }
    }

    /**
     * Hides the Google Docs find bar and refocuses the editor.
     * @param {Element} editorActiveEl - The editor element to refocus.
     */
    function hideFindWindowAndRefocus(editorActiveEl) {
      const findWindow = GoogleDocs.getFindWindow();
      if (findWindow) findWindow.style.display = "none";

      setTimeout(() => {
        if (editorActiveEl && typeof editorActiveEl.focus === "function") {
          editorActiveEl.focus();
        }
        Mode.toNormal();
      }, 50);
    }

    /**
     * Handles vim `f` and `F` single-character search.
     * @param {string} key - The character to search for.
     */
    function handleFindChar(key) {
      const editorActiveEl = iframe.contentDocument?.activeElement;
      sendKeyEvent("f", { control: true });

      setTimeout(() => {
        const activeEl = document.activeElement;
        if (activeEl && activeEl.tagName === "INPUT") {
          activeEl.value = key;
          activeEl.dispatchEvent(new Event("input", { bubbles: true }));
          hideFindWindowAndRefocus(editorActiveEl);
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
      const editorActiveEl = iframe.contentDocument?.activeElement;
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
            hideFindWindowAndRefocus(editorActiveEl);
          } else {
            // Wait for user to type and press Enter
            const handleEnter = (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                findInput.removeEventListener("keydown", handleEnter, true);
                STATE.search.lastSearch = findInput.value;
                hideFindWindowAndRefocus(editorActiveEl);
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
      const editorActiveEl = iframe.contentDocument?.activeElement;
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
              hideFindWindowAndRefocus(editorActiveEl);
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
          goToStartOfWord();
          break;
        case "e":
          goToEndOfWord();
          break;
        case "w":
          goToEndOfWord();
          goToEndOfWord();
          goToStartOfWord();
          break;
        case "g":
          sendKeyEvent("home", { control: true });
          break;
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
          clickMenu(menuItems.paste);
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
        case "Enter":
          if (STATE.search.active) closeFindWindow();
          return;
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
          clickMenu(menuItems.paste);
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
