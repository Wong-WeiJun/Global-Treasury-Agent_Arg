import { Footer } from "./Footer"

interface AuthLayoutProps {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-svh flex-col gap-4 p-6 md:p-10 bg-transparent w-full">
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className="w-full flex justify-center">{children}</div>
      </div>
      <Footer transparent />
    </div>
  )
}
