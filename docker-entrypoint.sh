#!/bin/sh
set -e

PUID=${PUID:-1001}
PGID=${PGID:-1001}

chown -R "${PUID}:${PGID}" /app/data
exec su-exec "${PUID}:${PGID}" "$@"
