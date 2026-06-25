import "./style.css";
import { Game } from "./game";

const canvas = document.getElementById("scene") as HTMLCanvasElement;
new Game(canvas);
