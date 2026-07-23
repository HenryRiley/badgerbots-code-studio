import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConnectApp } from "./ConnectApp.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Connect root was not found.");

createRoot(root).render(
  <StrictMode>
    <ConnectApp />
  </StrictMode>,
);
