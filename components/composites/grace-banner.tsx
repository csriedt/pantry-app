// #region TYPES
interface GraceBannerProperties {
  text: string;
  actionLabel: string;
  onAction?: () => void;
}
// #endregion

export const GraceBanner = (props: GraceBannerProperties) => {
  // #region CONSTANTS
  const { text, actionLabel, onAction } = props;
  // #endregion

  // #region VIEW
  return (
    <div className="flex items-center gap-2.5 rounded-control border border-strong bg-chip px-3.5 py-[11px] text-[12.5px] leading-snug">
      <span className="min-w-0 flex-1">{text}</span>
      <button
        type="button"
        onClick={onAction}
        className="min-h-11 flex-none px-1 text-[12.5px] font-semibold text-ink underline underline-offset-2"
      >
        {actionLabel}
      </button>
    </div>
  );
  // #endregion
};
