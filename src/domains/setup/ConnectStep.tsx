import { I } from "@/components/Icon";
import { GITHUB } from "@/domains/integrations/github";
import { INTEGRATIONS } from "@/domains/integrations/registry";
import { TAILSCALE } from "@/domains/integrations/tailscale";
import { VERCEL } from "@/domains/integrations/vercel";

const SERVICES = [GITHUB, ...INTEGRATIONS, VERCEL, TAILSCALE].map((s) => ({
  name: s.name,
  logo: s.logo,
  description: s.description,
}));

interface ConnectStepProps {
  /** Close the first run and open the Integrations page. */
  onOpenIntegrations: () => void;
}

// Step 3: what trace can connect to. Each one links to the Integrations page,
// which holds the forms; nothing here is required (sessions work with none).
export function ConnectStep({ onOpenIntegrations }: ConnectStepProps) {
  return (
    <>
      <div className="su-intro">
        All optional: trace runs sessions without any of these. Connect one now or later from
        Integrations in the rail.
      </div>
      <ul className="su-services">
        {SERVICES.map((s) => (
          <li key={s.name}>
            <button type="button" className="su-service" onClick={onOpenIntegrations}>
              <img className="su-logo" src={s.logo} alt="" />
              <span className="su-service-text">
                <span className="su-service-name">{s.name}</span>
                <span className="su-service-desc">{s.description}</span>
              </span>
              <I.Chevron size={13} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
