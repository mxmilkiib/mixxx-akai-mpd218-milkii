# Akai MPD218 Preset File Format (.mpd218)

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

## "chroma11" Preset Analysis

### Header
- **SysEx**: F0 (start), F7 (end)
- **Manufacturer**: 47 00 34 (Akai)  
- **Preset**: "chroma11"

### Encoder Banks (Active Only)
- **Bank 1 Enc 1**: CH10 CC36 (enabled)
- **Bank 2 Enc 3**: CH10 CC43 (enabled)  
- **Bank 3 Enc 5**: CH10 CC50 (enabled)
- *Most other encoders are disabled/empty*

### Pad Types (18/48 configured)
- **Note Pads** (2): Pads 3,4 → CH10 Note On/Off
- **CC Pads** (2): Pads 1,2 → CH13,14 CC messages
- **NRPN Pads** (2): Pads 5,6 → CH15,16 NRPN MSB/LSB
- **Other Pads** (12): Various channels 17-28

### Structure Summary
This preset uses minimal encoder configuration (3/18) but diverse pad types across multiple MIDI channels for different message types.

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