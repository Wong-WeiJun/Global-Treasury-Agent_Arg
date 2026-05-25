import { zodResolver } from "@hookform/resolvers/zod"
import {
  createFileRoute,
  Link as RouterLink,
  redirect,
} from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { z } from "zod"

import type { Body_login_login_access_token as AccessToken } from "@/client"
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

const formSchema = z.object({
  username: z.string().email({ message: "Invalid email address" }),
  password: z
    .string()
    .min(1, { message: "Password is required" })
    .min(8, { message: "Password must be at least 8 characters" }),
}) satisfies z.ZodType<AccessToken>

type FormData = z.infer<typeof formSchema>

export const Route = createFileRoute("/login")({
  component: Login,
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
        title: "MyAudit - Log In",
      },
    ],
  }),
})

function Login() {
  const { loginMutation } = useAuth()
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      username: "",
      password: "",
    },
  })

  const onSubmit = (data: FormData) => {
    if (loginMutation.isPending) return
    loginMutation.mutate(data)
  }

  return (
    <div className="dark min-h-screen w-full bg-[url('/assets/images/login.png')] bg-cover bg-center flex items-center justify-center p-4">
      <AuthLayout>
        {/* Glassmorphic card containment layer for maximum readability */}
        <div className="w-full max-w-[480px] aspect-[3/4] overflow-y-auto bg-black/40 backdrop-blur-md p-8 rounded-2xl shadow-xl border border-zinc-800/50 text-white">
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
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Login to your account
                </h1>
              </div>

              <div className="grid gap-4">
                <FormField
                  control={form.control}
                  name="username"
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
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center">
                        <FormLabel>Password</FormLabel>
                        <RouterLink
                          to="/recover-password"
                          className="ml-auto text-sm text-[#1677c8] hover:underline underline-offset-4"
                        >
                          Forgot your password?
                        </RouterLink>
                      </div>
                      <FormControl>
                        <PasswordInput
                          data-testid="password-input"
                          placeholder="Password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <LoadingButton
                  type="submit"
                  loading={loginMutation.isPending}
                  className="bg-[#1677c8] hover:bg-[#295375] text-white px-6 transition-colors duration-200"
                >
                  Log In
                </LoadingButton>
              </div>

              <div className="text-center text-sm text-white/70">
                Don't have an account yet?{" "}
                <RouterLink
                  to="/signup"
                  className="text-[#1677c8] underline underline-offset-4 font-medium"
                >
                  Sign up
                </RouterLink>
              </div>
            </form>
          </Form>
        </div>
      </AuthLayout>
    </div>
  )
}
