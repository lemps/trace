#!/usr/bin/env bash
# Starts a built trace on a CI runner and fails if it dies within a few seconds: catches
# missing libraries and startup panics that compiling and unit tests can't. Saves what's
# on screen to first-screen.png. It says nothing about whether agents work.
set -uo pipefail

WAIT=20
case "$(uname -s)" in
  Linux)
    export DISPLAY=:99
    Xvfb "$DISPLAY" -screen 0 1280x832x24 &
    xvfb=$!
    sleep 2
    src-tauri/target/release/trace &
    app=$!
    sleep "$WAIT"
    import -window root first-screen.png || echo "::warning::No screenshot."
    if ! kill -0 "$app" 2>/dev/null; then
      wait "$app"
      echo "::error::trace exited during startup with status $?."
      exit 1
    fi
    kill "$app" "$xvfb"
    ;;
  MINGW* | MSYS*)
    powershell -NoProfile -Command "
      \$app = Start-Process -PassThru 'src-tauri\target\release\trace.exe'
      Start-Sleep -Seconds $WAIT
      Add-Type -AssemblyName System.Windows.Forms, System.Drawing
      try {
        \$b = [Windows.Forms.Screen]::PrimaryScreen.Bounds
        \$img = New-Object Drawing.Bitmap \$b.Width, \$b.Height
        [Drawing.Graphics]::FromImage(\$img).CopyFromScreen(\$b.Location, [Drawing.Point]::Empty, \$b.Size)
        \$img.Save('first-screen.png')
      } catch { Write-Host '::warning::No screenshot.' }
      if (\$app.HasExited) {
        Write-Host \"::error::trace exited during startup with status \$(\$app.ExitCode).\"
        exit 1
      }
      Stop-Process -Id \$app.Id -Force
    "
    ;;
  *)
    echo "::error::No startup check for $(uname -s)."
    exit 1
    ;;
esac
