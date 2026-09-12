import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

const root = createRoot(document.getElementById("root")!);

// ?dev=art — лист процедурного арта (работа над графикой). Грузится отдельным
// чанком и в основной бандл игры не попадает.
const sheet = new URLSearchParams(location.search).get("dev") === "art";

if (sheet) {
  import("./ArtSheet").then(({ default: ArtSheet }) => {
    root.render(<StrictMode><ArtSheet /></StrictMode>);
  });
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
