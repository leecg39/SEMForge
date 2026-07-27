import { AuthTemplate } from "@/components/templates/AuthTemplate";
import { loginData } from "@/data/auth";
import { getServerDictionary } from "@/i18n/server";

export const metadata = { title: "Log in | Semrush UI Clone" };

export default async function LoginPage() {
  const { dict } = await getServerDictionary();
  return <AuthTemplate data={loginData} dict={dict} />;
}
