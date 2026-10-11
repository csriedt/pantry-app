import { describe, expect, it } from "vitest";

import { gateRoute } from "@/services/supabase/routeGate";

// The gate is the only security decision the proxy makes, so its policy
// is pinned here: anonymous is locked out of everything by default, the
// auth pages are public, and a signed-in user is moved off them.
describe("route gate (deny by default)", () => {
  it("sends anonymous visitors to sign-in", () => {
    expect(gateRoute("/pantry", false)).toEqual({ redirect: "/sign-in" });
    expect(gateRoute("/pantry/items/anything", false)).toEqual({
      redirect: "/sign-in",
    });
    expect(gateRoute("/", false)).toEqual({ redirect: "/sign-in" });
  });

  it("lets signed-in users through to the app", () => {
    expect(gateRoute("/pantry", true)).toBeNull();
    expect(gateRoute("/", true)).toBeNull();
    expect(gateRoute("/chef/thread/42", true)).toBeNull();
  });

  it("keeps the auth pages reachable when signed out", () => {
    expect(gateRoute("/sign-in", false)).toBeNull();
    expect(gateRoute("/sign-up", false)).toBeNull();
  });

  it("moves signed-in users off the auth pages into the app", () => {
    expect(gateRoute("/sign-in", true)).toEqual({ redirect: "/pantry" });
    expect(gateRoute("/sign-up", true)).toEqual({ redirect: "/pantry" });
  });
});
