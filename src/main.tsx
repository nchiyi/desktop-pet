import React from "react";
import "./i18n";
import ReactDOM from "react-dom/client";
import { PetApp } from "./windows/pet/PetApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PetApp />
  </React.StrictMode>
);
