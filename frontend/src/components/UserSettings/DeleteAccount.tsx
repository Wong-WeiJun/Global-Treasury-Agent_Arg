import DeleteConfirmation from "./DeleteConfirmation"

const DeleteAccount = () => {
  return (
    <div className="w-full bg-white dark:bg-zinc-950 p-6 md:p-10 rounded-2xl shadow-xl border border-destructive/40 transition-all duration-200">
      <h3 className="text-2xl font-bold tracking-tight text-center text-destructive pb-2">
        Delete Account
      </h3>
      <p className="text-sm text-muted-foreground text-center mb-6">
        Permanently delete your account and all associated data.
      </p>
      
      <div className="flex flex-col items-center justify-center w-full">
        <DeleteConfirmation />
      </div>
    </div>
  )
}

export default DeleteAccount