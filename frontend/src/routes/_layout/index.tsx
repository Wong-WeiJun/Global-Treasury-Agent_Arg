import { createFileRoute, Link } from "@tanstack/react-router"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [
      {
        title: "MyAudit - Dashboard",
      },
    ],
  }),
})

function Dashboard() {
  const { user: currentUser } = useAuth()

  return (
    <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen min-h-screen bg-[#111111] text-white font-sans antialiased selection:bg-[#1677c8] overflow-x-hidden">
      {/* HERO SECTION */}
      <section
        className="min-h-[calc(100vh-4rem)] flex items-center justify-center text-center px-5 bg-cover bg-center bg-no-repeat relative"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55)), url('/assets/Dashboard/nightdashboard.gif')`,
        }}
      >
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-[72px] md:leading-tight font-bold mb-5 uppercase tracking-wide drop-shadow-md">
            Treasury AI Agent
          </h1>
          <p className="text-lg md:text-xl text-zinc-300 max-w-2xl mx-auto drop-shadow leading-relaxed">
            Autonomous cross-border payment reconciliation, discrepancy
            investigation, and exception management for global treasury
            operations.
          </p>
          <p className="text-sm text-zinc-400 mt-4">
            Welcome back,{" "}
            {currentUser?.full_name || currentUser?.email || "User"}
          </p>
        </div>
      </section>

      {/* SHOWCASE SECTION */}
      <section className="px-6 md:px-12 py-20 md:py-[100px] bg-gray-50 dark:bg-[#181818]">
        <h2 className="text-center text-3xl md:text-[42px] text-black dark:text-white font-bold mb-[60px] tracking-tight">
          Tools
        </h2>

        {/* Responsive Grid Setup */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-7 max-w-7xl mx-auto">
          {/* CHAT ROUTE LINK */}
          <Link
            to="/chat"
            className="block text-inherit no-underline group focus:outline-none"
          >
            <div className="bg-gray-200 dark:bg-[#222] rounded-xl overflow-hidden transition-all duration-300 transform group-hover:-translate-y-2 group-focus:-translate-y-2 shadow-xl border border-zinc-800/40">
              <img
                src="/assets/Dashboard/chat.png"
                alt="File system illustration"
                className="w-full block object-cover aspect-video"
              />
              <div className="p-5">
                <h3 className="text-xl font-bold mb-2 text-black dark:text-white group-hover:text-[#65d4e8] transition-colors">
                  Chat
                </h3>
                <p className="text-zinc-400 text-sm">Use our Agent.</p>
              </div>
            </div>
          </Link>

          {/* DOCUMENTS ROUTE LINK */}
          <Link
            to="/reconcile"
            className="block text-inherit no-underline group focus:outline-none"
          >
            <div className="bg-gray-200 dark:bg-[#222] rounded-xl overflow-hidden transition-all duration-300 transform group-hover:-translate-y-2 group-focus:-translate-y-2 shadow-xl border border-zinc-800/40">
              <img
                src="/assets/Dashboard/document.jpg"
                alt="Placeholder illustration"
                className="w-full block object-cover aspect-video"
              />
              <div className="p-5">
                <h3 className="text-xl font-bold mb-2 text-black dark:text-white group-hover:text-[#65d4e8] transition-colors">
                  Reconcile
                </h3>
                <p className="text-zinc-400 text-sm">
                  Upload payment proofs for AI reconciliation.
                </p>
              </div>
            </div>
          </Link>

          <Link
            to="/history"
            className="block text-inherit no-underline group focus:outline-none"
          >
            <div className="bg-gray-200 dark:bg-[#222] rounded-xl overflow-hidden transition-all duration-300 transform group-hover:-translate-y-2 group-focus:-translate-y-2 shadow-xl border border-zinc-800/40">
              <img
                src="/assets/Dashboard/history.jpg"
                alt="Placeholder illustration"
                className="w-full block object-cover aspect-video"
              />
              <div className="p-5">
                <h3 className="text-xl font-bold mb-2 text-black dark:text-white group-hover:text-[#65d4e8] transition-colors">
                  History
                </h3>
                <p className="text-zinc-400 text-sm">
                  Review past uploaded documents.
                </p>
              </div>
            </div>
          </Link>

          {/* SETTINGS ROUTE LINK */}
          <Link
            to="/settings"
            className="block text-inherit no-underline group focus:outline-none"
          >
            <div className="bg-gray-200 dark:bg-[#222] rounded-xl overflow-hidden transition-all duration-300 transform group-hover:-translate-y-2 group-focus:-translate-y-2 shadow-xl border border-zinc-800/40">
              <img
                src="/assets/Dashboard/editprofile.png"
                alt="Placeholder illustration"
                className="w-full block object-cover aspect-video"
              />
              <div className="p-5">
                <h3 className="text-xl font-bold mb-2 text-black dark:text-white group-hover:text-[#65d4e8] transition-colors">
                  Edit Profile
                </h3>
                <p className="text-zinc-400 text-sm">Edit Personal Profile.</p>
              </div>
            </div>
          </Link>
        </div>
      </section>
    </div>
  )
}

export default Dashboard