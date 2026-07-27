import { AuthTemplate } from "@/components/templates/AuthTemplate";
import { loginData } from "@/data/auth";

export const metadata = { title: "Log in | Semrush UI Clone" };

export default function LoginPage() {
  return <AuthTemplate data={loginData} />;
}
