import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import {
  createFileRoute,
  Link as RouterLink,
  redirect,
} from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { LoginService } from "@/client"
import { AuthLayout } from "@/components/Common/AuthLayout"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import { isLoggedIn } from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

// Fixed runtime schema validation bug (z.email() -> z.string().email())
const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
})

type FormData = z.infer<typeof formSchema>

export const Route = createFileRoute("/recover-password")({
  component: RecoverPassword,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
  head: () => ({
    meta: [
      {
        title: "Recover Password - FastAPI Template",
      },
    ],
  }),
})

function RecoverPassword() {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  })
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const recoverPassword = async (data: FormData) => {
    await LoginService.recoverPassword({
      email: data.email,
    })
  }

  const mutation = useMutation({
    mutationFn: recoverPassword,
    onSuccess: () => {
      showSuccessToast("Password recovery email sent successfully")
      form.reset()
    },
    onError: handleError.bind(showErrorToast),
  })

  const onSubmit = async (data: FormData) => {
    if (mutation.isPending) return
    mutation.mutate(data)
  }

  return (
    <div className="min-h-screen w-full bg-[url('/assets/images/login.png')] bg-cover bg-center flex items-center justify-center p-4">
      <AuthLayout>
        {/* Styled Card Container Matching Login/Signup */}
        <div className="w-full max-w-md bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md p-8 rounded-2xl shadow-xl border border-zinc-200/50 dark:border-zinc-800/50">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-6"
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <img
                  src="/assets/images/favicon.png"
                  alt="Brand Logo"
                  className="h-14 w-auto object-contain mb-1"
                />
                <h1 className="text-2xl font-bold tracking-tight">
                  Password Recovery
                </h1>
              </div>

              <div className="grid gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="email-input"
                          placeholder="user@example.com"
                          type="email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Brand Color Integration */}
                <LoadingButton
                  type="submit"
                  className="w-full bg-[#1677c8] hover:bg-[#295375] text-white transition-colors duration-200"
                  loading={mutation.isPending}
                >
                  Continue
                </LoadingButton>
              </div>

              <div className="text-center text-sm text-zinc-600 dark:text-zinc-400">
                Remember your password?{" "}
                <RouterLink
                  to="/login"
                  className="text-[#1677c8] underline underline-offset-4 font-medium"
                >
                  Log in
                </RouterLink>
              </div>
            </form>
          </Form>
        </div>
      </AuthLayout>
    </div>
  )
}
