import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { MenuProvider } from "./components/MenuProvider";
import { applyDisplayPreferences } from "./utils/preferences";
import "./index.css";

applyDisplayPreferences();

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <MenuProvider>
      <App />
    </MenuProvider>
  </BrowserRouter>
);