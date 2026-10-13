import { Meal } from "./meal";

/** The user's meals, most recent first. */
export type ListMealsResponse = {
  meals: Meal[];
};
