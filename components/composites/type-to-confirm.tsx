import { useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// #region TYPES
interface TypeToConfirmProperties {
  label: string;
  word: string;
  actionLabel: string;
  onConfirm?: () => void;
}
// #endregion

export const TypeToConfirm = (props: TypeToConfirmProperties) => {
  // #region CONSTANTS
  const { label, word, actionLabel, onConfirm } = props;
  // #endregion

  // #region HOOKS
  const [value, setValue] = useState("");
  // #endregion

  // #region HANDLERS
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
  };
  // #endregion

  // #region VIEW
  const confirmed = value.trim() === word;

  return (
    <div>
      <div className="mb-2 font-mono text-micro tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </div>
      <Input
        value={value}
        onChange={onChange}
        aria-label={label}
        className="font-mono tracking-[0.08em]"
      />
      <Button
        variant="destructive"
        className="mt-4 w-full"
        disabled={!confirmed}
        onClick={onConfirm}
      >
        {actionLabel}
      </Button>
    </div>
  );
  // #endregion
};
