#!/usr/bin/env bash
# System libraries a Linux build of trace compiles and packages against (Debian/Ubuntu).
set -euo pipefail
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
  librsvg2-dev libxdo-dev patchelf libfuse2 file
