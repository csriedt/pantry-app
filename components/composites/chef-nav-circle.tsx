import Link from "next/link";

// #region TYPES
interface ChefNavCircleProperties {
  href?: string;
  onClick?: () => void;
}
// #endregion

export const ChefNavCircle = (props: ChefNavCircleProperties) => {
  // #region CONSTANTS
  const { href, onClick } = props;

  const circleClass =
    "grid size-[54px] place-items-center justify-self-center rounded-full border border-[color-mix(in_oklab,var(--herb)_78%,var(--ink))] bg-herb text-herb-on";
  // #endregion

  // #region HELPERS
  const sparkle = (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
    >
      <path d="M12 5C12.4 9.2 14.8 11.6 19 12C14.8 12.4 12.4 14.8 12 19C11.6 14.8 9.2 12.4 5 12C9.2 11.6 11.6 9.2 12 5Z" />
    </svg>
  );
  // #endregion

  // #region VIEW
  if (href) {
    return (
      <Link href={href} aria-label="Chef" className={circleClass}>
        {sparkle}
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label="Chef"
      onClick={onClick}
      className={circleClass}
    >
      {sparkle}
    </button>
  );
  // #endregion
};
