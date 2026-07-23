import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HostApp } from "./HostApp.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Host root element is missing.");

createRoot(root).render(
  <StrictMode>
    <HostApp />
  </StrictMode>,
);
