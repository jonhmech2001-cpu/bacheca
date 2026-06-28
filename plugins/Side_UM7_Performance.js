//=============================================================================
// Side_UM7_Performance.js
//=============================================================================
/*:
 * @target MV
 * @plugindesc v1.0.0 — [Side] Performance pack per UltraMode7: risoluzione dinamica, texture GC e overlay FPS. Compatibile UM7 (best-effort, NO glitch).
 * @author Side
 *
 * @help
 * ============================================================================
 * Side_UM7_Performance
 * ============================================================================
 * Pacchetto prestazioni pensato per giochi 2.5D con UltraMode7.
 * Il report mostra che il gioco è GPU-bound (la GPU è la risorsa più carica),
 * con qualche spike di caricamento dovuto ai PNG grandi. Questo plugin agisce
 * proprio su quei fronti:
 *
 *   1) RISOLUZIONE DINAMICA
 *      Quando gli FPS scendono sotto la soglia, abbassa la risoluzione di
 *      render (drawing buffer) e la rialza quando il carico cala. Meno pixel
 *      da disegnare = meno lavoro per lo shader Mode 7. La dimensione a schermo
 *      NON cambia (solo la nitidezza interna varia leggermente sotto carico).
 *
 *   2) TEXTURE GC
 *      Libera periodicamente le texture GPU non più usate (utile con PNG
 *      grandi di ambientazione/parallax) e a ogni cambio mappa/scena.
 *
 *   3) OVERLAY FPS
 *      Contatore on-screen con FPS, scala di render attuale e n° texture in
 *      memoria. Si attiva/disattiva con un tasto (default F8).
 *
 * ----------------------------------------------------------------------------
 * NOTE IMPORTANTI
 * ----------------------------------------------------------------------------
 *  • Richiede modalità WebGL (UltraMode7 la usa già). In Canvas il modulo
 *    risoluzione si autodisabilita.
 *  • La risoluzione dinamica tocca il renderer: è stata scritta per essere
 *    "safe" con UM7, ma VA PROVATA in gioco entrando/uscendo da mappe UM7.
 *    Se noti artefatti, alza "Min Render Scale" a 0.85 oppure metti
 *    "Enable Dynamic Resolution" = false (overlay e GC restano attivi).
 *  • Mettilo DOPO UltraMode7 nella lista plugin.
 *
 * ----------------------------------------------------------------------------
 * COMANDI PLUGIN (MV)
 * ----------------------------------------------------------------------------
 *   UM7Perf overlay on|off|toggle     # mostra/nasconde l'overlay FPS
 *   UM7Perf dynres on|off             # abilita/disabilita risoluzione dinamica
 *   UM7Perf scale 0.8                 # forza una scala di render fissa (0.1-1)
 *   UM7Perf gc                        # forza una pulizia texture adesso
 *
 * ============================================================================
 *
 * @param ---Risoluzione Dinamica---
 * @default
 *
 * @param EnableDynamicResolution
 * @text Abilita risoluzione dinamica
 * @type boolean
 * @default true
 *
 * @param TargetFPS
 * @text FPS obiettivo
 * @desc Sotto questo valore la risoluzione scende; sopra (con margine) risale.
 * @type number
 * @min 20
 * @max 120
 * @default 58
 *
 * @param MinRenderScale
 * @text Scala minima di render
 * @desc Limite inferiore (es. 0.6 = 60% dei pixel). Più basso = più performance ma più sfocato.
 * @type number
 * @decimals 2
 * @min 0.30
 * @max 1.00
 * @default 0.65
 *
 * @param MaxRenderScale
 * @text Scala massima di render
 * @type number
 * @decimals 2
 * @min 0.50
 * @max 1.00
 * @default 1.00
 *
 * @param ScaleStep
 * @text Passo di variazione
 * @desc Quanto cambia la scala a ogni aggiustamento.
 * @type number
 * @decimals 2
 * @min 0.02
 * @max 0.25
 * @default 0.05
 *
 * @param AdjustInterval
 * @text Intervallo aggiustamento (frame)
 * @desc Ogni quanti frame valutare/cambiare la scala (evita oscillazioni).
 * @type number
 * @min 15
 * @max 240
 * @default 45
 *
 * @param ---Texture GC---
 * @default
 *
 * @param EnableTextureGC
 * @text Abilita Texture GC
 * @type boolean
 * @default true
 *
 * @param TextureGCInterval
 * @text Intervallo GC (secondi)
 * @type number
 * @min 5
 * @max 300
 * @default 30
 *
 * @param GCOnSceneChange
 * @text GC al cambio scena/mappa
 * @type boolean
 * @default true
 *
 * @param ---Overlay FPS---
 * @default
 *
 * @param ShowOverlay
 * @text Mostra overlay all'avvio
 * @type boolean
 * @default true
 *
 * @param OverlayKey
 * @text Tasto toggle overlay
 * @desc Nome tasto JS (es. F8, F9, F10). Default: F8.
 * @default F8
 *
 * @param OverlayCorner
 * @text Posizione overlay
 * @type select
 * @option Alto-Sinistra
 * @value tl
 * @option Alto-Destra
 * @value tr
 * @option Basso-Sinistra
 * @value bl
 * @option Basso-Destra
 * @value br
 * @default tr
 */

(function () {
  "use strict";

  var PN = "Side_UM7_Performance";
  var P = PluginManager.parameters(PN);
  var B = function (v, d) { return v === undefined ? d : v === "true"; };
  var N = function (v, d) { var n = Number(v); return isNaN(n) ? d : n; };

  var CFG = {
    dynRes:      B(P["EnableDynamicResolution"], true),
    targetFPS:   N(P["TargetFPS"], 58),
    minScale:    N(P["MinRenderScale"], 0.65),
    maxScale:    N(P["MaxRenderScale"], 1.0),
    step:        N(P["ScaleStep"], 0.05),
    interval:    N(P["AdjustInterval"], 45),
    texGC:       B(P["EnableTextureGC"], true),
    gcInterval:  N(P["TextureGCInterval"], 30),
    gcOnScene:   B(P["GCOnSceneChange"], true),
    showOverlay: B(P["ShowOverlay"], true),
    overlayKey: (P["OverlayKey"] || "F8").toUpperCase(),
    corner:     (P["OverlayCorner"] || "tr")
  };

  //--------------------------------------------------------------------------
  // Utils
  //--------------------------------------------------------------------------
  function isWebGL() {
    return Graphics.isWebGL && Graphics.isWebGL();
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  //==========================================================================
  // 1) RISOLUZIONE DINAMICA
  //==========================================================================
  // Disaccoppia il drawing-buffer (renderer.resolution) dalla dimensione a
  // schermo. Lo stage e UM7 disegnano tutti tramite lo stesso renderer, quindi
  // lo scaling resta coerente. L'input resta corretto perché MV mappa il mouse
  // su _realScale (dimensione logica), non sul backing-store.

  Graphics._um7pScale = 1.0;

  Graphics.setRenderScale = function (scale) {
    if (!this._renderer) return;
    scale = clamp(scale, 0.1, 1.0);
    if (Math.abs((this._um7pScale || 1) - scale) < 0.001) return;
    var r = this._renderer;
    if (!r || typeof r.resize !== "function") return;
    try {
      this._um7pScale = scale;
      r.resolution = scale;
      if (r.rootRenderTarget) r.rootRenderTarget.resolution = scale;
      // resize ridisegna il backing-store a (width*scale x height*scale)
      r.resize(this._width, this._height);
      // riallinea la CSS sulla dimensione LOGICA (non sul backing-store)
      this._um7pFixCanvasCss();
    } catch (e) {
      console.warn(PN + ": setRenderScale fallito, ripristino 1.0", e);
      this._um7pScale = 1.0;
      try { r.resolution = 1.0; r.resize(this._width, this._height); } catch (e2) {}
    }
  };

  Graphics._um7pFixCanvasCss = function () {
    var c = this._canvas;
    if (!c) return;
    var w = Math.round(this._width * this._realScale);
    var h = Math.round(this._height * this._realScale);
    c.style.width = w + "px";
    c.style.height = h + "px";
  };

  // Quando MV ricentra il canvas (resize finestra / fullscreen) calcola la CSS
  // dalla larghezza del backing-store: con la nostra scala risulterebbe più
  // piccolo. Forziamo la CSS sulla dimensione logica.
  var _Graphics_centerElement = Graphics._centerElement;
  Graphics._centerElement = function (element) {
    _Graphics_centerElement.call(this, element);
    if (element === this._canvas && this._um7pScale && this._um7pScale < 0.999) {
      this._um7pFixCanvasCss();
    }
  };

  // Dopo un resize della finestra, MV rimette canvas.width = _width: riapplichiamo.
  var _Graphics_onWindowResize = Graphics._onWindowResize;
  Graphics._onWindowResize = function () {
    _Graphics_onWindowResize.call(this);
    if (this._um7pScale && this._um7pScale < 0.999) {
      var s = this._um7pScale;
      this._um7pScale = 1.0; // forza la riapplicazione
      this.setRenderScale(s);
    }
  };

  //--------------------------------------------------------------------------
  // Controller FPS + decisione scala
  //--------------------------------------------------------------------------
  var Perf = {
    frames: 0,
    lastSample: 0,
    fps: 60,
    fpsAccum: 60,
    sinceAdjust: 0,
    lastGC: 0
  };

  function sampleFps() {
    Perf.frames++;
    var now = performance.now();
    if (!Perf.lastSample) Perf.lastSample = now;
    var dt = now - Perf.lastSample;
    if (dt >= 500) {
      Perf.fps = (Perf.frames * 1000) / dt;
      // media smussata per evitare reazioni a singoli spike
      Perf.fpsAccum = Perf.fpsAccum * 0.5 + Perf.fps * 0.5;
      Perf.frames = 0;
      Perf.lastSample = now;
    }
  }

  function updateDynamicResolution() {
    if (!CFG.dynRes || !isWebGL()) return;
    Perf.sinceAdjust++;
    if (Perf.sinceAdjust < CFG.interval) return;
    Perf.sinceAdjust = 0;

    var fps = Perf.fpsAccum;
    var cur = Graphics._um7pScale || 1.0;
    var next = cur;

    if (fps < CFG.targetFPS - 2) {
      next = clamp(cur - CFG.step, CFG.minScale, CFG.maxScale);
    } else if (fps > CFG.targetFPS + 4 && cur < CFG.maxScale) {
      // risale solo con buon margine, per non rimbalzare
      next = clamp(cur + CFG.step, CFG.minScale, CFG.maxScale);
    }
    if (Math.abs(next - cur) > 0.001) Graphics.setRenderScale(next);
  }

  //==========================================================================
  // 2) TEXTURE GC
  //==========================================================================
  function runTextureGC(force) {
    if (!CFG.texGC && !force) return;
    try {
      var r = Graphics._renderer;
      if (r && r.textureGC && typeof r.textureGC.run === "function") {
        r.textureGC.run();
      }
    } catch (e) {
      console.warn(PN + ": textureGC errore", e);
    }
  }

  function updateTextureGC() {
    if (!CFG.texGC) return;
    var now = performance.now();
    if (!Perf.lastGC) Perf.lastGC = now;
    if (now - Perf.lastGC >= CFG.gcInterval * 1000) {
      Perf.lastGC = now;
      runTextureGC();
    }
  }

  // GC al cambio scena (le mappe UM7 con PNG grandi liberano memoria)
  if (CFG.gcOnScene) {
    var _SceneManager_changeScene = SceneManager.changeScene;
    SceneManager.changeScene = function () {
      var changing = this.isSceneChanging() && !this.isCurrentSceneBusy();
      _SceneManager_changeScene.call(this);
      if (changing) { setTimeout(function () { runTextureGC(true); }, 0); }
    };
  }

  //==========================================================================
  // Hook nel game-loop
  //==========================================================================
  var _SceneManager_updateMain = SceneManager.updateMain;
  SceneManager.updateMain = function () {
    _SceneManager_updateMain.call(this);
    sampleFps();
    updateDynamicResolution();
    updateTextureGC();
    if (Overlay.visible) Overlay.update();
  };

  //==========================================================================
  // 3) OVERLAY FPS
  //==========================================================================
  var Overlay = {
    el: null,
    visible: CFG.showOverlay,
    _t: 0,

    ensure: function () {
      if (this.el) return;
      var d = document.createElement("div");
      d.id = "um7perf-overlay";
      var s = d.style;
      s.position = "absolute";
      s.zIndex = 9999;
      s.padding = "6px 9px";
      s.font = "12px/1.35 Consolas, monospace";
      s.color = "#9effa0";
      s.background = "rgba(0,0,0,0.55)";
      s.border = "1px solid rgba(158,255,160,0.35)";
      s.borderRadius = "5px";
      s.pointerEvents = "none";
      s.whiteSpace = "pre";
      s.textShadow = "0 1px 2px #000";
      this._place(s);
      (document.body || document.documentElement).appendChild(d);
      this.el = d;
    },

    _place: function (s) {
      var m = "8px";
      s.top = s.bottom = s.left = s.right = "auto";
      if (CFG.corner === "tl") { s.top = m; s.left = m; }
      else if (CFG.corner === "bl") { s.bottom = m; s.left = m; }
      else if (CFG.corner === "br") { s.bottom = m; s.right = m; }
      else { s.top = m; s.right = m; }
    },

    texCount: function () {
      try {
        var r = Graphics._renderer;
        if (r && r.textureManager && r.textureManager._managedTextures) {
          return r.textureManager._managedTextures.length;
        }
      } catch (e) {}
      return "-";
    },

    update: function () {
      if (!this.visible) return;
      this.ensure();
      if ((this._t++ % 10) !== 0) return; // aggiorna ~6 volte/sec
      var fps = Perf.fpsAccum.toFixed(0);
      var scale = ((Graphics._um7pScale || 1) * 100).toFixed(0);
      var w = Math.round(Graphics._width * (Graphics._um7pScale || 1));
      var h = Math.round(Graphics._height * (Graphics._um7pScale || 1));
      var color = Perf.fpsAccum >= CFG.targetFPS - 3 ? "#9effa0"
                : Perf.fpsAccum >= 40 ? "#ffe28a" : "#ff8a8a";
      this.el.style.color = color;
      this.el.textContent =
        "FPS  " + fps +
        "\nRender " + scale + "%  (" + w + "x" + h + ")" +
        "\nTextures " + this.texCount() +
        "\nDynRes " + (CFG.dynRes ? "ON" : "off") +
        "  GC " + (CFG.texGC ? "ON" : "off");
    },

    setVisible: function (v) {
      this.visible = v;
      if (this.el) this.el.style.display = v ? "block" : "none";
      if (v) this.ensure();
    },

    toggle: function () { this.setVisible(!this.visible); }
  };

  // Toggle da tastiera (usa keydown raw per non interferire con Input MV)
  document.addEventListener("keydown", function (e) {
    var k = (e.key || "").toUpperCase();
    if (k === CFG.overlayKey) { Overlay.toggle(); }
  });

  //==========================================================================
  // Boot
  //==========================================================================
  var _Scene_Boot_start = Scene_Boot.prototype.start;
  Scene_Boot.prototype.start = function () {
    _Scene_Boot_start.call(this);
    if (CFG.showOverlay) Overlay.setVisible(true);
    if (!isWebGL() && CFG.dynRes) {
      console.warn(PN + ": modalità non-WebGL, risoluzione dinamica disabilitata.");
      CFG.dynRes = false;
    }
  };

  //==========================================================================
  // Comandi plugin
  //==========================================================================
  var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function (command, args) {
    _Game_Interpreter_pluginCommand.call(this, command, args);
    if (command !== "UM7Perf") return;
    var sub = (args[0] || "").toLowerCase();
    if (sub === "overlay") {
      var v = (args[1] || "toggle").toLowerCase();
      if (v === "on") Overlay.setVisible(true);
      else if (v === "off") Overlay.setVisible(false);
      else Overlay.toggle();
    } else if (sub === "dynres") {
      CFG.dynRes = (args[1] || "").toLowerCase() === "on";
      if (!CFG.dynRes) Graphics.setRenderScale(1.0);
    } else if (sub === "scale") {
      var s = Number(args[1]);
      if (!isNaN(s)) { CFG.dynRes = false; Graphics.setRenderScale(s); }
    } else if (sub === "gc") {
      runTextureGC(true);
    }
  };

})();
