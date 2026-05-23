import { createFileRoute, Link } from "@tanstack/react-router";
import useAuth from "@/hooks/useAuth";

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [
      {
        title: "MyAudit - Dashboard",
      },
    ],
  }),
});

function Dashboard() {
  const { user: currentUser } = useAuth();

  return (
    <div className="min-h-screen bg-[#111] text-white font-sans antialiased selection:bg-[#1677c8]">
      {/* HERO SECTION */}
      <section
        className="h-screen flex items-center justify-center text-center px-5 bg-cover bg-center bg-no-repeat relative"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55)), url('/assets/Dashboard/dashboard.gif')`,
        }}
      >
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-[72px] md:leading-tight font-bold mb-5 uppercase tracking-wide drop-shadow-md">
            MyAudit Dashboard
          </h1>
          <p className="text-lg md:text-xl text-zinc-300 max-w-xl mx-auto">
            Hi, {currentUser?.full_name || currentUser?.email || "User"} Welcome
            back.
          </p>
        </div>
      </section>

      {/* SHOWCASE SECTION */}
      <section className="px-6 md:px-12 py-20 md:py-[100px] bg-[#181818]">
        <h2 className="text-center text-3xl md:text-[42px] font-bold mb-[60px] tracking-tight">
          Tools
        </h2>

        {/* Responsive Grid Setup */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] tracking-normal gap-7 max-w-7xl mx-auto">
          <Link to="/chat" className="block text-inherit no-underline group">
            <div className="bg-[#222] rounded-xl overflow-hidden transition-all duration-300 transform group-hover:-translate-y-2 shadow-lg">
              <img
                src="/assets/Dashboard/chat.png"
                alt="File system illustration"
                className="w-full block object-cover aspect-video"
              />
              <div className="p-5">
                <h3 className="text-xl font-bold mb-2 text-white group-hover:text-[#65d4e8] transition-colors">
                  Chat
                </h3>
                <p className="text-zinc-400 text-sm">Use our Agent.</p>
              </div>
            </div>
          </Link>

          <Link
            to="/reconcile"
            className="block text-inherit no-underline group"
          >
            <div className="bg-[#222] rounded-xl overflow-hidden transition-all duration-300 transform group-hover:-translate-y-2 shadow-lg">
              <img
                src="/assets/Dashboard/document.jpg"
                alt="Placeholder illustration"
                className="w-full block object-cover aspect-video"
              />
              <div className="p-5">
                <h3 className="text-xl font-bold mb-2 text-white group-hover:text-[#1677c8] transition-colors">
                  Documents
                </h3>
                <p className="text-zinc-400 text-sm">
                  Match a payment proof against bank statement entries using AI.
                </p>
              </div>
            </div>
          </Link>

          <Link
            to="/settings"
            className="block text-inherit no-underline group"
          >
            <div className="bg-[#222] rounded-xl overflow-hidden transition-all duration-300 transform group-hover:-translate-y-2 shadow-lg">
              <img
                src="/assets/Dashboard/editprofile.png"
                alt="Placeholder illustration"
                className="w-full block object-cover aspect-video"
              />
              <div className="p-5">
                <h3 className="text-xl font-bold mb-2 text-white group-hover:text-[#1677c8] transition-colors">
                  Edit Profile
                </h3>
                <p className="text-zinc-400 text-sm">Edit Personal Profile.</p>
              </div>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
