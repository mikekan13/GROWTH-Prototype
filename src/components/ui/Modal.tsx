import { ReactNode } from "react";
import { Button } from "./Button";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}

interface ModalFooterProps {
  children: ReactNode;
}

interface ModalFormProps {
  onSubmit: (e: React.FormEvent) => void;
  children: ReactNode;
}

export function Modal({ isOpen, onClose: _onClose, title, children, size = "md" }: ModalProps) {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)'
      }}
    >
      <div
        className={`w-full p-8 ${sizeClasses[size]}`}
        style={{
          backgroundColor: '#22ab94',
          borderColor: '#1e9b82',
          background: 'linear-gradient(135deg, #22ab94 0%, #1e9b82 50%, #22ab94 100%)',
          boxShadow: '0 20px 60px rgba(34, 171, 148, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
          borderRadius: '1.5rem',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)'
        }}
      >
        {/* Glass morphism header */}
        <div className="text-center mb-6">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-3 shadow-2xl border border-white border-opacity-40"
            style={{
              background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 70%)',
              backgroundColor: 'rgba(255, 255, 255, 0.25)'
            }}
          >
            <svg className="w-8 h-8 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h3
            className="text-2xl font-bold text-white drop-shadow-lg mb-2"
            style={{
              fontFamily: 'monospace',
              letterSpacing: '0.05em',
              textShadow: '0 2px 4px rgba(0,0,0,0.4)'
            }}
          >
            {title}
          </h3>
        </div>

        {/* Modal content with glass morphism styling */}
        <div
          className="backdrop-blur-sm rounded-2xl p-6"
          style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.3)'
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function ModalForm({ onSubmit, children }: ModalFormProps) {
  return <form onSubmit={onSubmit}>{children}</form>;
}

export function ModalFooter({ children }: ModalFooterProps) {
  return <div className="flex justify-end space-x-3 mt-6">{children}</div>;
}

interface ModalCloseButtonProps {
  onClose: () => void;
  children?: ReactNode;
}

export function ModalCloseButton({ onClose, children = "Cancel" }: ModalCloseButtonProps) {
  return (
    <Button type="button" variant="outline" onClick={onClose}>
      {children}
    </Button>
  );
}