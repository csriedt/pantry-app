import { GenericErrorPayload } from "./genericErrorPayload";

export interface GenericPayload<T> extends GenericErrorPayload {
  data?: T;
}
