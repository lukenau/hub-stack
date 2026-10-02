# source me — puts the user-local Node 22 toolchain on PATH for this app.
# (The PWA under apps/hub, which the private monorepo builds with the host's
# Node 18, is a separate tree and is not part of this repo.)
export PATH="$HOME/.local/node22/bin:$PATH"
export EXPO_NO_TELEMETRY=1
export CI=1