#!/bin/sh

# This script runs as root to fix permissions on mounted volumes
echo "--- Fixing volume permissions ---"
chown -R appuser:appgroup /recordings
chown -R appuser:appgroup /var/log/motion
chown -R appuser:appgroup /app/motion_confs

# Now, drop privileges and execute the main command as 'appuser'
echo "--- Dropping privileges and starting application ---"
exec gosu appuser python -u detector.py