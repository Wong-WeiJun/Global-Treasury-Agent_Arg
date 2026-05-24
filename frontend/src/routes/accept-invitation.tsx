import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import { useState } from "react"
import { type InvitationAccept, InvitationsService } from "@/client"
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

  // Verify the invitation token
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

    acceptMutation.mutate({
      token,
      password,
    })
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
            <h2 className="text-xl font-bold text-red-900 dark:text-red-100 mb-2">
              Invalid Invitation Link
            </h2>
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">
              The invitation link is missing or invalid.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/login" })}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">
          Verifying invitation...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
            <h2 className="text-xl font-bold text-red-900 dark:text-red-100 mb-2">
              Invalid or Expired Invitation
            </h2>
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">
              {(error as any).body?.detail ||
                "This invitation is no longer valid."}
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/login" })}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <img
            src="/assets/images/favicon.png"
            alt="Logo"
            className="mx-auto h-12 w-auto"
          />
          <h2 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white">
            Accept Invitation
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            You've been invited to join{" "}
            <strong>{invitationInfo?.organization_name}</strong>
          </p>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Email: {invitationInfo?.email}
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Role: {invitationInfo?.role}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Min. 8 characters"
              />
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Re-enter password"
              />
            </div>
          </div>

          {acceptMutation.error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
              <p className="text-sm text-red-800 dark:text-red-200">
                {(acceptMutation.error as any).body?.detail ||
                  "Failed to accept invitation"}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={acceptMutation.isPending || !password || !confirmPassword}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {acceptMutation.isPending
              ? "Creating Account..."
              : "Accept & Create Account"}
          </button>
        </form>

        <div className="text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => navigate({ to: "/login" })}
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              Log in
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
