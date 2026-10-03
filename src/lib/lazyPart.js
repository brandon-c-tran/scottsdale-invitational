/* A component that loads its module on first use (React.lazy) so phones
   never download what only the TV or a commissioner renders. Once the
   module has landed, a new mount renders it directly; a mounted instance
   keeps the type it started with, so it never remounts when the load
   finishes. `preload()` fetches ahead (a commissioner device warms its
   sheets) and lets tests render synchronously. Render inside <Suspense>. */
import React, { lazy, useState } from "react";

export function lazyPart(load, name) {
  let Loaded = null, pending = null;
  const preload = () => pending || (pending = load().then(module => {
    Loaded = module[name];
    return Loaded;
  }, error => { pending = null; throw error; }));
  const Lazy = lazy(() => preload().then(Component => ({ default:Component })));
  function Part(props) {
    const [Component] = useState(() => Loaded || Lazy);
    return React.createElement(Component, props);
  }
  Part.displayName = `Lazy(${name})`;
  Part.preload = preload;
  return Part;
}
