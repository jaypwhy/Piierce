#!/usr/bin/env bash
# Install the `pc` shim into /usr/local/bin so `pc` runs from a bare shell.
#
#   bash bin/install-pc.sh [target-dir]     # default /usr/local/bin
#
# The shim is a small wrapper, not a copy of the CLI: it locates a built Piierce
# checkout at run time (PC_HOME, then $HOME/piierce-work, then this checkout) and
# execs its compiled CLI. Re-running this is safe, and it is how you put `pc`
# back after the shim goes missing.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-/usr/local/bin}"
TARGET="${TARGET_DIR}/pc"

if [ ! -f "${HERE}/dist/cli.js" ]; then
  echo "install-pc: ${HERE}/dist/cli.js is missing — run \`npm run build\` here first." >&2
  exit 1
fi

mkdir -p "${TARGET_DIR}"
cat > "${TARGET}" <<EOF
#!/bin/sh
# pc — the Pierce Collabs CLI (see jaypwhy/Piierce).
#
# A shim, not a copy: it finds a Piierce checkout that has been built and runs
# the compiled CLI from it, so \`pc\` always reflects the source of truth on disk.
# Restore it with \`bash <checkout>/bin/install-pc.sh\`.
#
#   PC_HOME  an explicit Piierce checkout, tried first
#
# Exit codes are the CLI's own: 0 ok · 1 error · 2 bad usage · 3 not connected.
for dir in "\$PC_HOME" \\
  "\$HOME/piierce-work" \\
  /home/agent-lead/piierce-work \\
  "${HERE}"; do
  if [ -n "\$dir" ] && [ -f "\$dir/bin/pc.mjs" ] && [ -f "\$dir/dist/cli.js" ]; then
    exec node "\$dir/bin/pc.mjs" "\$@"
  fi
done

echo "pc: no built Piierce checkout found. Set PC_HOME to one, or run bin/install-pc.sh in a checkout." >&2
exit 1
EOF
chmod 0755 "${TARGET}"

echo "install-pc: wrote ${TARGET} (checkout: ${HERE})"
