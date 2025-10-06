/*
 * Akai MPD218 Controller Script for Mixxx
 * Author: Milkii
 * Description: Robust, clean implementation of MPD218 controller with simplified architecture
 *
 * this program is free software; you can redistribute it and/or
 * modify it under the terms of the gnu general public license
 * as published by the free software foundation; either version 2
 * of the license, or (at your option) any later version.
 */

// Main controller object - MUST be global for Mixxx to find it
var MPD218 = {};




// MARK: CONFIGURATION
// helper to access debug setting
MPD218.isDebugEnabled = function() {
    return MPD218.Config && MPD218.Config.system && MPD218.Config.system.debugEnabled;
};

// announce script loading
console.log("🎛️  LOADING AKAI MPD218 CONTROLLER SCRIPT (Robust Rewrite)");
console.log("✅ MPD218 SCRIPT LOADED - Clean implementation ready!");
console.log("📅 Script loaded at: " + new Date().toLocaleString());

/*
 CLEAN ARCHITECTURE OVERVIEW:
 - ControllerState: centralized state management
 - MIDIConstants: all MIDI-related constants
 - PadLayout: simple, direct pad to note mapping
 - EncoderMapping: clean encoder to function mapping  
 - LEDManager: dedicated LED control
 - MIDIHandler: centralized MIDI message routing
 - Controllers: individual handlers for different control types
*/


// MARK: MIDI CONSTANTS
MPD218.MIDI = {
    // status bytes
    NOTE_ON: 0x90,
    NOTE_OFF: 0x80, 
    CC: 0xB0,
    
    // channels (0-based for status byte calculation)
    PAD_CHANNEL: 9,      // channel 10 (0x99/0x89 for pads)
    BUTTON_CHANNEL: 8,   // channel 9 (0x98/0x88 for feature buttons)
    
    // NRPN control numbers
    NRPN_MSB: 99,
    NRPN_LSB: 98,
    NRPN_INCREMENT: 96,
    NRPN_DECREMENT: 97,
    
    // velocities
    LED_ON: 127,
    LED_OFF: 0
};


// MARK: HARDWARE CONSTANTS
MPD218.HARDWARE = {
    // physical pad layout (device as manufactured, no rotation)
    PAD_NOTES: {
        // top row (furthest from user)
        TOP_ROW: [0x30, 0x31, 0x32, 0x33],
        // second row
        SECOND_ROW: [0x2C, 0x2D, 0x2E, 0x2F],
        // third row
        THIRD_ROW: [0x28, 0x29, 0x2A, 0x2B],
        // bottom row (closest to user)
        BOTTOM_ROW: [0x24, 0x25, 0x26, 0x27]
    },
    
    // timing constants
    TIMING: {
        LED_UPDATE_DELAY: 50,           // ms delay for LED updates after pad press
        SHUTDOWN_ANIMATION_INTERVAL: 60, // ms between shutdown animation steps
        RECONFIGURE_DELAY: 100,         // ms delay before re-init after reconfigure
        SYNC_DELAY: 200,                // ms delay before syncing LEDs after animation
        STARTUP_ANIMATION_DURATION: 5000, // ms total startup animation time
        FLASH_TEST_DURATION: 1000,      // ms for LED flash test
        ANIMATION_GAP_DURATION: 300,    // ms fixed gap between flashes (all channels)
        ZOOM_FEEDBACK_DURATION: 4000    // ms to show zoom level on pads
    },
    
    // limits and ranges
    LIMITS: {
        MAX_HOTCUES: 16,                // maximum hotcue number
        MAX_ZOOM: 100.0,                 // maximum waveform zoom
        MIN_ZOOM: 1.0,                  // minimum waveform zoom
        DECK_COUNT: 4,                  // number of decks
        MAX_BANKS: 3,                   // number of available banks
        MIDI_CHANNELS: 16,              // total MIDI channels (0-15)
        MAX_ENCODER_SPEED: 1000         // maximum valid encoder speed multiplier
    }
};


// MARK: CONTROLLER STATE
MPD218.State = {
    initialized: false,
    currentBank: 1,
    timers: [],
    lastInitTime: null,
    
    // nrpn parameter tracking per channel
    nrpnParams: {},
    
    // zoom feedback state
    zoomFeedback: {
        active: false,
        deck: null,
        timer: null,
        lastLevel: null,
        currentPadStates: {}    // track which pads are currently lit for zoom feedback
    },
    
    // superknob feedback state
    superknobFeedback: {
        active: false,
        deck: null,
        timer: null,
        lastValue: null,
        currentPadStates: {}    // track which pads are currently lit for superknob feedback
    },
    
    // beatjump rate tracking (per deck)
    beatjumpRate: {
        lastTime: {},      // last increment time per deck
        multiplier: {}     // current jump multiplier per deck
    },
    
    // timer management utilities
    addTimer: function(timerId) {
        if (timerId && this.timers.indexOf(timerId) === -1) {
            this.timers.push(timerId);
        }
        return timerId;
    },
    
    removeTimer: function(timerId) {
        const index = this.timers.indexOf(timerId);
        if (index !== -1) {
            this.timers.splice(index, 1);
        }
    },
    
    cleanupAllTimers: function() {
        this.timers.forEach(id => {
            try {
                engine.stopTimer(id);
            } catch (e) {
                // timer might already be stopped, ignore errors
            }
        });
        this.timers = [];
        
        // cleanup zoom feedback timer separately
        if (this.zoomFeedback.timer) {
            try {
                engine.stopTimer(this.zoomFeedback.timer);
            } catch (e) {
                // ignore timer cleanup errors
            }
            this.zoomFeedback.timer = null;
        }
        
        // cleanup superknob feedback timer separately
        if (this.superknobFeedback.timer) {
            try {
                engine.stopTimer(this.superknobFeedback.timer);
            } catch (e) {
                // ignore timer cleanup errors
            }
            this.superknobFeedback.timer = null;
        }
    }
};


// MARK: CONFIGURATION
// configure your MPD218 controller settings here
MPD218.Config = {
    // LAYOUT SETTINGS
    layout: {
        // device physical orientation
        rotation: 90,                   // degrees: 0, 90, 180, or 270
        rotationDirection: "counterclockwise", // "clockwise" or "counterclockwise"
        
        // indexing direction from user perspective
        indexOrder: "ascending",        // "ascending" (0,1,2,3) or "descending" (3,2,1,0)
        
        // deck assignment from left-to-right (or top-to-bottom if rotated)
        deckOrder: [3, 1, 2, 4],        // standard deck order: 3,1,2,4
        // deckOrder: [1, 2, 3, 4],     // linear deck order: 1,2,3,4
        
        // feature row assignment (nearest to furthest from user)
        featureRows: {
            nearest: "bpmlock",         // bottom row (closest to user)
            second: "slip_enabled",     // second row
            third: "keylock",           // third row  
            furthest: "quantize"        // top row (furthest from user)
        }
    },
    
    // ENCODER SETTINGS
    encoders: {
        // zoom encoder speeds (multipliers)
        zoomFast: 1,                  // fast zoom encoder speed (coarse adjustment)
        zoomSlow: 0.1,                  // fine zoom encoder speed (precise adjustment)
        
        // beatgrid nudge sensitivity
        beatgridSpeed: 1.0,             // beatgrid adjustment speed
        
        // jogwheel sensitivity
        jogwheelSpeed: 1200.0,             // jogwheel scratch speed
        
        // scrub sensitivity (alternative to jogwheel without inertia)
        scrubSpeed: 0.001                  // direct playposition scrub speed
    },
    
    // ZOOM FEEDBACK OPTIONS
    zoomFeedback: {
        enabled: true,                  // enable/disable zoom level visualization
        duration: 4000,                 // ms to show zoom level
        reverseDirection: true         // reverse zoom encoder direction
    },
    
    // SYSTEM SETTINGS
    system: {
        debugEnabled: true              // enable debug logging (set false to reduce console output)
    },
    
    // INTERACTION SETTINGS (future expansion?)
    // interaction: {
    //     bankSwitchMode: "manual",    // "manual", "auto", "momentary"
    //     padSensitivity: "medium",    // "low", "medium", "high"
    //     doubleClickTime: 300         // ms for double-click actions
    // }
};


// MARK: PAD LAYOUT GENERATOR
// generates layouts based on configuration
MPD218.LayoutGenerator = {
    // base physical layout (device as manufactured, no rotation)
    PHYSICAL_GRID: [
        MPD218.HARDWARE.PAD_NOTES.TOP_ROW,    // top row
        MPD218.HARDWARE.PAD_NOTES.SECOND_ROW, // second row
        MPD218.HARDWARE.PAD_NOTES.THIRD_ROW,  // third row
        MPD218.HARDWARE.PAD_NOTES.BOTTOM_ROW  // bottom row
    ],
    
    // rotate grid by specified degrees and direction
    rotateGrid: function(grid, degrees, direction = "clockwise") {
        let rotated = grid.map(row => [...row]);  // deep copy
        
        const rotations = (degrees / 90) % 4;
        const clockwise = direction === "clockwise";
        
        for (let i = 0; i < rotations; i++) {
            const rows = rotated.length;
            const cols = rotated[0].length;
            const newGrid = [];
            
            if (clockwise) {
                // rotate 90 degrees clockwise: transpose then reverse each row
                for (let col = 0; col < cols; col++) {
                    const newRow = [];
                    for (let row = rows - 1; row >= 0; row--) {
                        newRow.push(rotated[row][col]);
                    }
                    newGrid.push(newRow);
                }
            } else {
                // rotate 90 degrees counterclockwise: transpose then reverse column order
                for (let col = cols - 1; col >= 0; col--) {
                    const newRow = [];
                    for (let row = 0; row < rows; row++) {
                        newRow.push(rotated[row][col]);
                    }
                    newGrid.push(newRow);
                }
            }
            rotated = newGrid;
        }
        
        return rotated;
    },
    
    // extract channels/decks as stacks of pads (rotation handles orientation preference)
    extractChannels: function(grid, indexOrder, deckOrder) {
        const channels = {};
        
        // always extract as columns since rotation handles row/column preference
        const numCols = grid[0].length;
        for (let col = 0; col < numCols; col++) {
            const column = grid.map(row => row[col]);
            const channelIndex = indexOrder === "ascending" ? col : (numCols - 1 - col);
            const deckNum = deckOrder[channelIndex];
            channels[deckNum] = column;
        }
        
        return channels;
    },
    
    // extract feature rows based on configuration
    extractFeatureRows: function(grid, featureConfig) {
        const features = {};
        const rowOrder = ["nearest", "second", "third", "furthest"];
        
        rowOrder.forEach((position, index) => {
            const featureType = featureConfig[position];
            if (featureType) {
                // bottom row (index 3) is nearest, top row (index 0) is furthest
                const gridRowIndex = grid.length - 1 - index;
                if (gridRowIndex >= 0 && gridRowIndex < grid.length) {
                    features[featureType] = [...grid[gridRowIndex]];
                }
            }
        });
        
        return features;
    },
    
    // generate complete layout from configuration
    generateLayout: function() {
        const config = MPD218.Config.layout;
        // start with physical grid and apply rotation
        const rotatedGrid = this.rotateGrid(
            this.PHYSICAL_GRID, 
            config.rotation, 
            config.rotationDirection
        );
        
        // extract channel assignments
        const channels = this.extractChannels(
            rotatedGrid, 
            config.indexOrder, 
            config.deckOrder
        );
        
        // extract feature rows
        const features = this.extractFeatureRows(rotatedGrid, config.featureRows);
        
        // create flat notes array (manual flattening for compatibility)
        const allNotes = [];
        for (let row = 0; row < rotatedGrid.length; row++) {
            for (let col = 0; col < rotatedGrid[row].length; col++) {
                allNotes.push(rotatedGrid[row][col]);
            }
        }
        
        return {
            NOTES: allNotes,
            CHANNELS: channels,
            FEATURES: features,
            GRID: rotatedGrid  // for debugging
        };
    }
};

// generate the actual layout used by the controller
MPD218.PadLayout = MPD218.LayoutGenerator.generateLayout();


// MARK: BANK MAPPING GENERATOR
// generates bank mappings based on current layout
MPD218.BankGenerator = {
    // generate feature bank (bank 1) from layout
    generateFeatureBank: function(layout) {
        const pads = {};
        
        // map each feature type to its corresponding channel pads
        // use the layout's channel assignments to ensure proper deck mapping
        Object.entries(layout.FEATURES).forEach(([featureType, notes]) => {
            notes.forEach((note, index) => {
                // find which deck this note belongs to by checking channel assignments
                let deckNum = index + 1; // fallback
                Object.entries(layout.CHANNELS).forEach(([channelNum, channelNotes]) => {
                    if (channelNotes.includes(note)) {
                        deckNum = parseInt(channelNum);
                    }
                });
                
                pads[note] = {
                    type: featureType,
                    deck: `[Channel${deckNum}]`
                };
            });
        });
        
        return {
            name: "Features",
            pads: pads
        };
    },
    
    // generate hotcue bank for specific channel
    generateHotcueBank: function(layout, channelNum) {
        const pads = {};
        let hotcueNum = 1;
        
        // assign hotcues to all pads for this channel
        layout.NOTES.forEach(note => {
            pads[note] = {
                type: "hotcue",
                deck: `[Channel${channelNum}]`,
                number: hotcueNum++
            };
        });
        
        return {
            name: `Channel ${channelNum} Hotcues`,
            pads: pads
        };
    },
    
    // generate all bank mappings
    generateAllBanks: function(layout = MPD218.PadLayout) {
        return {
            1: this.generateFeatureBank(layout),
            2: this.generateHotcueBank(layout, 1),
            3: this.generateHotcueBank(layout, 2)
        };
    }
};

// generate the actual bank mappings used by the controller
MPD218.BankMappings = MPD218.BankGenerator.generateAllBanks();

// MARK: ENCODER MAPPINGS
// generator for encoder mappings to avoid duplication
MPD218.generateEncoderMappings = function() {
    // get configuration
    const deckOrder = MPD218.Config.layout.deckOrder;
    const rotation = MPD218.Config.layout.rotation;
    const rotationDir = MPD218.Config.layout.rotationDirection;
    
    // physical encoder hardware layout (as manufactured, no rotation):
    // bank 1: MIDI ch 1,2,3,4,5,6 (left to right, top row)
    // bank 2: MIDI ch 7,8,9,10,11,12 (left to right, bottom row)
    // bank 3: MIDI ch 13,14,15,16,1,2 (left to right, reuses ch 1-2)
    
    // the 4 deck encoders are in a 2x2 grid:
    // bank 1 MIDI ch: 3,4 (back row), 5,6 (front row) - positions [0,1,2,3]
    // bank 2 MIDI ch: 7,8 (back row), 9,10 (front row) - positions [0,1,2,3]
    // bank 3 MIDI ch: 13,14 (back row), 15,16 (front row) - positions [0,1,2,3]
    
    // map 2x2 grid positions to deck indices (like pads)
    // grid positions: [back-left, back-right, front-left, front-right]
    // which map to deck order indices: [0, 3, 1, 2] (curved pattern)
    const gridToDeckIndex = [0, 3, 1, 2];
    
    // apply rotation to the grid positions
    let rotatedGridToDeckIndex;
    
    if (rotation === 90 && rotationDir === "counterclockwise") {
        // 90° CCW: back-left → front-left, back-right → back-left, front-right → back-right, front-left → front-right
        // original: [0,3,1,2] → rotated: [1,0,2,3]
        rotatedGridToDeckIndex = [gridToDeckIndex[2], gridToDeckIndex[0], gridToDeckIndex[3], gridToDeckIndex[1]];
    } else if (rotation === 0) {
        // no rotation
        rotatedGridToDeckIndex = gridToDeckIndex;
    } else if (rotation === 180) {
        // 180°: reverse all
        rotatedGridToDeckIndex = [gridToDeckIndex[3], gridToDeckIndex[2], gridToDeckIndex[1], gridToDeckIndex[0]];
    } else if (rotation === 270 || (rotation === 90 && rotationDir === "clockwise")) {
        // 90° CW
        rotatedGridToDeckIndex = [gridToDeckIndex[1], gridToDeckIndex[3], gridToDeckIndex[0], gridToDeckIndex[2]];
    } else {
        // fallback
        rotatedGridToDeckIndex = gridToDeckIndex;
    }
    
    // map encoder positions to actual decks
    // encoder positions: [back-left, back-right, front-left, front-right]
    // for bank 1: MIDI ch 3,4,5,6
    // for bank 2: MIDI ch 7,8,9,10
    // for bank 3: MIDI ch 13,14,15,16
    const encoderToDeck = rotatedGridToDeckIndex.map(idx => deckOrder[idx]);
    
    return {
        // bank 1 - superknob (respects rotation + deck order)
        1: { type: "zoom", deck: "[Channel1]", speed: MPD218.Config.encoders.zoomFast },
        2: { type: "zoom", deck: "[Channel1]", speed: MPD218.Config.encoders.zoomSlow },
        3: { type: "superknob", deck: `[Channel${encoderToDeck[0]}]`, speed: 4.0 },
        4: { type: "superknob", deck: `[Channel${encoderToDeck[1]}]`, speed: 4.0 },
        5: { type: "superknob", deck: `[Channel${encoderToDeck[2]}]`, speed: 4.0 },
        6: { type: "superknob", deck: `[Channel${encoderToDeck[3]}]`, speed: 4.0 },
        
        // bank 2 - beatjump (respects rotation + deck order)
        7: { type: "beatjump", deck: `[Channel${encoderToDeck[0]}]`, speed: 1.0 },
        8: { type: "beatjump", deck: `[Channel${encoderToDeck[1]}]`, speed: 1.0 },
        9: { type: "beatjump", deck: `[Channel${encoderToDeck[2]}]`, speed: 1.0 },
        10: { type: "beatjump", deck: `[Channel${encoderToDeck[3]}]`, speed: 1.0 },
        
        // bank 3 - beatgrid (respects rotation + deck order)
        13: { type: "beatgrid", deck: `[Channel${encoderToDeck[0]}]`, speed: MPD218.Config.encoders.beatgridSpeed },
        14: { type: "beatgrid", deck: `[Channel${encoderToDeck[1]}]`, speed: MPD218.Config.encoders.beatgridSpeed },
        15: { type: "beatgrid", deck: `[Channel${encoderToDeck[2]}]`, speed: MPD218.Config.encoders.beatgridSpeed },
        16: { type: "beatgrid", deck: `[Channel${encoderToDeck[3]}]`, speed: MPD218.Config.encoders.beatgridSpeed }
        // note: MIDI ch 1,2 (zoom encoders) remain as zoom on all banks
        
        // RETIRED: playposition scrub system (replaced by beatjump scrub in bank 2)
        // 13: { type: "scrub", deck: `[Channel${encoderToDeck[0]}]`, speed: MPD218.Config.encoders.scrubSpeed },
        // 14: { type: "scrub", deck: `[Channel${encoderToDeck[1]}]`, speed: MPD218.Config.encoders.scrubSpeed },
        // 15: { type: "scrub", deck: `[Channel${encoderToDeck[2]}]`, speed: MPD218.Config.encoders.scrubSpeed },
        // 16: { type: "scrub", deck: `[Channel${encoderToDeck[3]}]`, speed: MPD218.Config.encoders.scrubSpeed }
    };
};

// simple channel-to-function mapping for NRPN encoders
MPD218.EncoderMappings = MPD218.generateEncoderMappings();


// MARK: LED MANAGER
MPD218.LEDManager = {
    // turn LED on/off for a specific pad note
    setPadLED: function(note, state) {
        try {
            // use pad channel (9) for LED control
            const velocity = state ? MPD218.MIDI.LED_ON : MPD218.MIDI.LED_OFF; 
            const status = state ? (MPD218.MIDI.NOTE_ON + MPD218.MIDI.PAD_CHANNEL) : (MPD218.MIDI.NOTE_OFF + MPD218.MIDI.PAD_CHANNEL);
            midi.sendShortMsg(status, note, velocity);
            
            // also send CC message as backup for LED control
            if (state) {
                midi.sendShortMsg(MPD218.MIDI.CC + MPD218.MIDI.PAD_CHANNEL, note, MPD218.MIDI.LED_ON);
            }
            
            if (MPD218.isDebugEnabled()) {
                console.log(`LED ${state ? 'ON' : 'OFF'}: note 0x${note.toString(16)} status 0x${status.toString(16)} vel ${velocity}`);
            }
        } catch (e) {
            console.log(`❌ MIDI error setting LED for note 0x${note.toString(16)}: ${e.message}`);
        }
    },
    
    // turn all pad LEDs off
    allPadsOff: function() {
        MPD218.PadLayout.NOTES.forEach(note => {
            this.setPadLED(note, false);
        });
    },
    
    // sync feature LEDs with current engine state
    syncFeatureLEDs: function() {
        const currentBank = MPD218.BankMappings[MPD218.State.currentBank];
        if (!currentBank) {
            console.log("❌ no current bank found for LED sync");
            return;
        }
        
        if (!currentBank.pads) {
            console.log("❌ current bank has no pad mappings");
            return;
        }
        
        if (MPD218.isDebugEnabled()) {
            console.log(`🔄 syncing LEDs for bank ${MPD218.State.currentBank} (${currentBank.name})`);
        }
        
        Object.entries(currentBank.pads).forEach(([note, mapping]) => {
            const noteNum = parseInt(note);
            let state = false;
            
            if (mapping.type === "hotcue") {
                state = engine.getValue(mapping.deck, `hotcue_${mapping.number}_status`) > 0;
            } else {
                // feature toggle (bpmlock, keylock, etc.)
                state = engine.getValue(mapping.deck, mapping.type) > 0;
            }
            
            if (MPD218.isDebugEnabled()) {
                console.log(`LED sync: 0x${noteNum.toString(16)} (${mapping.deck} ${mapping.type}) = ${state}`);
            }
            
            this.setPadLED(noteNum, state);
        });
        
        if (MPD218.isDebugEnabled()) {
            console.log("✅ LED sync complete");
        }
    },
    
    // zoom level feedback on all 16 pads
    showZoomFeedback: function(deck, zoomLevel) {
        // calculate zoom level (0-15 for 16 pads) first to check if update needed
        const normalizedZoom = (zoomLevel - MPD218.HARDWARE.LIMITS.MIN_ZOOM) / 
                              (MPD218.HARDWARE.LIMITS.MAX_ZOOM - MPD218.HARDWARE.LIMITS.MIN_ZOOM);
        const zoomSteps = Math.floor(normalizedZoom * 16);
        const clampedSteps = Math.max(0, Math.min(15, zoomSteps));
        
        // if this is the same level as last time, just reset the timer to avoid flicker
        if (MPD218.State.zoomFeedback.active && 
            MPD218.State.zoomFeedback.lastLevel === clampedSteps &&
            MPD218.State.zoomFeedback.deck === deck) {
            
            // just reset the timeout without changing LEDs
            if (MPD218.State.zoomFeedback.timer) {
                engine.stopTimer(MPD218.State.zoomFeedback.timer);
            }
            const feedbackDuration = MPD218.Config.zoomFeedback.duration || MPD218.HARDWARE.TIMING.ZOOM_FEEDBACK_DURATION;
            MPD218.State.zoomFeedback.timer = engine.beginTimer(feedbackDuration, () => {
                this.endZoomFeedback();
            }, true);
            
            if (MPD218.isDebugEnabled()) {
                console.log(`🔍 zoom feedback: same level ${clampedSteps}, timer reset (no flicker)`);
            }
            return;
        }
        
        // clear any existing zoom feedback timer
        if (MPD218.State.zoomFeedback.timer) {
            engine.stopTimer(MPD218.State.zoomFeedback.timer);
        }
        
        // set zoom feedback state
        MPD218.State.zoomFeedback.active = true;
        MPD218.State.zoomFeedback.deck = deck;
        MPD218.State.zoomFeedback.lastLevel = clampedSteps;
        
        // get pad order from bottom-left to top-right
        const orderedPads = this.getBottomLeftToTopRightOrder();
        
        if (MPD218.isDebugEnabled()) {
            console.log(`🔍 zoom feedback: ${zoomLevel.toFixed(2)} -> ${clampedSteps + 1}/16 pads (${orderedPads.length} available)`);
        }
        
        // on first activation, clear all pads once to override feature LEDs
        if (Object.keys(MPD218.State.zoomFeedback.currentPadStates).length === 0) {
            this.allPadsOff();
        }
        
        // calculate which pads should be lit
        const targetPadStates = {};
        for (let i = 0; i <= clampedSteps && i < orderedPads.length; i++) {
            targetPadStates[orderedPads[i]] = true;
        }
        
        // get current zoom feedback pad states
        const currentStates = MPD218.State.zoomFeedback.currentPadStates;
        
        // differential update - only change pads that need to change
        // first, turn off pads that should no longer be lit
        Object.keys(currentStates).forEach(noteHex => {
            const note = parseInt(noteHex);
            if (currentStates[noteHex] && !targetPadStates[note]) {
                this.setPadLED(note, false);
                delete currentStates[noteHex];
                if (MPD218.isDebugEnabled()) {
                    console.log(`  turned off pad 0x${note.toString(16)}`);
                }
            }
        });
        
        // then, turn on pads that should now be lit
        Object.keys(targetPadStates).forEach(note => {
            const noteNum = parseInt(note);
            const noteHex = noteNum.toString();
            if (!currentStates[noteHex]) {
                this.setPadLED(noteNum, true);
                currentStates[noteHex] = true;
                if (MPD218.isDebugEnabled()) {
                    console.log(`  turned on pad 0x${noteNum.toString(16)}`);
                }
            }
        });
        
        // schedule return to normal after timeout
        const feedbackDuration = MPD218.Config.zoomFeedback.duration || MPD218.HARDWARE.TIMING.ZOOM_FEEDBACK_DURATION;
        MPD218.State.zoomFeedback.timer = engine.beginTimer(feedbackDuration, () => {
            this.endZoomFeedback();
        }, true);
    },
    
    // get pad order from bottom-left to top-right 
    getBottomLeftToTopRightOrder: function() {
        // this depends on the current rotation and layout
        const grid = MPD218.PadLayout.GRID;
        const orderedPads = [];
        
        // for bottom-left to top-right, we want:
        // bottom row left-to-right, then next row left-to-right, etc.
        for (let row = grid.length - 1; row >= 0; row--) {
            for (let col = 0; col < grid[row].length; col++) {
                orderedPads.push(grid[row][col]);
            }
        }
        
        return orderedPads;
    },
    
    // end zoom feedback and return to normal LEDs
    endZoomFeedback: function() {
        // clear zoom feedback pad states first (only turn off zoom pads)
        const currentStates = MPD218.State.zoomFeedback.currentPadStates;
        Object.keys(currentStates).forEach(noteHex => {
            const note = parseInt(noteHex);
            this.setPadLED(note, false);
        });
        
        // reset zoom feedback state
        MPD218.State.zoomFeedback.active = false;
        MPD218.State.zoomFeedback.deck = null;
        MPD218.State.zoomFeedback.timer = null;
        MPD218.State.zoomFeedback.lastLevel = null;
        MPD218.State.zoomFeedback.currentPadStates = {};
        
        // return to normal LED state
        this.syncFeatureLEDs();
        
        if (MPD218.isDebugEnabled()) {
            console.log("🔍 zoom feedback ended - returned to normal LEDs");
        }
    },
    
    // superknob feedback on all 16 pads (center-based visualization)
    showSuperknobFeedback: function(deck, superknobValue) {
        // superknob value: 0.0 = full lpf, 0.5 = neutral, 1.0 = full hpf
        // visualization: start with all 16 pads lit at center (0.5)
        // turn left (lpf): remove pads from top-right progressively
        // turn right (hpf): remove pads from bottom-left progressively
        
        // calculate how many pads to show (0-16)
        // at 0.5 (neutral): show all 16 pads
        // at 0.0 (full lpf): show 0 pads
        // at 1.0 (full hpf): show 0 pads
        const distanceFromCenter = Math.abs(superknobValue - 0.5);
        const normalizedDistance = distanceFromCenter * 2; // 0.0 to 1.0
        const padsToShow = Math.round((1.0 - normalizedDistance) * 16);
        const clampedPads = Math.max(0, Math.min(16, padsToShow));
        
        // if this is the same value as last time, just reset the timer
        if (MPD218.State.superknobFeedback.active && 
            MPD218.State.superknobFeedback.lastValue === superknobValue &&
            MPD218.State.superknobFeedback.deck === deck) {
            
            // just reset the timeout without changing LEDs
            if (MPD218.State.superknobFeedback.timer) {
                engine.stopTimer(MPD218.State.superknobFeedback.timer);
            }
            const feedbackDuration = MPD218.HARDWARE.TIMING.ZOOM_FEEDBACK_DURATION;
            MPD218.State.superknobFeedback.timer = engine.beginTimer(feedbackDuration, () => {
                this.endSuperknobFeedback();
            }, true);
            
            if (MPD218.isDebugEnabled()) {
                console.log(`🎚️ superknob feedback: same value ${superknobValue.toFixed(3)}, timer reset (no flicker)`);
            }
            return;
        }
        
        // clear any existing superknob feedback timer
        if (MPD218.State.superknobFeedback.timer) {
            engine.stopTimer(MPD218.State.superknobFeedback.timer);
        }
        
        // set superknob feedback state
        MPD218.State.superknobFeedback.active = true;
        MPD218.State.superknobFeedback.deck = deck;
        MPD218.State.superknobFeedback.lastValue = superknobValue;
        
        // get pad order
        // for lpf (< 0.5): remove from bottom-left (normal order)
        // for hpf (> 0.5): remove from top-right (reverse order)
        const grid = MPD218.PadLayout.GRID;
        let orderedPads = [];
        
        if (superknobValue < 0.5) {
            // lpf mode: start from center, remove from bottom-left
            // order: bottom-left to top-right (normal)
            for (let row = grid.length - 1; row >= 0; row--) {
                for (let col = 0; col < grid[row].length; col++) {
                    orderedPads.push(grid[row][col]);
                }
            }
        } else {
            // hpf mode: start from center, remove from top-right
            // order: top-right to bottom-left (reverse of normal)
            for (let row = 0; row < grid.length; row++) {
                for (let col = grid[row].length - 1; col >= 0; col--) {
                    orderedPads.push(grid[row][col]);
                }
            }
        }
        
        if (MPD218.isDebugEnabled()) {
            const mode = superknobValue < 0.5 ? 'lpf' : superknobValue > 0.5 ? 'hpf' : 'neutral';
            console.log(`🎚️ superknob feedback: ${superknobValue.toFixed(3)} (${mode}) -> ${clampedPads}/16 pads`);
        }
        
        // on first activation, clear all pads once
        if (Object.keys(MPD218.State.superknobFeedback.currentPadStates).length === 0) {
            this.allPadsOff();
        }
        
        // calculate which pads should be lit
        const targetPadStates = {};
        for (let i = 0; i < clampedPads && i < orderedPads.length; i++) {
            targetPadStates[orderedPads[i]] = true;
        }
        
        // get current superknob feedback pad states
        const currentStates = MPD218.State.superknobFeedback.currentPadStates;
        
        // differential update - only change pads that need to change
        // first, turn off pads that should no longer be lit
        Object.keys(currentStates).forEach(noteHex => {
            const note = parseInt(noteHex);
            if (currentStates[noteHex] && !targetPadStates[note]) {
                this.setPadLED(note, false);
                delete currentStates[noteHex];
                if (MPD218.isDebugEnabled()) {
                    console.log(`  turned off pad 0x${note.toString(16)}`);
                }
            }
        });
        
        // then, turn on pads that should now be lit
        Object.keys(targetPadStates).forEach(note => {
            const noteNum = parseInt(note);
            const noteHex = noteNum.toString();
            if (!currentStates[noteHex]) {
                this.setPadLED(noteNum, true);
                currentStates[noteHex] = true;
                if (MPD218.isDebugEnabled()) {
                    console.log(`  turned on pad 0x${noteNum.toString(16)}`);
                }
            }
        });
        
        // schedule return to normal after timeout
        const feedbackDuration = MPD218.HARDWARE.TIMING.ZOOM_FEEDBACK_DURATION;
        MPD218.State.superknobFeedback.timer = engine.beginTimer(feedbackDuration, () => {
            this.endSuperknobFeedback();
        }, true);
    },
    
    // end superknob feedback and return to normal LEDs
    endSuperknobFeedback: function() {
        // clear superknob feedback pad states first
        const currentStates = MPD218.State.superknobFeedback.currentPadStates;
        Object.keys(currentStates).forEach(noteHex => {
            const note = parseInt(noteHex);
            this.setPadLED(note, false);
        });
        
        // reset superknob feedback state
        MPD218.State.superknobFeedback.active = false;
        MPD218.State.superknobFeedback.deck = null;
        MPD218.State.superknobFeedback.timer = null;
        MPD218.State.superknobFeedback.lastValue = null;
        MPD218.State.superknobFeedback.currentPadStates = {};
        
        // return to normal LED state
        this.syncFeatureLEDs();
        
        if (MPD218.isDebugEnabled()) {
            console.log("🎚️ superknob feedback ended - returned to normal LEDs");
        }
    }
};



// MARK: CONTROL HANDLERS
MPD218.Controllers = {
    // handle pad presses
    handlePad: function(channel, control, value, status, group) {
        if (value === 0) return; // only handle press, not release
        
        // if zoom feedback is active, ignore pad presses (they're just visual)
        if (MPD218.State.zoomFeedback.active) {
            if (MPD218.isDebugEnabled()) {
                console.log("🔍 ignoring pad press during zoom feedback");
            }
            return;
        }
        
        // if superknob feedback is active, ignore pad presses (they're just visual)
        if (MPD218.State.superknobFeedback.active) {
            if (MPD218.isDebugEnabled()) {
                console.log("🎚️ ignoring pad press during superknob feedback");
            }
            return;
        }
        
        const currentBank = MPD218.BankMappings[MPD218.State.currentBank];
        if (!currentBank || !currentBank.pads) {
            if (MPD218.isDebugEnabled()) {
                console.log(`no valid bank mapping for bank ${MPD218.State.currentBank}`);
            }
            return;
        }
        
        const mapping = currentBank.pads[control];
        if (!mapping) {
            if (MPD218.isDebugEnabled()) {
                console.log(`no mapping for pad 0x${control.toString(16)} in bank ${MPD218.State.currentBank}`);
            }
            return;
        }
        
        if (MPD218.isDebugEnabled()) {
            console.log(`pad pressed: 0x${control.toString(16)} -> ${mapping.deck} ${mapping.type} ${mapping.number || ''}`);
        }
        
        switch (mapping.type) {
            case "hotcue":
                engine.setValue(mapping.deck, `hotcue_${mapping.number}_activate`, 1);
                break;
                
            case "bpmlock":
            case "keylock": 
            case "slip_enabled":
            case "quantize":
                const current = engine.getValue(mapping.deck, mapping.type);
                engine.setValue(mapping.deck, mapping.type, !current);
                break;
        }
        
        // immediately update LED to reflect the change
        engine.beginTimer(MPD218.HARDWARE.TIMING.LED_UPDATE_DELAY, () => {
            if (mapping.type === "hotcue") {
                const state = engine.getValue(mapping.deck, `hotcue_${mapping.number}_status`) > 0;
                MPD218.LEDManager.setPadLED(control, state);
            } else {
                const state = engine.getValue(mapping.deck, mapping.type) > 0;
                MPD218.LEDManager.setPadLED(control, state);
            }
        }, true);
    },
    
    // handle NRPN messages for encoders
    handleNRPN: {
        // track NRPN parameter selection (CC 99/98)
        setParameter: function(channel, msb, lsb) {
            const midiChannel = channel + 1;
            if (!MPD218.State.nrpnParams[midiChannel]) {
                MPD218.State.nrpnParams[midiChannel] = {};
            }
            MPD218.State.nrpnParams[midiChannel].param = (msb << 7) | lsb;
            
            if (MPD218.isDebugEnabled()) {
                console.log(`NRPN param set: ch${midiChannel} = 0x${MPD218.State.nrpnParams[midiChannel].param.toString(16)}`);
            }
        },
        
        // handle increment/decrement (CC 96/97)  
        processMotion: function(channel, increment, value) {
            const midiChannel = channel + 1;
            const mapping = MPD218.EncoderMappings[midiChannel];
            
            if (!mapping) {
                if (MPD218.isDebugEnabled()) {
                    console.log(`⚠️ no encoder mapping for MIDI channel ${midiChannel} (available: ${Object.keys(MPD218.EncoderMappings).join(',')})`);
                }
                return;
            }
            
            const direction = increment ? 1 : -1;
            const speed = value * (mapping.speed || 1.0);
            
            if (MPD218.isDebugEnabled()) {
                console.log(`encoder motion: ch${midiChannel} ${mapping.type} ${direction > 0 ? 'inc' : 'dec'} speed=${speed}`);
            }
            
            switch (mapping.type) {
                case "zoom":
                    this.handleZoom(mapping.deck, direction, speed);
                    break;
                    
                case "beatgrid":
                    this.handleBeatgrid(mapping.deck, direction, speed);
                    break;
                    
                case "jogwheel":
                    this.handleJogwheel(mapping.deck, direction, speed);
                    break;
                    
                // RETIRED: playposition scrub (replaced by beatjump scrub)
                // case "scrub":
                //     this.handleScrub(mapping.deck, direction, speed);
                //     break;
                    
                case "beatjump":
                    this.handleBeatJump(mapping.deck, direction, speed);
                    break;
                    
                case "superknob":
                    this.handleSuperknob(mapping.deck, direction, speed);
                    break;
            }
        },
        
        handleZoom: function(deck, direction, speed) {
            const current = engine.getValue(deck, "waveform_zoom");
            
            // apply direction reversal if configured
            const actualDirection = MPD218.Config.zoomFeedback.reverseDirection ? -direction : direction;
            
            // use multiplicative zoom for more natural feel across the range
            const zoomFactor = 1 + (actualDirection * speed * 0.05);
            let newZoom = current * zoomFactor;
            
            // clamp to configured range
            newZoom = Math.max(MPD218.HARDWARE.LIMITS.MIN_ZOOM, Math.min(MPD218.HARDWARE.LIMITS.MAX_ZOOM, newZoom));
            
            engine.setValue(deck, "waveform_zoom", newZoom);
            
            // show zoom level feedback on all pads (if enabled)
            if (MPD218.Config.zoomFeedback.enabled) {
                MPD218.LEDManager.showZoomFeedback(deck, newZoom);
            }
        },
        
        handleBeatgrid: function(deck, direction, speed) {
            // beatgrid nudge with speed multiplier
            const delta = direction * (speed || 1.0);
            engine.setValue(deck, "beats_translate_move", delta);
        },
        
        handleJogwheel: function(deck, direction, speed) {
            const delta = direction * speed * 0.01;
            engine.setValue(deck, "jog", delta);
        },
        
        // RETIRED: playposition scrub (replaced by beatjump scrub in bank 2)
        // handleScrub: function(deck, direction, speed) {
        //     // direct playposition control without inertia
        //     const current = engine.getValue(deck, "playposition");
        //     const delta = direction * speed;
        //     const newPos = Math.max(0, Math.min(1, current + delta));
        //     engine.setValue(deck, "playposition", newPos);
        // },
        
        handleSuperknob: function(deck, direction, speed) {
            // control the superknob (quick effect super1 parameter)
            // superknob ranges from 0.0 (full lpf) to 1.0 (full hpf), with 0.5 as neutral
            const deckNum = deck.match(/\d+/)[0];
            const control = `[QuickEffectRack1_${deck}]`;
            const current = engine.getValue(control, "super1");
            
            // adjust sensitivity - much smaller steps for fine control
            const delta = direction * 0.001 * speed;
            const newValue = Math.max(0, Math.min(1, current + delta));
            
            engine.setValue(control, "super1", newValue);
            
            // show superknob feedback on all pads
            MPD218.LEDManager.showSuperknobFeedback(deck, newValue);
            
            if (MPD218.isDebugEnabled()) {
                console.log(`superknob: ${deck} ${direction > 0 ? '+' : '-'} -> ${newValue.toFixed(3)} (${newValue < 0.5 ? 'lpf' : newValue > 0.5 ? 'hpf' : 'neutral'})`);
            }
        },
        
        handleBeatJump: function(deck, direction, speed) {
            // beat jump with rate-based multiplier
            // track time between increments to detect fast turning
            const now = Date.now();
            const rateState = MPD218.State.beatjumpRate;
            
            if (!rateState.lastTime[deck]) {
                rateState.lastTime[deck] = now;
                rateState.multiplier[deck] = 1;
            }
            
            const timeSinceLastIncrement = now - rateState.lastTime[deck];
            rateState.lastTime[deck] = now;
            
            // adjust multiplier based on increment rate
            // fast turning (< 50ms between increments) = increase multiplier
            // slow turning (> 150ms) = reset to 1
            // use powers of 2: 1, 2, 4, 8
            if (timeSinceLastIncrement < 50) {
                // very fast - jump to next power of 2
                if (rateState.multiplier[deck] < 2) {
                    rateState.multiplier[deck] = 2;
                } else if (rateState.multiplier[deck] < 4) {
                    rateState.multiplier[deck] = 4;
                } else {
                    rateState.multiplier[deck] = 8;
                }
            } else if (timeSinceLastIncrement < 100) {
                // medium fast - move to 2 if at 1
                if (rateState.multiplier[deck] < 2) {
                    rateState.multiplier[deck] = 2;
                }
            } else if (timeSinceLastIncrement > 150) {
                // slow - reset to 1 beat
                rateState.multiplier[deck] = 1;
            }
            // else maintain current multiplier
            
            const beatSize = rateState.multiplier[deck];
            
            // check if jump would go beyond track boundaries
            const currentPos = engine.getValue(deck, "playposition");
            const trackDuration = engine.getValue(deck, "duration");
            const currentTime = currentPos * trackDuration;
            const bpm = engine.getValue(deck, "bpm");
            
            if (bpm > 0 && trackDuration > 0) {
                // calculate jump distance in seconds
                const secondsPerBeat = 60.0 / bpm;
                const jumpSeconds = beatSize * secondsPerBeat * direction;
                const newTime = currentTime + jumpSeconds;
                
                // only execute if within track bounds
                if (newTime >= 0 && newTime <= trackDuration) {
                    engine.setValue(deck, "beatjump_size", beatSize);
                    const control = direction > 0 ? "beatjump_forward" : "beatjump_backward";
                    engine.setValue(deck, control, 1);
                } else {
                    // clamp to track boundaries
                    if (newTime < 0) {
                        engine.setValue(deck, "playposition", 0);
                    } else {
                        engine.setValue(deck, "playposition", 0.999); // just before end
                    }
                }
            } else {
                // fallback if no track info
                engine.setValue(deck, "beatjump_size", beatSize);
                const control = direction > 0 ? "beatjump_forward" : "beatjump_backward";
                engine.setValue(deck, control, 1);
            }
            
            if (MPD218.isDebugEnabled()) {
                console.log(`beatjump: ${deck} ${direction > 0 ? '+' : '-'}${beatSize} beats (rate: ${timeSinceLastIncrement}ms, mult: ${rateState.multiplier[deck].toFixed(1)})`);
            }
        }
    }
};

// MARK: MIDI HANDLERS
// individual MIDI message handlers that route to controllers
MPD218.MIDIHandlers = {
    // pad note messages (Channel 10: 0x99 note on, 0x89 note off)
    padPress: function(channel, control, value, status, group) {
        MPD218.Controllers.handlePad(channel, control, value, status, group);
    },
    
    // NRPN CC 99 (parameter MSB)
    nrpnMSB: function(channel, control, value, status, group) {
        const midiChannel = status & 0x0F;
        if (!MPD218.State.nrpnParams[midiChannel + 1]) {
            MPD218.State.nrpnParams[midiChannel + 1] = {};
        }
        MPD218.State.nrpnParams[midiChannel + 1].msb = value;
        
        if (MPD218.isDebugEnabled()) {
            console.log(`🎛️  NRPN MSB: channel ${midiChannel + 1}, value ${value}`);
        }
    },
    
    // NRPN CC 98 (parameter LSB)  
    nrpnLSB: function(channel, control, value, status, group) {
        const midiChannel = status & 0x0F;
        if (!MPD218.State.nrpnParams[midiChannel + 1]) {
            MPD218.State.nrpnParams[midiChannel + 1] = {};
        }
        const params = MPD218.State.nrpnParams[midiChannel + 1];
        params.lsb = value;
        
        // set parameter when both MSB and LSB received
        if (params.msb !== undefined) {
            MPD218.Controllers.handleNRPN.setParameter(midiChannel, params.msb, params.lsb);
        }
        
        if (MPD218.isDebugEnabled()) {
            console.log(`🎛️  NRPN LSB: channel ${midiChannel + 1}, value ${value}`);
        }
    },
    
    // NRPN CC 96 (data increment)
    nrpnIncrement: function(channel, control, value, status, group) {
        const midiChannel = status & 0x0F;
        if (MPD218.isDebugEnabled()) {
            console.log(`🔄 NRPN INCREMENT: channel ${midiChannel + 1}, value ${value}`);
        }
        MPD218.Controllers.handleNRPN.processMotion(midiChannel, true, value);
    },
    
    // NRPN CC 97 (data decrement)
    nrpnDecrement: function(channel, control, value, status, group) {
        const midiChannel = status & 0x0F;
        if (MPD218.isDebugEnabled()) {
            console.log(`🔄 NRPN DECREMENT: channel ${midiChannel + 1}, value ${value}`);
        }
        MPD218.Controllers.handleNRPN.processMotion(midiChannel, false, value);
    }
};

// MARK: ANIMATION MANAGER
MPD218.AnimationManager = {
    // startup animation with diagonal wave
    runStartupAnimation: function() {
        console.log("🔦 initializing LEDs...");
        MPD218.LEDManager.allPadsOff();
        
        console.log("✨ running diagonal wave startup animation...");
        const startPause = 100; // quarter-second pause before animation starts
        
        // pause before starting the animation
        const startTimer = engine.beginTimer(startPause, () => {
            const channelPads = this.prepareChannelPads();
            this.runDiagonalWave(channelPads);
        }, true);
        MPD218.State.addTimer(startTimer);
    },
    
    // prepare channel pad assignments with correct visual ordering
    prepareChannelPads: function() {
        const channelPads = {};
        Array.from({length: MPD218.HARDWARE.LIMITS.DECK_COUNT}, (_, i) => i + 1).forEach(channelNum => {
            const pads = MPD218.PadLayout.CHANNELS[channelNum] || [];
            
            // for the animation, we want index 0 to be closest to user
            // the layout generator produces pads in the order they appear in the grid
            // but we need to ensure they're ordered from closest to furthest from user
            
            // with 90° counterclockwise rotation and columns:
            // - original bottom row (0x24-0x27) becomes the rightmost column after rotation
            // - original top row (0x30-0x33) becomes the leftmost column after rotation
            // - so after rotation, moving down a column goes from left to right in original orientation
            // - which means we need to reverse the order if the generator gives us top-to-bottom
            
            let orderedPads = [...pads];
 
            // check the actual note values to determine physical order
            if (pads.length >= 2) {
                // if the first note is higher than the last, we need to reverse
                // because higher note numbers are typically at the top in the original grid
                if (pads[0] > pads[pads.length - 1]) {
                    orderedPads = [...pads].reverse();
                    if (MPD218.isDebugEnabled()) {
                        console.log(`Channel ${channelNum}: reversed pad order (was top-to-bottom, now bottom-to-top)`);
                    }
                }
            }
            
            channelPads[channelNum] = orderedPads;
            
            if (MPD218.isDebugEnabled()) {
                console.log(`Channel ${channelNum} pads (bottom to top): [${orderedPads.map(p => '0x' + p.toString(16)).join(',')}]`);
                console.log(`  Animation will use first ${channelNum} pads starting from closest to user`);
            }
        });
        
        return channelPads;
    },
    
    // diagonal wave animation from top-left to bottom-right
    runDiagonalWave: function(channelPads) {
        const grid = MPD218.PadLayout.GRID;
        const stepDuration = 83; // 83ms per diagonal step (increased speed by a third)
        const gapBetweenWaves = -stepDuration; // reverse wave starts one step before forward wave completes
        
        // identify which pads should remain on (channel number display)
        const channelDisplayPads = new Set();
        for (let channelNum = 1; channelNum <= MPD218.HARDWARE.LIMITS.DECK_COUNT; channelNum++) {
            const pads = channelPads[channelNum];
            if (pads && pads.length >= channelNum) {
                // first N pads of channel N should remain on
                for (let i = 0; i < channelNum; i++) {
                    channelDisplayPads.add(pads[i]);
                }
            }
        }
        
        if (MPD218.isDebugEnabled()) {
            console.log(`channel display pads that will remain on: [${Array.from(channelDisplayPads).map(p => '0x' + p.toString(16)).join(',')}]`);
        }
        
        // get diagonals from top-left to bottom-right
        const rows = grid.length;
        const cols = grid[0].length;
        const diagonals = [];
        
        // there are (rows + cols - 1) diagonals
        for (let d = 0; d < rows + cols - 1; d++) {
            const diagonal = [];
            for (let row = 0; row < rows; row++) {
                const col = d - row;
                if (col >= 0 && col < cols) {
                    diagonal.push(grid[row][col]);
                }
            }
            diagonals.push(diagonal);
        }
        
        if (MPD218.isDebugEnabled()) {
            console.log(`diagonal wave: ${diagonals.length} diagonals`);
            diagonals.forEach((diag, i) => {
                console.log(`  diagonal ${i}: [${diag.map(p => '0x' + p.toString(16)).join(',')}]`);
            });
        }
        
        // turn on pads diagonally
        let currentTime = 0;
        diagonals.forEach((diagonal, index) => {
            const onTimer = engine.beginTimer(currentTime, () => {
                diagonal.forEach(pad => {
                    MPD218.LEDManager.setPadLED(pad, true);
                });
                if (MPD218.isDebugEnabled()) {
                    console.log(`diagonal ${index} on: [${diagonal.map(p => '0x' + p.toString(16)).join(',')}]`);
                }
            }, true);
            MPD218.State.addTimer(onTimer);
            currentTime += stepDuration;
        });
        
        // wait for gap, then turn off pads (except channel display pads)
        const waveOnDuration = currentTime;
        const waveOffStart = waveOnDuration + gapBetweenWaves;
        currentTime = waveOffStart;
        
        diagonals.forEach((diagonal, index) => {
            const offTimer = engine.beginTimer(currentTime, () => {
                diagonal.forEach(pad => {
                    // only turn off if not part of channel display
                    if (!channelDisplayPads.has(pad)) {
                        MPD218.LEDManager.setPadLED(pad, false);
                    }
                });
                if (MPD218.isDebugEnabled()) {
                    const padsToTurnOff = diagonal.filter(p => !channelDisplayPads.has(p));
                    if (padsToTurnOff.length > 0) {
                        console.log(`diagonal ${index} off: [${padsToTurnOff.map(p => '0x' + p.toString(16)).join(',')}]`);
                    }
                }
            }, true);
            MPD218.State.addTimer(offTimer);
            currentTime += stepDuration;
        });
        
        // pause for another second at the end
        const endPause = 1000; // 1 second pause at end
        const allOffTimer = engine.beginTimer(currentTime + endPause, () => {
            MPD218.LEDManager.allPadsOff();
            if (MPD218.isDebugEnabled()) {
                console.log("all pads off for quarter second");
            }
        }, true);
        MPD218.State.addTimer(allOffTimer);
        
        // sync LEDs after quarter-second all-off period
        const allOffDuration = 250; // quarter second all off
        const syncTimer = engine.beginTimer(currentTime + endPause + allOffDuration, () => {
            MPD218.LEDManager.syncFeatureLEDs();
            console.log("✅ startup animation complete - LEDs synced");
        }, true);
        MPD218.State.addTimer(syncTimer);
    },
    
    // shutdown animation: sequential pad sweep
    runShutdownAnimation: function() {
        // shutdown animation works for actual shutdowns (shows on final exit)
        // script reloads happen too fast for the animation to complete
        console.log("✨ running shutdown animation...");
        
        if (!MPD218.PadLayout || !MPD218.PadLayout.NOTES) {
            // fallback if layout not available
            MPD218.LEDManager.allPadsOff();
            console.log("✅ MPD218 controller shutdown complete");
            return;
        }
        
        let currentPad = 0;
        const shutdownTimer = engine.beginTimer(MPD218.HARDWARE.TIMING.SHUTDOWN_ANIMATION_INTERVAL, () => {
            // turn off previous pad
            if (currentPad > 0) {
                MPD218.LEDManager.setPadLED(MPD218.PadLayout.NOTES[currentPad - 1], false);
            }
            
            // turn on current pad
            if (currentPad < MPD218.PadLayout.NOTES.length) {
                MPD218.LEDManager.setPadLED(MPD218.PadLayout.NOTES[currentPad], true);
                currentPad++;
            } else {
                // animation complete - turn off last pad
                MPD218.LEDManager.setPadLED(MPD218.PadLayout.NOTES[currentPad - 1], false);
                engine.stopTimer(shutdownTimer);
                MPD218.LEDManager.allPadsOff();
                console.log("✅ MPD218 controller shutdown complete");
            }
        }, false);
    }
};


// MARK: INITIALIZATION MANAGER
MPD218.InitManager = {
    // clean up previous state and prepare for initialization
    cleanup: function() {
        console.log("=".repeat(60));
        console.log("🎛️  INITIALIZING AKAI MPD218 CONTROLLER (Clean Rewrite)");
        console.log("=".repeat(60));
        
        // clear all timers safely
        MPD218.State.cleanupAllTimers();
    },
    
    // register all MIDI handlers
    registerHandlers: function() {
        this.registerPadHandlers();
        this.registerEncoderHandlers();
    },
    
    // register pad note handlers for all pad notes
    registerPadHandlers: function() {
        MPD218.PadLayout.NOTES.forEach(note => {
            const padStatus = MPD218.MIDI.NOTE_ON + MPD218.MIDI.PAD_CHANNEL;
            midi.makeInputHandler(padStatus, note, MPD218.MIDIHandlers.padPress);
            
            if (MPD218.isDebugEnabled()) {
                console.log(`registered pad handler: note 0x${note.toString(16)} status 0x${padStatus.toString(16)}`);
            }
        });
    },
    
    // register NRPN handlers for encoder channels
    registerEncoderHandlers: function() {
        // register for all MIDI channels to catch any encoder input
        // we'll filter in the handlers based on what we actually want to handle
        for (let channel = 0; channel < MPD218.HARDWARE.LIMITS.MIDI_CHANNELS; channel++) {
            const status = MPD218.MIDI.CC + channel;  // 0-based channel
            
            midi.makeInputHandler(status, MPD218.MIDI.NRPN_MSB, MPD218.MIDIHandlers.nrpnMSB);
            midi.makeInputHandler(status, MPD218.MIDI.NRPN_LSB, MPD218.MIDIHandlers.nrpnLSB);
            midi.makeInputHandler(status, MPD218.MIDI.NRPN_INCREMENT, MPD218.MIDIHandlers.nrpnIncrement);
            midi.makeInputHandler(status, MPD218.MIDI.NRPN_DECREMENT, MPD218.MIDIHandlers.nrpnDecrement);
        }
        
        if (MPD218.isDebugEnabled()) {
            console.log("registered NRPN handlers for all 16 MIDI channels");
            console.log("encoder mappings:", Object.keys(MPD218.EncoderMappings).join(','));
            console.log("🔍 turn encoders to see which channels they actually use");
        }
    },
    
    // connect engine callbacks for LED updates
    connectCallbacks: function() {
        const decks = Array.from({length: MPD218.HARDWARE.LIMITS.DECK_COUNT}, (_, i) => `[Channel${i + 1}]`);
        decks.forEach(deck => {
            // hotcue callbacks
            for (let i = 1; i <= MPD218.HARDWARE.LIMITS.MAX_HOTCUES; i++) {
                engine.makeConnection(deck, `hotcue_${i}_status`, MPD218.EngineCallbacks.hotcueChanged);
            }
            
            // feature callbacks
            engine.makeConnection(deck, "bpmlock", MPD218.EngineCallbacks.featureChanged);
            engine.makeConnection(deck, "keylock", MPD218.EngineCallbacks.featureChanged);
            engine.makeConnection(deck, "slip_enabled", MPD218.EngineCallbacks.featureChanged);
            engine.makeConnection(deck, "quantize", MPD218.EngineCallbacks.featureChanged);
        });
    },
    
    // finalize initialization
    finalizeInit: function() {
        MPD218.State.initialized = true;
        MPD218.State.lastInitTime = Date.now();
        console.log("✅ MPD218 controller initialization complete!");
    }
};


// MARK: UTILITY FUNCTIONS
// common utility functions to reduce code duplication
MPD218.Utils = {
    // find pad note that maps to specific deck and feature/hotcue
    findPadForMapping: function(deck, type, number = null) {
        const currentBank = MPD218.BankMappings[MPD218.State.currentBank];
        if (!currentBank || !currentBank.pads) return null;
        
        for (const [note, mapping] of Object.entries(currentBank.pads)) {
            if (mapping.deck === deck && mapping.type === type) {
                if (type === "hotcue" && mapping.number === number) {
                    return parseInt(note);
                } else if (type !== "hotcue") {
                    return parseInt(note);
                }
            }
        }
        return null;
    }
};


// MARK: ENGINE CALLBACKS
// callbacks for engine value changes to update LEDs
MPD218.EngineCallbacks = {
    // hotcue status changed
    hotcueChanged: function(value, group, control) {
        // extract hotcue number from control name (e.g., "hotcue_1_status" -> 1)
        const match = control.match(/hotcue_(\d+)_status/);
        if (!match) return;
        
        const hotcueNum = parseInt(match[1]);
        const padNote = MPD218.Utils.findPadForMapping(group, "hotcue", hotcueNum);
        
        if (padNote !== null) {
            MPD218.LEDManager.setPadLED(padNote, value > 0);
        }
    },
    
    // feature toggle changed (bpmlock, keylock, etc.)
    featureChanged: function(value, group, control) {
        if (MPD218.isDebugEnabled()) {
            console.log(`🔔 feature changed: ${group} ${control} = ${value}`);
        }
        
        const padNote = MPD218.Utils.findPadForMapping(group, control);
        
        if (padNote !== null) {
            if (MPD218.isDebugEnabled()) {
                console.log(`  → updating LED for pad 0x${padNote.toString(16)} to ${value > 0}`);
            }
            MPD218.LEDManager.setPadLED(padNote, value > 0);
        } else if (MPD218.isDebugEnabled()) {
            console.log(`  → no pad found for ${group} ${control} in bank ${MPD218.State.currentBank}`);
        }
    }
};

// MARK: INITIALIZATION
// clean initialization function - now just orchestrates the process
MPD218.init = function() {
    MPD218.InitManager.cleanup();
    MPD218.InitManager.registerHandlers();
    MPD218.InitManager.connectCallbacks();
    MPD218.AnimationManager.runStartupAnimation();
    MPD218.InitManager.finalizeInit();
};


// clean shutdown function  
MPD218.shutdown = function() {
    console.log("🎛️  shutting down MPD218 controller...");
    
    // mark as not initialized
    MPD218.State.initialized = false;
    
    // stop all existing timers safely
    MPD218.State.cleanupAllTimers();
    
    // run shutdown animation (works on final exit, not script reloads)
    MPD218.AnimationManager.runShutdownAnimation();
};


// MARK: UTILITY FUNCTIONS
// add some utility functions for testing and convenience
MPD218.test = function() {
    console.log("🧪 testing MPD218 controller...");
    console.log(`initialized: ${MPD218.State.initialized}`);
    console.log(`current bank: ${MPD218.State.currentBank}`);
    console.log(`debug enabled: ${MPD218.isDebugEnabled()}`);
    
    // flash all LEDs briefly
    console.log("flashing all LEDs...");
    MPD218.PadLayout.NOTES.forEach(note => {
        MPD218.LEDManager.setPadLED(note, true);
    });
    
    engine.beginTimer(MPD218.HARDWARE.TIMING.FLASH_TEST_DURATION, () => {
        MPD218.LEDManager.allPadsOff();
        console.log("✅ test complete");
    }, true);
    
    return "test executed - check console for details";
};

// test zoom feedback feature
MPD218.testZoomFeedback = function(zoomLevel = 8.0) {
    console.log(`🔍 testing zoom feedback at level ${zoomLevel}...`);
    MPD218.LEDManager.showZoomFeedback("[Channel1]", zoomLevel);
    return `zoom feedback test started - ${zoomLevel} displayed for ${MPD218.HARDWARE.TIMING.ZOOM_FEEDBACK_DURATION}ms`;
};

// test zoom feedback with different levels
MPD218.testZoomLevels = function() {
    const levels = [0.1, 1.0, 8.0, 32.0, 64.0];
    console.log("🔍 testing multiple zoom levels...");
    
    levels.forEach((level, index) => {
        engine.beginTimer(index * 2000, () => {
            console.log(`\n--- Testing zoom level ${level} ---`);
            MPD218.LEDManager.showZoomFeedback("[Channel1]", level);
        }, true);
    });
    
    return "zoom level progression test started";
};

// test smooth zoom transitions (no flicker)
MPD218.testSmoothZoom = function() {
    console.log("🔍 testing smooth zoom transitions (should not flicker)...");
    
    // rapid zoom changes to test differential updates
    const levels = [1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1];
    
    levels.forEach((level, index) => {
        engine.beginTimer(index * 200, () => {
            MPD218.LEDManager.showZoomFeedback("[Channel1]", level);
        }, true);
    });
    
    return "smooth zoom test started - watch for flicker-free updates";
};

// test superknob feedback feature
MPD218.testSuperknobFeedback = function(value = 0.5) {
    console.log(`🎚️ testing superknob feedback at value ${value}...`);
    MPD218.LEDManager.showSuperknobFeedback("[Channel1]", value);
    return `superknob feedback test started - ${value} displayed for ${MPD218.HARDWARE.TIMING.ZOOM_FEEDBACK_DURATION}ms`;
};

// test superknob feedback with different values
MPD218.testSuperknobLevels = function() {
    const values = [0.5, 0.25, 0.0, 0.25, 0.5, 0.75, 1.0, 0.75, 0.5];
    console.log("🎚️ testing multiple superknob values...");
    
    values.forEach((value, index) => {
        engine.beginTimer(index * 2000, () => {
            const mode = value < 0.5 ? 'lpf' : value > 0.5 ? 'hpf' : 'neutral';
            console.log(`\n--- testing superknob value ${value.toFixed(2)} (${mode}) ---`);
            MPD218.LEDManager.showSuperknobFeedback("[Channel1]", value);
        }, true);
    });
    
    return "superknob value progression test started";
};

// test smooth superknob transitions (no flicker)
MPD218.testSmoothSuperknob = function() {
    console.log("🎚️ testing smooth superknob transitions (should not flicker)...");
    
    // rapid superknob changes to test differential updates
    // sweep from neutral to lpf and back, then to hpf and back
    const values = [0.5, 0.4, 0.3, 0.2, 0.1, 0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5];
    
    values.forEach((value, index) => {
        engine.beginTimer(index * 200, () => {
            MPD218.LEDManager.showSuperknobFeedback("[Channel1]", value);
        }, true);
    });
    
    return "smooth superknob test started - watch for flicker-free updates";
};

// change bank (for testing)
MPD218.setBank = function(bankNum) {
    if (bankNum >= 1 && bankNum <= MPD218.HARDWARE.LIMITS.MAX_BANKS) {
        MPD218.State.currentBank = bankNum;
        console.log(`switched to bank ${bankNum}: ${MPD218.BankMappings[bankNum].name}`);
        MPD218.LEDManager.syncFeatureLEDs();
    } else {
        console.log(`bank must be 1-${MPD218.HARDWARE.LIMITS.MAX_BANKS}`);
    }
};

// toggle debug logging
MPD218.setDebug = function(enabled) {
    if (enabled !== undefined) {
        MPD218.Config.system.debugEnabled = enabled;
        console.log(`🐛 debug logging ${enabled ? 'ENABLED' : 'DISABLED'}`);
        return `debug ${enabled ? 'enabled' : 'disabled'}`;
    } else {
        // toggle current state
        MPD218.Config.system.debugEnabled = !MPD218.Config.system.debugEnabled;
        console.log(`🐛 debug logging ${MPD218.Config.system.debugEnabled ? 'ENABLED' : 'DISABLED'}`);
        return `debug ${MPD218.Config.system.debugEnabled ? 'enabled' : 'disabled'}`;
    }
};

// configure zoom feedback settings
MPD218.setZoomFeedback = function(enabled, duration, reverse) {
    if (enabled !== undefined) MPD218.Config.zoomFeedback.enabled = enabled;
    if (duration !== undefined) MPD218.Config.zoomFeedback.duration = duration;
    if (reverse !== undefined) MPD218.Config.zoomFeedback.reverseDirection = reverse;
    
    console.log(`🔍 zoom feedback updated: ${MPD218.Config.zoomFeedback.enabled ? 'enabled' : 'disabled'} (${MPD218.Config.zoomFeedback.duration}ms, reverse: ${MPD218.Config.zoomFeedback.reverseDirection})`);
    return "zoom feedback settings updated";
};

// configure encoder speeds
MPD218.setEncoderSpeeds = function(zoomFast, zoomSlow, beatgrid, jogwheel, scrub) {
    // validate inputs
    const isValidSpeed = (val) => val === undefined || (typeof val === 'number' && val > 0 && val < MPD218.HARDWARE.LIMITS.MAX_ENCODER_SPEED);
    
    if (!isValidSpeed(zoomFast) || !isValidSpeed(zoomSlow) || !isValidSpeed(beatgrid) || !isValidSpeed(jogwheel) || !isValidSpeed(scrub)) {
        console.log(`❌ encoder speeds must be positive numbers < ${MPD218.HARDWARE.LIMITS.MAX_ENCODER_SPEED}`);
        return "invalid encoder speed values";
    }
    
    if (zoomFast !== undefined) MPD218.Config.encoders.zoomFast = zoomFast;
    if (zoomSlow !== undefined) MPD218.Config.encoders.zoomSlow = zoomSlow;
    if (beatgrid !== undefined) MPD218.Config.encoders.beatgridSpeed = beatgrid;
    if (jogwheel !== undefined) MPD218.Config.encoders.jogwheelSpeed = jogwheel;
    if (scrub !== undefined) MPD218.Config.encoders.scrubSpeed = scrub;
    
    // regenerate encoder mappings with new speeds
    MPD218.EncoderMappings = MPD218.generateEncoderMappings();
    
    console.log(`🎛️  encoder speeds updated: zoom fast=${MPD218.Config.encoders.zoomFast}, slow=${MPD218.Config.encoders.zoomSlow}, beatgrid=${MPD218.Config.encoders.beatgridSpeed}, jogwheel=${MPD218.Config.encoders.jogwheelSpeed}, scrub=${MPD218.Config.encoders.scrubSpeed}`);
    return "encoder speeds updated";
};


// MARK: CONFIGURATION UTILITIES
// functions to help configure and reconfigure the layout

// reconfigure layout (for runtime changes)
MPD218.reconfigure = function() {
    console.log("🔧 reconfiguring layout...");
    
    // regenerate layout and mappings from current config
    MPD218.PadLayout = MPD218.LayoutGenerator.generateLayout();
    MPD218.BankMappings = MPD218.BankGenerator.generateAllBanks();
    
    console.log("✅ layout reconfigured");
    
    // if controller is initialized, re-register handlers and sync LEDs
    if (MPD218.State.initialized) {
        console.log("🔄 re-initializing with new layout...");
        MPD218.shutdown();
        engine.beginTimer(MPD218.HARDWARE.TIMING.RECONFIGURE_DELAY, () => {
            MPD218.init();
        }, true);
    }
    
    return MPD218.showLayout();
};

// show current layout configuration
MPD218.showLayout = function() {
    console.log("📋 current controller configuration:");
    console.log(`  rotation: ${MPD218.Config.layout.rotation}° ${MPD218.Config.layout.rotationDirection}`);
    console.log(`  index order: ${MPD218.Config.layout.indexOrder}`);
    console.log(`  deck order: [${MPD218.Config.layout.deckOrder.join(', ')}]`);
    console.log(`  features: ${Object.entries(MPD218.Config.layout.featureRows).map(([pos, feat]) => `${pos}=${feat}`).join(', ')}`);
    
    console.log("\n🎛️  encoder settings:");
    console.log(`  zoom speeds: fast=${MPD218.Config.encoders.zoomFast}, slow=${MPD218.Config.encoders.zoomSlow}`);
    console.log(`  other speeds: beatgrid=${MPD218.Config.encoders.beatgridSpeed}, jogwheel=${MPD218.Config.encoders.jogwheelSpeed}, scrub=${MPD218.Config.encoders.scrubSpeed}`);
    
    console.log("\n🔍 zoom feedback:");
    console.log(`  enabled: ${MPD218.Config.zoomFeedback.enabled}, duration: ${MPD218.Config.zoomFeedback.duration}ms, reverse: ${MPD218.Config.zoomFeedback.reverseDirection}`);
    
    console.log("\n🐛 system settings:");
    console.log(`  debug logging: ${MPD218.Config.system.debugEnabled ? 'ENABLED' : 'disabled'}`);
    
    console.log("\n🎛️  generated layout:");
    console.log("  channels:", Object.entries(MPD218.PadLayout.CHANNELS).map(([deck, notes]) => 
        `CH${deck}=[${notes.map(n => '0x' + n.toString(16)).join(',')}]`).join(' '));
    console.log("  features:", Object.entries(MPD218.PadLayout.FEATURES).map(([feat, notes]) => 
        `${feat}=[${notes.map(n => '0x' + n.toString(16)).join(',')}]`).join(' '));
    
    console.log("\n🎛️  encoder mappings (left to right):");
    const deckOrder = MPD218.Config.layout.deckOrder;
    console.log(`  bank 1 beatgrid: deck ${deckOrder[0]}, deck ${deckOrder[1]}, deck ${deckOrder[2]}, deck ${deckOrder[3]}`);
    console.log(`  bank 2 beatjump: deck ${deckOrder[0]}, deck ${deckOrder[1]}, deck ${deckOrder[2]}, deck ${deckOrder[3]}`);
    console.log(`  bank 3 superknob: deck ${deckOrder[0]}, deck ${deckOrder[1]}, deck ${deckOrder[2]}, deck ${deckOrder[3]}`);
    
    return "layout info logged to console";
};

// debug function to show pad mappings in current bank
MPD218.showBankMappings = function(bankNum = MPD218.State.currentBank) {
    const bank = MPD218.BankMappings[bankNum];
    if (!bank) {
        console.log(`❌ bank ${bankNum} not found`);
        return;
    }
    
    console.log(`🎛️  bank ${bankNum} (${bank.name}) pad mappings:`);
    Object.entries(bank.pads).forEach(([note, mapping]) => {
        const noteHex = '0x' + parseInt(note).toString(16);
        if (mapping.type === "hotcue") {
            console.log(`  ${noteHex} -> ${mapping.deck} hotcue ${mapping.number}`);
        } else {
            console.log(`  ${noteHex} -> ${mapping.deck} ${mapping.type}`);
        }
    });
    
    return "bank mappings logged to console";
};

// debug function to test different layout configurations
MPD218.testLayoutConfigs = function() {
    console.log("🧪 testing layout configuration redundancy...");
    
    const configs = [
        { name: "90° CCW (vertical strips)", rotation: 90, rotationDirection: "counterclockwise" },
        { name: "0° (horizontal strips)", rotation: 0, rotationDirection: "clockwise" },
        { name: "180° (inverted vertical)", rotation: 180, rotationDirection: "clockwise" },
        { name: "270° CW (alt vertical)", rotation: 270, rotationDirection: "clockwise" }
    ];
    
    const original = JSON.parse(JSON.stringify(MPD218.Config.layout));
    
    configs.forEach(config => {
        console.log(`\n--- testing: ${config.name} ---`);
        
        // temporarily apply config
        Object.assign(MPD218.Config.layout, config);
        const layout = MPD218.LayoutGenerator.generateLayout();
        
        console.log("channels:", Object.entries(layout.CHANNELS).map(([deck, notes]) => 
            `CH${deck}=[${notes.map(n => '0x' + n.toString(16)).join(',')}]`).join(' '));
        console.log("features:", Object.entries(layout.FEATURES).map(([feat, notes]) => 
            `${feat}=[${notes.map(n => '0x' + n.toString(16)).join(',')}]`).join(' '));
    });
    
    // restore original config
    Object.assign(MPD218.Config.layout, original);
    
    console.log("\n✅ layout config test complete");
    return "test results logged to console";
};

// MARK: FUTURE CONFIGURATION POSSIBILITIES
/*
🚀 POTENTIAL ADVANCED OPTIONS:

HARDWARE BEHAVIOR:
- ledBrightness: "dim"|"medium"|"full" - LED intensity control
- padSensitivity: "low"|"medium"|"high" - velocity sensitivity 
- doubleClickTime: 300 - ms for double-click detection
- holdTime: 500 - ms for pad hold actions
- encoderAcceleration: true - faster response on quick turns

ANIMATION & FEEDBACK:
- animationSpeed: "slow"|"normal"|"fast"|"off" - startup animation speed
- ledFeedback: "instant"|"delayed"|"off" - LED response timing
- animationStyle: "channels"|"sweep"|"flash"|"custom" - startup pattern
- shutdownStyle: "sweep"|"flash"|"fade"|"off" - shutdown pattern

LAYOUT & GROUPING:
- grouping: "4x4"|"2x8"|"8x2"|"linear" - pad arrangement strategy
- bankAutoSwitch: true - auto-switch banks based on deck focus
- mirrorLayout: true - mirror layout for left-handed users
- channelSpacing: 1 - gap between channel groups

INTERACTION MODES:
- bankSwitchMode: "manual"|"auto"|"momentary" - bank switching behavior
- padMode: "toggle"|"hold"|"momentary" - pad behavior mode
- contextSensitive: true - pads adapt to current Mixxx state
- shiftMode: "modifier"|"bank"|"layer" - shift key behavior

ADVANCED FEATURES:
- customActions: {...} - user-defined pad behaviors
- midiPassthrough: true - allow non-script MIDI through
- profileSwitching: true - multiple saved configurations
- smartLEDs: true - LEDs react to audio analysis
- crossfaderAssign: true - auto-assign channels to crossfader
*/

console.log("🎛️  MPD218 controller script loaded successfully!");
console.log("💡 use MPD218.showLayout() to see current configuration");
console.log("🔧 modify MPD218.Config at the top and call MPD218.reconfigure() to apply changes");
console.log("🔍 use MPD218.showBankMappings() to see current bank's pad-to-deck mappings");
console.log("🧪 use MPD218.testLayoutConfigs() to compare different orientations");
console.log("🔍 use MPD218.testZoomFeedback(level) to test zoom visualization");
console.log("🔍 use MPD218.testZoomLevels() to test zoom progression");
console.log("✨ use MPD218.testSmoothZoom() to test flicker-free updates");
console.log("🎚️ use MPD218.testSuperknobFeedback(value) to test superknob visualization");
console.log("🎚️ use MPD218.testSuperknobLevels() to test superknob progression");
console.log("✨ use MPD218.testSmoothSuperknob() to test flicker-free superknob updates");
console.log("⚙️  use MPD218.setZoomFeedback(enabled, duration, reverse) to configure zoom feedback");
console.log("🎛️  use MPD218.setEncoderSpeeds(zoomFast, zoomSlow, beatgrid, jogwheel) to configure speeds");
console.log("🐛 use MPD218.setDebug() to toggle debug logging");
