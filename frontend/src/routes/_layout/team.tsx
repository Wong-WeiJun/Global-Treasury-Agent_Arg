import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  BarChart3,
  Crown,
  Eye,
  Shield,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from "lucide-react"
import { useState } from "react"
import {
  type InvitationCreate,
  InvitationsService,
  MembershipsService,
} from "@/client"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { useUserRole } from "@/hooks/useUserRole"

export const Route = createFileRoute("/_layout/team")({
  component: TeamManagement,
})

const ROLE_INFO = {
  OWNER: {
    icon: Crown,
    label: "Owner",
    description: "Full control over organization",
    color: "text-yellow-600 dark:text-yellow-400",
  },
  ADMIN: {
    icon: Shield,
    label: "Admin",
    description: "Manage members and settings",
    color: "text-blue-600 dark:text-blue-400",
  },
  FINANCE_MANAGER: {
    icon: TrendingUp,
    label: "Finance Manager",
    description: "Approve transactions and view reports",
    color: "text-green-600 dark:text-green-400",
  },
  ANALYST: {
    icon: BarChart3,
    label: "Analyst",
    description: "View reconciliations and reports",
    color: "text-purple-600 dark:text-purple-400",
  },
  VIEWER: {
    icon: Eye,
    label: "Viewer",
    description: "Read-only access",
    color: "text-gray-600 dark:text-gray-400",
  },
}

function TeamManagement() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { canManageTeam } = useUserRole()
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("VIEWER")

  const { data: memberships, isLoading } = useQuery({
    queryKey: ["memberships"],
    queryFn: () => MembershipsService.listMyOrganizations(),
  })

  const { data: teamMembers, isLoading: membersLoading } = useQuery({
    queryKey: ["team-members", currentUser?.organization_id],
    queryFn: async () => {
      if (!currentUser?.organization_id) return { data: [], count: 0 }
      return MembershipsService.listOrganizationMembers({
        organizationId: currentUser.organization_id,
      })
    },
    enabled: !!currentUser?.organization_id,
  })

  const { data: invitations = [] } = useQuery({
    queryKey: ["invitations", currentUser?.organization_id],
    queryFn: async () => {
      if (!currentUser?.organization_id) return []
      return InvitationsService.listInvitations({
        organizationId: currentUser.organization_id,
      })
    },
    enabled: !!currentUser?.organization_id && canManageTeam,
  })

  const inviteMutation = useMutation({
    mutationFn: (data: InvitationCreate) =>
      InvitationsService.inviteMember({
        organizationId: currentUser!.organization_id!,
        requestBody: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] })
      showSuccessToast("Invitation sent successfully!")
      setInviteEmail("")
      setInviteRole("VIEWER")
    },
    onError: (error: any) => {
      showErrorToast(error.body?.detail || "Failed to send invitation")
    },
  })

  const cancelInviteMutation = useMutation({
    mutationFn: (invitationId: string) =>
      InvitationsService.cancelInvitation({ invitationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] })
      showSuccessToast("Invitation cancelled")
    },
    onError: () => {
      showErrorToast("Failed to cancel invitation")
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: (membershipId: string) =>
      MembershipsService.removeMembership({ membershipId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] })
      showSuccessToast("Member removed successfully")
    },
    onError: (error: any) => {
      showErrorToast(error.body?.detail || "Failed to remove member")
    },
  })

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return

    inviteMutation.mutate({
      email: inviteEmail,
      role: inviteRole,
    })
  }

  if (!currentUser?.organization_id) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            You need to belong to an organization to manage team members.
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-500 dark:text-gray-400">
            Loading team...
          </div>
        </div>
      </div>
    )
  }

  const currentMembership = memberships?.data?.find(
    (m) => m.organization_id === currentUser.organization_id,
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="size-6" />
            Team Management
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Manage your organization's team members and roles
          </p>
        </div>
      </div>

      {/* Current User's Role */}
      {currentMembership && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            {ROLE_INFO[currentMembership.role as keyof typeof ROLE_INFO] && (
              <>
                {(() => {
                  const RoleIcon =
                    ROLE_INFO[currentMembership.role as keyof typeof ROLE_INFO]
                      .icon
                  return <RoleIcon className="size-5" />
                })()}
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Your role:{" "}
                    {
                      ROLE_INFO[
                        currentMembership.role as keyof typeof ROLE_INFO
                      ]?.label
                    }
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    {
                      ROLE_INFO[
                        currentMembership.role as keyof typeof ROLE_INFO
                      ]?.description
                    }
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Invite Members (Owner/Admin only) */}
      {canManageTeam && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <UserPlus className="size-5" />
            Invite Team Member
          </h2>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="invite-email"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Email Address
                </label>
                <input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="colleague@company.com"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="invite-role"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Role
                </label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                >
                  {Object.entries(ROLE_INFO)
                    .filter(([key]) => key !== "OWNER") // Can't invite as OWNER
                    .map(([key, info]) => (
                      <option key={key} value={key}>
                        {info.label}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={inviteMutation.isPending || !inviteEmail.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
            </button>
          </form>
        </div>
      )}

      {/* Role Descriptions */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Role Permissions
        </h2>
        <div className="space-y-3">
          {Object.entries(ROLE_INFO).map(([key, info]) => {
            const Icon = info.icon
            return (
              <div
                key={key}
                className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md"
              >
                <Icon className={`size-5 mt-0.5 ${info.color}`} />
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                    {info.label}
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {info.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pending Invitations */}
      {canManageTeam && invitations.length > 0 && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Pending Invitations
          </h2>
          <div className="space-y-3">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {invitation.email}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Role:{" "}
                    {
                      ROLE_INFO[invitation.role as keyof typeof ROLE_INFO]
                        ?.label
                    }{" "}
                    • Expires:{" "}
                    {new Date(invitation.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => cancelInviteMutation.mutate(invitation.id)}
                  disabled={cancelInviteMutation.isPending}
                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-50"
                  title="Cancel invitation"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current Members */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Team Members ({teamMembers?.count || 0})
        </h2>
        {membersLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500 dark:text-gray-400">
              Loading members...
            </div>
          </div>
        ) : teamMembers && teamMembers.data.length > 0 ? (
          <div className="space-y-3">
            {teamMembers.data.map((member) => {
              const roleInfo = ROLE_INFO[member.role as keyof typeof ROLE_INFO]
              const RoleIcon = roleInfo?.icon
              const isCurrentUser = member.user_id === currentUser?.id

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-md"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex items-center justify-center size-10 rounded-full bg-blue-100 dark:bg-blue-900/30">
                      <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                        {member.user_full_name
                          ? member.user_full_name.charAt(0).toUpperCase()
                          : member.user_email.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {member.user_full_name || member.user_email}
                          {isCurrentUser && (
                            <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                              (You)
                            </span>
                          )}
                        </p>
                        {!member.user_is_active && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {member.user_email}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {RoleIcon && (
                          <RoleIcon className={`size-3 ${roleInfo.color}`} />
                        )}
                        <span
                          className={`text-xs font-medium ${roleInfo?.color}`}
                        >
                          {roleInfo?.label}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          • Joined{" "}
                          {new Date(member.joined_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  {canManageTeam && !isCurrentUser && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `⚠️ WARNING: Remove ${member.user_email} from the organization?\n\nThis will permanently DELETE their user account and all associated data.\n\nThis action cannot be undone.`,
                          )
                        ) {
                          removeMemberMutation.mutate(member.id)
                        }
                      }}
                      disabled={removeMemberMutation.isPending}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-50"
                      title="Remove member and delete account"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
              No team members found.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
