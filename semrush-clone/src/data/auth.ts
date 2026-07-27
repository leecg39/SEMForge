import type { AuthPageData } from "@/types/templates";

/** PUB-AUTH 로그인/가입. */

export const loginData: AuthPageData = {
  mode: "login",
  title: "Log in to your account",
  subtitle: "Welcome back. Enter your details to continue.",
  submitLabel: "Log in",
  altPrompt: { text: "Don't have an account?", linkLabel: "Sign up", href: "/signup/" },
};

export const signupData: AuthPageData = {
  mode: "signup",
  title: "Create your account",
  subtitle: "Start your free trial. No credit card required.",
  submitLabel: "Create account",
  altPrompt: { text: "Already have an account?", linkLabel: "Log in", href: "/login/" },
};
