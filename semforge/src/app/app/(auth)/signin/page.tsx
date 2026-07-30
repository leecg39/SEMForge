import { redirect } from "next/navigation";
import { SignInForm } from "@/components/crud/SignInForm";
import { getAuth } from "@/lib/session";

export const metadata = { title: "로그인 · SEMForge CRUD 클론" };

export default async function SignInPage() {
  const auth = await getAuth();
  if (auth) redirect("/app/home/");
  return <SignInForm />;
}
