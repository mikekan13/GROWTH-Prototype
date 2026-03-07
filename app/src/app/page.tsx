import { redirect } from 'next/navigation';
import { getSession, getRoleDashboard } from '@/lib/auth';
import AuthForm from '@/components/AuthForm';

export default async function Home() {
  const session = await getSession();
  if (session) {
    redirect(getRoleDashboard(session.user.role));
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="text-center mb-12">
        <h1 className="font-[family-name:var(--font-header)] text-6xl text-[var(--surface-dark)] tracking-wider">
          GRO.WTH
        </h1>
        <p className="mt-2 text-sm text-[var(--accent-teal)] font-[family-name:var(--font-terminal)]">
          Goals . Resistance . Opportunity . Wealth . Tech . Health
        </p>
      </div>
      <AuthForm />
    </main>
  );
}
