import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Site from "./pages/Site";
import Admin from "./pages/Admin";
import MentionsLegales from "./pages/MentionsLegales";
import ProtectionDonnees from "./pages/ProtectionDonnees";
import Desinscription from "./pages/Desinscription";
import Annuler from "./pages/Annuler";
import WidgetReservation from "./pages/WidgetReservation";
import "./theme.css";
import "./app.css";
import "./site.css";

const ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH || "/gestion-a7x9k2";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Site />} />
        <Route path="/mentions-legales" element={<MentionsLegales />} />
        <Route path="/protection-des-donnees" element={<ProtectionDonnees />} />
        <Route path={ADMIN_PATH} element={<Admin />} />
        <Route path="/desinscription" element={<Desinscription />} />
        <Route path="/annuler" element={<Annuler />} />
        <Route path="/widget-reservation" element={<WidgetReservation />} />
        <Route path="*" element={<Site />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
