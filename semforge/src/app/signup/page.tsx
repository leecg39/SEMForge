import { AuthTemplate } from "@/components/templates/AuthTemplate";
import { signupData } from "@/data/auth";
import { getServerDictionary } from "@/i18n/server";

export const metadata = { title: "Sign up | SEMForge" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ keyword?: string | string[] }>;
}) {
  const { dict } = await getServerDictionary();
  const { keyword } = await searchParams;
  return <AuthTemplate data={signupData} dict={dict} restoreKeyword={Array.isArray(keyword) ? keyword[0] : keyword} />;
}
