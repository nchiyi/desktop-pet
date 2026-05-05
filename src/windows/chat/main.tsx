import React from "react";
import "../../i18n";
import ReactDOM from "react-dom/client";
import { ChatApp } from "./ChatApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ChatApp />
  </React.StrictMode>
);
