import { useQuery } from "@tanstack/react-query"
import { MembershipsService } from "@/client"
import useAuth from "./useAuth"

export function useUserRole() {
  const { user } = useAuth()

  const { data: memberships } = useQuery({
    queryKey: ["memberships"],
    queryFn: () => MembershipsService.listMyOrganizations(),
    enabled: !!user?.organization_id,
  })

  const currentMembership = memberships?.data?.find(
    (m) => m.organization_id === user?.organization_id,
  )

  const role = currentMembership?.role || null

  // Role-based permissions
  const isOwner = role === "OWNER"
  const isAdmin = role === "ADMIN"
  const isFinanceManager = role === "FINANCE_MANAGER"
  const isAnalyst = role === "ANALYST"
  const isViewer = role === "VIEWER"

  // Permission helpers
  const canManageTeam = isOwner || isAdmin
  const canReconcile = isOwner || isAdmin || isFinanceManager
  const canViewReports = isOwner || isAdmin || isFinanceManager || isAnalyst
  const canApprove = isOwner || isAdmin || isFinanceManager
  const canDeleteReports = isOwner || isAdmin || isFinanceManager
  const canEditReports = isOwner || isAdmin || isFinanceManager || isAnalyst

  return {
    role,
    isOwner,
    isAdmin,
    isFinanceManager,
    isAnalyst,
    isViewer,
    canManageTeam,
    canReconcile,
    canViewReports,
    canApprove,
    canDeleteReports,
    canEditReports,
  }
}
