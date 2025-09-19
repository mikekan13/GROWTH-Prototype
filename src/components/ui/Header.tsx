import { ReactNode } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button } from "./Button";

interface HeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  actions?: ReactNode;
  showAuth?: boolean;
}

export function Header({ title, subtitle, breadcrumbs, actions, showAuth = true }: HeaderProps) {

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <div>
            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                {breadcrumbs.map((crumb, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    {index > 0 && <span>/</span>}
                    {crumb.href ? (
                      <Link href={crumb.href} className="hover:text-indigo-600">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className={index === breadcrumbs.length - 1 ? "text-gray-900" : ""}>
                        {crumb.label}
                      </span>
                    )}
                  </div>
                ))}
              </nav>
            )}
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            {subtitle && (
              <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center space-x-4">
            {actions}
            {showAuth && (
              <>
                <Link
                  href="/admin"
                  className="text-sm text-gray-600 hover:text-indigo-700"
                >
                  Admin
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="text-gray-600 hover:text-red-600"
                >
                  Sign Out
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}