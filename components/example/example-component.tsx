import "react";
import { useEffect, useState } from "react";

// #region TYPES
interface ExampleComponentProperties {
 // ... properties defined
 a: string;
 b?: number;
}
// ... can also be defined in a properties.ts file, sibling to this file
// #endregion

export const ExampleComponent = (props: ExampleComponentProperties) => {
 // #region CONSTANTS
 const {
  a,
  b = 0,
  // ... destructure the props — this is also where defaults live
 } = props;
 // ... any other constants to define (don't need to be literal constants, it's just a general name)
 // Derived values belong here too: compute from props/state during render
 // instead of mirroring into state and syncing with an effect. An expensive
 // derivation moves to HOOKS as useMemo.
 // #endregion

 // #region HOOKS
 const [state, setState] = useState();
 // ... any up front hooks, memos, state, etc — keep state minimal: only what
 // changes over time; never a copy of props or of derivable data
 // #endregion

 // #region HELPERS
 const doSomething = () => {
  // ... something
 };
 // ... helper or utility functions, functions called within handlers, etc
 // #endregion

 // #region HANDLERS
 const onSomething = () => {
  doSomething();
 };
 // ... handlers for events, onClick, etc — logic caused by a user action
 // belongs here, not in an effect
 // #endregion

 // #region LIFECYCLE
 useEffect(() => {
  doSomething();
 }, [state]);
 // ... useEffect, etc, the hooks that are "active" within the react lifecycle, as opposed to the declarative ones in the hooks region
 // Reacting to props/state here is right when the effect synchronizes with an
 // external system (network, DOM, browser API, non-React widget). It's wrong
 // when the effect's job is to setState a value derived from props/state —
 // that belongs in CONSTANTS, computed during render.
 // #endregion

 // #region VIEW
 return (
  <>
   <button onClick={onSomething}>Click</button>
  </>
 );
 // ... the actual main rendering section (doesn't preclude rendering within help functions)
 // #endregion
};
