import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

const root = createRoot(document.getElementById("root")!);

// ?dev=art — лист процедурного арта (работа над графикой); ?dev=map — карта
// местности (прототип непрерывного рельефа против гекс-мозаики). Оба грузятся
// отдельными чанками и в основной бандл игры не попадают.
const dev = new URLSearchParams(location.search).get("dev");
const sheet = dev === "art";
const mapdev = dev === "map";

if (sheet) {
  import("./ArtSheet").then(({ default: ArtSheet }) => {
    root.render(<StrictMode><ArtSheet /></StrictMode>);
  });
} else if (mapdev) {
  import("./MapDev").then(({ default: MapDev }) => {
    root.render(<StrictMode><MapDev /></StrictMode>);
  });
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
