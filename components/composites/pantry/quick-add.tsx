"use client";

import { useEffect, useState, type ChangeEvent } from "react";

import { QuickAddSuggestions } from "@/components/composites/quick-add-suggestions";
import { Input } from "@/components/ui/input";
import { useCreateUserFood } from "@/hooks/catalog/useCreateUserFood";
import { useSearchFoods } from "@/hooks/catalog/useSearchFoods";
import type { Food } from "@/types/catalog/food";

// #region TYPES
interface QuickAddProperties {
  placeholder?: string;
  helperText?: string;
  createOnMissNote?: string;
  autoFocus?: boolean;
  onSelect: (food: Food) => void;
}
// #endregion

// #region CONSTANTS
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 8;
// #endregion

export const QuickAdd = (props: QuickAddProperties) => {
  // #region CONSTANTS
  const {
    placeholder = "Add an item",
    helperText = "Names only — no amounts, no dates. Add those later if you want.",
    createOnMissNote = "saved to your pantry only",
    autoFocus = false,
    onSelect,
  } = props;
  // #endregion

  // #region HOOKS
  const [term, setTerm] = useState("");
  const [query, dispatchSearch] = useSearchFoods();
  const [createUserFood] = useCreateUserFood();
  // #endregion

  // #region HELPERS
  const trimmed = term.trim();
  const foods = trimmed.length > 0 ? (query.data?.data?.foods ?? []) : [];
  const exactMatch = foods.some(
    food => food.canonical_name.toLowerCase() === trimmed.toLowerCase(),
  );
  const createOnMiss =
    trimmed.length > 0 && !exactMatch ? trimmed : undefined;
  // #endregion

  // #region HANDLERS
  const onTermChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTerm(event.target.value);
  };

  const pick = (food: Food) => {
    setTerm("");
    onSelect(food);
  };

  const create = (name: string) => {
    createUserFood(
      { canonical_name: name },
      { onSuccess: ({ data }) => data && pick(data.food) },
    );
  };
  // #endregion

  // #region LIFECYCLE
  useEffect(() => {
    if (trimmed.length === 0) return undefined;
    const timer = setTimeout(
      () => dispatchSearch({ params: { query: trimmed, limit: SEARCH_LIMIT } }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [trimmed, dispatchSearch]);
  // #endregion

  // #region VIEW
  return (
    <div>
      <Input
        value={term}
        onChange={onTermChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      {trimmed.length > 0 ? (
        <div className="mt-3">
          <QuickAddSuggestions
            suggestions={foods}
            createOnMiss={createOnMiss}
            createOnMissNote={createOnMissNote}
            searching={query.isFetching}
            onPick={pick}
            onCreate={create}
          />
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
  // #endregion
}
