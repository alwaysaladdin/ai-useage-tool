import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { MenubarApp } from "./MenubarApp.jsx";
import "./styles.css";

function RootRouter() {
  const [isMenubar, setIsMenubar] = useState(window.location.hash === "#menubar");

  useEffect(() => {
    function syncRoute() {
      setIsMenubar(window.location.hash === "#menubar");
    }

    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  return isMenubar ? <MenubarApp /> : <App />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootRouter />
  </React.StrictMode>,
);
