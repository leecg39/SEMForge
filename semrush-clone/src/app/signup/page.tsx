import { AuthTemplate } from "@/components/templates/AuthTemplate";
import { signupData } from "@/data/auth";

export const metadata = { title: "Sign up | Semrush UI Clone" };

export default function SignupPage() {
  return <AuthTemplate data={signupData} />;
}
