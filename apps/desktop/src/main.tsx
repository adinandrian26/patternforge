import { render } from "preact";

import { App } from "./App";
import "./styles.css";

const root = document.getElementById("app");

if (root === null) {
  throw new Error("PatternForge root element was not found.");
}

render(<App />, root);
