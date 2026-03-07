"use client";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  variant?: 'danger' | 'warning' | 'info';
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isLoading = false,
  variant = 'danger'
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const variantColors = {
    danger: { button: 'bg-red-500 hover:bg-red-600', color: 'var(--pillar-body)' },
    warning: { button: 'bg-yellow-500 hover:bg-yellow-600', color: 'var(--accent-gold)' },
    info: { button: 'bg-blue-500 hover:bg-blue-600', color: 'var(--accent-teal)' },
  };

  const styles = variantColors[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ pointerEvents: 'auto' }}>
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={!isLoading ? onClose : undefined}
      />
      <div className="relative bg-gray-800 rounded-lg shadow-2xl border border-gray-700 max-w-md w-full p-6">
        <h3 className="text-xl font-bold text-white text-center mb-2">{title}</h3>
        <p className="text-gray-300 text-center mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded font-medium border border-gray-600 bg-gray-700 hover:bg-gray-600 text-white transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 rounded font-medium transition-colors disabled:opacity-50 text-white ${styles.button}`}
          >
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
