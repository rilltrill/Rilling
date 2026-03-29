#!/bin/bash

cd "$(dirname "$0")"

echo "========================================"
echo "       CK3 Save Browser Launcher        "
echo "========================================"
echo ""

if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 is not installed or not in PATH."
    echo "Please install Python 3 from https://www.python.org/"
    echo ""
    echo "Press any key to exit..."
    read -n 1 -s
    exit 1
fi

echo "Starting CK3 Save Browser..."
echo ""

python3 -m ck3_browser
if [ $? -ne 0 ]; then
    echo ""
    echo "python3 failed, trying python..."
    echo ""
    python -m ck3_browser
    if [ $? -ne 0 ]; then
        echo ""
        echo "ERROR: Failed to launch CK3 Save Browser."
        echo "Press any key to exit..."
        read -n 1 -s
        exit 1
    fi
fi
