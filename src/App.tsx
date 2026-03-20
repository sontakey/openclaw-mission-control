import { Link, Route, Routes } from "react-router-dom";

const navigationItems = [
  { label: "Board", path: "/" },
  { label: "Agents", path: "/agents" },
  { label: "Settings", path: "/settings" },
];

function Page({ title, description }: { description: string; title: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </section>
  );
}

export default function App() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-teal-700">
              Mission Control
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Local dashboard scaffold for your OpenClaw fleet.
            </p>
          </div>
          <nav className="flex gap-2">
            {navigationItems.map((item) => (
              <Link
                key={item.path}
                className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-teal-50 hover:text-teal-800"
                to={item.path}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <Routes>
          <Route
            path="/"
            element={
              <Page
                title="Board"
                description="Kanban board components will land in the next implementation step."
              />
            }
          />
          <Route
            path="/agents"
            element={
              <Page
                title="Agents"
                description="Agent status panels and live data hooks will be added next."
              />
            }
          />
          <Route
            path="/settings"
            element={
              <Page
                title="Settings"
                description="Environment and gateway settings will be wired in once the backend routes exist."
              />
            }
          />
        </Routes>
      </div>
    </main>
  );
}
