// #region TYPES
export type StockState = "stocked" | "short" | "out";

interface StockGlyphProperties {
  state: StockState;
}
// #endregion

export const StockGlyph = (props: StockGlyphProperties) => {
  // #region CONSTANTS
  const { state } = props;

  // The dot is never the only signal — the amount or the state chip carries
  // the meaning; this mark is decorative.
  const stateClass = {
    stocked: "bg-ink",
    short: "bg-amber",
    out: "shadow-[inset_0_0_0_2px_var(--ink)]",
  }[state];
  // #endregion

  // #region VIEW
  return (
    <span
      aria-hidden="true"
      className={`size-[9px] flex-none rounded-full ${stateClass}`}
    />
  );
  // #endregion
};
