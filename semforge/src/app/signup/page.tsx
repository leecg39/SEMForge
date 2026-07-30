import { AuthTemplate } from "@/components/templates/AuthTemplate";
import { signupData } from "@/data/auth";
import { getServerDictionary } from "@/i18n/server";

export const metadata = { title: "Sign up | SEMForge" };

export default async function SignupPage() {
  const { dict } = await getServerDictionary();
  return <AuthTemplate data={signupData} dict={dict} />;
}
