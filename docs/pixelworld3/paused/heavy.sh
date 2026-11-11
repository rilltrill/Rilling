#!/bin/sh
# usage: sh /tmp/pw2/heavy.sh <command ...>
# Runs the command while holding one of three machine-wide slots, so that captures, test suites and
# builds of the agents sharing this 4-core box do not all run at once (stage loads time out when they do).
mkdir -p /tmp/pw2/locks
for i in 0 1 2; do
  exec 9>/tmp/pw2/locks/heavy.$i.lock
  if flock -n 9; then "$@"; exit $?; fi
done
i=$(( $$ % 3 ))
exec 9>/tmp/pw2/locks/heavy.$i.lock
flock 9
"$@"
