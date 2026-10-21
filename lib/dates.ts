const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

export const formatDayMonth = (iso: string): string =>
  DAY_MONTH.format(new Date(iso));
