import React from "react";

/* No eyebrow above the heading: the title carries itself. (`kicker` is
   accepted for older callers and ignored.) */
export function PageHeading({ title, children, aside }) {
  return <header className="fd-page-heading">
    <div className="fd-page-heading-row"><h1>{title}</h1>{aside}</div>
    {children}
  </header>;
}

export function SectionHeading({ title, detail, action }) {
  return <div className="fd-section-heading">
    <div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}
  </div>;
}
