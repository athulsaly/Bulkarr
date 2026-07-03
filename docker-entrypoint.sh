#!/bin/sh
set -e
chown -R nextjs:nodejs /app/data
exec su-exec nextjs "$@"
