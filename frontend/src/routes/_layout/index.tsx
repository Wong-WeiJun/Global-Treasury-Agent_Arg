import { createFileRoute, Link as RouterLink } from "@tanstack/react-router"
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
    <div className="min-h-screen bg-[#111] text-white font-sans antialiased selection:bg-[#27a495]">

      {/* HERO SECTION */}
      <section 
        className="h-screen flex items-center justify-center text-center px-5 bg-cover bg-center bg-no-repeat relative"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55)), url('/assets/Dashboard/dashboard.gif')`
        }}
      >
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-[72px] md:leading-tight font-bold mb-5 uppercase tracking-wide">
            MyAudit Dashboard
          </h1>
          <p className="text-lg md:text-xl text-zinc-300 max-w-xl mx-auto">
            Hi, {currentUser?.full_name || currentUser?.email || "User"}  Welcome back.
          </p>
        </div>
      </section>

      {/* SHOWCASE SECTION */}
      <section className="px-5 md:px-[60px] py-20 md:py-[100px] bg-[#181818]">
        <h2 className="text-center text-3xl md:text-[42px] font-bold mb-[60px]">
          Featured Projects
        </h2>

        {/* Responsive Grid Setup */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap- tracking-normal gap-7 max-w-7xl mx-auto">
          
          {/* Card 1 */}
          <a href="/Serve/Web Pass Man/Index.html" className="block text-inherit no-underline group">
            <div className="bg-[#222] rounded-xl overflow-hidden transition-all duration-300 transform group-hover:-translate-y-2 shadow-lg">
              <img 
                src="https://images.unsplash.com/photo-1563986768609-322da13575f3?w=600&auto=format&fit=crop&q=60" 
                alt="Password Manager illustration" 
                className="w-full block object-cover aspect-video"
              />
              <div className="p-5">
                <h3 className="text-xl font-bold mb-2 text-white group-hover:text-[#27a495] transition-colors">
                  Document
                </h3>
                <p className="text-zinc-400 text-sm">Password Manager.</p>
              </div>
            </div>
          </a>

          {/* Card 2 */}
          <a href="/Serve/Local Preview/index.html" className="block text-inherit no-underline group">
            <div className="bg-[#222] rounded-xl overflow-hidden transition-all duration-300 transform group-hover:-translate-y-2 shadow-lg">
              <img 
                src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=60" 
                alt="File system illustration" 
                className="w-full block object-cover aspect-video"
              />
              <div className="p-5">
                <h3 className="text-xl font-bold mb-2 text-white group-hover:text-[#27a495] transition-colors">
                  Chat
                </h3>
                <p className="text-zinc-400 text-sm">Use our Agent.</p>
              </div>
            </div>
          </a>

          {/* Card 3 - External Video Link */}
          <a 
            href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="block text-inherit no-underline group"
          >
            <div className="bg-[#222] rounded-xl overflow-hidden transition-all duration-300 transform group-hover:-translate-y-2 shadow-lg">
              <img 
                src="https://images.unsplash.com/photo-1614741118887-7a4ee193a5fa?w=600&auto=format&fit=crop&q=60" 
                alt="Placeholder illustration" 
                className="w-full block object-cover aspect-video"
              />
              <div className="p-5">
                <h3 className="text-xl font-bold mb-2 text-white group-hover:text-[#27a495] transition-colors">
                  nothing yet...
                </h3>
                <p className="text-zinc-400 text-sm">Maybe one day.</p>
              </div>
            </div>
          </a>

        </div>
      </section>
    </div>
  )
}