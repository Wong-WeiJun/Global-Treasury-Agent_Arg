import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import { useState } from "react"
import { type InvitationAccept, InvitationsService } from "@/client"
import { Footer } from "@/components/Common/Footer"
import useCustomToast from "@/hooks/useCustomToast"

export const Route = createFileRoute("/accept-invitation")({
  component: AcceptInvitationPage,
})

function AcceptInvitationPage() {
  const navigate = useNavigate()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const search = useSearch({ from: "/accept-invitation" }) as { token?: string }
  const token = search.token

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const {
    data: invitationInfo,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["invitation-verify", token],
    queryFn: async () => {
      if (!token) throw new Error("No token")
      return InvitationsService.verifyInvitation({ token }) as Promise<{
        email: string
        organization_name: string
        role: string
        expires_at: string
      }>
    },
    enabled: !!token,
    retry: false,
  })

  const acceptMutation = useMutation({
    mutationFn: (data: InvitationAccept) =>
      InvitationsService.acceptInvitation({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Account created successfully! Please log in.")
      navigate({ to: "/login" })
    },
    onError: (error: any) => {
      showErrorToast(error.body?.detail || "Failed to accept invitation")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      showErrorToast("Passwords do not match")
      return
    }
    if (password.length < 8) {
      showErrorToast("Password must be at least 8 characters")
      return
    }
    if (!token) {
      showErrorToast("Invalid invitation link")
      return
    }
    acceptMutation.mutate({ token, password })
  }

  if (!token) {
    return (
      <div className="dark min-h-screen w-full bg-[url('/assets/images/login.png')] bg-cover bg-center flex items-center justify-center p-4">
        <div className="w-full max-w-[480px] bg-black/40 backdrop-blur-md p-8 rounded-2xl shadow-xl border border-zinc-800/50 text-center">
          <h2 className="text-xl font-bold text-red-400 mb-2">
            Invalid Invitation Link
          </h2>
          <p className="text-sm text-zinc-400 mb-4">
            The invitation link is missing or invalid.
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/login" })}
            className="px-4 py-2 bg-[#1677c8] hover:bg-[#295375] text-white rounded-md transition-colors duration-200"
          >
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="dark min-h-screen w-full bg-[url('/assets/images/login.png')] bg-cover bg-center flex items-center justify-center">
        <div className="text-white">Verifying invitation...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dark min-h-screen w-full bg-[url('/assets/images/login.png')] bg-cover bg-center flex items-center justify-center p-4">
        <div className="w-full max-w-[480px] bg-black/40 backdrop-blur-md p-8 rounded-2xl shadow-xl border border-zinc-800/50 text-center">
          <h2 className="text-xl font-bold text-red-400 mb-2">
            Invalid or Expired Invitation
          </h2>
          <p className="text-sm text-zinc-400 mb-4">
            {(error as any).body?.detail ||
              "This invitation is no longer valid."}
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/login" })}
            className="px-4 py-2 bg-[#1677c8] hover:bg-[#295375] text-white rounded-md transition-colors duration-200"
          >
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="dark min-h-screen w-full bg-[url('/assets/images/login.png')] bg-cover bg-center flex flex-col p-6 md:p-10">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-[480px] aspect-[3/4] overflow-y-auto bg-black/40 backdrop-blur-md p-8 rounded-2xl shadow-xl border border-zinc-800/50 flex flex-col gap-5">
          <div className="text-center">
            <img
              src="/assets/images/favicon.png"
              alt="Logo"
              className="mx-auto h-14 w-auto object-contain mb-3"
            />
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Accept Invitation
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              You've been invited to join{" "}
              <strong className="text-white">
                {invitationInfo?.organization_name}
              </strong>
            </p>
          </div>

          <div className="bg-blue-900/30 border border-blue-800/50 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-100">
              Email: {invitationInfo?.email}
            </p>
            <p className="text-xs text-blue-300 mt-1">
              Role: {invitationInfo?.role}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-zinc-300 mb-1"
              >
                Create Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1677c8] focus:border-[#1677c8] bg-zinc-900 text-white text-sm"
                placeholder="Min. 8 characters"
              />
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium text-zinc-300 mb-1"
              >
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1677c8] focus:border-[#1677c8] bg-zinc-900 text-white text-sm"
                placeholder="Re-enter password"
              />
            </div>

            {acceptMutation.error && (
              <div className="bg-red-900/20 border border-red-800 rounded-md p-3">
                <p className="text-sm text-red-300">
                  {(acceptMutation.error as any).body?.detail ||
                    "Failed to accept invitation"}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={
                acceptMutation.isPending || !password || !confirmPassword
              }
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#1677c8] hover:bg-[#295375] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1677c8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              {acceptMutation.isPending
                ? "Creating Account..."
                : "Accept & Create Account"}
            </button>
          </form>

          <div className="text-center text-sm text-zinc-400">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => navigate({ to: "/login" })}
              className="font-medium text-[#1677c8] hover:underline underline-offset-4"
            >
              Log in
            </button>
          </div>
        </div>
      </div>
      <Footer transparent />
    </div>
  )
}
