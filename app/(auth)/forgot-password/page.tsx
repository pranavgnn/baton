"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/lib/auth/client";

const schema = z.object({
  email: z.email("Enter a valid email address"),
});

type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: Values) {
    // Better Auth always reports success so the response cannot be used to
    // enumerate which addresses are on the whitelist.
    await requestPasswordReset({
      email: values.email,
      redirectTo: "/reset-password",
    });
    setSent(true);
  }

  return (
    <Card className="auth-card">
      <CardHeader>
        <CardTitle>Set or reset your password</CardTitle>
        <CardDescription>
          New accounts are activated the same way. Enter your work email and we
          will send you a secure link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="form-stack">
            <Alert>
              <CheckCircle2 className="size-4" />
              <AlertTitle>Check your inbox</AlertTitle>
              <AlertDescription>
                If that address belongs to a provisioned account, a link is on
                its way. It expires in 24 hours.
              </AlertDescription>
            </Alert>
            <Button asChild variant="outline" className="w-full">
              <Link href="/sign-in">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="form-stack"
            noValidate
          >
            <Field data-invalid={Boolean(errors.email)}>
              <FieldLabel htmlFor="email">Email address</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@example.org"
                aria-invalid={Boolean(errors.email)}
                {...register("email")}
              />
              <FieldError errors={[errors.email]} />
            </Field>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sending link
                </>
              ) : (
                "Send me a link"
              )}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/sign-in"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
