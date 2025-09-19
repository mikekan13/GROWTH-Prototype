"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  UserCircleIcon,
  EyeIcon,
  MapIcon,
  CogIcon
} from "@heroicons/react/24/outline";

type UserRole = "ADMIN" | "WATCHER" | "TRAILBLAZER" | "GODHEAD";

interface RoleConfig {
  role: UserRole;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  bgColor: string;
}

const roles: RoleConfig[] = [
  {
    role: "ADMIN",
    icon: CogIcon,
    label: "Admin",
    color: "text-red-600",
    bgColor: "bg-red-50 hover:bg-red-100"
  },
  {
    role: "WATCHER",
    icon: EyeIcon,
    label: "Watcher (GM)",
    color: "text-purple-600",
    bgColor: "bg-purple-50 hover:bg-purple-100"
  },
  {
    role: "TRAILBLAZER",
    icon: UserCircleIcon,
    label: "Trailblazer (Player)",
    color: "text-green-600",
    bgColor: "bg-green-50 hover:bg-green-100"
  },
  {
    role: "GODHEAD",
    icon: MapIcon,
    label: "Godhead (AI)",
    color: "text-blue-600",
    bgColor: "bg-blue-50 hover:bg-blue-100"
  }
];

export default function RoleSwitcher() {
  const { data: session, update } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Only show for your specific account during development
  if (session?.user?.email !== "mikekan13@gmail.com") {
    return null;
  }

  const currentRole = (session?.user as { role?: string })?.role || "WATCHER";
  const currentRoleConfig = roles.find(r => r.role === currentRole) || roles[1]; // Default to WATCHER

  const handleRoleSwitch = async (newRole: UserRole) => {
    if (newRole === currentRole || isUpdating) return;

    setIsUpdating(true);
    try {
      const response = await fetch("/api/dev/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole })
      });

      if (response.ok) {
        // Update the session with new role
        await update({ role: newRole });
        setIsOpen(false);

        // Redirect to appropriate interface based on role
        switch (newRole) {
          case "ADMIN":
            window.location.href = "/admin";
            break;
          case "WATCHER":
            window.location.href = "/campaigns";
            break;
          case "TRAILBLAZER":
            window.location.href = "/trailblazer";
            break;
          case "GODHEAD":
            window.location.href = "/admin"; // AI agents use admin interface
            break;
          default:
            window.location.reload();
        }
      } else {
        console.error("Failed to switch role");
      }
    } catch (error) {
      console.error("Error switching role:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="relative">
        {/* Current Role Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`
            p-2 rounded-lg border shadow-lg transition-all duration-200
            ${currentRoleConfig.bgColor} ${currentRoleConfig.color}
            border-gray-200 hover:shadow-xl
            ${isOpen ? 'ring-2 ring-blue-500' : ''}
          `}
          title={`Current Role: ${currentRoleConfig.label} (Dev Mode)`}
        >
          <currentRoleConfig.icon className="w-6 h-6" />
        </button>

        {/* Role Selection Dropdown */}
        {isOpen && (
          <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 min-w-[140px] py-1">
            <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">
              Switch Role (Dev)
            </div>
            {roles.map((roleConfig) => {
              const isActive = roleConfig.role === currentRole;
              const isDisabled = false; // All roles now available

              return (
                <button
                  key={roleConfig.role}
                  onClick={() => handleRoleSwitch(roleConfig.role)}
                  disabled={isDisabled || isUpdating}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors
                    ${isActive
                      ? `${roleConfig.bgColor} ${roleConfig.color}`
                      : 'text-gray-700 hover:bg-gray-50'
                    }
                    ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    ${isUpdating ? 'opacity-50 cursor-wait' : ''}
                  `}
                >
                  <roleConfig.icon className="w-4 h-4" />
                  <span>{roleConfig.label}</span>
                  {isActive && (
                    <div className="ml-auto w-2 h-2 bg-current rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[-1]"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}