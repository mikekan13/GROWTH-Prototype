import { redirect } from 'next/navigation';
import { getSession, getRoleDashboard } from '@/lib/auth';
import AuthForm from '@/components/AuthForm';
import GrowthLogo from '@/components/GrowthLogo';

export default async function Home() {
  const session = await getSession();
  if (session) {
    redirect(getRoleDashboard(session.user.role));
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="text-center mb-12">
        <GrowthLogo />
        <p className="mt-4 text-sm text-[var(--accent-teal)] font-[family-name:var(--font-terminal)]">
          Goals . Resistance . Opportunity . Wealth . Tech . Health
        </p>
      </div>
      <AuthForm />
    </main>
  );
}
