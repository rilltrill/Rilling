#!/bin/bash

# CK3 History Extractor - macOS Helper Script
# This script makes it easier to run the CK3 History Extractor on macOS

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==================================${NC}"
echo -e "${BLUE}CK3 History Extractor - macOS${NC}"
echo -e "${BLUE}==================================${NC}"
echo ""

# Check if the executable exists
if [ ! -f "target/release/ck3_history_extractor" ]; then
    echo -e "${YELLOW}Executable not found. Building the project...${NC}"
    cargo build --release
    echo -e "${GREEN}Build complete!${NC}"
    echo ""
fi

# Default paths
DEFAULT_SAVE_DIR="$HOME/Documents/Paradox Interactive/Crusader Kings III/save games"
DEFAULT_GAME_PATH="$HOME/Library/Application Support/Steam/steamapps/common/Crusader Kings III/game"
DEFAULT_OUTPUT_DIR="$HOME/Documents/ck3-history-output"

echo -e "${BLUE}Step 1: Select Save File${NC}"
echo "Default save directory: $DEFAULT_SAVE_DIR"
echo ""

# Check if save directory exists
if [ -d "$DEFAULT_SAVE_DIR" ]; then
    echo -e "${GREEN}Found save games:${NC}"
    ls -1t "$DEFAULT_SAVE_DIR"/*.ck3 2>/dev/null | head -5 | while read -r savefile; do
        echo "  - $(basename "$savefile")"
    done
    echo ""
else
    echo -e "${YELLOW}Default save directory not found!${NC}"
    echo "You'll need to manually enter the save file path."
    echo ""
fi

# Check if game directory exists
echo -e "${BLUE}Step 2: Verify Game Installation${NC}"
if [ -d "$DEFAULT_GAME_PATH" ]; then
    echo -e "${GREEN}✓ Found CK3 game files at: $DEFAULT_GAME_PATH${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠ Game path not found at expected location!${NC}"
    echo "Expected: $DEFAULT_GAME_PATH"
    echo "You'll need to manually enter the game path when prompted."
    echo ""
fi

# Create output directory if it doesn't exist
echo -e "${BLUE}Step 3: Prepare Output Directory${NC}"
if [ ! -d "$DEFAULT_OUTPUT_DIR" ]; then
    echo "Creating output directory: $DEFAULT_OUTPUT_DIR"
    mkdir -p "$DEFAULT_OUTPUT_DIR"
fi
echo -e "${GREEN}✓ Output directory ready: $DEFAULT_OUTPUT_DIR${NC}"
echo ""

# Usage tips
echo -e "${BLUE}==================================${NC}"
echo -e "${YELLOW}IMPORTANT TIPS:${NC}"
echo ""
echo "1. ${GREEN}Rendering Depth${NC}: Start with 1 or 2 (lower is safer)"
echo "2. ${GREEN}Modded Saves${NC}: May crash - try a vanilla save first"
echo "3. ${GREEN}Path Entry${NC}: You can drag & drop files into Terminal"
echo "4. ${YELLOW}Warnings${NC}: Lots of 'key not found' warnings are NORMAL"
echo ""
echo -e "${BLUE}==================================${NC}"
echo ""

# Prompt to continue
read -p "Press ENTER to start the extractor (or Ctrl+C to cancel)... "
echo ""

# Run with backtrace for better error messages
echo -e "${GREEN}Starting CK3 History Extractor...${NC}"
echo ""
export RUST_BACKTRACE=1
./target/release/ck3_history_extractor

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}==================================${NC}"
    echo -e "${GREEN}✓ Extraction completed successfully!${NC}"
    echo -e "${GREEN}==================================${NC}"
    echo ""
    echo "Your CK3 history is ready!"
    echo "Open the index.html file in your output directory to view it."
    echo ""

    # Offer to open the output
    read -p "Open output in browser? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Try to find index.html in the default output directory
        if [ -f "$DEFAULT_OUTPUT_DIR/index.html" ]; then
            open "$DEFAULT_OUTPUT_DIR/index.html"
        else
            echo "Could not find index.html in default output directory."
            echo "Please navigate to your output directory and open index.html manually."
        fi
    fi
else
    echo ""
    echo -e "${RED}==================================${NC}"
    echo -e "${RED}✗ Extraction failed${NC}"
    echo -e "${RED}==================================${NC}"
    echo ""
    echo -e "${YELLOW}Common solutions:${NC}"
    echo "1. Try a vanilla (unmodded) save file"
    echo "2. Use a lower rendering depth (0 or 1)"
    echo "3. Try a smaller/newer save file"
    echo "4. Check the MACOS_SETUP.md guide for more help"
    echo ""
    echo "For more help, visit:"
    echo "https://github.com/TCA166/CK3-history-extractor/issues"
    echo ""
fi
