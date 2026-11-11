#!/bin/sh
# Playwright 1.56.1 (pinned by the repo) looks for Chromium build 1194; this container ships build 1243.
# Point the expected paths at the installed browser (idempotent). Never run `playwright install`.
B=/opt/pw-browsers
mkdir -p $B/chromium_headless_shell-1194/chrome-linux $B/chromium-1194/chrome-linux
ln -sfn $B/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell $B/chromium_headless_shell-1194/chrome-linux/headless_shell
ln -sfn $B/chromium-1243/chrome-linux64/chrome $B/chromium-1194/chrome-linux/chrome
touch $B/chromium_headless_shell-1194/INSTALLATION_COMPLETE $B/chromium-1194/INSTALLATION_COMPLETE $B/chromium_headless_shell-1194/DEPENDENCIES_VALIDATED $B/chromium-1194/DEPENDENCIES_VALIDATED
