/*:
 * @plugindesc [MV] Motion blur sugli eventi in movimento (conversione da MZ) v1.0.5
 * @author Sang Hendrix (porting MV by ChatGPT)
 * @help
 * Questo plugin applica un effetto di motion blur agli eventi (e opzionalmente
 * al player) quando si muovono, rendendo il movimento più fluido.
 *
 * USO:
 * - Parametro "Apply to All Events":
 *     true  -> tutti gli eventi (eccetto il player) hanno il motion blur
 *     false -> solo gli eventi che hanno il notetag <obj> nelle note dell'evento
 *
 * - Per abilitare il blur sul PLAYER:
 *     Usa il comando plugin (MV):
 *
 *       HendrixMotionBlurPlayer true 1
 *
 *     Dove:
 *       arg0 = true/false (abilita o disabilita)
 *       arg1 = forza del blur (numero, es. 1, 2, 3...)
 *
 * NOTE:
 * - L'effetto si applica solo se la velocità di movimento del personaggio è > 3.
 * - È influenzato dall'opzione "Motion Blur" nelle Opzioni di gioco.
 *
 * COMANDO PLUGIN (MV):
 *   HendrixMotionBlurPlayer enable strength
 *
 *   Esempi:
 *   - HendrixMotionBlurPlayer true 1
 *   - HendrixMotionBlurPlayer false 0
 *
 * @param Apply to all events
 * @text Apply to All Events
 * @desc Il motion blur verrà applicato a tutti gli eventi eccetto il player. Se false, usa il notetag <obj> sugli eventi desiderati.
 * @type boolean
 * @default true
 */

(function() {
    'use strict';

    var pluginName = 'Hendrix_Motion_Blur';
    var params = PluginManager.parameters(pluginName);
    var applyToAllEvents = (params['Apply to all events'] === 'true');

    var playerMotionBlur = false;
    var playerBlurStrength = 1;

    //--------------------------------------------------------------------------
    // Plugin Command (MV)
    //--------------------------------------------------------------------------

    var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        if (command === 'HendrixMotionBlurPlayer') {
            var enable = String(args[0] || 'false').toLowerCase() === 'true';
            var strength = Number(args[1] || 1) || 1;
            playerMotionBlur = enable;
            playerBlurStrength = strength;
            if ($gamePlayer && $gamePlayer.checkMotionBlurTag) {
                $gamePlayer.checkMotionBlurTag();
            }
        }
    };

    //--------------------------------------------------------------------------
    // Game_CharacterBase
    //--------------------------------------------------------------------------

    var _Game_CharacterBase_initMembers = Game_CharacterBase.prototype.initMembers;
    Game_CharacterBase.prototype.initMembers = function() {
        _Game_CharacterBase_initMembers.call(this);
        this._motionBlur = false;
        this._lastPosition = { x: this._realX, y: this._realY };
        this._wasMoving = false;
        this._isMoving = false;
    };

    Game_CharacterBase.prototype.checkMotionBlurTag = function() {
        // Disattiva se troppo lento
        if (this._moveSpeed <= 3) {
            this._motionBlur = false;
            return;
        }

        // Player
        if (this instanceof Game_Player) {
            this._motionBlur = playerMotionBlur && ConfigManager.motionBlur;
        }
        // Eventi
        else if (this instanceof Game_Event) {
            if (this.page()) {
                var note = this.event().note || '';
                this._hasObjTag = note.indexOf('<obj>') >= 0;
                this._motionBlur = ConfigManager.motionBlur &&
                                   (applyToAllEvents || this._hasObjTag);
            } else {
                this._motionBlur = ConfigManager.motionBlur && applyToAllEvents;
            }
        }
        // Altro: niente blur
        else {
            this._motionBlur = false;
        }
    };

    //--------------------------------------------------------------------------
    // Game_Event
    //--------------------------------------------------------------------------

    var _Game_Event_setupPage = Game_Event.prototype.setupPage;
    Game_Event.prototype.setupPage = function() {
        _Game_Event_setupPage.call(this);
        if (this.checkMotionBlurTag) {
            this.checkMotionBlurTag();
        }
    };

    //--------------------------------------------------------------------------
    // Spriteset_Map
    //--------------------------------------------------------------------------

    var _Spriteset_Map_createCharacters = Spriteset_Map.prototype.createCharacters;
    Spriteset_Map.prototype.createCharacters = function() {
        _Spriteset_Map_createCharacters.call(this);
        this._characterSprites.forEach(function(sprite) {
            if (sprite._character && sprite.updateMotionBlur) {
                sprite.updateMotionBlur();
            }
        });
    };

    Spriteset_Map.prototype.updateBlurSettings = function() {
        this._characterSprites.forEach(function(sprite) {
            if (sprite._character && sprite._character.checkMotionBlurTag) {
                sprite._character.checkMotionBlurTag();
                sprite.updateMotionBlur();
            }
        });
    };

    //--------------------------------------------------------------------------
    // Sprite_Character
    //--------------------------------------------------------------------------

    var _Sprite_Character_update = Sprite_Character.prototype.update;
    Sprite_Character.prototype.update = function() {
        _Sprite_Character_update.call(this);
        if (!this._character) return;

        this._character._wasMoving = this._character._isMoving;
        this._character._isMoving = this._character.isMoving();

        if (this._character._isMoving || this._character._wasMoving) {
            this.updateMotionBlur();
        } else {
            this.clearMotionBlur();
        }
    };

    Sprite_Character.prototype.clearMotionBlur = function() {
        if (this._motionBlurFilter && this._motionBlurFilter.uniforms) {
            this._motionBlurFilter.uniforms.blurDirection = [0, 0];
        }
    };

    Sprite_Character.prototype.updateMotionBlur = function() {
        if (!this._character) return;

        var screenWidth  = Graphics.boxWidth;
        var screenHeight = Graphics.boxHeight;
        var screenX = this._character.screenX();
        var screenY = this._character.screenY();

        // Solo se è nel viewport (+100px di margine)
        if (screenX >= -100 && screenY >= -100 &&
            screenX <= screenWidth + 100 &&
            screenY <= screenHeight + 100) {

            if (ConfigManager.motionBlur && this._character._motionBlur) {
                if (!this._motionBlurFilter) {
                    this._motionBlurFilter = this.createMotionBlurFilter();
                }

                if (this.filters) {
                    if (this.filters.indexOf(this._motionBlurFilter) < 0) {
                        this.filters.push(this._motionBlurFilter);
                    }
                } else {
                    this.filters = [this._motionBlurFilter];
                }
                this.updateBlurDirection();
            } else {
                if (this.filters && this._motionBlurFilter) {
                    var idx = this.filters.indexOf(this._motionBlurFilter);
                    if (idx >= 0) {
                        this.filters.splice(idx, 1);
                    }
                }
            }
        }
    };

    Sprite_Character.prototype.updateBlurDirection = function() {
        if (!this._motionBlurFilter || !this._motionBlurFilter.uniforms) return;
        var char = this._character;
        var deltaX = char._realX - char._lastPosition.x;
        var deltaY = char._realY - char._lastPosition.y;

        if (char.isMoving()) {
            char._lastPosition.x = char._realX;
            char._lastPosition.y = char._realY;

            var speed = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            var scaleFactor = Math.min(speed / 3, 1);

            var blurStrength = (char instanceof Game_Player)
                ? playerBlurStrength
                : 10 * scaleFactor;

            this._motionBlurFilter.uniforms.blurDirection = [
                deltaX * blurStrength,
                deltaY * blurStrength
            ];
        } else {
            this._motionBlurFilter.uniforms.blurDirection[0] *= 0.9;
            this._motionBlurFilter.uniforms.blurDirection[1] *= 0.9;
        }
    };

    Sprite_Character.prototype.createMotionBlurFilter = function() {
        var HVertex = [
            'attribute vec2 aVertexPosition;',
            'attribute vec2 aTextureCoord;',
            'uniform mat3 projectionMatrix;',
            'varying vec2 vTextureCoord;',
            'void main(void) {',
            '    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);',
            '    vTextureCoord = aTextureCoord;',
            '}'
        ].join('\n');

        var HFrag = [
            'varying vec2 vTextureCoord;',
            'uniform sampler2D uSampler;',
            'uniform vec2 blurDirection;',
            'const int samples = 5;',
            'void main(void) {',
            '    vec4 color = vec4(0.0);',
            '    vec2 offset = blurDirection / float(samples);',
            '    for (int i = 0; i < samples; i++) {',
            '        color += texture2D(uSampler, vTextureCoord + offset * (float(i) - float(samples) / 2.0));',
            '    }',
            '    color /= float(samples);',
            '    gl_FragColor = color;',
            '}'
        ].join('\n');

        var uniforms = {
            blurDirection: [0, 0]
        };

        return new PIXI.Filter(HVertex, HFrag, uniforms);
    };

    //--------------------------------------------------------------------------
    // Window_Options
    //--------------------------------------------------------------------------

    var _Window_Options_addGeneralOptions = Window_Options.prototype.addGeneralOptions;
    Window_Options.prototype.addGeneralOptions = function() {
        _Window_Options_addGeneralOptions.call(this);
        this.addCommand('Motion Blur', 'motionBlur');
    };

    //--------------------------------------------------------------------------
    // ConfigManager
    //--------------------------------------------------------------------------

    ConfigManager.motionBlur = true;

    var _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        var config = _ConfigManager_makeData.call(this);
        config.motionBlur = this.motionBlur;
        return config;
    };

    var _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        _ConfigManager_applyData.call(this, config);
        this.motionBlur = this.readFlag(config, 'motionBlur', true);
        this.onChangeMotionBlur();
    };

    ConfigManager.onChangeMotionBlur = function() {
        if ($gameMap && $gameMap.events) {
            $gameMap.events().forEach(function(event) {
                if (event.checkMotionBlurTag) {
                    event.checkMotionBlurTag();
                }
            });
        }
        var scene = SceneManager._scene;
        if (scene && scene._spriteset && scene._spriteset.updateBlurSettings) {
            scene._spriteset.updateBlurSettings();
        }
    };

})();
