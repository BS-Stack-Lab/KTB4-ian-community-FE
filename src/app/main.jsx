import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "../shared/styles/global.css";
import "./app.css";
import { startAppUpdateCoordinator } from "../shared/update/appUpdateCoordinator.js";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("React root element를 찾을 수 없습니다.");

startAppUpdateCoordinator();
createRoot(rootElement).render(<App />);
