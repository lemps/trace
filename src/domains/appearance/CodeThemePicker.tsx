import { CODE_THEMES } from "./chatStyle";
import { useAppearance } from "./store";

// The code themes as thumbnails: a few highlighted lines, each card carrying
// its own data-code-theme so it paints with that theme's real colours
// (styles/code-themes.css). "Match theme" follows the app theme.

function Snippet() {
  return (
    <code className="ap-code-thumb">
      <span className="hljs-comment">{"// open the file"}</span>
      {"\n"}
      <span className="hljs-keyword">const</span> <span className="hljs-title">path</span> ={" "}
      <span className="hljs-string">"src/a.ts"</span>;{"\n"}
      <span className="hljs-keyword">await</span> <span className="hljs-title">open</span>(path,{" "}
      <span className="hljs-number">42</span>);
    </code>
  );
}

export function CodeThemePicker() {
  const codeTheme = useAppearance((s) => s.prefs.chat.codeTheme);
  const updateChat = useAppearance((s) => s.updateChat);
  return (
    <fieldset className="ap-thumbs" aria-label="Code theme">
      {CODE_THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={codeTheme === t.id}
          className={`ap-thumb${codeTheme === t.id ? " on" : ""}`}
          onClick={() => updateChat({ codeTheme: t.id })}
        >
          <span className="ap-code-card" data-code-theme={t.id}>
            <Snippet />
          </span>
          <span className="ap-thumb-name">{t.label}</span>
        </button>
      ))}
    </fieldset>
  );
}
