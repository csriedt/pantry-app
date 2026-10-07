// #region TYPES
interface MadeDateLineProperties {
  madeAt: Date;
  /** Passed in so rendering stays pure; screens hand it the fixture clock. */
  now: Date;
}
// #endregion

export const MadeDateLine = (props: MadeDateLineProperties) => {
  // #region CONSTANTS
  const { madeAt, now } = props;

  // Inside seven days the weekday is warmer; outside it, the date is clearer.
  const daysAgo = Math.floor(
    (now.getTime() - madeAt.getTime()) / 86_400_000
  );
  const label =
    daysAgo <= 7
      ? `Made ${madeAt.toLocaleDateString("en-US", { weekday: "long" })}`
      : `Made ${madeAt.toLocaleDateString("en-US", { day: "numeric", month: "short" })}`;
  // #endregion

  // #region VIEW
  return (
    <span className="ml-auto flex-none font-mono text-meta font-semibold whitespace-nowrap text-rust">
      {label}
    </span>
  );
  // #endregion
};
