import { getDesktopConfig } from "./world/config";
import { installVoiceDoubleClick } from "./world/voiceDoubleClick";
import "./world/window";

// fork-only: join voice channels on double click (opt-in, off by default)
installVoiceDoubleClick(
  document,
  () => getDesktopConfig()?.voiceJoinOnDoubleClick === true,
);
