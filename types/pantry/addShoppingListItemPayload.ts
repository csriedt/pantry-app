import { GenericPayload } from "../service/payloads";
import { AddShoppingListItemResponse } from "./addShoppingListItemRequest";

export type AddShoppingListItemPayload =
  GenericPayload<AddShoppingListItemResponse>;
