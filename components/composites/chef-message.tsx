import { cn } from "@/lib/utils";

// #region TYPES
interface ChefMessageProperties {
  role: "ai" | "me";
  text: string;
  tools?: string[];
  note?: string;
  streaming?: boolean;
}
// #endregion

export const ChefMessage = (props: ChefMessageProperties) => {
  // #region CONSTANTS
  const { role, text, tools = [], note, streaming = false } = props;
  // #endregion

  // #region VIEW
  return (
    <div
      className={cn(
        "max-w-[84%] rounded-2xl border border-border px-3.5 py-3 text-[14.5px] leading-normal",
        role === "ai" ? "self-start bg-surface" : "self-end bg-chip"
      )}
    >
      <p className="m-0">
        {text}
        {streaming ? (
          <span
            aria-hidden="true"
            className="animate-caret ml-0.5 inline-block h-[15px] w-0.5 translate-y-[2px] bg-ink"
          />
        ) : null}
      </p>
      {tools.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {tools.map(tool => (
            <span
              key={tool}
              className="inline-flex items-center rounded-pill border border-strong px-2.5 py-1 font-mono text-[10.5px] tracking-[0.03em] text-muted-foreground"
            >
              {tool}
            </span>
          ))}
        </div>
      ) : null}
      {note ? (
        <p className="mt-2.5 text-[11.5px] leading-snug text-muted-foreground">{note}</p>
      ) : null}
    </div>
  );
  // #endregion
};
