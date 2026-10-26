import { Component } from "react";
import { failFloatPart } from "./floatParts.js";

/* A Float part that throws while it renders is out for the session: the
   boundary marks it failed (every surface then falls back to Field Day's
   own) and shows its fallback meanwhile. Field Day never goes down with it. */
export class FloatBoundary extends Component {
  constructor(props) { super(props); this.state = { error:false }; }
  static getDerivedStateFromError() { return { error:true }; }
  componentDidCatch(error) {
    try {
      console.error(JSON.stringify({ event:"float-part-failed", part:this.props.name,
        error:String(error?.message || error).slice(0, 200) }));
    } catch {}
    failFloatPart(this.props.name, "render");
  }
  render() { return this.state.error ? this.props.fallback ?? null : this.props.children; }
}
