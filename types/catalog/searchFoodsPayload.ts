import { GenericPayload } from "../service/payloads";
import { SearchFoodsResponse } from "./searchFoodsRequest";

export type SearchFoodsPayload = GenericPayload<SearchFoodsResponse>;
