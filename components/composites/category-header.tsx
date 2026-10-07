// #region TYPES
interface CategoryHeaderProperties {
  name: string;
  count: number;
}
// #endregion

export const CategoryHeader = (props: CategoryHeaderProperties) => {
  // #region CONSTANTS
  const { name, count } = props;
  // #endregion

  // #region VIEW
  return (
    <div className="flex items-center justify-between gap-2.5 border-b border-strong pb-1.5 font-mono text-micro tracking-[0.09em] text-muted-foreground uppercase">
      <span>{name}</span>
      <span className="tabular-nums">{count}</span>
    </div>
  );
  // #endregion
};
