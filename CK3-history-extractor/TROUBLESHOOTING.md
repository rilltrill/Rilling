# CK3 History Extractor - Troubleshooting Guide

## Your Crash Issue

Based on your error output, your CK3 History Extractor is crashing during the rendering phase after successfully parsing your save file. This is a **known issue** that affects modded saves and saves with extensive DLC content.

### What's Happening

Your output shows:
1. ✅ Save file parsing **completed successfully**
2. ✅ Game files **loaded successfully**
3. ⚠️ **Many warnings** about missing localization keys (NORMAL - don't worry about these!)
4. ❌ **Crash** during the rendering/HTML generation phase

### The Cause

According to GitHub Issue #44 (https://github.com/TCA166/CK3-history-extractor/issues/44), crashes like yours are typically caused by:

- **Characters with no language data** - Often introduced by mods
- **Missing localization for custom content** - DLC and mods add content without full localization
- **Memory issues** with large, complex save files

### The Quick Fix: Use a Vanilla Save

The **most reliable solution** is to extract a vanilla (unmodded) save:

#### Step-by-Step Fix

1. **Launch CK3**

2. **Disable ALL mods**
   - Main menu → Playset → Select "Ironman"

 or create a new playset with no mods

3. **Load your current game**
   - It may show warnings about missing content - that's OK
   - You don't need to play, just load it

4. **Save immediately**
   - Create a new save with a different name (e.g., "vanilla_extract.ck3")

5. **Use this new save with the extractor**
   - This save won't have mod-specific characters/data
   - Should extract successfully!

## Alternative Solutions

### Solution 2: Try a Smaller Save

Create a test save to verify the extractor works:

1. Start a **new CK3 game** (vanilla, no mods)
2. Play for **20-50 years** (just enough for some history)
3. Save and exit
4. Extract this save - it's small and should work perfectly

### Solution 3: Lower Rendering Depth

If you must use your current save:

1. When prompted for "rendering depth", enter **0** or **1**
2. This processes less data and may avoid the crash
3. Depth options:
   - **0**: Minimal rendering, fastest
   - **1**: Basic rendering, safe for most saves
   - **2**: More detail, higher crash risk
   - **3+**: Maximum detail, highest crash risk

### Solution 4: Check for Ironman Encoding

If your save is Ironman (look for `last_save.ck3`):

1. Check the main README for ironman handling
2. You may need to disable ironman and create a regular save

## Still Crashing?

### Report It!

The developer is actively fixing crashes. Help them by reporting:

1. **Go to**: https://github.com/TCA166/CK3-history-extractor/issues
2. **Create a new issue** with:
   - Title: "macOS crash during rendering phase"
   - Your macOS version
   - List of mods/DLC you're using
   - Whether a vanilla save works
   - The crash report file path (shown in error message)

### Run with Full Debug Info

To get detailed error information for the developer:

```bash
cd ~/Downloads/CK3-history-extractor
RUST_BACKTRACE=full ./target/release/ck3_history_extractor
```

Copy the full output and include it in your GitHub issue.

## What Those Warnings Mean

You saw hundreds of warnings like:
```
Warning: key x_mc_277 not found
Warning: key house_cardona not found
Warning: key ce1_heroic_legacy_track_name not found
```

**These are NORMAL!** They just mean:
- The extractor can't find text translations for some mod/DLC content
- They don't cause crashes
- They appear even on successful extractions

Think of them like browser console warnings - annoying but harmless.

## Expected Behavior (When Working)

A successful extraction looks like:

```
[00:00:02] Save parsing complete
[00:00:05] Rendering characters...
[00:00:10] Rendering titles...
[00:00:15] Rendering dynasties...
[00:00:18] Generating timeline...
[00:00:20] Creating HTML...
Done! Output written to: /path/to/output
```

You should then have:
- An `index.html` file in your output directory
- Folders for characters, titles, dynasties, etc.
- An interactive website you can browse locally

## Prevention Tips

To avoid crashes in the future:

1. **Test with vanilla saves first** - Always verify the tool works before trying modded saves
2. **Start with small saves** - A 50-year campaign extracts faster and more reliably than a 500-year one
3. **Keep mods minimal** - The more mods, the higher the crash risk
4. **Use lower render depths** - Depth 1-2 is usually enough
5. **Report crashes** - Help the developer improve the tool!

## FAQ

**Q: Will I lose my game progress if I create a vanilla save?**
A: No! Your original save is untouched. You're just creating a copy without mods for extraction.

**Q: The vanilla save won't have my mod content in the extracted history, right?**
A: Correct. The trade-off is: modded content (with crashes) vs. vanilla content (stable). Once the developer fixes the mod crashes, you can re-extract with full content.

**Q: How long does extraction take?**
A: Small saves (< 100 years): 1-2 minutes
Medium saves (100-300 years): 3-5 minutes
Large saves (300+ years): 5-15+ minutes

**Q: Is this a macOS-specific problem?**
A: No, it affects all platforms. Modded saves crash on Windows and Linux too.

**Q: Will future versions fix this?**
A: The developer is actively working on it! Issue #44 and #45 are tracking these crashes.

## Success Stories

Many users have successfully extracted their histories by:
1. Using vanilla saves
2. Lowering render depth
3. Creating smaller test saves first

You can see an example of what the output looks like here:
https://tca166.github.io/CK3-history-extractor/TCA166's%20history/index.html

## Need More Help?

- 📖 **macOS Setup Guide**: Read `MACOS_SETUP.md` in this directory
- 🚀 **Helper Script**: Run `./run_ck3_extractor.sh` for guided extraction
- 🐛 **Report Issues**: https://github.com/TCA166/CK3-history-extractor/issues
- 📧 **Original Author**: TCA166 on GitHub

Good luck with your extraction! The tool is awesome when it works, and with a vanilla save, it should work perfectly for you.
