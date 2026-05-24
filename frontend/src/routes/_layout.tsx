import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import { useEffect, useMemo } from "react"

import { IconParticleBackground } from "@/components/Common/Background"
import { Footer } from "@/components/Common/Footer"
import { TopNavbar } from "@/components/Common/TopNavbar"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"
import { getPageIcons } from "@/lib/pageIcons"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/login",
      })
    }
  },
})

function Layout() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const router = useRouterState()

  const pageIcons = useMemo(
    () => getPageIcons(router.location.pathname),
    [router.location.pathname],
  )

  useEffect(() => {
    if (
      user &&
      !user.organization_id &&
      router.location.pathname !== "/onboarding"
    ) {
      navigate({ to: "/onboarding" })
    }
  }, [user, navigate, router.location.pathname])

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!user.organization_id && router.location.pathname !== "/onboarding") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">
          Redirecting to onboarding...
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen w-full flex flex-col bg-blue-50 dark:bg-zinc-900">
      <IconParticleBackground
        icons={pageIcons}
        className="z-0 text-blue-600 dark:text-zinc-500"
      />

      <header className="sticky top-0 z-50 w-full border-b border-blue-900 bg-blue-950 dark:bg-blue-950 backdrop-blur-md transition-all">
        <TopNavbar />
      </header>

      <div className="relative z-10 flex-1 w-full p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </div>

      <Footer />
    </div>
  )
}

export default Layout
