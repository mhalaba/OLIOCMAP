import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Banner } from "./components/Banner";
import { BottomNav } from "./components/BottomNav";
import { currentUser, fetchConfig, fetchStatus, pb } from "./lib/pb";
import { queueAll, queueRemove } from "./lib/queue";
import { AddPointPage } from "./pages/AddPointPage";
import { LoginPage } from "./pages/LoginPage";
import { MapPage } from "./pages/MapPage";
import { CertPage, NodesPage, ReportPage } from "./pages/MiscPages";
import { MyPointsPage } from "./pages/MyPointsPage";
import { OperatorPage } from "./pages/OperatorPage";
import { PrintPage } from "./pages/PrintPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { RegisterPage } from "./pages/RegisterPage";
import { StatusPage } from "./pages/StatusPage";
import type { NodeStatus } from "./types";

export default function App() {
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [user, setUser] = useState(currentUser());
  const [pending, setPending] = useState(0);
  const [httpsNote, setHttpsNote] = useState(false);
  const [intervalDays, setIntervalDays] = useState(14);

  useEffect(() => {
    const unsub = pb.authStore.onChange(() => setUser(currentUser()));
    const pull = () => {
      fetchStatus()
        .then(setStatus)
        .catch(() => setStatus((s) => s || ({ mode: "wyspa" } as NodeStatus)));
    };
    pull();
    fetchConfig()
      .then((c) => {
        setIntervalDays(c.confirm_interval_days || 14);
      })
      .catch(() => {});
    const secure = window.isSecureContext;
    setHttpsNote(!secure);
    const id = setInterval(pull, 5000);
    const onVis = () => {
      if (document.visibilityState === "visible") pull();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      unsub();
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (!user || (user.role !== "operator" && user.role !== "admin")) return;
    pb.collection("points")
      .getList(1, 1, { filter: 'status = "pending" && category != "potrzeba"' })
      .then((r) => setPending(r.totalItems))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    async function flush() {
      if (!pb.authStore.isValid) return;
      const items = await queueAll();
      for (const it of items) {
        try {
          await pb.collection("points").create(it.payload);
          await queueRemove(it.id);
        } catch {
          break;
        }
      }
    }
    window.addEventListener("online", flush);
    flush();
    return () => window.removeEventListener("online", flush);
  }, [user]);

  return (
    <div className="app">
      <Banner status={status} httpsNote={httpsNote} />
      <Routes>
        <Route path="/" element={<MapPage intervalDays={intervalDays} />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/rejestracja" element={<RegisterPage />} />
        <Route path="/dodaj" element={<AddPointPage />} />
        <Route path="/moje" element={<MyPointsPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/operator" element={<OperatorPage intervalDays={intervalDays} />} />
        <Route path="/operator/wezly" element={<NodesPage />} />
        <Route path="/wydruk" element={<PrintPage />} />
        <Route path="/prywatnosc" element={<PrivacyPage />} />
        <Route path="/instalacja-certyfikatu" element={<CertPage />} />
        <Route path="/zglos-blad/:id" element={<ReportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav user={user} pendingCount={pending} />
    </div>
  );
}
