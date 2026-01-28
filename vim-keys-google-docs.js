// vim-keys-google-docs.js

// ==UserScript==
// @name        VimKeys (Vim for Google Docs)
// @namespace   http://tampermonkey.net/
// @version     1.3.4
// @description Vim-style keyboard shortcuts for Google Docs. Ported from the DocsKeys extension.
// @author      uhs-robert
// @license     MIT
// @match       https://docs.google.com/document/*
// @grant       none
// @run-at      document-idle
// @downloadURL https://update.greasyfork.org/scripts/562026/VimKeys%20%28Vim%20for%20Google%20Docs%29.user.js
// @updateURL https://update.greasyfork.org/scripts/562026/VimKeys%20%28Vim%20for%20Google%20Docs%29.meta.js
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

  function initVimKeys() {
    const iframe = document.querySelector("iframe.docs-texteventtarget-iframe");

    if (!iframe || !iframe.contentDocument || !iframe.contentDocument.body) {
      setTimeout(initVimKeys, 500);

      return;
    }

    console.debug("VimKeys: Initializing...");
    iframe.contentDocument.addEventListener("keydown", eventHandler, true);
    const STATE = {
      mode: "normal",
      tempNormal: false,
      replaceCharMode: false,
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

    function wordMods(shift = false) {
      return { shift, [wordModifierKey]: true };
    }

    function paragraphMods(shift = false) {
      return { shift, [paragraphModifierKey]: true };
    }

    // Inject style for disabling cursor animation in insert mode
    const existingStyle = document.getElementById("vim-keys-style");
    if (existingStyle) existingStyle.remove();
    const style_el = document.createElement("style");
    style_el.id = "vim-keys-style";
    style_el.textContent =
      ".vim-no-cursor-animation { animation: none !important; }";
    document.head.appendChild(style_el);

    // Mode indicator element (insert, visual, etc.)
    // Remove existing indicator if present to prevent duplicates on re-init
    const existingIndicator = document.getElementById("vim-mode-indicator");
    if (existingIndicator) existingIndicator.remove();
    const modeIndicator = document.createElement("div");
    modeIndicator.id = "vim-mode-indicator";
    modeIndicator.style.position = "fixed";
    modeIndicator.style.bottom = "20px";
    modeIndicator.style.right = "20px";
    modeIndicator.style.padding = "8px 16px";
    modeIndicator.style.borderRadius = "4px";
    modeIndicator.style.fontFamily =
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    modeIndicator.style.fontSize = "14px";
    modeIndicator.style.fontWeight = "500";
    modeIndicator.style.zIndex = "9999";
    document.body.appendChild(modeIndicator);

    function updateModeIndicator(currentMode) {
      modeIndicator.textContent = currentMode.toUpperCase();
      switch (currentMode) {
        case "normal":
          modeIndicator.style.backgroundColor = COLORSCHEME.mode["normal"].bg;
          modeIndicator.style.color = COLORSCHEME.mode["normal"].fg;
          break;
        case "insert":
          modeIndicator.style.backgroundColor = COLORSCHEME.mode["insert"].bg;
          modeIndicator.style.color = COLORSCHEME.mode["insert"].fg;
          break;
        case "visual":
          modeIndicator.style.backgroundColor = COLORSCHEME.mode["visual"].bg;
          modeIndicator.style.color = COLORSCHEME.mode["visual"].fg;
          break;
        case "v-line":
          modeIndicator.style.backgroundColor = COLORSCHEME.mode["v-line"].bg;
          modeIndicator.style.color = COLORSCHEME.mode["v-line"].fg;
          break;
        case "waitForFirstInput":
        case "waitForSecondInput":
        case "waitForVisualInput":
          modeIndicator.style.backgroundColor = COLORSCHEME.mode["wait"].bg;
          modeIndicator.style.color = COLORSCHEME.mode["wait"].fg;
          break;
      }
    }

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

    function repeatMotion(motion, times, key) {
      for (let i = 0; i < times; i++) motion(key);
    }

    function switchModeToVisual() {
      STATE.mode = "visual";
      updateModeIndicator(STATE.mode);
      sendKeyEvent("right", { shift: true });
    }

    function switchModeToVisualLine() {
      STATE.mode = "v-line";
      updateModeIndicator(STATE.mode);
      goToStartOfLine();
      selectToEndOfLine();
    }

    function switchModeToNormal(skipDeselect = false) {
      if (
        !skipDeselect &&
        (STATE.mode === "v-line" || STATE.mode === "visual")
      ) {
        sendKeyEvent("right");
        sendKeyEvent("left");
      }

      STATE.mode = "normal";
      updateModeIndicator(STATE.mode);

      STATE.replaceCharMode = false;

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
    }

    function switchModeToInsert() {
      STATE.mode = "insert";
      updateModeIndicator(STATE.mode);
      const cursor = GoogleDocs.getCursor();
      if (cursor) {
        const parent = cursor.parentElement;
        if (parent) parent.classList.add("vim-no-cursor-animation");
      }
    }

    function goToStartOfLine() {
      sendKeyEvent("home");
    }
    function goToEndOfLine() {
      sendKeyEvent("end");
    }
    function selectToStartOfLine() {
      sendKeyEvent("home", { shift: true });
    }
    function selectToEndOfLine() {
      sendKeyEvent("end", { shift: true });
    }
    function selectToStartOfWord() {
      sendKeyEvent("left", wordMods(true));
    }
    function selectToEndOfWord() {
      sendKeyEvent("right", wordMods(true));
    }
    function goToEndOfWord() {
      sendKeyEvent("right", wordMods());
    }
    function goToStartOfWord() {
      sendKeyEvent("left", wordMods());
    }
    function selectInnerWord() {
      sendKeyEvent("left");
      sendKeyEvent("left", wordMods());
      sendKeyEvent("right", wordMods(true));
    }
    function goToTop() {
      sendKeyEvent("home", { control: true, shift: true });
      STATE.longStringOp = "";
    }
    function selectToEndOfPara() {
      sendKeyEvent("down", paragraphMods(true));
    }
    function goToEndOfPara(shift = false) {
      sendKeyEvent("down", paragraphMods(shift));
      sendKeyEvent("right", { shift });
    }
    function goToStartOfPara(shift = false) {
      sendKeyEvent("up", paragraphMods(shift));
    }
    function addLineTop() {
      goToStartOfLine();
      sendKeyEvent("enter");
      sendKeyEvent("up");
      switchModeToInsert();
    }
    function addLineBottom() {
      goToEndOfLine();
      sendKeyEvent("enter");
      switchModeToInsert();
    }
    function handleAppend() {
      const cursor = GoogleDocs.getCursor();
      if (!cursor) {
        sendKeyEvent("right");
        switchModeToInsert();
        return;
      }
      const originalTop = cursor.getBoundingClientRect().top;
      sendKeyEvent("right");
      // Use requestAnimationFrame to wait for cursor position update
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const newTop = cursor.getBoundingClientRect().top;
          if (newTop > originalTop + 10) sendKeyEvent("left");
          switchModeToInsert();
        });
      });
    }
    function runLongStringOp(operation = STATE.longStringOp) {
      switch (operation) {
        case "c":
          clickMenu(menuItems.cut);
          switchModeToInsert();
          break;
        case "d":
          clickMenu(menuItems.cut);
          switchModeToNormal(true);
          break;
        case "y":
          clickMenu(menuItems.copy);
          sendKeyEvent("left");
          switchModeToNormal(true);
          break;
        case "p":
          sendKeyEvent("v", clipboardMods());
          switchModeToNormal(true);
          break;
        case "v":
          break;
        case "g":
          goToTop();
          break;
      }
    }

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
          switchModeToNormal();
          break;
      }
    }

    function waitForTextObject(key) {
      switch (key) {
        case "w":
          selectInnerWord();
          runLongStringOp();
          break;
        default:
          switchModeToNormal();
          break;
      }
    }

    function waitForFirstInput(key) {
      switch (key) {
        case "i":
          STATE.mode = "waitForTextObject";
          break;
        case "a":
          STATE.mode = "waitForTextObject";
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
          switchModeToNormal();
      }
    }

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
      STATE.mode = "v-line";
    }

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
      STATE.mode = STATE.multipleMotion.mode;
    }

    function eventHandler(e) {
      if (["Shift", "Meta", "Control", "Alt", ""].includes(e.key)) return;

      if (e.ctrlKey && STATE.mode === "normal") {
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

      if (e.ctrlKey && STATE.mode === "insert" && e.key === "o") {
        e.preventDefault();
        e.stopImmediatePropagation();
        switchModeToNormal();
        STATE.tempNormal = true;
        return;
      }

      if (STATE.mode === "insert" && STATE.replaceCharMode) {
        if (e.key === "Escape") {
          e.preventDefault();
          switchModeToNormal();
          return;
        }
        if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
          sendKeyEvent("delete");

          // Use requestAnimationFrame to wait for delete to process
          requestAnimationFrame(() => {
            sendKeyEvent("left");
            switchModeToNormal();
          });

          return;
        }
      }

      if (e.altKey || e.ctrlKey || e.metaKey) return;

      if (e.key === "Escape") {
        e.preventDefault();
        if (STATE.search.active) closeFindWindow();
        if (STATE.mode === "v-line" || STATE.mode === "visual")
          sendKeyEvent("right");
        switchModeToNormal();
        return;
      }

      if (STATE.mode != "insert") {
        e.preventDefault();
        switch (STATE.mode) {
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

    function hideFindWindowAndRefocus(editorActiveEl) {
      const findWindow = GoogleDocs.getFindWindow();
      if (findWindow) findWindow.style.display = "none";

      setTimeout(() => {
        if (editorActiveEl && typeof editorActiveEl.focus === "function") {
          editorActiveEl.focus();
        }
        switchModeToNormal();
      }, 50);
    }

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
      STATE.mode = "normal";
    }

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

    function handleKeyEventNormal(key) {
      if (/[1-9]/.test(key)) {
        STATE.mode = "multipleMotion";
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
        case "w":
          goToEndOfWord();
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
          STATE.mode = "waitForFirstInput";
          break;
        case "p":
          clickMenu(menuItems.paste);
          break;
        case "a":
          handleAppend();
          break;
        case "i":
          switchModeToInsert();
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
          switchModeToInsert();
          break;
        case "A":
          goToEndOfLine();
          switchModeToInsert();
          break;
        case "v":
          switchModeToVisual();
          break;
        case "V":
          switchModeToVisualLine();
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
          STATE.replaceCharMode = true;
          switchModeToInsert();
          break;

        case "f":
          if (STATE.search.active && STATE.search.isCharSearch) {
            sendKeyEvent("g", { control: true, shift: !STATE.search.forward });
          } else {
            STATE.search.forward = true;
            STATE.mode = "waitForFindChar";
          }
          return;
        case "F":
          if (STATE.search.active && STATE.search.isCharSearch) {
            sendKeyEvent("g", { control: true, shift: STATE.search.forward });
          } else {
            STATE.search.forward = false;
            STATE.mode = "waitForFindChar";
          }
          return;
        case "/":
          clickMenu(menuItems.find);
          break;
        case "x":
          sendKeyEvent("delete");
          break;
        case "Enter":
          if (STATE.search.active) closeFindWindow();
          return;
        default:
          return;
      }
      if (STATE.tempNormal) {
        STATE.tempNormal = false;
        if (
          STATE.mode != "visual" &&
          STATE.mode != "v-line" &&
          STATE.mode != "waitForFirstInput" &&
          STATE.mode != "waitForTextObject"
        ) {
          switchModeToInsert();
        }
      }
    }

    function handleKeyEventVisualLine(key) {
      if (/[1-9]/.test(key)) {
        STATE.mode = "multipleMotion";
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
          switchModeToNormal();
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
          STATE.mode = "waitForVisualInput";
          break;
        case "x":
          clickMenu(menuItems.cut);
          switchModeToNormal(true);
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

    function clickMenu(itemCaption) {
      const item = getMenuItem(itemCaption);
      if (item) simulateClick(item);
    }

    function getMenuItem(menuItem, silenceWarning = false) {
      const caption = menuItem.caption;
      let el = menuItemElements[caption];
      if (el) return el;
      el = findMenuItem(menuItem);
      if (!el) {
        if (!silenceWarning)
          console.error("VimKeys: Could not find menu item", menuItem.caption);
        return null;
      }
      return (menuItemElements[caption] = el);
    }

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

    function activateTopLevelMenu(menuCaption) {
      const buttons = Array.from(document.querySelectorAll(".menu-button"));
      const button = buttons.find((el) => el.innerText.trim() === menuCaption);
      if (!button) {
        console.error(`VimKeys: Couldn't find top-level button ${menuCaption}`);
        return;
      }
      simulateClick(button);
      simulateClick(button);
    }

    switchModeToNormal();
  }

  function waitForDocs() {
    const editor = document.querySelector(".docs-texteventtarget-iframe");
    if (editor) initVimKeys();
    else setTimeout(waitForDocs, 500);
  }

  waitForDocs();
})();
