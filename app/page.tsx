import { ActivityPanel } from "./components/ActivityPanel";
import { ApprovalPanel } from "./components/ApprovalPanel";
import { DependenciesPanel } from "./components/DependenciesPanel";
import { DeploymentsPanel } from "./components/DeploymentsPanel";
import { FindingsPanel } from "./components/FindingsPanel";
import { Header } from "./components/Header";
import { IncidentBanner } from "./components/IncidentBanner";
import { LogsPanel } from "./components/LogsPanel";
import { ServicesPanel } from "./components/ServicePanel";

export default function Page() {
  return (
    <main className="min-h-screen p-4 font-mono text-zinc-300 lg:p-6">
      <div className="mx-auto max-w-[1600px]">
        <Header />
        <IncidentBanner />

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4">
            <ServicesPanel />
            <DependenciesPanel />
          </div>
          <div className="space-y-4">
            <DeploymentsPanel />
            <LogsPanel />
          </div>
          <div className="space-y-4">
            <ApprovalPanel />
            <ActivityPanel />
            <FindingsPanel />
          </div>
        </div>
      </div>
    </main>
  );
}
