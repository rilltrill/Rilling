# CK3 History Extractor - macOS Setup Guide

This guide will help you set up and run the CK3 History Extractor on macOS.

## Known Issues on macOS

### Crash After Parsing
The program may crash after successfully parsing your save file, particularly with:
- **Modded saves** (Steam Workshop or custom mods)
- **DLC content** that introduces characters without proper localization
- **Large save files** with extensive character histories

**Symptoms:**
```
Save parsing complete
[Many warnings about missing keys]
Well, this is embarrassing.
ck3_history_extractor had a problem and crashed.
```

### Why This Happens
The crashes are typically caused by:
1. Characters with missing language data (common in mods)
2. Missing localization keys for custom content
3. Memory issues when rendering large family trees

## Solutions & Workarounds

### Option 1: Try a Vanilla (Unmodded) Save
The most reliable workaround is to create a new save without mods:

1. **Disable all mods** in CK3
2. **Load your game**
3. **Create a new save**
4. **Use this new save** with the extractor

This often resolves the crash issues.

### Option 2: Reduce Rendering Depth
When the program asks for "rendering depth", try:
- **Depth 0 or 1** for quicker processing and less memory usage
- Avoid depths > 2 on large saves

### Option 3: Create a Fresh Test Save
If you just want to see the tool in action:
1. Start a new CK3 game
2. Play for 20-50 years
3. Save the game
4. Extract that save (small saves are less likely to crash)

## macOS Installation Steps

### 1. Install Prerequisites

#### Install Homebrew (if not already installed)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### Install Rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

After installation, close and reopen your Terminal.

### 2. Build the Program

```bash
# Navigate to the CK3-history-extractor directory
cd ~/Downloads/CK3-history-extractor

# Build the release version
cargo build --release
```

This will take several minutes. When complete, the executable will be at:
`target/release/ck3_history_extractor`

### 3. Find Your Save Files

Your CK3 saves are typically located at:
```
~/Documents/Paradox Interactive/Crusader Kings III/save games/
```

To list them:
```bash
ls -la ~/Documents/Paradox\ Interactive/Crusader\ Kings\ III/save\ games/
```

### 4. Find Your CK3 Game Installation

For **Steam** installations:
```
~/Library/Application Support/Steam/steamapps/common/Crusader Kings III/game
```

**IMPORTANT:** Point to the `/game` subdirectory, not the main folder!

### 5. Run the Program

```bash
cd ~/Downloads/CK3-history-extractor
./target/release/ck3_history_extractor
```

When prompted:
- **Save file path**: Drag and drop your .ck3 file into Terminal
- **Game path**: Use the path above (with `/game` at the end)
- **Rendering depth**: Start with **1** (lower is safer)
- **Language**: `english`
- **Output path**: Create a folder like `~/Documents/ck3-output` and drag it in

## Using the Helper Script

We've included a helper script to make this easier:

```bash
chmod +x run_ck3_extractor.sh
./run_ck3_extractor.sh
```

## Debugging Crashes

If the program still crashes:

### 1. Run with Verbose Error Output
```bash
RUST_BACKTRACE=full ./target/release/ck3_history_extractor
```

### 2. Try Command-Line Mode
Instead of interactive mode, try specifying everything upfront:

```bash
./target/release/ck3_history_extractor \
  --save-path "/path/to/your/save.ck3" \
  --game-path "~/Library/Application Support/Steam/steamapps/common/Crusader Kings III/game" \
  --output-path "~/Documents/ck3-output" \
  --depth 1
```

### 3. Check for Ironman Saves
Ironman saves need special handling. Check if your save is ironman-encoded.

### 4. Report the Issue
If you still can't get it working:
1. Save the crash report (shown in the error message)
2. Open an issue at: https://github.com/TCA166/CK3-history-extractor/issues
3. Include:
   - Your macOS version
   - Whether you're using mods
   - The crash report file
   - The last few lines of output before the crash

## Tips for Success

1. **Start small**: Test with a short, unmodded game first
2. **Keep rendering depth low**: Use depth 1 or 2 max
3. **Create a dedicated output folder**: Don't output to Desktop or Documents root
4. **Be patient**: Large saves can take 5-10 minutes to process
5. **Check free disk space**: The output can be several hundred MB

## Expected Warnings

These warnings are **normal** and don't indicate a problem:
```
Warning: key x_mc_XXX not found
Warning: key house_XXXXX not found
Warning: key ce1_heroic_legacy_track_name not found
```

These are just missing localization keys for custom/mod content. They won't prevent the extraction from completing successfully.

## Success!

When it works, you'll see:
- Progress bars for parsing and rendering
- Output files in your specified output directory
- An `index.html` file you can open in any browser

Open `index.html` in your web browser to explore your CK3 history!

## Getting Help

- **GitHub Issues**: https://github.com/TCA166/CK3-history-extractor/issues
- **Example Output**: https://tca166.github.io/CK3-history-extractor/TCA166's%20history/index.html
- **Original README**: See README.md in this directory
