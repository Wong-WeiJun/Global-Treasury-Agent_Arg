import { Appearance } from "@/components/Common/Appearance"
import { Footer } from "./Footer"

interface AuthLayoutProps {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    /* Removed 'bg-zinc-950' to make the layout wrapper background fully transparent */
    <div className="flex min-h-svh flex-col gap-4 p-6 md:p-10 bg-transparent w-full">
      <div className="flex justify-end">
        <Appearance />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        {/* Your custom brand logo */}
        <img
          src="/assets/images/favicon.png"
          alt="Brand Logo"
          className="h-16 w-auto object-contain"
        />

        {/* Removed 'max-w-xs' constraints here so that the card size can be controlled cleanly by the children templates */}
        <div className="w-full flex justify-center">{children}</div>
      </div>
      <Footer />
    </div>
  )
}
