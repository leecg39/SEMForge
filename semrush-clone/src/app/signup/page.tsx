import { AuthTemplate } from "@/components/templates/AuthTemplate";
import { signupData } from "@/data/auth";
import { getServerDictionary } from "@/i18n/server";

export const metadata = { title: "Sign up | Semrush UI Clone" };

export default async function SignupPage() {
  const { dict } = await getServerDictionary();
  return <AuthTemplate data={signupData} dict={dict} />;
}
