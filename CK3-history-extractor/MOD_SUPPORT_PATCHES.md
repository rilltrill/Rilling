# CK3 History Extractor - Mod Support Patches

## Overview

This document describes the patches applied to the CK3 History Extractor to fix crashes when processing modded save files. The patches make the extractor more resilient to missing or incomplete data that mods may introduce.

## The Problem

The original CK3 History Extractor would crash (panic) when encountering:
- Missing localization keys for modded content
- Characters with incomplete data (e.g., no languages)
- Malformed data structures from mods
- Graph generation failures due to inconsistent data

These crashes occurred because the code used `.unwrap()` extensively, which panics when it encounters `None` or an error.

## The Solution

Instead of crashing, the patched extractor now:
1. **Logs warnings** when it encounters problematic data
2. **Skips problematic entities** rather than halting completely
3. **Continues processing** the rest of the save file
4. **Generates partial output** with whatever it can successfully extract

## Files Modified

### 1. `lib/src/display/renderer.rs`

**Changes:**
- Replaced `.unwrap()` calls in the `render()` method with proper error handling
- Added logging for template loading failures
- Added logging for template rendering failures
- Added logging for file writing failures
- Fixed potential panic in BFS queue processing

**Impact:**
- Characters/entities that fail to render are skipped with a warning
- The rest of the extraction continues normally
- User sees which entities failed to render in the logs

### 2. `lib/src/display/graph.rs`

**Changes:**
- Fixed division-by-zero potential in death graph generation
- Added error handling for all graph drawing operations:
  - Line graph creation
  - Family tree generation
  - Timeline graph creation
- Replaced all `.unwrap()` calls with proper error handling
- Added logging for graph generation failures

**Impact:**
- Graphs that fail to generate are skipped with a warning
- Missing or inconsistent data in graphs doesn't crash the entire extraction
- The rest of the HTML pages still generate successfully

## Technical Details

### Error Handling Pattern

**Before:**
```rust
let template = env.get_template(T::TEMPLATE_NAME).unwrap();
let contents = template.render(obj.deref()).unwrap();
fs::write(path, contents).unwrap();
```

**After:**
```rust
let template = match env.get_template(T::TEMPLATE_NAME) {
    Ok(t) => t,
    Err(e) => {
        eprintln!("Warning: Failed to get template {}: {}", T::TEMPLATE_NAME, e);
        return;
    }
};
// ... similar patterns for other operations
```

### Division by Zero Fix

**Before:**
```rust
*data.get(&year).unwrap_or(&0) as f64 / *contast.get(&year).unwrap() as f64
```

**After:**
```rust
filter_map(|year| {
    let total = contast.get(&year).copied().unwrap_or(1);
    if total == 0 {
        return None; // Skip years with no data
    }
    Some((*data.get(&year).unwrap_or(&0) as f64 / total as f64))
})
```

## What Users Will See

### Successful Extraction
With the patches, a modded save will now extract successfully, showing warnings like:
```
Warning: key x_mc_277 not found
Warning: key house_cardona not found
Warning: Failed to render charTemplate.html: missing field 'custom_mod_field'. Skipping this entity.
Warning: Failed to draw family tree node: ...
[Progress continues...]
Extraction complete!
```

### Partial Output
The generated HTML will include:
- ✅ All successfully rendered characters
- ✅ All successfully generated graphs
- ✅ All successfully rendered titles, faiths, cultures, etc.
- ❌ Missing: Entities that failed to render (logged as warnings)
- ❌ Missing: Graphs that failed to generate (logged as warnings)

## Testing with Your Mods

Your specific mods:
- **Coronations** - Should now work! Coronation events may show generic text if localization is missing
- **Friends & Foes** - Should now work! Relationship data will be extracted if available
- **Legends of the Dead** - Should now work! Legends will appear if the extractor can parse them
- **Garments of the Holy Roman Empire** - Should work fine (cosmetic mod)

## Expected Behavior

### Normal Warnings (Safe to Ignore)
```
Warning: key x_mc_XXX not found
Warning: key house_XXXXX not found
Warning: key ce1_heroic_legacy_track_name not found
```
These are just missing localization keys and are completely normal.

### Entity Skipping (Some data lost, but extraction continues)
```
Warning: Failed to render charTemplate.html: ...
Warning: Failed to draw family tree node: ...
```
This means one specific character or node couldn't be rendered, but others will be.

### Critical Failures (Extraction may stop)
```
Warning: Failed to build chart: ...
Warning: Failed to fill graph background: ...
```
If you see many of these, the graphs may not generate, but character pages should still work.

## How to Use

1. **Build the patched version** (already done):
   ```bash
   cd CK3-history-extractor
   cargo build --release
   ```

2. **Run with your modded save**:
   ```bash
   ./target/release/ck3_history_extractor
   ```

3. **Check the output**:
   - Look for warnings in the console
   - Open the generated `index.html`
   - Verify what was successfully extracted

## Reporting Issues

If the patched extractor still crashes or produces incomplete output:

1. **Save the full console output** to a file
2. **Note which mods you're using**
3. **Check the warnings** to see which entities failed
4. **Report to the original project**: https://github.com/TCA166/CK3-history-extractor/issues

Include:
- Console output with warnings
- List of active mods
- Description of what's missing from the output
- Your CK3 version and DLC list

## Future Improvements

Potential enhancements (not yet implemented):
- [ ] Better mod localization support
- [ ] Automatic mod file discovery and loading
- [ ] Custom parsing for common mod patterns
- [ ] Fallback rendering for unknown entity types
- [ ] Summary report of skipped entities

## Credits

- Original CK3 History Extractor: [TCA166](https://github.com/TCA166/CK3-history-extractor)
- Crash fixes and mod support patches: Applied in response to GitHub Issue #44

## License

These patches maintain compatibility with the original MIT license of the CK3 History Extractor.
