# Akai MPD218 Preset File Format (.mpd218)

## Table of Contents
- [Quick Cheat Sheet](#quick-cheat-sheet)
- [Structure](#structure)
- [Format](#format)
- [Control Entry (7 bytes)](#control-entry-7-bytes)
- [Pad Entry (8 bytes)](#pad-entry-8-bytes)
- [Banks](#banks)
- ["chroma10" Preset Analysis](#chroma10-preset-analysis)
- ["chroma11" Preset Analysis](#chroma11-preset-analysis)
- [Parser Example](#parser-example)
- [Extended Reference](#extended-reference)
  - [Channel encoding and MIDI status](#channel-encoding-and-midi-status)
  - [Control entry (7 bytes) — field breakdown (observed)](#control-entry-7-bytes--field-breakdown-observed)
  - [Pad entry (8 bytes) — field breakdown (observed)](#pad-entry-8-bytes--field-breakdown-observed)
  - [Banks and slot indexing](#banks-and-slot-indexing)
  - [Practical mapping notes (Mixxx controller script alignment)](#practical-mapping-notes-mixxx-controller-script-alignment)
  - [Robust parsing guidance](#robust-parsing-guidance)
  - [A more defensive parser (Python)](#a-more-defensive-parser-python)
  - [Known quirks and gotchas](#known-quirks-and-gotchas)
  - [Cross‑checking with a live device](#cross-checking-with-a-live-device)
  - [Related assets](#related-assets)
- [Hex Field Map (with annotated example)](#hex-field-map-with-annotated-example)
- [Observed pad type values (from multiple presets)](#observed-pad-type-values-from-multiple-presets)
- [On‑wire traces (status‑level examples)](#on-wire-traces-status-level-examples)
- [Script crosswalk (format ↔ controller script)](#script-crosswalk-format-controller-script)

## Quick Cheat Sheet
- **file layout (observed)**
  - header: `F0 47 00 34 10 04 1d 01`
  - name: 8 bytes ASCII at 0x08–0x0F
  - controls: 55 × 7 bytes starting at 0x10
  - reserved gap: 3 bytes at 0x191–0x193
  - pads: 18 × 8 bytes starting at 0x194
  - footer: `F7`
- **channel math**
  - CH→status: NoteOn `0x90+(ch-1)`, NoteOff `0x80+(ch-1)`, CC `0xB0+(ch-1)`
  - examples: CH10 NoteOn=0x99, NoteOff=0x89, CC=0xB9
- **nrpn cc numbers**
  - select param: MSB=99 (0x63), LSB=98 (0x62)
  - relative: Inc=96 (0x60), Dec=97 (0x61)
  - absolute: DataEntry MSB=6 (0x06), LSB=38 (0x26)
- **nrpn null/reset**: MSB=127 & LSB=127
- **pads & leds**: pads typically on CH10; LED on=NoteOn velocity 127, off=NoteOff 0

## Structure
**Hardware**: 6 encoders + 16 pads (4×4 grid), each with 3 banks
**File**: SysEx format with header + 55 controls (7 bytes) + 18 pads (8 bytes) + footer

## Format
```
F0 47 00 34 10 04 1d 01 + preset_name(8) + controls(55×7) + pads(18×8) + F7
```

## Control Entry (7 bytes)
```
[enabled][params(4)][channel][controller]
01        00 04 32 00  09      24         = Bank1 Encoder1: CH10 CC36
```

## Pad Entry (8 bytes) 
```
[type][pad#][channel][ctrl][vel][00][00][seq]
02    03    09      00    7F   00  00  01     = Pad3: CH10 Note vel=127
```

## Banks
- **Encoders**: entries 1-6 (bank1), 7-12 (bank2), 13-18 (bank3)
- **Pads**: 16 pads × 3 banks = 48 possible (only 18 used in this preset)
- **Channels**: 09=CH10(drums), 0A=CH11(NRPN), 0C-10=CH13-17(CC/PC)

## "chroma10" Preset Analysis

### Header
- **SysEx**: F0 (start), F7 (end)
- **Manufacturer**: 47 00 34 (Akai)
- **Preset**: "chroma10" (factory default focus on pad chromatic layout)

### Encoder Banks
- Factory chroma10 presets typically emphasize pad layout; encoder slots may be CC‑based defaults, sparsely populated, or disabled.
- Observed patterns include contiguous CC ranges on CH10 or neighboring channels (e.g., CH11/12) for basic 7‑bit absolute control.
- NRPN is generally not used in strict factory chroma10; when high‑resolution control is desired, reprogram encoders to NRPN (see custom chroma12‑milkii below).

### Pad Types and Layout
- 16 pads → CH10 Note On/Off across a 4×4 grid.
- Note numbers: 0x24–0x33 (36–51) in a spatially logical chromatic layout.
- Velocity: commonly fixed 0x7F (127); LED brightness driven by Note velocity on host.

### Structure Summary
- The chroma10 default establishes CH10 as the pad/percussion channel with a consistent 4×4 note grid. Encoders remain CC‑oriented unless explicitly reprogrammed. Host scripts can safely treat CH10 Note traffic (pads) separately from any CH10 CC traffic (encoders) by branching on MIDI status (Note vs CC).

## "chroma11" Preset Analysis

### Header
- **SysEx**: F0 (start), F7 (end)
- **Manufacturer**: 47 00 34 (Akai)  
- **Preset**: "chroma11" (factory variant with mixed pad/CC/NRPN examples)

### Encoder Banks
- **Bank 1 Enc 1**: CH10 CC36 (enabled)
- **Bank 2 Enc 3**: CH10 CC43 (enabled)  
- **Bank 3 Enc 5**: CH10 CC50 (enabled)
- *Most other encoders are disabled/empty*

### Pad Types and Layout
- **Note Pads** (2): Pads 3,4 → CH10 Note On/Off
- **CC Pads** (2): Pads 1,2 → CH13,14 CC messages
- **NRPN Pads** (2): Pads 5,6 → CH15,16 NRPN MSB/LSB
- **Other Pads** (12): Various channels 17-28
- Velocity: commonly fixed 0x7F (127) for Note pads; LED brightness driven by Note velocity on host.

### Structure Summary
- This preset uses minimal encoder configuration (3/18) but diverse pad types across multiple MIDI channels for different message types.
- Host scripts can safely treat CH10 Note traffic (pads) separately from any CH10 CC/NRPN traffic (encoders) by branching on MIDI status (Note vs CC).

## Parser Example
```python
def parse_mpd218(filename):
    with open(filename, 'rb') as f: data = f.read()
    
    preset_name = data[8:16].decode('ascii').rstrip('\x00')
    controls = [{'enabled': data[0x10+i*7]==1, 'channel': data[0x15+i*7], 'controller': data[0x16+i*7]} 
                for i in range(55)]
    pads = [{'pad': data[0x194+i*8+1], 'channel': data[0x194+i*8+2], 'velocity': data[0x194+i*8+4]} 
            for i in range(18)]
    
    return {'name': preset_name, 'controls': controls, 'pads': pads}
```

## Extended Reference

### Overview and provenance
- This notes the on-disk SysEx wire format of Akai MPD218 preset files with observed fields from multiple presets, including a custom working preset used by the controller script:
  - chroma12-milkii preset file: `/home/milk/media/projects/audio/mpd218/chroma12-milkii.mpd218`
- Observations are empirical. Akai may revise structure across firmware. Treat unknown bytes as reserved.

### High-level layout (observed)
- SysEx start: `F0`
- Manufacturer/Model: `47 00 34`
- Preset header continuation: bytes vary (`10 04 1d 01` commonly observed)
- Preset name: 8 bytes ASCII, null-padded
- Controls block: 55 entries × 7 bytes each (encoders, knobs, misc)
- Reserved/padding: 3 bytes (observed gap before pads)
- Pads block: 18 entries × 8 bytes each (represent configured pad slots)
- SysEx end: `F7`

Notes:
- The “55 controls” covers three encoder banks (18 slots) plus other device controls Akai stores; many may be disabled.
- Only 18 pad entries are stored even though the MPD218 exposes 16×3 pads in operation. Unconfigured pads are omitted from the file.

### Channel encoding and MIDI status
- MIDI channels are 1–16. In file bytes and on the wire, Akai encodes channel as 0-based nibble/byte:
  - 0x00 → CH1, …, 0x09 → CH10, …, 0x0F → CH16
- Wire status bytes for the same channel (useful for controller scripting):
  - Note On/Off: `0x90 + (channel-1)` / `0x80 + (channel-1)`
    - Example: CH10 Note On = `0x99`, Note Off = `0x89`
  - Control Change (CC): `0xB0 + (channel-1)`
    - Example: CH10 CC = `0xB9`
  - NRPN uses CC numbers: MSB=99 (0x63), LSB=98 (0x62), Data Inc=96 (0x60), Data Dec=97 (0x61), Data Entry MSB=6 (0x06), Data Entry LSB=38 (0x26)

### Control entry (7 bytes) — field breakdown (observed)
```
[enabled][params(4)][channel][controller]
```
- `enabled` (1 byte): 0x01 = enabled, 0x00 = disabled
- `params(4)` (4 bytes): mode/behavior payload. Akai multiplexes here:
  - CC absolute mode (7‑bit or paired 14‑bit)
  - NRPN absolute (MSB/LSB + Data Entry)
  - NRPN relative increment/decrement (Data Inc/Dec)
  - Device‑specific relative via Channel Pressure
  - The exact bit layout is not fully published; treat as opaque unless you need to generate presets programmatically. Dump two presets that differ by only one option to diff these.
- `channel` (1 byte): 0x00..0x0F (CH1..CH16). Example: 0x09 = CH10
- `controller` (1 byte): for CC modes this is the CC number (e.g., 0x24 = CC36)

Examples (taken from real files):
- `01 00 04 32 00  09  24`
  - enabled, params `00 04 32 00` (opaque here), channel 0x09 (CH10), controller 0x24 (CC36)

### Pad entry (8 bytes) — field breakdown (observed)
```
[type][pad#][channel][ctrl][vel][00][00][seq]
```
- `type` (1 byte): 0x02 = Note, 0x01 = CC (observed). Other values appear reserved.
- `pad#` (1 byte): device pad index (Akai numbering, not necessarily 0-based)
- `channel` (1 byte): 0x00..0x0F (CH1..CH16) as above
- `ctrl` (1 byte): note number if `type=Note`, CC number if `type=CC`
- `vel` (1 byte): default velocity for Note type (e.g., 0x7F)
- `00 00` (2 bytes): reserved
- `seq` (1 byte): pad slot sequence

Example:
- `02 03 09 00 7F 00 00 01` → Pad 3, CH10, Note, velocity 127

### Banks and slot indexing
- Encoders: entries 1–6 (Bank A), 7–12 (Bank B), 13–18 (Bank C). Remaining control entries are reserved/unused in most presets.
- Pads: 18 stored entries correspond to active configuration across pad banks. The device still exposes 16 pads × 3 banks on the wire.

### Practical mapping notes (Mixxx controller script alignment)
- Current script assumes NRPN for high‑resolution encoders; it listens on these channels for jog/zoom/beatgrid:
  - CH1..CH6 for zoom/beatgrid encoders
  - CH9..CH12 for jogwheel NRPN per deck
- Pads typically send Note messages on CH10 in factory “chroma10/chroma12” styles. It is safe to also use CH10 for an encoder’s NRPN because the message types differ (Note vs CC) and the script separates handlers by status byte.
- LED driving uses Note On with velocity for brightness, Note Off for off. For CH10 pads: `0x99` with velocity 127 to light, `0x89` with velocity 0 to clear.

### Robust parsing guidance
- Don’t hard‑code offsets you can derive:
  - The controls block begins after the 8‑byte name; in observed files this is at 0x10.
  - Controls length is fixed at 55×7.
  - A 3‑byte reserved region often follows.
  - The pads block then begins (observed at 0x194) for 18×8 bytes.
- Because small variations exist across presets/firmware, prefer anchored scans:
  - Find `F0 47 00 34` then read name at +8 for 8 bytes.
  - Read 55×7 controls starting at 0x10 unless the header indicates otherwise.
  - If your computed pad start ≠ 0x194, scan forward for a plausible pads table by validating entries against `[type, pad#, channel]` ranges.

### A more defensive parser (Python)
```python
from dataclasses import dataclass

@dataclass
class Control:
    enabled: bool
    params: bytes
    channel: int
    controller: int

@dataclass
class Pad:
    type: int
    pad: int
    channel: int
    ctrl: int
    velocity: int
    seq: int

def parse_mpd218_strict(data: bytes):
    assert data[0] == 0xF0 and data[-1] == 0xF7, "not a SysEx frame"
    assert data[1:4] == bytes([0x47,0x00,0x34]), "unexpected manufacturer/model"

    name = data[8:16].decode('ascii', errors='ignore').rstrip('\x00')

    controls_start = 0x10
    controls = []
    for i in range(55):
        base = controls_start + i*7
        entry = data[base:base+7]
        controls.append(Control(
            enabled=(entry[0]==1),
            params=entry[1:5],
            channel=entry[5],
            controller=entry[6]
        ))

    # observed 3-byte reserved gap
    pads_start = controls_start + 55*7 + 3
    pads = []
    for i in range(18):
        base = pads_start + i*8
        entry = data[base:base+8]
        pads.append(Pad(
            type=entry[0], pad=entry[1], channel=entry[2], ctrl=entry[3],
            velocity=entry[4], seq=entry[7]
        ))

    return { 'name': name, 'controls': controls, 'pads': pads }
```

### Known quirks and gotchas
- Many controls are present but disabled; do not assume contiguous enabled encoders.
- Only a subset of pads are serialized; absence from the pads table does not imply the device won’t send for that physical pad in some banks—validate on the wire.
- Some presets encode 14‑bit CC by pairing CC N and N+32; if you rely on NRPN, prefer decoding NRPN instead of attempting to combine CC pairs.
- NRPN “null” per MIDI spec is MSB=127 and LSB=127; receiving that should clear the currently selected parameter in host scripts.

### Cross‑checking with a live device
- Verify per‑channel behavior by listening to status bytes:
  - Pads on CH10 should produce `0x99`/`0x89` Note events with expected note numbers/velocities.
  - Encoders set to NRPN on CH9..CH12 should produce `0xB?` CC sequences using 99/98 + 96/97.
- When both pads and an encoder share CH10, ensure your host separates based on status class (Note vs CC) to avoid conflicts.

### Related assets
- Factory presets: `/home/milk/media/projects/audio/mpd218/MPD218 - Factory Presets/`
- Custom preset (active with this script): `/home/milk/media/projects/audio/mpd218/chroma12-milkii.mpd218`

---

## Hex Field Map (with annotated example)

### Offsets (observed)
- `0x00`: `F0` (SysEx start)
- `0x01–0x03`: `47 00 34` (Akai manufacturer/model)
- `0x04–0x07`: header continuation (often `10 04 1d 01`)
- `0x08–0x0F`: preset name (8 ASCII bytes, null‑padded)
- `0x10–0x190`: 55 × 7‑byte control entries (385 bytes)
- `0x191–0x193`: 3‑byte reserved gap
- `0x194–0x1CB`: 18 × 8‑byte pad entries (144 bytes)
- `...`: any further reserved/padding up to
- `end`: `F7` (SysEx end)

### Minimal annotated hexdump (illustrative)
```hex
F0 47 00 34 10 04 1D 01   63 68 72 6F 6D 61 31 32   ; "chroma12" name @ 0x08
[ 55 × 7 control bytes ... ]                         ; 0x10 .. 0x190
00 00 00                                              ; reserved gap @ 0x191..0x193
02 01 09 24 7F 00 00 01   ; pad#1  type=Note  ch=10 note=36 vel=127 seq=1
02 02 09 25 7F 00 00 02   ; pad#2  type=Note  ch=10 note=37 vel=127 seq=2
01 03 0C 10 00 00 00 03   ; pad#3  type=CC    ch=13 cc=16  vel(ignored)  seq=3
...                                                  ; remaining pad slots
F7                                                    ; SysEx end
```

Notes:
- The hexdump is schematic; real files contain full control/pad tables.
- Name bytes are ASCII; non‑ASCII is typically zero‑padded.

## Observed pad type values (from multiple presets)

| value | meaning | ctrl field | example |
|-------|---------|------------|---------|
| 0x02  | Note    | note #     | `02 03 09 00 7F 00 00 01` → pad3, CH10, Note 0x00, vel 127 |
| 0x01  | CC      | CC #       | `01 01 0C 10 00 00 00 01` → pad1, CH13, CC 16 |
| other | reserved/unused (observed but undocumented) | — | treat as opaque |

Practical:
- For Notes, LED brightness is the velocity in host scripts; use 127 for full.
- For CC pads, the velocity byte is present but not used.

## On‑wire traces (status‑level examples)

### Pad press/release on CH10 (Note)
```
press:   0x99 0x24 0x7F   ; NoteOn CH10, note 36, vel 127 (LED bright)
release: 0x89 0x24 0x00   ; NoteOff CH10, note 36, vel 0   (LED off)
```

### NRPN relative inc/dec on CH10 (CC)
Select parameter (example param 0x0010), then relative moves:
```
0xB9 0x63 0x00   ; CC99 MSB = 0x00
0xB9 0x62 0x10   ; CC98 LSB = 0x10  → param 0x0010 selected
0xB9 0x60 0x01   ; CC96 Data Increment (step size = 1)
0xB9 0x61 0x02   ; CC97 Data Decrement (step size = 2)
```
Absolute variant (14‑bit data entry) would instead send CC6 (MSB) and CC38 (LSB).

### NRPN null/reset on any channel
```
CC99 = 127, CC98 = 127  → host should clear current NRPN parameter selection
```

## Script crosswalk (format ↔ controller script)

*currently this is wrong, wip*

This section links the preset format fields and wire messages to their handling in the Mixxx controller script at `Akai-MPD218-milkii/Akai-MPD218-milkii-scripts.js`.

### Channels and status bytes → script constants
- `CH → status` mapping
  - Note On: `0x90 + (ch-1)` → `MPD218.midi.noteOn`
  - Note Off: `0x80 + (ch-1)` → `MPD218.midi.noteOff`
  - CC: `0xB0 + (ch-1)` → `MPD218.midi.channel` (base), plus ch‑specific helpers where used
- Common channel shortcuts used by the script
  - Channel 9 buttons: `noteOnCh9=0x98`, `noteOffCh9=0x88`, `ccCh9=0xB8`
  - Channel 10 pads: `noteOnCh10=0x99`, `noteOffCh10=0x89`
  - NRPN CC numbers: `nrpnMSB=0x63 (99)`, `nrpnLSB=0x62 (98)`, `nrpnIncrement=0x60 (96)`, `nrpnDecrement=0x61 (97)`

### NRPN selection and motion → handlers and state
- Parameter select (format: CC 99/98) → `MPD218.handleNRPNMSB()` / `MPD218.handleNRPNLSB()`
  - Updates `MPD218.nrpnState.channels[ch].msb/lsb`
  - Clears parameter on NRPN null/reset (MSB=127, LSB=127)
- Relative motion (format: CC 96/97) → `MPD218.handleNRPNIncrement()` / `MPD218.handleNRPNDecrement()`
  - Looks up per‑channel intent via `MPD218.nrpnChannelMappings`
  - Dispatches to purpose‑built helpers:
    - Zoom: `MPD218.handleNRPNZoom(deck, value, speed, direction, ch)`
    - Beatgrid: `MPD218.handleNRPNBeatgrid(deck, direction, ch, value)`
    - Jogwheel: `MPD218.handleNRPNJogwheel(deck, direction, ch, value, speed)`
- Registration of NRPN CCs per channel happens in `MPD218.setupMIDIHandlers()`
  - Jogwheel NRPN channels registered explicitly: 9 (0xB8), 10 (0xB9), 11 (0xBA), 12 (0xBB)
  - Additional channels 1..6 are registered for zoom/beatgrid NRPN depending on layout

### Pads (Note entries) → pad handlers and LEDs
- Format: Pad type=Note on CH10 → wire `0x99/0x89` with note number and velocity
- Script:
  - Input handling: `MPD218.handlePad()` registered for both `0x90` (base) and `0x99` (CH10) in `MPD218.setupMIDIHandlers()` using the unified pad layout abstraction.
  - LED driving: `MPD218.updateLED(note, velocity)` sends Note On/Off on both base pad channel and CH10 to ensure visual sync with presets that place pads on CH10.
  - Banked pad mapping: `MPD218.padMappings = MPD218.createPadMappings()`; pads are mapped to hotcues or features by bank.

### Button columns (channel 9) → feature toggles and LEDs
- Format: Channel 9 Note On (0x98) indicates a press; velocity > 0 = pressed.
- Script:
  - Feature toggles: `MPD218.handleBPMLock`, `MPD218.handleKeyLock`, `MPD218.handleSlipMode`, `MPD218.handleQuantization`
  - LED sync helpers: `MPD218.syncFeatureLEDs()` backs LEDs using `noteOnCh9`/`noteOffCh9` and full velocity for ON.
  - Strong re‑sync on toggle: `MPD218.applyBinaryToggle()` sends immediate LED feedback and verifies with a short timer.

### Mapping table authority
- `MPD218.nrpnChannelMappings` acts as the source of truth for encoder intent per MIDI channel (zoom, beatgrid, jogwheel) and speed scalar.
- `MPD218.nrpnState.channels` tracks per‑channel NRPN selection and data bytes.
- Legacy CC paths (`MPD218.knobMappings` + `MPD218.handleKnob`) can be gated or removed when NRPN is in use to avoid overlap.

### Practical cross‑checks
- If the preset uses CH10 for pads and any encoder, you should see:
  - Pad presses: `0x99 note vel` (Note On) and `0x89 note 0` (Note Off)
  - Encoder NRPN: `0xB9` CC 99/98 (select) followed by 96/97 (motion)
- The script branches by status class, so Note vs CC on the same channel do not conflict.