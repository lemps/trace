import { currentOs, type Os } from "./os";

// What each OS's player can read (`platform::SoundPlayer` on the backend, which has the
// final say). Offered as the file picker's filter.
const AUDIO_EXTENSIONS: Record<Os, string[]> = {
  macos: ["aiff", "aif", "wav", "mp3", "m4a", "caf", "aac"],
  linux: ["wav", "ogg", "oga", "flac"],
  windows: ["wav"],
};

export const audioExtensions = AUDIO_EXTENSIONS[currentOs];
