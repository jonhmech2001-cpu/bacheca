//=============================================================================
// JJ_UltraMode7DepthOfField.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc v0.2 Depth Of Field for Ultra Mode 7. Blurs distant events/characters using UltraMode7 depth.
 * @author JJ / ChatGPT
 *
 * @param Enabled
 * @text Enabled by default
 * @type boolean
 * @default true
 *
 * @param Focus Mode
 * @type select
 * @option Player
 * @value player
 * @option Fixed Z
 * @value fixed
 * @default player
 *
 * @param Focus Z
 * @type number
 * @min 0
 * @default 550
 *
 * @param Focus Range
 * @type number
 * @min 1
 * @default 220
 *
 * @param Max Blur
 * @type number
 * @decimals 2
 * @min 0
 * @default 5
 *
 * @param Curve
 * @type number
 * @decimals 2
 * @min 0.01
 * @default 1.35
 *
 * @param Far Only
 * @type boolean
 * @default true
 *
 * @param Affect Player
 * @type boolean
 * @default false
 *
 * @param Affect Followers
 * @type boolean
 * @default false
 *
 * @param Blur Quality
 * @type number
 * @min 1
 * @max 4
 * @default 1
 *
 * @param Update Rate
 * @desc Updates blur every N frames. 1 = every frame.
 * @type number
 * @min 1
 * @default 2
 *
 * @param Debug
 * @type boolean
 * @default false
 *
 * @command enable
 * @text Enable DOF
 *
 * @command disable
 * @text Disable DOF
 *
 * @command setFocusPlayer
 * @text Focus Player
 *
 * @command setFocusZ
 * @text Set Focus Z
 * @arg z
 * @type number
 * @default 550
 *
 * @command setMaxBlur
 * @text Set Max Blur
 * @arg value
 * @type number
 * @decimals 2
 * @default 5
 *
 * @command setFocusRange
 * @text Set Focus Range
 * @arg value
 * @type number
 * @default 220
 *
 * @help
 * Put this plugin BELOW UltraMode7.js.
 *
 * This plugin blurs Sprite_Character instances according to their Ultra Mode 7 Z depth.
 * It is intentionally independent from FilterController.
 *
 * Map note:
 *   <DOFOff>        disables the system on that map.
 *   <DOFOn>         forces the system on that map.
 *
 * Event note tags:
 *   <DOFIgnore>     never blur this event.
 *   <DOFFocus>      keep this event sharp.
 *   <DOFOffset:2>   add local blur amount.
 *   <DOFMaxBlur:3>  clamp this event's blur.
 *
 * Script calls:
 *   JJ.UM7DOF.enable()
 *   JJ.UM7DOF.disable()
 *   JJ.UM7DOF.setFocusFromPlayer()
 *   JJ.UM7DOF.setFocusZ(550)
 *   JJ.UM7DOF.setFocusRange(220)
 *   JJ.UM7DOF.setMaxBlur(5)
 *   JJ.UM7DOF.setCurve(1.35)
 *   JJ.UM7DOF.setFarOnly(true)
 *   JJ.UM7DOF.debugOnce()
 */

(() => {
    "use strict";

    const PLUGIN_NAME = "JJ_UltraMode7DepthOfField";
    const params = PluginManager.parameters(PLUGIN_NAME);

    function boolParam(name, fallback) {
        const v = params[name];
        if (v === undefined || v === null || v === "") return fallback;
        return String(v).toLowerCase() === "true";
    }

    function numParam(name, fallback) {
        const n = Number(params[name]);
        return Number.isFinite(n) ? n : fallback;
    }

    window.JJ = window.JJ || {};
    const DOF = window.JJ.UM7DOF = window.JJ.UM7DOF || {};

    DOF.enabled = boolParam("Enabled", true);
    DOF.focusMode = String(params["Focus Mode"] || "player").toLowerCase();
    DOF.focusZ = numParam("Focus Z", 550);
    DOF.focusRange = Math.max(1, numParam("Focus Range", 220));
    DOF.maxBlur = Math.max(0, numParam("Max Blur", 5));
    DOF.curve = Math.max(0.01, numParam("Curve", 1.35));
    DOF.farOnly = boolParam("Far Only", true);
    DOF.affectPlayer = boolParam("Affect Player", false);
    DOF.affectFollowers = boolParam("Affect Followers", false);
    DOF.blurQuality = Math.max(1, Math.min(4, Math.round(numParam("Blur Quality", 1))));
    DOF.updateRate = Math.max(1, Math.round(numParam("Update Rate", 2)));
    DOF.debug = boolParam("Debug", false);

    DOF._frame = 0;
    DOF._lastDebug = null;

    DOF.enable = function() {
        this.enabled = true;
    };

    DOF.disable = function() {
        this.enabled = false;
        this.clearAllBlur();
    };

    DOF.setFocusFromPlayer = function() {
        this.focusMode = "player";
    };

    DOF.setFocusZ = function(z) {
        const n = Number(z);
        if (Number.isFinite(n)) {
            this.focusMode = "fixed";
            this.focusZ = n;
        }
    };

    DOF.setFocusRange = function(v) {
        const n = Number(v);
        if (Number.isFinite(n)) this.focusRange = Math.max(1, n);
    };

    DOF.setMaxBlur = function(v) {
        const n = Number(v);
        if (Number.isFinite(n)) this.maxBlur = Math.max(0, n);
    };

    DOF.setCurve = function(v) {
        const n = Number(v);
        if (Number.isFinite(n)) this.curve = Math.max(0.01, n);
    };

    DOF.setFarOnly = function(v) {
        this.farOnly = !!v;
    };

    DOF.isUltraMode7Ready = function() {
        return window.UltraMode7 && typeof UltraMode7.isActive === "function" && UltraMode7.isActive();
    };

    DOF.isMapEnabled = function() {
        if (!$dataMap) return true;
        if ($dataMap.meta && $dataMap.meta.DOFOff) return false;
        if ($dataMap.meta && $dataMap.meta.DOFOn) return true;
        return true;
    };

    DOF.characterMapPixelPosition = function(character) {
        // UltraMode7 compatibility code uses adjusted/scrolled map pixel coordinates,
        // not already-projected screenX/screenY values.
        let tx;
        let ty;

        if ($gameMap.isLoopHorizontal() || $gameMap.isLoopVertical()) {
            const p = $gameMap.adjustUltraMode7LoopedPosition(character._realX, character._realY);
            tx = p.x;
            ty = p.y;
        } else {
            tx = $gameMap.adjustX(character._realX);
            ty = $gameMap.adjustY(character._realY);
        }

        return {
            x: (tx + 0.5) * $gameMap.tileWidth() + $gameScreen.shake(),
            y: (ty + 1.0) * $gameMap.tileHeight()
        };
    };

    DOF.depthOfCharacter = function(character) {
        if (!this.isUltraMode7Ready() || !character) return 0;
        const p = this.characterMapPixelPosition(character);
        const projected = UltraMode7.mapToScreen(p.x, p.y);
        return projected && Number.isFinite(projected.z) ? projected.z : 0;
    };

    DOF.focusDepth = function() {
        if (this.focusMode === "player" && window.$gamePlayer) {
            return this.depthOfCharacter($gamePlayer);
        }
        return this.focusZ;
    };

    DOF.noteOfSprite = function(sprite) {
        const c = sprite && sprite._character;
        if (c && typeof c.event === "function") {
            const ev = c.event();
            return ev ? (ev.note || "") : "";
        }
        return "";
    };

    DOF.shouldIgnoreSprite = function(sprite) {
        const c = sprite && sprite._character;
        if (!c) return true;

        if (c === $gamePlayer && !this.affectPlayer) return true;
        if (typeof Game_Follower !== "undefined" && c instanceof Game_Follower && !this.affectFollowers) return true;

        const note = this.noteOfSprite(sprite);
        if (/<DOFIgnore>/i.test(note)) return true;
        if (/<DOFFocus>/i.test(note)) return true;

        return false;
    };

    DOF.localOffset = function(sprite) {
        const note = this.noteOfSprite(sprite);
        const m = note.match(/<DOFOffset\s*:\s*([\d.+\-]+)>/i);
        return m ? Number(m[1]) || 0 : 0;
    };

    DOF.localMaxBlur = function(sprite) {
        const note = this.noteOfSprite(sprite);
        const m = note.match(/<DOFMaxBlur\s*:\s*([\d.+\-]+)>/i);
        return m ? Math.max(0, Number(m[1]) || 0) : this.maxBlur;
    };

    DOF.blurForSprite = function(sprite) {
        const depth = this.depthOfCharacter(sprite._character);
        const focus = this.focusDepth();
        let delta = depth - focus;

        if (this.farOnly && delta <= 0) return 0;

        delta = Math.abs(delta);
        const normalized = Math.max(0, delta / this.focusRange);
        let blur = Math.pow(normalized, this.curve) * this.maxBlur;
        blur += this.localOffset(sprite);
        blur = Math.min(blur, this.localMaxBlur(sprite));
        blur = Math.min(blur, this.maxBlur);
        return Math.max(0, blur);
    };

    DOF.clearSpriteBlur = function(sprite) {
        if (!sprite || !sprite._jjDofBlurFilter) return;
        if (sprite.filters) {
            sprite.filters = sprite.filters.filter(f => f !== sprite._jjDofBlurFilter);
            if (sprite.filters.length === 0) sprite.filters = null;
        }
        sprite._jjDofBlurFilter = null;
        sprite._jjDofLastBlur = 0;
    };

    DOF.applySpriteBlur = function(sprite, value) {
        if (!sprite) return;

        if (value <= 0.01) {
            this.clearSpriteBlur(sprite);
            return;
        }

        if (!sprite._jjDofBlurFilter) {
            const filter = new PIXI.filters.BlurFilter();
            filter.quality = this.blurQuality;
            filter.blur = 0;
            sprite._jjDofBlurFilter = filter;

            const list = sprite.filters ? sprite.filters.slice() : [];
            if (!list.includes(filter)) list.push(filter);
            sprite.filters = list;
        }

        sprite._jjDofBlurFilter.blur = value;
        sprite._jjDofLastBlur = value;
    };

    DOF.clearAllBlur = function() {
        const scene = SceneManager._scene;
        const sprites = scene && scene._spriteset && scene._spriteset._characterSprites;
        if (!sprites) return;
        sprites.forEach(sprite => this.clearSpriteBlur(sprite));
    };

    DOF.updateSprite = function(sprite) {
        if (!this.enabled || !this.isMapEnabled() || !this.isUltraMode7Ready()) {
            this.clearSpriteBlur(sprite);
            return;
        }

        if (!sprite || !sprite.visible || this.shouldIgnoreSprite(sprite)) {
            this.clearSpriteBlur(sprite);
            return;
        }

        const blur = this.blurForSprite(sprite);
        this.applySpriteBlur(sprite, blur);
    };

    DOF.debugOnce = function() {
        const scene = SceneManager._scene;
        const sprites = scene && scene._spriteset && scene._spriteset._characterSprites;
        if (!sprites) {
            console.log("[UM7DOF] No character sprites found.");
            return;
        }
        const rows = sprites.map(sprite => {
            const c = sprite._character;
            return {
                name: c === $gamePlayer ? "Player" : (c && c.event ? c.event().name : String(c)),
                depth: c ? this.depthOfCharacter(c) : null,
                blur: sprite._jjDofLastBlur || 0,
                ignored: this.shouldIgnoreSprite(sprite)
            };
        });
        console.table(rows);
        this._lastDebug = rows;
    };

    const _Sprite_Character_update = Sprite_Character.prototype.update;
    Sprite_Character.prototype.update = function() {
        _Sprite_Character_update.call(this);

        DOF._frame++;
        if (DOF._frame % DOF.updateRate !== 0) return;

        DOF.updateSprite(this);
    };

    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        DOF.clearAllBlur();
        _Scene_Map_terminate.call(this);
    };

    if (PluginManager.registerCommand) {
        PluginManager.registerCommand(PLUGIN_NAME, "enable", () => DOF.enable());
        PluginManager.registerCommand(PLUGIN_NAME, "disable", () => DOF.disable());
        PluginManager.registerCommand(PLUGIN_NAME, "setFocusPlayer", () => DOF.setFocusFromPlayer());
        PluginManager.registerCommand(PLUGIN_NAME, "setFocusZ", args => DOF.setFocusZ(args.z));
        PluginManager.registerCommand(PLUGIN_NAME, "setMaxBlur", args => DOF.setMaxBlur(args.value));
        PluginManager.registerCommand(PLUGIN_NAME, "setFocusRange", args => DOF.setFocusRange(args.value));
    }

})();
