import { useEffect } from "react";
import type { NavId } from "@/app/nav";
import { Modal } from "@/components/Modal";
import { AgentStep } from "./AgentStep";
import { ConnectStep } from "./ConnectStep";
import { SETUP_STEPS, stepBy } from "./checks";
import { PreflightList } from "./PreflightList";
import { useSetupStore } from "./store";
import { ThemeStep } from "./ThemeStep";

interface SetupFlowProps {
  onNav: (nav: NavId) => void;
}

// The first run (three skippable steps: agent, theme, connect) and the checks on
// their own (the launch notice's Details). Mounted once in the app shell; on
// mount it decides which, if either, this launch shows (`store.launch`).
export function SetupFlow({ onNav }: SetupFlowProps) {
  const view = useSetupStore((s) => s.view);
  const step = useSetupStore((s) => s.step);
  const launch = useSetupStore((s) => s.launch);
  const goTo = useSetupStore((s) => s.goTo);
  const close = useSetupStore((s) => s.close);

  useEffect(() => launch(), [launch]);

  if (view === "checks") {
    return (
      <Modal
        title="Setup checks"
        onClose={close}
        className="su-modal"
        footer={
          <button type="button" className="btn primary" onClick={close}>
            Done
          </button>
        }
      >
        <PreflightList />
      </Modal>
    );
  }
  if (view !== "setup") return null;

  const at = SETUP_STEPS.findIndex((s) => s.id === step);
  const isLast = at === SETUP_STEPS.length - 1;
  const openIntegrations = () => {
    close();
    onNav("integrations");
  };

  return (
    <Modal
      title="Set up trace"
      onClose={close}
      className="su-modal"
      footer={
        <>
          <button type="button" className="btn su-skip" onClick={close}>
            Skip setup
          </button>
          {at > 0 && (
            <button type="button" className="btn" onClick={() => goTo(stepBy(step, -1))}>
              Back
            </button>
          )}
          <button
            type="button"
            className="btn primary"
            onClick={isLast ? close : () => goTo(stepBy(step, 1))}
          >
            {isLast ? "Finish" : "Next"}
          </button>
        </>
      }
    >
      <ol className="su-steps" aria-label="Setup steps">
        {SETUP_STEPS.map((s, i) => (
          <li key={s.id} className={i === at ? "on" : i < at ? "done" : undefined}>
            <button type="button" onClick={() => goTo(s.id)} aria-current={i === at && "step"}>
              <span className="su-step-n">{i + 1}</span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>
      {step === "agent" && <AgentStep />}
      {step === "theme" && <ThemeStep />}
      {step === "connect" && <ConnectStep onOpenIntegrations={openIntegrations} />}
    </Modal>
  );
}
