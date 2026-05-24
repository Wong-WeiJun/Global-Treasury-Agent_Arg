import { zodResolver } from "@hookform/resolvers/zod"
import {
  createFileRoute,
  Link as RouterLink,
  redirect,
} from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { z } from "zod"
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
import { PasswordInput } from "@/components/ui/password-input"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"

const formSchema = z
  .object({
    email: z.string().email({ message: "Invalid email address" }),
    full_name: z.string().min(1, { message: "Full Name is required" }),
    password: z
      .string()
      .min(1, { message: "Password is required" })
      .min(8, { message: "Password must be at least 8 characters" }),
    confirm_password: z
      .string()
      .min(1, { message: "Password confirmation is required" }),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "The passwords don't match",
    path: ["confirm_password"],
  })

type FormData = z.infer<typeof formSchema>

export const Route = createFileRoute("/signup")({
  component: SignUp,
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
        title: "MyAudit - Sign Up",
      },
    ],
  }),
})

function SignUp() {
  const { signUpMutation } = useAuth()
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      email: "",
      full_name: "",
      password: "",
      confirm_password: "",
    },
  })

  const onSubmit = (data: FormData) => {
    if (signUpMutation.isPending) return

    const { confirm_password: _confirm_password, ...submitData } = data
    signUpMutation.mutate(submitData)
  }

  return (
    /*
      1. Replace '/background-pattern.png' with your actual image path.
    */
    <div className="min-h-screen w-full bg-[url('/assets/images/login.png')] bg-cover bg-center flex items-center justify-center p-4">
      <AuthLayout>
        {/* Glassmorphic card containment layer for maximum readability */}
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
                  Create an account
                </h1>
              </div>

              <div className="grid gap-4">
                <FormField
                  control={form.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="full-name-input"
                          placeholder="User"
                          type="text"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <PasswordInput
                          data-testid="password-input"
                          placeholder="Password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirm_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <PasswordInput
                          data-testid="confirm-password-input"
                          placeholder="Confirm Password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <LoadingButton
                  type="submit"
                  loading={signUpMutation.isPending}
                  className="bg-[#1677c8] hover:bg-[#295375] text-white px-6 transition-colors duration-200"
                >
                  Sign Up
                </LoadingButton>
              </div>

              <div className="text-center text-sm text-zinc-600 dark:text-zinc-400">
                Already have an account?{" "}
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

export default SignUp
