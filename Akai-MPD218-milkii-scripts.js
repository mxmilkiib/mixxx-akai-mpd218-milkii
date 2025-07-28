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
console.log("🎛️  Loading Akai MPD218 Controller Script (milkii version)");

/*///////////////////////////////////
//      USER VARIABLES BEGIN       //
///////////////////////////////////*/

// Enable debug logging
MPD218.debugEnabled = true;  // Set to true for debugging

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
        6: { currentParameter: null, msb: 0, lsb: 0 }  // General zoom
    }
};

// NRPN channel mappings - map MIDI channels to controls
MPD218.nrpnChannelMappings = {
    1: { deck: "[Channel1]", control: "beats_translate_move", speed: 1.0 },      // First knob
    2: { deck: "[Channel2]", control: "beats_translate_move", speed: 1.0 },      // Second knob
    3: { deck: "[Channel3]", control: "beats_translate_move", speed: 1.0 },      // Third knob  
    4: { deck: "[Channel4]", control: "beats_translate_move", speed: 1.0 },      // Fourth knob
    5: { deck: "[Channel1]", control: "waveform_zoom_nrpn", speed: 12.0 },       // Fast zoom
    6: { deck: "[Channel1]", control: "waveform_zoom_nrpn", speed: 1.0 }        // Fine zoom
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

// BPM Lock button mappings (channel 10)
// Bottom to top physical order: Deck 4, 2, 1, 3
MPD218.bpmLockMappings = {
    0x24: { deck: "[Channel4]" },  // Bottom button = Deck 4
    0x28: { deck: "[Channel2]" },  // Second button = Deck 2
    0x2C: { deck: "[Channel1]" },  // Third button = Deck 1
    0x30: { deck: "[Channel3]" }   // Top button = Deck 3
};

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
    
    // Turn off BPM lock button LEDs (channel 10)
    for (const buttonNote of Object.keys(MPD218.bpmLockMappings)) {
        MPD218.forceBPMLockLEDOff(buttonNote);
    }
};

MPD218.forceBPMLockLEDOff = function(buttonNote) {
    const note = parseInt(buttonNote);
    console.log(`🔦 Forcing BPM lock LED OFF for button 0x${note.toString(16)}`);
    
    // Try only the most basic method for now
    midi.sendShortMsg(0x89, note, 0);  // Note Off with velocity 0
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
    // 0x99 = Note On channel 10 with velocity > 0 (button press)
    // 0xD9 = Note On channel 10 with velocity 0 (button held) - IGNORE
    // 0x89 = Note Off channel 10 (button release) - IGNORE
    
    // Only respond to actual button presses (Note On with velocity > 0)
    if (status === 0x99 && value > 0) {
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
        midi.sendShortMsg(0x99, control, 127); // Full velocity
        midi.sendShortMsg(0x99, control, 100); // High velocity
        midi.sendShortMsg(0x99, control, 127); // Full velocity again
        
        // Also try Control Change on channel 10
        midi.sendShortMsg(0xB9, control, 127); // CC on channel 10
    } else {
        console.log(`🔥 Sending Note Off for LED OFF`);
        midi.sendShortMsg(0x89, control, 0);
    }
    
    // Set up continuous LED refresh to override button held messages
    if (newLock) {
        console.log(`🔥 Setting up continuous LED refresh timer`);
        // Create a timer that keeps sending LED ON commands
        engine.beginTimer(50, function() {
            const currentState = engine.getValue(mapping.deck, "bpmlock");
            if (currentState) {
                console.log(`🔥 Continuous LED refresh - sending Note On`);
                midi.sendShortMsg(0x99, control, 127);
            } else {
                console.log(`🔥 BPM lock turned off - stopping LED refresh`);
                return false; // Stop the timer
            }
        }, false); // false = repeating timer
    }
    
    // Verify the change
    engine.beginTimer(100, function() {
        const verifyLock = engine.getValue(mapping.deck, "bpmlock");
        console.log(`🔥 Verified BPM lock state after toggle: ${verifyLock}`);
        
        // Double-check LED again with full velocity
        if (verifyLock) {
            console.log(`🔥 Re-sending Note On with velocity 127 to ensure LED stays lit`);
            midi.sendShortMsg(0x99, control, 127);
        }
    }, true); // true = one-shot timer
    
    MPD218.log(`BPM Lock toggled for ${mapping.deck}: ${newLock ? "ON" : "OFF"}`);
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
    
    // For jog wheels, we don't need to check currentParameter - just use the channel mapping
    // The controller sends parameter 0,0 which is valid for jog wheel control
    if (channelState.currentParameter === null || channelState.currentParameter === undefined) {
        console.log(`⚠️  Ch${midiChannel} NRPN Data Increment received but no parameter selected (param: ${channelState.currentParameter})`);
        MPD218.log(`Ch${midiChannel} NRPN Data Increment received but no parameter selected (param: ${channelState.currentParameter})`);
        // Don't return - continue processing for jog wheel control
    }
    
    const mapping = MPD218.nrpnChannelMappings[midiChannel];
    if (!mapping) {
        console.log(`❌ No mapping found for MIDI channel ${midiChannel}`);
        MPD218.log(`No mapping found for MIDI channel ${midiChannel}`);
        return;
    }
    
    MPD218.log(`Processing NRPN Increment - Ch${midiChannel}, mapping: ${mapping.control}, deck: ${mapping.deck}`);
    
    if (mapping.control === "waveform_zoom_nrpn") {
        MPD218.handleNRPNZoom(mapping.deck, value, mapping.speed, "increment", midiChannel);
    } else if (mapping.control === "beats_translate_move") {
        MPD218.handleNRPNBeatgrid(mapping.deck, "increment", midiChannel, value);
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
    
    // For jog wheels, we don't need to check currentParameter - just use the channel mapping
    // The controller sends parameter 0,0 which is valid for jog wheel control
    if (channelState.currentParameter === null || channelState.currentParameter === undefined) {
        console.log(`⚠️  Ch${midiChannel} NRPN Data Decrement received but no parameter selected (param: ${channelState.currentParameter})`);
        MPD218.log(`Ch${midiChannel} NRPN Data Decrement received but no parameter selected (param: ${channelState.currentParameter})`);
        // Don't return - continue processing for jog wheel control
    }
    
    const mapping = MPD218.nrpnChannelMappings[midiChannel];
    if (!mapping) {
        console.log(`❌ No mapping found for MIDI channel ${midiChannel}`);
        MPD218.log(`No mapping found for MIDI channel ${midiChannel}`);
        return;
    }
    
    MPD218.log(`Processing NRPN Decrement - Ch${midiChannel}, mapping: ${mapping.control}, deck: ${mapping.deck}`);
    
    if (mapping.control === "waveform_zoom_nrpn") {
        MPD218.handleNRPNZoom(mapping.deck, value, mapping.speed, "decrement", midiChannel);
    } else if (mapping.control === "beats_translate_move") {
        MPD218.handleNRPNBeatgrid(mapping.deck, "decrement", midiChannel, value);
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
            
            // Update LED on channel 10 - ALWAYS use full velocity for Note On
            if (value) {
                console.log(`🔦 Sending Note On (0x99) with velocity 127 to turn LED ON`);
                midi.sendShortMsg(0x99, parseInt(buttonNote), 127); // Always use full velocity
            } else {
                console.log(`🔦 Sending Note Off (0x89) to turn LED OFF`);
                midi.sendShortMsg(0x89, parseInt(buttonNote), 0);   // Note Off
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
            midi.sendShortMsg(0x99, parseInt(buttonNote), 127); // Note On
        } else {
            midi.sendShortMsg(0x89, parseInt(buttonNote), 0);   // Note Off
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
    
    MPD218.log("NRPN test complete - check if beatgrid moved");
    return "NRPN test executed";
};

// Test jog wheel directly
MPD218.testJogWheel = function(channel) {
    channel = channel || 1;
    console.log(`🧪 Testing jog wheel for channel ${channel}...`);
    
    // Simulate the exact NRPN sequence your controller sends
    const status = 0xB0 + (channel - 1); // 0xB0 for ch1, 0xB1 for ch2, etc.
    
    console.log(`📤 Simulating jog wheel NRPN sequence for channel ${channel} (status: 0x${status.toString(16)})`);
    
    // Set parameter to 0,0 (what your controller sends)
    MPD218.handleNRPNMSB(1, 0x63, 0, status, "[Channel1]");
    MPD218.handleNRPNLSB(1, 0x62, 0, status, "[Channel1]");
    
    // Send increment (what happens when you turn the knob)
    MPD218.handleNRPNIncrement(1, 0x60, 3, status, "[Channel1]");
    
    console.log("✅ Jog wheel test complete - check if beatgrid moved");
    return `Jog wheel test executed for channel ${channel}`;
};

// Test BPM lock LEDs manually
MPD218.testBPMLockLEDs = function(state) {
    console.log(`🧪 Testing BPM lock LEDs - turning all ${state ? "ON" : "OFF"}`);
    
    for (const [buttonNote, mapping] of Object.entries(MPD218.bpmLockMappings)) {
        const note = parseInt(buttonNote);
        console.log(`   Button 0x${note.toString(16)} (${mapping.deck})`);
        
        if (state) {
            // Turn ON
            console.log(`   -> Sending Note On (0x99) with velocity 127`);
            midi.sendShortMsg(0x99, note, 127);
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
    
    // BPM Lock button handlers (channel 10 = 0x99 for note on)
    Object.keys(MPD218.bpmLockMappings).forEach(note => {
        midi.makeInputHandler(0x99, parseInt(note), MPD218.handleBPMLock);
        MPD218.log(`Registered BPM lock handler for note 0x${parseInt(note).toString(16)} on channel 10`);
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
        MPD218.log("Registered NRPN handlers for channel 1");
        
        // Channel 2 (0xB1)
        midi.makeInputHandler(0xB1, 0x63, MPD218.handleNRPNMSB);
        midi.makeInputHandler(0xB1, 0x62, MPD218.handleNRPNLSB);
        midi.makeInputHandler(0xB1, 0x60, MPD218.handleNRPNIncrement);
        midi.makeInputHandler(0xB1, 0x61, MPD218.handleNRPNDecrement);
        MPD218.log("Registered NRPN handlers for channel 2");
        
        // Channel 3 (0xB2)
        midi.makeInputHandler(0xB2, 0x63, MPD218.handleNRPNMSB);
        midi.makeInputHandler(0xB2, 0x62, MPD218.handleNRPNLSB);
        midi.makeInputHandler(0xB2, 0x60, MPD218.handleNRPNIncrement);
        midi.makeInputHandler(0xB2, 0x61, MPD218.handleNRPNDecrement);
        MPD218.log("Registered NRPN handlers for channel 3");
        
        // Channel 4 (0xB3)
        midi.makeInputHandler(0xB3, 0x63, MPD218.handleNRPNMSB);
        midi.makeInputHandler(0xB3, 0x62, MPD218.handleNRPNLSB);
        midi.makeInputHandler(0xB3, 0x60, MPD218.handleNRPNIncrement);
        midi.makeInputHandler(0xB3, 0x61, MPD218.handleNRPNDecrement);
        // Channel 5 (0xB4) - Zoom control
        midi.makeInputHandler(0xB4, 0x63, MPD218.handleNRPNMSB);
        midi.makeInputHandler(0xB4, 0x62, MPD218.handleNRPNLSB);
        midi.makeInputHandler(0xB4, 0x60, MPD218.handleNRPNIncrement);
        midi.makeInputHandler(0xB4, 0x61, MPD218.handleNRPNDecrement);
        
        // Channel 6 (0xB5) - Zoom control
        midi.makeInputHandler(0xB5, 0x63, MPD218.handleNRPNMSB);
        midi.makeInputHandler(0xB5, 0x62, MPD218.handleNRPNLSB);
        midi.makeInputHandler(0xB5, 0x60, MPD218.handleNRPNIncrement);
        midi.makeInputHandler(0xB5, 0x61, MPD218.handleNRPNDecrement);
        
        MPD218.log("All NRPN handlers registered");
    } else {
        MPD218.log("NRPN handlers disabled");
    }
    
    MPD218.log("MIDI handler setup complete");
};

MPD218.init = function() {
    MPD218.log("=== INITIALIZING AKAI MPD218 CONTROLLER ===");
    MPD218.log(`Debug enabled: ${MPD218.debugEnabled}`);
    MPD218.log(`NRPN enabled: ${MPD218.enableNRPN}`);
    MPD218.log(`Reverse zoom: ${MPD218.reverseZoom}`);
    
    // Setup MIDI input handlers
    MPD218.setupMIDIHandlers();
    
    // Connect control change callbacks
    MPD218.connectControls();
    
    // Initialize LEDs
    MPD218.turnOffAllLEDs();
    MPD218.updateAllLEDs();
    
    // Force BPM lock LEDs off after a short delay to ensure controller is ready
    engine.beginTimer(500, function() {
        // Explicitly turn off all BPM lock LEDs
        for (const buttonNote of Object.keys(MPD218.bpmLockMappings)) {
            MPD218.forceBPMLockLEDOff(buttonNote);
        }
        
        // Then update based on actual state
        for (const [buttonNote, mapping] of Object.entries(MPD218.bpmLockMappings)) {
            const lockStatus = engine.getValue(mapping.deck, "bpmlock");
            if (lockStatus) {
                midi.sendShortMsg(0x99, parseInt(buttonNote), 127);
            } else {
                MPD218.forceBPMLockLEDOff(buttonNote);
            }
        }
    }, true); // true = one-shot timer
    
    MPD218.state.initialized = true;
    MPD218.log("=== CONTROLLER INITIALIZATION COMPLETE ===");
};

MPD218.shutdown = function() {
    MPD218.log("=== SHUTTING DOWN AKAI MPD218 CONTROLLER ===");
    
    // Turn off all LEDs
    MPD218.turnOffAllLEDs();
    
    MPD218.state.initialized = false;
    MPD218.log("=== CONTROLLER SHUTDOWN COMPLETE ===");
};