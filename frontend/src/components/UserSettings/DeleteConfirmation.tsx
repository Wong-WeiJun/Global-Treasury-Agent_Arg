import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"

import { MembershipsService, UsersService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { LoadingButton } from "@/components/ui/loading-button"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const DeleteConfirmation = () => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { handleSubmit } = useForm()
  const { logout, user: currentUser } = useAuth()

  // Check if user is an OWNER
  const { data: memberships } = useQuery({
    queryKey: ["memberships"],
    queryFn: () => MembershipsService.listMyOrganizations(),
    enabled: !!currentUser,
  })

  const isOwner = memberships?.data?.some((m) => m.role === "OWNER")

  const mutation = useMutation({
    mutationFn: () => UsersService.deleteUserMe(),
    onSuccess: () => {
      showSuccessToast("Your account has been successfully deleted")
      logout()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    },
  })

  const onSubmit = async () => {
    mutation.mutate()
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive" className="mt-3">
          Delete Account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>⚠️ Confirmation Required</DialogTitle>
            <DialogDescription className="space-y-2">
              {isOwner ? (
                <>
                  <p className="text-red-600 dark:text-red-400 font-bold">
                    WARNING: You are an ORGANIZATION OWNER
                  </p>
                  <p>
                    Deleting your account will{" "}
                    <strong>permanently delete your entire organization</strong>{" "}
                    and <strong>ALL member accounts</strong>.
                  </p>
                  <p>
                    All documents, reconciliation records, and organization data
                    will be <strong>permanently lost</strong>.
                  </p>
                  <p className="text-red-600 dark:text-red-400 font-semibold">
                    This action cannot be undone!
                  </p>
                </>
              ) : (
                <p>
                  All your account data will be{" "}
                  <strong>permanently deleted.</strong> If you are sure, please
                  click <strong>"Confirm"</strong> to proceed. This action
                  cannot be undone.
                </p>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button variant="outline" disabled={mutation.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <LoadingButton
              variant="destructive"
              type="submit"
              loading={mutation.isPending}
            >
              Delete
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default DeleteConfirmation
