import { useEffect, useState } from "react";
import { toast } from "@/app/toast";
import { BusyLabel } from "@/components/BusyLabel";
import { I } from "@/components/Icon";
import { Markdown } from "@/components/Markdown";
import { appVersion, checkAppUpdate, installAppUpdate, type UpdateInfo } from "@/ipc/update";
import { SettingRow } from "./SettingRow";

type Phase = "idle" | "checking" | "current" | "available" | "installing";

// The Updates section of Settings: show the running version, check the GitHub
// release feed on demand, and install + relaunch in place. Dev builds have no
// release feed behind them, so a failed check is a toast, not fatal.
export function UpdateSettings() {
  const [version, setVersion] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    void appVersion().then(setVersion);
  }, []);

  const check = async () => {
    setPhase("checking");
    try {
      const found = await checkAppUpdate();
      setUpdate(found);
      setPhase(found ? "available" : "current");
    } catch (err) {
      toast.error(`Couldn't check for updates: ${String(err)}`);
      setPhase("idle");
    }
  };

  const install = async () => {
    setPhase("installing");
    try {
      await installAppUpdate();
      // The app restarts on success — anything after this only runs on failure.
    } catch (err) {
      toast.error(`Couldn't install the update: ${String(err)}`);
      setPhase("available");
    }
  };

  const hint =
    phase === "current"
      ? "You're on the latest version."
      : phase === "installing"
        ? "Downloading and installing…"
        : "Updates are downloaded from GitHub releases and verified before installing.";

  return (
    <section className="setting-group">
      <h2>Updates</h2>
      <div className="desc">trace {version ? `v${version}` : ""}</div>
      <SettingRow label={update ? `v${update.version} available` : "App version"} hint={hint}>
        {phase === "available" && update ? (
          <button type="button" className="btn primary" onClick={() => void install()}>
            <I.Download size={14} /> Install &amp; restart
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={() => void check()}
            disabled={phase === "checking" || phase === "installing"}
          >
            <BusyLabel busy={phase === "checking"} idle="Check for updates" working="Checking…" />
          </button>
        )}
      </SettingRow>
      {phase === "available" && update?.notes && (
        <div className="update-notes">
          <div className="update-notes-title">What's new in v{update.version}</div>
          <Markdown text={update.notes} />
        </div>
      )}
    </section>
  );
}
