/*
 * Akai MPD218 Controller Script for Mixxx
 * Author: milkii
 * Description: Controller script for Akai MPD218 with hotcues, loops, and waveform navigation
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 */

// Main controller object - MUST be global for Mixxx to find it
var MPD218 = {};

// Announce script loading
console.log("🎛️  LOADING AKAI MPD218 CONTROLLER SCRIPT (milkii refactored version)");

// Add immediate verification that script file is being read
console.log("✅ MPD218 SCRIPT FILE LOADED - If you see this, the .js file is being read!");
console.log("📅 Script loaded at: " + new Date().toLocaleString());

/*///////////////////////////////////
//      USER VARIABLES BEGIN       //
///////////////////////////////////*/

// Enable debug logging (using default values since settings aren't configured yet)
MPD218.debugEnabled = true;  // Default to true for now

// Waveform zoom sensitivity for relative controls
// Lower values = finer control, higher values = coarser control
MPD218.zoomSensitivity = 0.3;

// Reverse zoom direction (set to true to flip zoom in/out)
MPD218.reverseZoom = true;  // false = normal (clockwise zooms in), true = reversed (clockwise zooms out)

// Beatgrid movement sensitivity
MPD218.beatgridSensitivity = 1.0;

// Enable shift functionality for hotcue deletion
MPD218.enableShift = true;

// Enable 14-bit NRPN input for high-resolution control
MPD218.enableNRPN = true;

/*///////////////////////////////////
//       USER VARIABLES END        //
///////////////////////////////////*/

// Controller state
MPD218.state = {
    padBank: 1,          // Current pad bank (1-4)
    currentDeck: "[Channel1]",
    shiftPressed: false,
    initialized: false
};

// MIDI constants
MPD218.midi = {
    channel: 0xB0,       // Main MIDI channel
    noteOn: 0x90,        // Note on messages for pads
    noteOff: 0x80,       // Note off messages
    // NRPN Control Change numbers
    nrpnMSB: 0x63,       // CC 99 - NRPN Parameter MSB
    nrpnLSB: 0x62,       // CC 98 - NRPN Parameter LSB
    nrpnIncrement: 0x60, // CC 96 - Data Increment
    nrpnDecrement: 0x61  // CC 97 - Data Decrement
};

// NRPN state tracking - per MIDI channel
MPD218.nrpnState = {
    channels: {
        1: { currentParameter: null, msb: 0, lsb: 0 }, // Deck 1 beatgrid
        2: { currentParameter: null, msb: 0, lsb: 0 }, // Deck 2 beatgrid
        3: { currentParameter: null, msb: 0, lsb: 0 }, // Deck 3 beatgrid
        4: { currentParameter: null, msb: 0, lsb: 0 }, // Deck 4 beatgrid
        5: { currentParameter: null, msb: 0, lsb: 0 }, // Quick zoom
        6: { currentParameter: null, msb: 0, lsb: 0 }, // General zoom
        9: { currentParameter: null, msb: 0, lsb: 0 }, // Deck 1 jogwheel
        11: { currentParameter: null, msb: 0, lsb: 0 }, // Deck 2 jogwheel
        12: { currentParameter: null, msb: 0, lsb: 0 }, // Deck 3 jogwheel
        13: { currentParameter: null, msb: 0, lsb: 0 }  // Deck 4 jogwheel
    }
};

// NRPN channel mappings - map MIDI channels to controls
MPD218.nrpnChannelMappings = {
    1: { deck: "[Channel1]", control: "beats_translate_move", speed: 1.0 },      // First knob
    2: { deck: "[Channel2]", control: "beats_translate_move", speed: 1.0 },      // Second knob
    3: { deck: "[Channel3]", control: "beats_translate_move", speed: 1.0 },      // Third knob  
    4: { deck: "[Channel4]", control: "beats_translate_move", speed: 1.0 },      // Fourth knob
    5: { deck: "[Channel1]", control: "waveform_zoom_nrpn", speed: 12.0 },       // Fast zoom (increased from 4.0)
    6: { deck: "[Channel1]", control: "waveform_zoom_nrpn", speed: 1.0 },        // Fine zoom
           9: { deck: "[Channel1]", control: "jogwheel_nrpn", speed: 3.0 },             // Jogwheel for Channel 1
       11: { deck: "[Channel2]", control: "jogwheel_nrpn", speed: 3.0 },            // Jogwheel for Channel 2
       12: { deck: "[Channel3]", control: "jogwheel_nrpn", speed: 3.0 },            // Jogwheel for Channel 3
       13: { deck: "[Channel4]", control: "jogwheel_nrpn", speed: 3.0 }             // Jogwheel for Channel 4
};

// Pad mappings for different banks
MPD218.padMappings = {
    1: { // Bank 1 - Channel 1 hotcues 1-8
        0x24: { deck: "[Channel1]", type: "hotcue", number: 1 },
        0x25: { deck: "[Channel1]", type: "hotcue", number: 2 },
        0x26: { deck: "[Channel1]", type: "hotcue", number: 3 },
        0x27: { deck: "[Channel1]", type: "hotcue", number: 4 },
        0x28: { deck: "[Channel1]", type: "hotcue", number: 5 },
        0x29: { deck: "[Channel1]", type: "hotcue", number: 6 },
        0x2A: { deck: "[Channel1]", type: "hotcue", number: 7 },
        0x2B: { deck: "[Channel1]", type: "hotcue", number: 8 }
    },
    2: { // Bank 2 - Channel 1 hotcues 9-16
        0x24: { deck: "[Channel1]", type: "hotcue", number: 9 },
        0x25: { deck: "[Channel1]", type: "hotcue", number: 10 },
        0x26: { deck: "[Channel1]", type: "hotcue", number: 11 },
        0x27: { deck: "[Channel1]", type: "hotcue", number: 12 },
        0x28: { deck: "[Channel1]", type: "hotcue", number: 13 },
        0x29: { deck: "[Channel1]", type: "hotcue", number: 14 },
        0x2A: { deck: "[Channel1]", type: "hotcue", number: 15 },
        0x2B: { deck: "[Channel1]", type: "hotcue", number: 16 }
    },
    3: { // Bank 3 - Channel 2 hotcues 1-8
        0x24: { deck: "[Channel2]", type: "hotcue", number: 1 },
        0x25: { deck: "[Channel2]", type: "hotcue", number: 2 },
        0x26: { deck: "[Channel2]", type: "hotcue", number: 3 },
        0x27: { deck: "[Channel2]", type: "hotcue", number: 4 },
        0x28: { deck: "[Channel2]", type: "hotcue", number: 5 },
        0x29: { deck: "[Channel2]", type: "hotcue", number: 6 },
        0x2A: { deck: "[Channel2]", type: "hotcue", number: 7 },
        0x2B: { deck: "[Channel2]", type: "hotcue", number: 8 }
    },
    4: { // Bank 4 - Loop controls
        0x24: { deck: "[Channel1]", type: "loop_in" },
        0x25: { deck: "[Channel1]", type: "loop_out" },
        0x26: { deck: "[Channel1]", type: "reloop_toggle" },
        0x27: { deck: "[Channel1]", type: "beatloop_4" },
        0x28: { deck: "[Channel2]", type: "loop_in" },
        0x29: { deck: "[Channel2]", type: "loop_out" },
        0x2A: { deck: "[Channel2]", type: "reloop_toggle" },
        0x2B: { deck: "[Channel2]", type: "beatloop_4" }
    }
};

// Knob mappings
MPD218.knobMappings = {
    // Beatgrid controls (relative encoders)
    0x03: { deck: "[Channel3]", control: "beats_translate_move", type: "relative" },
    0x09: { deck: "[Channel4]", control: "beats_translate_move", type: "relative" },
    0x0C: { deck: "[Channel1]", control: "beats_translate_move", type: "relative" },
    0x0D: { deck: "[Channel2]", control: "beats_translate_move", type: "relative" },
    
    // Waveform zoom controls (relative encoders)
    0x0E: { deck: "[Channel1]", control: "waveform_zoom", type: "relative", speed: 0.6 },
    0x0F: { deck: "[Channel1]", control: "waveform_zoom", type: "relative", speed: 0.2 },
    
    // Standard controls (absolute)
    0x16: { deck: "[Channel1]", control: "volume", type: "absolute" },
    0x17: { deck: "[Channel2]", control: "volume", type: "absolute" },
    0x18: { deck: "[Channel1]", control: "filterHigh", type: "absolute" },
    0x19: { deck: "[Channel2]", control: "filterHigh", type: "absolute" },
    0x1C: { deck: "[Master]", control: "crossfader", type: "absolute" },
    0x1D: { deck: "[Master]", control: "headVolume", type: "absolute" }
};

// Transport button mappings
MPD218.transportMappings = {
    0x75: { type: "play" },
    0x76: { type: "stop" },
    0x77: { type: "shift" }
};

// BPM Lock button mappings (channel 9)
// Bottom to top physical order: Deck 4, 2, 1, 3
MPD218.bpmLockMappings = {
    0x24: { deck: "[Channel4]" },  // Bottom button = Deck 4
    0x28: { deck: "[Channel2]" },  // Second button = Deck 2
    0x2C: { deck: "[Channel1]" },  // Third button = Deck 1
    0x30: { deck: "[Channel3]" }   // Top button = Deck 3
};

// Timer management for BPM lock LED refresh
MPD218.bpmLockTimers = {};

// Key Lock button mappings (channel 9)
// Second column: Deck 4, 2, 1, 3 (bottom to top)
MPD218.keyLockMappings = {
    0x25: { deck: "[Channel4]" },  // Bottom button = Deck 4
    0x29: { deck: "[Channel2]" },  // Second button = Deck 2
    0x2D: { deck: "[Channel1]" },  // Third button = Deck 1
    0x31: { deck: "[Channel3]" }   // Top button = Deck 3
};

// Timer management for Key lock LED refresh
MPD218.keyLockTimers = {};

// Slip Mode button mappings (channel 9)
// Third column: Deck 4, 2, 1, 3 (bottom to top)
MPD218.slipModeMappings = {
    0x26: { deck: "[Channel4]" },  // Bottom button = Deck 4
    0x2A: { deck: "[Channel2]" },  // Second button = Deck 2
    0x2E: { deck: "[Channel1]" },  // Third button = Deck 1
    0x32: { deck: "[Channel3]" }   // Top button = Deck 3
};

// Timer management for Slip mode LED refresh
MPD218.slipModeTimers = {};

// Quantization button mappings (channel 9)
// Fourth column: Deck 4, 2, 1, 3 (bottom to top)
MPD218.quantizationMappings = {
    0x27: { deck: "[Channel4]" },  // Bottom button = Deck 4
    0x2B: { deck: "[Channel2]" },  // Second button = Deck 2
    0x2F: { deck: "[Channel1]" },  // Third button = Deck 1
    0x33: { deck: "[Channel3]" }   // Top button = Deck 3
};

// Timer management for Quantization LED refresh
MPD218.quantizationTimers = {};

/*///////////////////////////////////
//        UTILITY FUNCTIONS        //
///////////////////////////////////*/

// File-based debug logging for troubleshooting
MPD218.fileLog = function(message) {
    // This creates a simple way to check if our script is running
    // by writing timestamps to help debug
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] MPD218: ${message}`);
};

MPD218.log = function(message) {
    if (MPD218.debugEnabled) {
        MPD218.fileLog(message);
    }
};

MPD218.updateLED = function(note, velocity) {
    midi.sendShortMsg(MPD218.midi.noteOn, note, velocity);
};

MPD218.turnOffAllLEDs = function() {
    // Turn off pad LEDs
    for (let note = 0x24; note <= 0x2B; note++) {
        MPD218.updateLED(note, 0);
    }
    
    // Turn off BPM lock button LEDs (channel 9)
    for (const buttonNote of Object.keys(MPD218.bpmLockMappings)) {
        MPD218.forceBPMLockLEDOff(buttonNote);
    }
    
    // Turn off Key lock button LEDs (channel 9)
    for (const buttonNote of Object.keys(MPD218.keyLockMappings)) {
        MPD218.forceKeyLockLEDOff(buttonNote);
    }
    
    // Turn off Slip mode button LEDs (channel 9)
    for (const buttonNote of Object.keys(MPD218.slipModeMappings)) {
        MPD218.forceSlipModeLEDOff(buttonNote);
    }
    
    // Turn off Quantization button LEDs (channel 9)
    for (const buttonNote of Object.keys(MPD218.quantizationMappings)) {
        MPD218.forceQuantizationLEDOff(buttonNote);
    }
};

MPD218.forceBPMLockLEDOff = function(buttonNote) {
    const note = parseInt(buttonNote);
    console.log(`🔦 Forcing BPM lock LED OFF for button 0x${note.toString(16)}`);
    
    // Try only the most basic method for now
    midi.sendShortMsg(0x88, note, 0);  // Note Off with velocity 0
};

MPD218.forceKeyLockLEDOff = function(buttonNote) {
    const note = parseInt(buttonNote);
    console.log(`🎵 Forcing Key lock LED OFF for button 0x${note.toString(16)}`);
    
    // Try only the most basic method for now
    midi.sendShortMsg(0x88, note, 0);  // Note Off with velocity 0
};

MPD218.forceSlipModeLEDOff = function(buttonNote) {
    const note = parseInt(buttonNote);
    console.log(`🎛️ Forcing Slip mode LED OFF for button 0x${note.toString(16)}`);
    
    // Try only the most basic method for now
    midi.sendShortMsg(0x88, note, 0);  // Note Off with velocity 0
};

MPD218.forceQuantizationLEDOff = function(buttonNote) {
    const note = parseInt(buttonNote);
    console.log(`🎯 Forcing Quantization LED OFF for button 0x${note.toString(16)}`);
    
    // Try only the most basic method for now
    midi.sendShortMsg(0x88, note, 0);  // Note Off with velocity 0
};

/*///////////////////////////////////
//         CONTROL HANDLERS        //
///////////////////////////////////*/

MPD218.handlePad = function(channel, control, value, status, group) {
    if (value === 0) return; // Only handle press, not release
    
    const mapping = MPD218.padMappings[MPD218.state.padBank]?.[control];
    if (!mapping) {
        MPD218.log(`No mapping for pad 0x${control.toString(16)} in bank ${MPD218.state.padBank}`);
        return;
    }
    
    MPD218.log(`Pad pressed: bank ${MPD218.state.padBank}, deck ${mapping.deck}, type ${mapping.type}`);
    
    switch (mapping.type) {
        case "hotcue":
            if (MPD218.state.shiftPressed && MPD218.enableShift) {
                engine.setValue(mapping.deck, `hotcue_${mapping.number}_clear`, 1);
            } else {
                engine.setValue(mapping.deck, `hotcue_${mapping.number}_activate`, 1);
            }
            break;
            
        case "loop_in":
            engine.setValue(mapping.deck, "loop_in", 1);
            break;
            
        case "loop_out":
            engine.setValue(mapping.deck, "loop_out", 1);
            break;
            
        case "reloop_toggle":
            engine.setValue(mapping.deck, "reloop_toggle", 1);
            break;
            
        case "beatloop_4":
            engine.setValue(mapping.deck, "beatloop_4_toggle", 1);
            break;
    }
};

MPD218.handleKnob = function(channel, control, value, status, group) {
    MPD218.log(`handleKnob called: channel=${channel}, control=0x${control.toString(16)}, value=${value}, status=0x${status.toString(16)}`);
    
    const mapping = MPD218.knobMappings[control];
    if (!mapping) {
        MPD218.log(`No mapping for knob 0x${control.toString(16)}`);
        return;
    }
    
    MPD218.log(`Found mapping: ${mapping.deck}.${mapping.control} (${mapping.type})`);
    
    let processedValue;
    
    switch (mapping.type) {
        case "relative":
            MPD218.log(`Processing relative control: ${mapping.control}`);
            if (mapping.control === "waveform_zoom") {
                MPD218.log(`Calling handleRelativeZoom with value=${value}, deck=${mapping.deck}, speed=${mapping.speed || MPD218.zoomSensitivity}`);
                MPD218.handleRelativeZoom(value, mapping.deck, mapping.speed || MPD218.zoomSensitivity);
            } else if (mapping.control === "beats_translate_move") {
                MPD218.log(`Calling handleBeatgridMove with value=${value}, deck=${mapping.deck}`);
                MPD218.handleBeatgridMove(value, mapping.deck);
            }
            return; // Don't call engine.setValue directly for relative controls
            
        case "absolute":
        default:
            processedValue = value / 127.0;
            MPD218.log(`Processing absolute control: ${mapping.deck}.${mapping.control} = ${processedValue}`);
            break;
    }
    
    MPD218.log(`Setting engine value: ${mapping.deck}.${mapping.control} = ${processedValue}`);
    engine.setValue(mapping.deck, mapping.control, processedValue);
};

MPD218.handleTransport = function(channel, control, value, status, group) {
    if (value === 0) return; // Only handle press
    
    const mapping = MPD218.transportMappings[control];
    if (!mapping) return;
    
    switch (mapping.type) {
        case "play":
            const isPlaying = engine.getValue(MPD218.state.currentDeck, "play");
            engine.setValue(MPD218.state.currentDeck, "play", !isPlaying);
            break;
            
        case "stop":
            engine.setValue(MPD218.state.currentDeck, "play", 0);
            break;
            
        case "shift":
            MPD218.state.shiftPressed = !MPD218.state.shiftPressed;
            MPD218.log(`Shift ${MPD218.state.shiftPressed ? "ON" : "OFF"}`);
            break;
    }
};

MPD218.handleBPMLock = function(channel, control, value, status, group) {
    console.log(`🔥 BPM Lock MIDI: status=0x${status.toString(16)}, control=0x${control.toString(16)}, value=${value}`);
    
    // Handle different MIDI message types:
    // 0x98 = Note On channel 9 with velocity > 0 (button press)
    // 0xD8 = Note On channel 9 with velocity 0 (button held) - IGNORE
    // 0x88 = Note Off channel 9 (button release) - IGNORE
    
    // Only respond to actual button presses (Note On with velocity > 0)
    if (status === 0x98 && value > 0) {
        console.log(`🔥 Valid button press detected with velocity ${value}`);
    } else {
        console.log(`🔥 Ignoring MIDI message - not a valid button press`);
        return;
    }
    
    const mapping = MPD218.bpmLockMappings[control];
    if (!mapping) {
        MPD218.log(`No BPM lock mapping for button 0x${control.toString(16)}`);
        return;
    }
    
    console.log(`🔥 Mapped to deck: ${mapping.deck}`);
    
    // Get current state
    const currentLock = engine.getValue(mapping.deck, "bpmlock");
    console.log(`🔥 Current BPM lock state: ${currentLock}`);
    
    // Toggle BPM lock for the mapped deck
    const newLock = !currentLock;
    console.log(`🔥 Setting BPM lock to: ${newLock}`);
    engine.setValue(mapping.deck, "bpmlock", newLock);
    
    // AGGRESSIVE LED CONTROL - send multiple commands to override button held messages
    console.log(`🔥 Aggressively updating LED for button 0x${control.toString(16)}`);
    if (newLock) {
        console.log(`🔥 Sending multiple Note On commands to force LED ON`);
        // Send multiple Note On commands with different velocities
        midi.sendShortMsg(0x98, control, 127); // Full velocity
        midi.sendShortMsg(0x98, control, 100); // High velocity
        midi.sendShortMsg(0x98, control, 127); // Full velocity again
        
        // Also try Control Change on channel 9
        midi.sendShortMsg(0xB8, control, 127); // CC on channel 9
    } else {
        console.log(`🔥 Sending Note Off for LED OFF`);
        midi.sendShortMsg(0x88, control, 0);
    }
    
    // Set up continuous LED refresh to override button held messages
    if (newLock) {
        console.log(`🔥 Setting up continuous LED refresh timer for ${mapping.deck}`);
        // Stop any existing timer for this deck
        if (MPD218.bpmLockTimers[mapping.deck]) {
            console.log(`🔥 Stopping existing timer for ${mapping.deck}`);
            engine.stopTimer(MPD218.bpmLockTimers[mapping.deck]);
        }
        
        // Create a timer that keeps sending LED ON commands
        const timerId = engine.beginTimer(200, function() {
            const currentState = engine.getValue(mapping.deck, "bpmlock");
            if (currentState) {
                // Only log occasionally to reduce spam
                if (Math.random() < 0.1) { // 10% chance to log
                    console.log(`🔥 Continuous LED refresh - sending Note On for ${mapping.deck}`);
                }
                midi.sendShortMsg(0x98, control, 127);
            } else {
                console.log(`🔥 BPM lock turned off - stopping LED refresh for ${mapping.deck}`);
                // Clean up timer reference
                delete MPD218.bpmLockTimers[mapping.deck];
                return false; // Stop the timer
            }
        }, false); // false = repeating timer
        
        // Store timer reference
        MPD218.bpmLockTimers[mapping.deck] = timerId;
        console.log(`🔥 Timer ${timerId} created for ${mapping.deck}`);
    } else {
        // Stop timer when BPM lock is turned OFF
        if (MPD218.bpmLockTimers[mapping.deck]) {
            console.log(`🔥 Stopping LED refresh timer for ${mapping.deck}`);
            engine.stopTimer(MPD218.bpmLockTimers[mapping.deck]);
            delete MPD218.bpmLockTimers[mapping.deck];
        }
    }
    
    // Verify the change
    engine.beginTimer(100, function() {
        const verifyLock = engine.getValue(mapping.deck, "bpmlock");
        console.log(`🔥 Verified BPM lock state after toggle: ${verifyLock}`);
        
        // Double-check LED again with full velocity
        if (verifyLock) {
            console.log(`🔥 Re-sending Note On with velocity 127 to ensure LED stays lit`);
            midi.sendShortMsg(0x98, control, 127);
        }
    }, true); // true = one-shot timer
    
    MPD218.log(`BPM Lock toggled for ${mapping.deck}: ${newLock ? "ON" : "OFF"}`);
};

MPD218.handleKeyLock = function(channel, control, value, status, group) {
    console.log(`🎵 Key Lock MIDI: status=0x${status.toString(16)}, control=0x${control.toString(16)}, value=${value}`);
    
    // Handle different MIDI message types:
    // 0x98 = Note On channel 9 with velocity > 0 (button press)
    // 0xD8 = Note On channel 9 with velocity 0 (button held) - IGNORE
    // 0x88 = Note Off channel 9 (button release) - IGNORE
    
    // Only respond to actual button presses (Note On with velocity > 0)
    if (status === 0x98 && value > 0) {
        console.log(`🎵 Valid button press detected with velocity ${value}`);
    } else {
        console.log(`🎵 Ignoring MIDI message - not a valid button press`);
        return;
    }
    
    const mapping = MPD218.keyLockMappings[control];
    if (!mapping) {
        MPD218.log(`No Key lock mapping for button 0x${control.toString(16)}`);
        return;
    }
    
    console.log(`🎵 Mapped to deck: ${mapping.deck}`);
    
    // Get current state
    const currentLock = engine.getValue(mapping.deck, "keylock");
    console.log(`🎵 Current Key lock state: ${currentLock}`);
    
    // Toggle Key lock for the mapped deck
    const newLock = !currentLock;
    console.log(`🎵 Setting Key lock to: ${newLock}`);
    engine.setValue(mapping.deck, "keylock", newLock);
    
    // AGGRESSIVE LED CONTROL - send multiple commands to override button held messages
    console.log(`🎵 Aggressively updating LED for button 0x${control.toString(16)}`);
    if (newLock) {
        console.log(`🎵 Sending multiple Note On commands to force LED ON`);
        // Send multiple Note On commands with different velocities
        midi.sendShortMsg(0x98, control, 127); // Full velocity
        midi.sendShortMsg(0x98, control, 100); // High velocity
        midi.sendShortMsg(0x98, control, 127); // Full velocity again
        
        // Also try Control Change on channel 9
        midi.sendShortMsg(0xB8, control, 127); // CC on channel 9
    } else {
        console.log(`🎵 Sending Note Off for LED OFF`);
        midi.sendShortMsg(0x88, control, 0);
    }
    
    // Set up continuous LED refresh to override button held messages
    if (newLock) {
        console.log(`🎵 Setting up continuous LED refresh timer for ${mapping.deck}`);
        // Stop any existing timer for this deck
        if (MPD218.keyLockTimers[mapping.deck]) {
            console.log(`🎵 Stopping existing timer for ${mapping.deck}`);
            engine.stopTimer(MPD218.keyLockTimers[mapping.deck]);
        }
        
        // Create a timer that keeps sending LED ON commands
        const timerId = engine.beginTimer(200, function() {
            const currentState = engine.getValue(mapping.deck, "keylock");
            if (currentState) {
                // Only log occasionally to reduce spam
                if (Math.random() < 0.1) { // 10% chance to log
                    console.log(`🎵 Continuous LED refresh - sending Note On for ${mapping.deck}`);
                }
                midi.sendShortMsg(0x98, control, 127);
            } else {
                console.log(`🎵 Key lock turned off - stopping LED refresh for ${mapping.deck}`);
                // Clean up timer reference
                delete MPD218.keyLockTimers[mapping.deck];
                return false; // Stop the timer
            }
        }, false); // false = repeating timer
        
        // Store timer reference
        MPD218.keyLockTimers[mapping.deck] = timerId;
        console.log(`🎵 Timer ${timerId} created for ${mapping.deck}`);
    } else {
        // Stop timer when Key lock is turned OFF
        if (MPD218.keyLockTimers[mapping.deck]) {
            console.log(`🎵 Stopping LED refresh timer for ${mapping.deck}`);
            engine.stopTimer(MPD218.keyLockTimers[mapping.deck]);
            delete MPD218.keyLockTimers[mapping.deck];
        }
    }
    
    // Verify the change
    engine.beginTimer(100, function() {
        const verifyLock = engine.getValue(mapping.deck, "keylock");
        console.log(`🎵 Verified Key lock state after toggle: ${verifyLock}`);
        
        // Double-check LED again with full velocity
        if (verifyLock) {
            console.log(`🎵 Re-sending Note On with velocity 127 to ensure LED stays lit`);
            midi.sendShortMsg(0x98, control, 127);
        }
    }, true); // true = one-shot timer
    
    MPD218.log(`Key Lock toggled for ${mapping.deck}: ${newLock ? "ON" : "OFF"}`);
};

MPD218.handleSlipMode = function(channel, control, value, status, group) {
    console.log(`🎛️ Slip Mode MIDI: status=0x${status.toString(16)}, control=0x${control.toString(16)}, value=${value}`);
    
    // Handle different MIDI message types:
    // 0x98 = Note On channel 9 with velocity > 0 (button press)
    // 0xD8 = Note On channel 9 with velocity 0 (button held) - IGNORE
    // 0x88 = Note Off channel 9 (button release) - IGNORE
    
    // Only respond to actual button presses (Note On with velocity > 0)
    if (status === 0x98 && value > 0) {
        console.log(`🎛️ Valid button press detected with velocity ${value}`);
    } else {
        console.log(`🎛️ Ignoring MIDI message - not a valid button press`);
        return;
    }
    
    const mapping = MPD218.slipModeMappings[control];
    if (!mapping) {
        MPD218.log(`No Slip mode mapping for button 0x${control.toString(16)}`);
        return;
    }
    
    console.log(`🎛️ Mapped to deck: ${mapping.deck}`);
    
    // Get current state
    const currentMode = engine.getValue(mapping.deck, "slip_enabled");
    console.log(`🎛️ Current Slip mode state: ${currentMode}`);
    
    // Toggle Slip mode for the mapped deck
    const newMode = !currentMode;
    console.log(`🎛️ Setting Slip mode to: ${newMode}`);
    engine.setValue(mapping.deck, "slip_enabled", newMode);
    
    // AGGRESSIVE LED CONTROL - send multiple commands to override button held messages
    console.log(`🎛️ Aggressively updating LED for button 0x${control.toString(16)}`);
    if (newMode) {
        console.log(`🎛️ Sending multiple Note On commands to force LED ON`);
        // Send multiple Note On commands with different velocities
        midi.sendShortMsg(0x98, control, 127); // Full velocity
        midi.sendShortMsg(0x98, control, 100); // High velocity
        midi.sendShortMsg(0x98, control, 127); // Full velocity again
        
        // Also try Control Change on channel 9
        midi.sendShortMsg(0xB8, control, 127); // CC on channel 9
    } else {
        console.log(`🎛️ Sending Note Off for LED OFF`);
        midi.sendShortMsg(0x88, control, 0);
    }
    
    // Set up continuous LED refresh to override button held messages
    if (newMode) {
        console.log(`🎛️ Setting up continuous LED refresh timer for ${mapping.deck}`);
        // Stop any existing timer for this deck
        if (MPD218.slipModeTimers[mapping.deck]) {
            console.log(`🎛️ Stopping existing timer for ${mapping.deck}`);
            engine.stopTimer(MPD218.slipModeTimers[mapping.deck]);
        }
        
        // Create a timer that keeps sending LED ON commands
        const timerId = engine.beginTimer(200, function() {
            const currentState = engine.getValue(mapping.deck, "slip_enabled");
            if (currentState) {
                // Only log occasionally to reduce spam
                if (Math.random() < 0.1) { // 10% chance to log
                    console.log(`🎛️ Continuous LED refresh - sending Note On for ${mapping.deck}`);
                }
                midi.sendShortMsg(0x98, control, 127);
            } else {
                console.log(`🎛️ Slip mode turned off - stopping LED refresh for ${mapping.deck}`);
                // Clean up timer reference
                delete MPD218.slipModeTimers[mapping.deck];
                return false; // Stop the timer
            }
        }, false); // false = repeating timer
        
        // Store timer reference
        MPD218.slipModeTimers[mapping.deck] = timerId;
        console.log(`🎛️ Timer ${timerId} created for ${mapping.deck}`);
    } else {
        // Stop timer when Slip mode is turned OFF
        if (MPD218.slipModeTimers[mapping.deck]) {
            console.log(`🎛️ Stopping LED refresh timer for ${mapping.deck}`);
            engine.stopTimer(MPD218.slipModeTimers[mapping.deck]);
            delete MPD218.slipModeTimers[mapping.deck];
        }
    }
    
    // Verify the change
    engine.beginTimer(100, function() {
        const verifyMode = engine.getValue(mapping.deck, "slip_enabled");
        console.log(`🎛️ Verified Slip mode state after toggle: ${verifyMode}`);
        
        // Double-check LED again with full velocity
        if (verifyMode) {
            console.log(`🎛️ Re-sending Note On with velocity 127 to ensure LED stays lit`);
            midi.sendShortMsg(0x98, control, 127);
        }
    }, true); // true = one-shot timer
    
    MPD218.log(`Slip Mode toggled for ${mapping.deck}: ${newMode ? "ON" : "OFF"}`);
};

MPD218.handleQuantization = function(channel, control, value, status, group) {
    console.log(`🎯 Quantization MIDI: status=0x${status.toString(16)}, control=0x${control.toString(16)}, value=${value}`);
    
    // Handle different MIDI message types:
    // 0x98 = Note On channel 9 with velocity > 0 (button press)
    // 0xD8 = Note On channel 9 with velocity 0 (button held) - IGNORE
    // 0x88 = Note Off channel 9 (button release) - IGNORE
    
    // Only respond to actual button presses (Note On with velocity > 0)
    if (status === 0x98 && value > 0) {
        console.log(`🎯 Valid button press detected with velocity ${value}`);
    } else {
        console.log(`🎯 Ignoring MIDI message - not a valid button press`);
        return;
    }
    
    const mapping = MPD218.quantizationMappings[control];
    if (!mapping) {
        MPD218.log(`No Quantization mapping for button 0x${control.toString(16)}`);
        return;
    }
    
    console.log(`🎯 Mapped to deck: ${mapping.deck}`);
    
    // Get current state
    const currentQuant = engine.getValue(mapping.deck, "quantize");
    console.log(`🎯 Current Quantization state: ${currentQuant}`);
    
    // Toggle Quantization for the mapped deck
    const newQuant = !currentQuant;
    console.log(`🎯 Setting Quantization to: ${newQuant}`);
    engine.setValue(mapping.deck, "quantize", newQuant);
    
    // AGGRESSIVE LED CONTROL - send multiple commands to override button held messages
    console.log(`🎯 Aggressively updating LED for button 0x${control.toString(16)}`);
    if (newQuant) {
        console.log(`🎯 Sending multiple Note On commands to force LED ON`);
        // Send multiple Note On commands with different velocities
        midi.sendShortMsg(0x98, control, 127); // Full velocity
        midi.sendShortMsg(0x98, control, 100); // High velocity
        midi.sendShortMsg(0x98, control, 127); // Full velocity again
        
        // Also try Control Change on channel 9
        midi.sendShortMsg(0xB8, control, 127); // CC on channel 9
    } else {
        console.log(`🎯 Sending Note Off for LED OFF`);
        midi.sendShortMsg(0x88, control, 0);
    }
    
    // Set up continuous LED refresh to override button held messages
    if (newQuant) {
        console.log(`🎯 Setting up continuous LED refresh timer for ${mapping.deck}`);
        // Stop any existing timer for this deck
        if (MPD218.quantizationTimers[mapping.deck]) {
            console.log(`🎯 Stopping existing timer for ${mapping.deck}`);
            engine.stopTimer(MPD218.quantizationTimers[mapping.deck]);
        }
        
        // Create a timer that keeps sending LED ON commands
        const timerId = engine.beginTimer(200, function() {
            const currentState = engine.getValue(mapping.deck, "quantize");
            if (currentState) {
                // Only log occasionally to reduce spam
                if (Math.random() < 0.1) { // 10% chance to log
                    console.log(`🎯 Continuous LED refresh - sending Note On for ${mapping.deck}`);
                }
                midi.sendShortMsg(0x98, control, 127);
            } else {
                console.log(`🎯 Quantization turned off - stopping LED refresh for ${mapping.deck}`);
                // Clean up timer reference
                delete MPD218.quantizationTimers[mapping.deck];
                return false; // Stop the timer
            }
        }, false); // false = repeating timer
        
        // Store timer reference
        MPD218.quantizationTimers[mapping.deck] = timerId;
        console.log(`🎯 Timer ${timerId} created for ${mapping.deck}`);
    } else {
        // Stop timer when Quantization is turned OFF
        if (MPD218.quantizationTimers[mapping.deck]) {
            console.log(`🎯 Stopping LED refresh timer for ${mapping.deck}`);
            engine.stopTimer(MPD218.quantizationTimers[mapping.deck]);
            delete MPD218.quantizationTimers[mapping.deck];
        }
    }
    
    // Verify the change
    engine.beginTimer(100, function() {
        const verifyQuant = engine.getValue(mapping.deck, "quantize");
        console.log(`🎯 Verified Quantization state after toggle: ${verifyQuant}`);
        
        // Double-check LED again with full velocity
        if (verifyQuant) {
            console.log(`🎯 Re-sending Note On with velocity 127 to ensure LED stays lit`);
            midi.sendShortMsg(0x98, control, 127);
        }
    }, true); // true = one-shot timer
    
    MPD218.log(`Quantization toggled for ${mapping.deck}: ${newQuant ? "ON" : "OFF"}`);
};

MPD218.handleRelativeZoom = function(value, deck, speed) {
    const currentZoom = engine.getValue(deck, "waveform_zoom");
    let newZoom = currentZoom;
    
    if (value >= 0x01 && value <= 0x3F) {
        // Clockwise - zoom in (lower values)
        const zoomStep = value * speed;
        newZoom = Math.max(0.1, currentZoom - zoomStep);
    } else if (value >= 0x41 && value <= 0x7F) {
        // Counter-clockwise - zoom out (higher values)
        const turnSpeed = (128 - value);
        const zoomStep = turnSpeed * speed;
        newZoom = Math.min(64.0, currentZoom + zoomStep);
    }
    
    if (newZoom !== currentZoom) {
        engine.setValue(deck, "waveform_zoom", newZoom);
    }
};

MPD218.handleBeatgridMove = function(value, deck) {
    if (value >= 0x01 && value <= 0x3F) {
        // Clockwise - move later
        engine.setValue(deck, "beats_translate_move", 1);
    } else if (value >= 0x41 && value <= 0x7F) {
        // Counter-clockwise - move earlier
        engine.setValue(deck, "beats_translate_move", -1);
    }
};

/*///////////////////////////////////
//        NRPN HANDLERS            //
///////////////////////////////////*/

// Handle NRPN Parameter Number MSB (CC 99)
MPD218.handleNRPNMSB = function(channel, control, value, status, group) {
    console.log(`🚨 NRPN MSB HANDLER CALLED! status=0x${status.toString(16)}, control=0x${control.toString(16)}, value=${value}`);
    console.log(`🔧 NRPN MSB: status=0x${status.toString(16)}, control=0x${control.toString(16)}, value=${value}`);
    
    if (!MPD218.enableNRPN) return;
    
    const midiChannel = (status & 0x0F) + 1;
    const channelState = MPD218.nrpnState.channels[midiChannel];
    
    if (!channelState) {
        console.log(`❌ Unknown MIDI channel ${midiChannel} for NRPN MSB`);
        MPD218.log(`Unknown MIDI channel ${midiChannel} for NRPN MSB`);
        return;
    }
    
    channelState.msb = value;
    channelState.currentParameter = (channelState.msb << 7) | channelState.lsb;
    
    // Check for NRPN null/reset (127,127)
    if (channelState.msb === 127 && channelState.lsb === 127) {
        channelState.currentParameter = null;
        console.log(`🔄 NRPN RESET - Ch${midiChannel} parameter cleared`);
        MPD218.log(`NRPN RESET - Ch${midiChannel} parameter cleared`);
        return;
    }
    
    console.log(`📝 Ch${midiChannel} NRPN MSB set to ${value}, parameter: ${channelState.currentParameter}`);
    MPD218.log(`Ch${midiChannel} NRPN MSB set to ${value}, parameter: ${channelState.currentParameter}`);
};

// Handle NRPN Parameter Number LSB (CC 98)
MPD218.handleNRPNLSB = function(channel, control, value, status, group) {
    console.log(`🚨 NRPN LSB HANDLER CALLED! status=0x${status.toString(16)}, control=0x${control.toString(16)}, value=${value}`);
    console.log(`🔧 NRPN LSB: status=0x${status.toString(16)}, control=0x${control.toString(16)}, value=${value}`);
    
    if (!MPD218.enableNRPN) return;
    
    const midiChannel = (status & 0x0F) + 1;
    const channelState = MPD218.nrpnState.channels[midiChannel];
    
    if (!channelState) {
        console.log(`❌ Unknown MIDI channel ${midiChannel} for NRPN LSB`);
        MPD218.log(`Unknown MIDI channel ${midiChannel} for NRPN LSB`);
        return;
    }
    
    channelState.lsb = value;
    channelState.currentParameter = (channelState.msb << 7) | channelState.lsb;
    
    // Check for NRPN null/reset (127,127)
    if (channelState.msb === 127 && channelState.lsb === 127) {
        channelState.currentParameter = null;
        console.log(`🔄 NRPN RESET - Ch${midiChannel} parameter cleared`);
        MPD218.log(`NRPN RESET - Ch${midiChannel} parameter cleared`);
        return;
    }
    
    console.log(`📝 Ch${midiChannel} NRPN LSB set to ${value}, parameter: ${channelState.currentParameter}`);
    MPD218.log(`Ch${midiChannel} NRPN LSB set to ${value}, parameter: ${channelState.currentParameter}`);
};

// Handle NRPN Data Increment (CC 96)
MPD218.handleNRPNIncrement = function(channel, control, value, status, group) {
    console.log(`🔧 NRPN INCREMENT: status=0x${status.toString(16)}, control=0x${control.toString(16)}, value=${value}`);
    
    if (!MPD218.enableNRPN) return;
    
    const midiChannel = (status & 0x0F) + 1;
    const channelState = MPD218.nrpnState.channels[midiChannel];
    
    console.log(`🔧 NRPN Increment received - Ch${midiChannel}, value: ${value}`);
    MPD218.log(`NRPN Increment received - Ch${midiChannel}, value: ${value}`);
    
    if (!channelState) {
        console.log(`❌ Unknown MIDI channel ${midiChannel} for NRPN Increment`);
        MPD218.log(`Unknown MIDI channel ${midiChannel} for NRPN Increment`);
        return;
    }
    
    if (channelState.currentParameter === null || channelState.currentParameter === undefined) {
        console.log(`⚠️  Ch${midiChannel} NRPN Data Increment received but no parameter selected (param: ${channelState.currentParameter})`);
        MPD218.log(`Ch${midiChannel} NRPN Data Increment received but no parameter selected (param: ${channelState.currentParameter})`);
        return;
    }
    
    const mapping = MPD218.nrpnChannelMappings[midiChannel];
    if (!mapping) {
        console.log(`❌ No mapping found for MIDI channel ${midiChannel}`);
        MPD218.log(`No mapping found for MIDI channel ${midiChannel}`);
        return;
    }
    
    console.log(`✅ Processing NRPN Increment - Ch${midiChannel}, mapping: ${mapping.control}, deck: ${mapping.deck}`);
    MPD218.log(`Processing NRPN Increment - Ch${midiChannel}, mapping: ${mapping.control}, deck: ${mapping.deck}`);
    
    if (mapping.control === "waveform_zoom_nrpn") {
        MPD218.handleNRPNZoom(mapping.deck, value, mapping.speed, "increment", midiChannel);
    } else if (mapping.control === "beats_translate_move") {
        MPD218.handleNRPNBeatgrid(mapping.deck, "increment", midiChannel, value);
    } else if (mapping.control === "jogwheel_nrpn") {
        MPD218.handleNRPNJogwheel(mapping.deck, "increment", midiChannel, value, mapping.speed);
    }
};

// Handle NRPN Data Decrement (CC 97)
MPD218.handleNRPNDecrement = function(channel, control, value, status, group) {
    console.log(`🔧 NRPN DECREMENT: status=0x${status.toString(16)}, control=0x${control.toString(16)}, value=${value}`);
    
    if (!MPD218.enableNRPN) return;
    
    const midiChannel = (status & 0x0F) + 1;
    const channelState = MPD218.nrpnState.channels[midiChannel];
    
    console.log(`🔧 NRPN Decrement received - Ch${midiChannel}, value: ${value}`);
    MPD218.log(`NRPN Decrement received - Ch${midiChannel}, value: ${value}`);
    
    if (!channelState) {
        console.log(`❌ Unknown MIDI channel ${midiChannel} for NRPN Decrement`);
        MPD218.log(`Unknown MIDI channel ${midiChannel} for NRPN Decrement`);
        return;
    }
    
    if (channelState.currentParameter === null || channelState.currentParameter === undefined) {
        console.log(`⚠️  Ch${midiChannel} NRPN Data Decrement received but no parameter selected (param: ${channelState.currentParameter})`);
        MPD218.log(`Ch${midiChannel} NRPN Data Decrement received but no parameter selected (param: ${channelState.currentParameter})`);
        return;
    }
    
    const mapping = MPD218.nrpnChannelMappings[midiChannel];
    if (!mapping) {
        console.log(`❌ No mapping found for MIDI channel ${midiChannel}`);
        MPD218.log(`No mapping found for MIDI channel ${midiChannel}`);
        return;
    }
    
    console.log(`✅ Processing NRPN Decrement - Ch${midiChannel}, mapping: ${mapping.control}, deck: ${mapping.deck}`);
    MPD218.log(`Processing NRPN Decrement - Ch${midiChannel}, mapping: ${mapping.control}, deck: ${mapping.deck}`);
    
    if (mapping.control === "waveform_zoom_nrpn") {
        MPD218.handleNRPNZoom(mapping.deck, value, mapping.speed, "decrement", midiChannel);
    } else if (mapping.control === "beats_translate_move") {
        MPD218.handleNRPNBeatgrid(mapping.deck, "decrement", midiChannel, value);
    } else if (mapping.control === "jogwheel_nrpn") {
        MPD218.handleNRPNJogwheel(mapping.deck, "decrement", midiChannel, value, mapping.speed);
    }
};

// Handle NRPN zoom with ultra-precise control
MPD218.handleNRPNZoom = function(deck, value, speed, direction, midiChannel) {
    const currentZoom = engine.getValue(deck, "waveform_zoom");
    const stepSize = value * speed * 0.01; // High-resolution steps
    let newZoom = currentZoom;
    
    // Apply zoom direction reversal if enabled
    let effectiveDirection = direction;
    if (MPD218.reverseZoom) {
        effectiveDirection = (direction === "increment") ? "decrement" : "increment";
}
    
    if (effectiveDirection === "increment") {
        // Increment = zoom IN (lower values = more zoomed in)
        newZoom = Math.max(0.1, currentZoom - stepSize);
    } else if (effectiveDirection === "decrement") {
        // Decrement = zoom OUT (higher values = more zoomed out)
        newZoom = Math.min(64.0, currentZoom + stepSize);
    }
    
    if (newZoom !== currentZoom) {
        engine.setValue(deck, "waveform_zoom", newZoom);
        MPD218.log(`NRPN Zoom ${deck} ${direction}${MPD218.reverseZoom ? " (reversed)" : ""}: ${currentZoom.toFixed(4)} -> ${newZoom.toFixed(4)} (ch: ${midiChannel})`);
    }
};

// Handle NRPN beatgrid with 14-bit precision
MPD218.handleNRPNBeatgrid = function(deck, direction, midiChannel, value) {
    if (direction === "increment") {
        // Increment = move beatgrid later
        engine.setValue(deck, "beats_translate_move", 1);
        MPD218.log(`NRPN Beatgrid ${deck} move later (ch: ${midiChannel})`);
    } else if (direction === "decrement") {
        // Decrement = move beatgrid earlier
        engine.setValue(deck, "beats_translate_move", -1);
        MPD218.log(`NRPN Beatgrid ${deck} move earlier (ch: ${midiChannel})`);
    }
};

// Handle NRPN jogwheel with 14-bit precision for track scrubbing
MPD218.handleNRPNJogwheel = function(deck, direction, midiChannel, value, speed) {
    // Calculate relative movement based on value and speed multiplier
    const relativeMovement = Math.round(value * speed);
    
    // Get current position
    const currentPosition = engine.getValue(deck, "playposition");
    
    // Calculate movement step (adjust this value to control sensitivity)
    const movementStep = relativeMovement / 6400; // Smaller divisor = faster movement
    
    if (direction === "increment") {
        // Increment = scrub forward (later in track)
        const newPosition = Math.min(1.0, currentPosition + movementStep);
        engine.setValue(deck, "playposition", newPosition);
        MPD218.log(`NRPN Jogwheel ${deck} scrub forward (ch: ${midiChannel}, pos: ${currentPosition.toFixed(3)} -> ${newPosition.toFixed(3)})`);
    } else if (direction === "decrement") {
        // Decrement = scrub backward (earlier in track)
        const newPosition = Math.max(0.0, currentPosition - movementStep);
        engine.setValue(deck, "playposition", newPosition);
        MPD218.log(`NRPN Jogwheel ${deck} scrub backward (ch: ${midiChannel}, pos: ${currentPosition.toFixed(3)} -> ${newPosition.toFixed(3)})`);
    }
};

/*///////////////////////////////////
//         LED CALLBACKS          //
///////////////////////////////////*/

MPD218.updateHotcueLED = function(value, group, control) {
    if (!control.includes("hotcue_") || !control.includes("_status")) return;
    
    const hotcueNumber = parseInt(control.replace("hotcue_", "").replace("_status", ""));
    
    // Find corresponding pad in current bank
    for (const [padCode, mapping] of Object.entries(MPD218.padMappings[MPD218.state.padBank] || {})) {
        if (mapping.type === "hotcue" && mapping.deck === group && mapping.number === hotcueNumber) {
            MPD218.updateLED(parseInt(padCode), value ? 127 : 0);
            break;
        }
    }
};

MPD218.updateLoopLED = function(value, group, control) {
    // Update loop-related LEDs if needed
    MPD218.log(`Loop LED update: ${group} ${control} = ${value}`);
};

MPD218.updateBPMLockLED = function(value, group, control) {
    console.log(`🔦 BPM Lock LED callback triggered: ${group}.${control} = ${value}`);
    
    // Find the button that corresponds to this deck
    for (const [buttonNote, mapping] of Object.entries(MPD218.bpmLockMappings)) {
        if (mapping.deck === group) {
            console.log(`🔦 Found matching button 0x${parseInt(buttonNote).toString(16)} for ${group}`);
            
            // Update LED on channel 9 - ALWAYS use full velocity for Note On
            if (value) {
                        console.log(`🔦 Sending Note On (0x98) with velocity 127 to turn LED ON`);
        midi.sendShortMsg(0x98, parseInt(buttonNote), 127); // Always use full velocity
            } else {
                console.log(`🔦 Sending Note Off (0x88) to turn LED OFF`);
                midi.sendShortMsg(0x88, parseInt(buttonNote), 0);   // Note Off
            }
            MPD218.log(`BPM Lock LED update: ${group} = ${value ? "ON" : "OFF"} (button 0x${parseInt(buttonNote).toString(16)})`);
            break;
        }
    }
};

/*///////////////////////////////////
//       BANK MANAGEMENT           //
///////////////////////////////////*/

MPD218.selectBank = function(bankNumber) {
    if (bankNumber >= 1 && bankNumber <= 4) {
        MPD218.state.padBank = bankNumber;
        MPD218.log(`Selected bank ${bankNumber}`);
        MPD218.updateAllLEDs();
    }
};

MPD218.updateAllLEDs = function() {
    // Update LEDs based on current bank state
    const currentBank = MPD218.padMappings[MPD218.state.padBank];
    if (!currentBank) return;
    
    for (const [padCode, mapping] of Object.entries(currentBank)) {
        if (mapping.type === "hotcue") {
            const status = engine.getValue(mapping.deck, `hotcue_${mapping.number}_status`);
            MPD218.updateLED(parseInt(padCode), status ? 127 : 0);
        }
    }
    
    // Update BPM lock LEDs
    for (const [buttonNote, mapping] of Object.entries(MPD218.bpmLockMappings)) {
        const lockStatus = engine.getValue(mapping.deck, "bpmlock");
        if (lockStatus) {
            midi.sendShortMsg(0x98, parseInt(buttonNote), 127); // Note On
        } else {
            midi.sendShortMsg(0x88, parseInt(buttonNote), 0);   // Note Off
        }
    }
    
    // Update Key lock LEDs
    for (const [buttonNote, mapping] of Object.entries(MPD218.keyLockMappings)) {
        const lockStatus = engine.getValue(mapping.deck, "keylock");
        if (lockStatus) {
            midi.sendShortMsg(0x98, parseInt(buttonNote), 127); // Note On
        } else {
            midi.sendShortMsg(0x88, parseInt(buttonNote), 0);   // Note Off
        }
    }
    
    // Update Slip mode LEDs
    for (const [buttonNote, mapping] of Object.entries(MPD218.slipModeMappings)) {
        const modeStatus = engine.getValue(mapping.deck, "slip_enabled");
        if (modeStatus) {
            midi.sendShortMsg(0x98, parseInt(buttonNote), 127); // Note On
        } else {
            midi.sendShortMsg(0x88, parseInt(buttonNote), 0);   // Note Off
        }
    }
    
    // Update Quantization LEDs
    for (const [buttonNote, mapping] of Object.entries(MPD218.quantizationMappings)) {
        const quantStatus = engine.getValue(mapping.deck, "quantize");
        if (quantStatus) {
            midi.sendShortMsg(0x98, parseInt(buttonNote), 127); // Note On
        } else {
            midi.sendShortMsg(0x88, parseInt(buttonNote), 0);   // Note Off
        }
    }
};

/*///////////////////////////////////
//         TEST FUNCTIONS          //
///////////////////////////////////*/

// Test function to verify the script is working
MPD218.test = function() {
    console.log("🎛️  MPD218 TEST FUNCTION CALLED - SCRIPT IS WORKING!");
    MPD218.log("=== MPD218 TEST FUNCTION ===");
    MPD218.log(`Script loaded: ${MPD218.state.initialized}`);
    MPD218.log(`Current deck: ${MPD218.state.currentDeck}`);
    MPD218.log(`Current pad bank: ${MPD218.state.padBank}`);
    MPD218.log(`Debug enabled: ${MPD218.debugEnabled}`);
    MPD218.log(`NRPN enabled: ${MPD218.enableNRPN}`);
    MPD218.log(`Reverse zoom: ${MPD218.reverseZoom}`);
    MPD218.log("Flash all pad LEDs for 1 second...");
    
    // Flash all LEDs
    for (let note = 0x24; note <= 0x2B; note++) {
        MPD218.updateLED(note, 127);
    }
    
    // Turn them off after 1 second
    engine.beginTimer(1000, () => {
        MPD218.turnOffAllLEDs();
        MPD218.log("Test complete - LEDs turned off");
    }, true);
    
    return "MPD218 test executed - check console for details";
};

// Test NRPN handlers manually
MPD218.testNRPN = function() {
    console.log("🧪 Testing NRPN handlers manually...");
    
    // Simulate NRPN messages for channel 1
    console.log("📤 Simulating NRPN sequence for channel 1...");
    
    // Set parameter to 0,0
    MPD218.handleNRPNMSB(1, 0x63, 0, 0xB0, "[Channel1]");
    MPD218.handleNRPNLSB(1, 0x62, 0, 0xB0, "[Channel1]");
    
    // Send some increments
    MPD218.handleNRPNIncrement(1, 0x60, 3, 0xB0, "[Channel1]");
    MPD218.handleNRPNIncrement(1, 0x60, 3, 0xB0, "[Channel1]");
    
    console.log("✅ NRPN test complete - check if beatgrid moved");
    return "NRPN test executed";
};

// Test jogwheel functionality manually
MPD218.testJogwheel = function(deck, direction) {
    deck = deck || "[Channel1]";
    direction = direction || "increment";
    console.log(`🧪 Testing jogwheel for ${deck} - ${direction}`);
    
    // Simulate NRPN jogwheel movement
    const testValue = 5; // Moderate speed
    const testSpeed = 1.0;
    
    MPD218.handleNRPNJogwheel(deck, direction, 9, testValue, testSpeed);
    
    console.log(`✅ Jogwheel test executed for ${deck} - ${direction}`);
    return `Jogwheel test executed for ${deck} - ${direction}`;
};

// Test BPM lock LEDs manually
MPD218.testBPMLockLEDs = function(state) {
    console.log(`🧪 Testing BPM lock LEDs - turning all ${state ? "ON" : "OFF"}`);
    
    for (const [buttonNote, mapping] of Object.entries(MPD218.bpmLockMappings)) {
        const note = parseInt(buttonNote);
        console.log(`   Button 0x${note.toString(16)} (${mapping.deck})`);
        
        if (state) {
            // Turn ON
                    console.log(`   -> Sending Note On (0x98) with velocity 127`);
        midi.sendShortMsg(0x98, note, 127);
        } else {
            // Turn OFF - try all methods
            console.log(`   -> Trying multiple methods to turn OFF`);
            MPD218.forceBPMLockLEDOff(buttonNote);
        }
    }
    
    return `BPM lock LEDs turned ${state ? "ON" : "OFF"}`;
};

// Test BPM lock toggle for a specific deck
MPD218.testBPMLockToggle = function(deck) {
    deck = deck || "[Channel1]";
    console.log(`🧪 Testing BPM lock toggle for ${deck}`);
    
    const currentState = engine.getValue(deck, "bpmlock");
    console.log(`   Current state: ${currentState}`);
    
    const newState = !currentState;
    console.log(`   Setting to: ${newState}`);
    engine.setValue(deck, "bpmlock", newState);
    
    engine.beginTimer(200, function() {
        const verifiedState = engine.getValue(deck, "bpmlock");
        console.log(`   Verified state: ${verifiedState}`);
        
        // Check if LED update was called
        console.log(`   LED should be ${verifiedState ? "ON" : "OFF"}`);
    }, true); // true = one-shot timer
    
    return `BPM lock toggled for ${deck}`;
};

/*///////////////////////////////////
//     INITIALIZATION & CLEANUP    //
///////////////////////////////////*/

MPD218.connectControls = function() {
    // Connect hotcue status indicators for all decks
    for (const deck of ["[Channel1]", "[Channel2]", "[Channel3]", "[Channel4]"]) {
        for (let i = 1; i <= 16; i++) {
            engine.makeConnection(deck, `hotcue_${i}_status`, MPD218.updateHotcueLED);
        }
        
        // Connect loop indicators
        engine.makeConnection(deck, "loop_enabled", MPD218.updateLoopLED);
        
        // Connect BPM lock (sync lock) indicators
        engine.makeConnection(deck, "bpmlock", MPD218.updateBPMLockLED);
    }
};

MPD218.setupMIDIHandlers = function() {
    MPD218.log("Setting up MIDI handlers...");
    
    // Pad handlers (Note On messages)
    const padNotes = [0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x2B];
    padNotes.forEach(note => {
        midi.makeInputHandler(MPD218.midi.noteOn, note, MPD218.handlePad);
        MPD218.log(`Registered pad handler for note 0x${note.toString(16)}`);
    });
    
    // Knob handlers (Control Change messages)
    Object.keys(MPD218.knobMappings).forEach(cc => {
        midi.makeInputHandler(MPD218.midi.channel, parseInt(cc), MPD218.handleKnob);
        MPD218.log(`Registered knob handler for CC 0x${parseInt(cc).toString(16)}`);
    });
    
    // Transport button handlers
    Object.keys(MPD218.transportMappings).forEach(note => {
        midi.makeInputHandler(MPD218.midi.noteOn, parseInt(note), MPD218.handleTransport);
        MPD218.log(`Registered transport handler for note 0x${parseInt(note).toString(16)}`);
    });
    
    // BPM Lock button handlers (channel 9 = 0x98 for note on)
    Object.keys(MPD218.bpmLockMappings).forEach(note => {
        midi.makeInputHandler(0x98, parseInt(note), MPD218.handleBPMLock);
        MPD218.log(`Registered BPM lock handler for note 0x${parseInt(note).toString(16)} on channel 9`);
    });
    
    // Key Lock button handlers (channel 9 = 0x98 for note on)
    Object.keys(MPD218.keyLockMappings).forEach(note => {
        midi.makeInputHandler(0x98, parseInt(note), MPD218.handleKeyLock);
        MPD218.log(`Registered Key lock handler for note 0x${parseInt(note).toString(16)} on channel 9`);
    });
    
    // Slip Mode button handlers (channel 9 = 0x98 for note on)
    Object.keys(MPD218.slipModeMappings).forEach(note => {
        midi.makeInputHandler(0x98, parseInt(note), MPD218.handleSlipMode);
        MPD218.log(`Registered Slip mode handler for note 0x${parseInt(note).toString(16)} on channel 9`);
    });
    
    // Quantization button handlers (channel 9 = 0x98 for note on)
    Object.keys(MPD218.quantizationMappings).forEach(note => {
        midi.makeInputHandler(0x98, parseInt(note), MPD218.handleQuantization);
        MPD218.log(`Registered Quantization handler for note 0x${parseInt(note).toString(16)} on channel 9`);
    });
    
    // NRPN handlers for high-resolution control (if enabled)
    if (MPD218.enableNRPN) {
        console.log("🔧 Setting up NRPN handlers...");
        MPD218.log("Setting up NRPN handlers...");
        
        // Register NRPN handlers for each channel
        // Channel 1 (0xB0)
        midi.makeInputHandler(0xB0, 0x63, MPD218.handleNRPNMSB);    // CC 99
        midi.makeInputHandler(0xB0, 0x62, MPD218.handleNRPNLSB);    // CC 98
        midi.makeInputHandler(0xB0, 0x60, MPD218.handleNRPNIncrement); // CC 96
        midi.makeInputHandler(0xB0, 0x61, MPD218.handleNRPNDecrement); // CC 97
        console.log("✅ Registered NRPN handlers for channel 1");
        
        // Channel 2 (0xB1)
        midi.makeInputHandler(0xB1, 0x63, MPD218.handleNRPNMSB);
        midi.makeInputHandler(0xB1, 0x62, MPD218.handleNRPNLSB);
        midi.makeInputHandler(0xB1, 0x60, MPD218.handleNRPNIncrement);
        midi.makeInputHandler(0xB1, 0x61, MPD218.handleNRPNDecrement);
        console.log("✅ Registered NRPN handlers for channel 2");
        
        // Channel 3 (0xB2)
        midi.makeInputHandler(0xB2, 0x63, MPD218.handleNRPNMSB);
        midi.makeInputHandler(0xB2, 0x62, MPD218.handleNRPNLSB);
        midi.makeInputHandler(0xB2, 0x60, MPD218.handleNRPNIncrement);
        midi.makeInputHandler(0xB2, 0x61, MPD218.handleNRPNDecrement);
        console.log("✅ Registered NRPN handlers for channel 3");
        
        // Channel 4 (0xB3)
        midi.makeInputHandler(0xB3, 0x63, MPD218.handleNRPNMSB);
        midi.makeInputHandler(0xB3, 0x62, MPD218.handleNRPNLSB);
        midi.makeInputHandler(0xB3, 0x60, MPD218.handleNRPNIncrement);
        midi.makeInputHandler(0xB3, 0x61, MPD218.handleNRPNDecrement);
        console.log("✅ Registered NRPN handlers for channel 4");
        
        // Channel 5 (0xB4) - Zoom control
        midi.makeInputHandler(0xB4, 0x63, MPD218.handleNRPNMSB);
        midi.makeInputHandler(0xB4, 0x62, MPD218.handleNRPNLSB);
        midi.makeInputHandler(0xB4, 0x60, MPD218.handleNRPNIncrement);
        midi.makeInputHandler(0xB4, 0x61, MPD218.handleNRPNDecrement);
        console.log("✅ Registered NRPN handlers for channel 5 (zoom)");
        
        // Channel 6 (0xB5) - Zoom control
        midi.makeInputHandler(0xB5, 0x63, MPD218.handleNRPNMSB);
        midi.makeInputHandler(0xB5, 0x62, MPD218.handleNRPNLSB);
        midi.makeInputHandler(0xB5, 0x60, MPD218.handleNRPNIncrement);
        midi.makeInputHandler(0xB5, 0x61, MPD218.handleNRPNDecrement);
        console.log("✅ Registered NRPN handlers for channel 6 (zoom)");
        
        // Channel 9 (0xB8) - Jogwheel for Channel 1
        midi.makeInputHandler(0xB8, 0x63, MPD218.handleNRPNMSB);
        midi.makeInputHandler(0xB8, 0x62, MPD218.handleNRPNLSB);
        midi.makeInputHandler(0xB8, 0x60, MPD218.handleNRPNIncrement);
        midi.makeInputHandler(0xB8, 0x61, MPD218.handleNRPNDecrement);
        console.log("✅ Registered NRPN handlers for channel 9 (jogwheel Channel 1)");
        
        // Channel 11 (0xBA) - Jogwheel for Channel 2
        midi.makeInputHandler(0xBA, 0x63, MPD218.handleNRPNMSB);
        midi.makeInputHandler(0xBA, 0x62, MPD218.handleNRPNLSB);
        midi.makeInputHandler(0xBA, 0x60, MPD218.handleNRPNIncrement);
        midi.makeInputHandler(0xBA, 0x61, MPD218.handleNRPNDecrement);
        console.log("✅ Registered NRPN handlers for channel 11 (jogwheel Channel 2)");
        
        // Channel 12 (0xBB) - Jogwheel for Channel 3
        midi.makeInputHandler(0xBB, 0x63, MPD218.handleNRPNMSB);
        midi.makeInputHandler(0xBB, 0x62, MPD218.handleNRPNLSB);
        midi.makeInputHandler(0xBB, 0x60, MPD218.handleNRPNIncrement);
        midi.makeInputHandler(0xBB, 0x61, MPD218.handleNRPNDecrement);
        console.log("✅ Registered NRPN handlers for channel 12 (jogwheel Channel 3)");
        
        // Channel 13 (0xBC) - Jogwheel for Channel 4
        midi.makeInputHandler(0xBC, 0x63, MPD218.handleNRPNMSB);
        midi.makeInputHandler(0xBC, 0x62, MPD218.handleNRPNLSB);
        midi.makeInputHandler(0xBC, 0x60, MPD218.handleNRPNIncrement);
        midi.makeInputHandler(0xBC, 0x61, MPD218.handleNRPNDecrement);
        console.log("✅ Registered NRPN handlers for channel 13 (jogwheel Channel 4)");
        
        console.log("✅ All NRPN handlers registered");
        MPD218.log("All NRPN handlers registered");
    } else {
        MPD218.log("NRPN handlers disabled");
    }
    
    // Debug: Add catch-all MIDI handler for troubleshooting
    if (MPD218.debugEnabled) {
        MPD218.log("Debug mode enabled - extra logging active");
        
        // Note: Complex debug handlers removed to avoid interference
        // Debug messages are now built into each handler function
    }
    
    MPD218.log("MIDI handler setup complete");
};

MPD218.init = function() {
    // VERY LOUD messages to verify script loading
    console.log("=".repeat(60));
    console.log("🎛️  MPD218 CONTROLLER SCRIPT LOADING...");
    console.log("🎛️  IF YOU SEE THIS, THE SCRIPT IS WORKING!");
    console.log("=".repeat(60));
    
    // Test to verify script is loaded and working
    console.log("🎛️  MPD218 INIT STARTING - SCRIPT IS LOADED!");
    console.log("🎛️  If you see this message, the script is working");
    
    MPD218.log("=== INITIALIZING AKAI MPD218 CONTROLLER ===");
    MPD218.log(`Debug enabled: ${MPD218.debugEnabled}`);
    MPD218.log(`NRPN enabled: ${MPD218.enableNRPN}`);
    MPD218.log(`Reverse zoom: ${MPD218.reverseZoom}`);
    
    // Setup MIDI input handlers
    MPD218.setupMIDIHandlers();
    
    // Connect control change callbacks
    MPD218.connectControls();
    
    // Note: Jogwheel functionality uses the "jog" control which works without scratch engine
    console.log("🎛️  Jogwheel controls ready for channels 9, 11, 12, 13");
    
    // Clean up any orphaned timers
    MPD218.bpmLockTimers = {};
    MPD218.keyLockTimers = {};
    MPD218.slipModeTimers = {};
    MPD218.quantizationTimers = {};
    
    // Initialize LEDs
    console.log("🔦 Turning off all LEDs...");
    MPD218.turnOffAllLEDs();
    
    console.log("🔦 Updating all LEDs to match current state...");
    MPD218.updateAllLEDs();
    
    // Force BPM lock LEDs off after a short delay to ensure controller is ready
    console.log("🔦 Scheduling delayed BPM lock LED update...");
    engine.beginTimer(500, function() {
        console.log("🔦 Delayed BPM lock LED update - forcing all OFF");
        // Explicitly turn off all BPM lock LEDs
        for (const buttonNote of Object.keys(MPD218.bpmLockMappings)) {
            MPD218.forceBPMLockLEDOff(buttonNote);
        }
        
        // Then update based on actual state
        console.log("🔦 Now updating BPM lock LEDs based on actual bpmlock state");
        for (const [buttonNote, mapping] of Object.entries(MPD218.bpmLockMappings)) {
            const lockStatus = engine.getValue(mapping.deck, "bpmlock");
            console.log(`   ${mapping.deck} bpmlock = ${lockStatus}`);
            if (lockStatus) {
                midi.sendShortMsg(0x98, parseInt(buttonNote), 127);
            } else {
                MPD218.forceBPMLockLEDOff(buttonNote);
            }
        }
        
        // Force Key lock LEDs off after a short delay to ensure controller is ready
        console.log("🎵 Scheduling delayed Key lock LED update...");
        engine.beginTimer(600, function() {
            console.log("🎵 Delayed Key lock LED update - forcing all OFF");
            // Explicitly turn off all Key lock LEDs
            for (const buttonNote of Object.keys(MPD218.keyLockMappings)) {
                MPD218.forceKeyLockLEDOff(buttonNote);
            }
            
            // Then update based on actual state
            console.log("🎵 Now updating Key lock LEDs based on actual keylock state");
            for (const [buttonNote, mapping] of Object.entries(MPD218.keyLockMappings)) {
                const lockStatus = engine.getValue(mapping.deck, "keylock");
                console.log(`   ${mapping.deck} keylock = ${lockStatus}`);
                if (lockStatus) {
                    midi.sendShortMsg(0x98, parseInt(buttonNote), 127);
                } else {
                    MPD218.forceKeyLockLEDOff(buttonNote);
                }
            }
            
            // Force Slip mode LEDs off after a short delay to ensure controller is ready
            console.log("🎛️ Scheduling delayed Slip mode LED update...");
            engine.beginTimer(700, function() {
                console.log("🎛️ Delayed Slip mode LED update - forcing all OFF");
                // Explicitly turn off all Slip mode LEDs
                for (const buttonNote of Object.keys(MPD218.slipModeMappings)) {
                    MPD218.forceSlipModeLEDOff(buttonNote);
                }
                
                // Then update based on actual state
                console.log("🎛️ Now updating Slip mode LEDs based on actual slip_enabled state");
                for (const [buttonNote, mapping] of Object.entries(MPD218.slipModeMappings)) {
                    const modeStatus = engine.getValue(mapping.deck, "slip_enabled");
                    console.log(`   ${mapping.deck} slip_enabled = ${modeStatus}`);
                    if (modeStatus) {
                        midi.sendShortMsg(0x98, parseInt(buttonNote), 127);
                    } else {
                        MPD218.forceSlipModeLEDOff(buttonNote);
                    }
                }
                
                // Force Quantization LEDs off after a short delay to ensure controller is ready
                console.log("🎯 Scheduling delayed Quantization LED update...");
                engine.beginTimer(800, function() {
                    console.log("🎯 Delayed Quantization LED update - forcing all OFF");
                    // Explicitly turn off all Quantization LEDs
                    for (const buttonNote of Object.keys(MPD218.quantizationMappings)) {
                        MPD218.forceQuantizationLEDOff(buttonNote);
                    }
                    
                    // Then update based on actual state
                    console.log("🎯 Now updating Quantization LEDs based on actual quantize state");
                    for (const [buttonNote, mapping] of Object.entries(MPD218.quantizationMappings)) {
                        const quantStatus = engine.getValue(mapping.deck, "quantize");
                        console.log(`   ${mapping.deck} quantize = ${quantStatus}`);
                        if (quantStatus) {
                            midi.sendShortMsg(0x98, parseInt(buttonNote), 127);
                        } else {
                            MPD218.forceQuantizationLEDOff(buttonNote);
                        }
                    }
                }, true); // true = one-shot timer
            }, true); // true = one-shot timer
        }, true); // true = one-shot timer
    }, true); // true = one-shot timer
    
    MPD218.state.initialized = true;
    MPD218.log("=== CONTROLLER INITIALIZATION COMPLETE ===");
};

MPD218.shutdown = function() {
    MPD218.log("=== SHUTTING DOWN AKAI MPD218 CONTROLLER ===");
    
    // Stop all BPM lock timers
    for (const [deck, timerId] of Object.entries(MPD218.bpmLockTimers)) {
        console.log(`🔥 Stopping timer ${timerId} for ${deck} during shutdown`);
        engine.stopTimer(timerId);
    }
    MPD218.bpmLockTimers = {};
    
    // Stop all Key lock timers
    for (const [deck, timerId] of Object.entries(MPD218.keyLockTimers)) {
        console.log(`🎵 Stopping timer ${timerId} for ${deck} during shutdown`);
        engine.stopTimer(timerId);
    }
    MPD218.keyLockTimers = {};
    
    // Stop all Slip mode timers
    for (const [deck, timerId] of Object.entries(MPD218.slipModeTimers)) {
        console.log(`🎛️ Stopping timer ${timerId} for ${deck} during shutdown`);
        engine.stopTimer(timerId);
    }
    MPD218.slipModeTimers = {};
    
    // Stop all Quantization timers
    for (const [deck, timerId] of Object.entries(MPD218.quantizationTimers)) {
        console.log(`🎯 Stopping timer ${timerId} for ${deck} during shutdown`);
        engine.stopTimer(timerId);
    }
    MPD218.quantizationTimers = {};
    
    // Turn off all LEDs
    MPD218.turnOffAllLEDs();
    
    MPD218.state.initialized = false;
    MPD218.log("=== CONTROLLER SHUTDOWN COMPLETE ===");
};