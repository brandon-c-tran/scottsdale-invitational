import React from "react";

export function PageHeading({ kicker, title, children, aside }) {
  return <header className="fd-page-heading">
    {kicker && <div className="fd-kicker">{kicker}</div>}
    <div className="fd-page-heading-row"><h1>{title}</h1>{aside}</div>
    {children}
  </header>;
}

export function SectionHeading({ title, detail, action }) {
  return <div className="fd-section-heading">
    <div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}
  </div>;
}
