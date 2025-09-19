"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface Wallet {
  id: string;
  ownerType: string;
  ownerRef: string;
  liquid: string;
  crystalized: string;
  total: string;
  owner?: {
    name?: string;
    email?: string;
    role?: string;
  };
}

interface Summary {
  ownerType: string;
  liquid: string;
  crystalized: string;
  total: string;
  walletCount: number;
}

interface Conservation {
  total: string;
  expected: string;
  isValid: boolean;
  difference: string;
}

export default function KrmaAdminPage() {
  const { data: _session } = useSession();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [summaryByType, setSummaryByType] = useState<Summary[]>([]);
  const [conservation, setConservation] = useState<Conservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  // Transfer form state
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferData, setTransferData] = useState({
    fromWalletId: '',
    toWalletId: '',
    amount: '',
    transferType: 'liquid' as 'liquid' | 'crystalized',
    reason: ''
  });
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferMessage, setTransferMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Destruction form state
  const [showDestroyForm, setShowDestroyForm] = useState(false);
  const [destroyData, setDestroyData] = useState({
    walletId: '',
    reason: ''
  });
  const [destroyLoading, setDestroyLoading] = useState(false);
  const [destroyMessage, setDestroyMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchWalletData();
  }, []);

  const fetchWalletData = async () => {
    try {
      const response = await fetch("/api/admin/krma/wallets");
      if (response.ok) {
        const data = await response.json();
        setWallets(data.wallets);
        setSummaryByType(data.summaryByType);
        setConservation(data.conservation);
      } else if (response.status === 403) {
        setUnauthorized(true);
      }
    } catch (error) {
      console.error("Failed to fetch wallet data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatKrma = (amount: string) => {
    return BigInt(amount).toLocaleString();
  };

  const getOwnerDisplay = (wallet: Wallet) => {
    if (wallet.owner?.name) {
      return `${wallet.owner.name} (${wallet.owner.email})`;
    }
    return wallet.ownerRef;
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!transferData.fromWalletId || !transferData.toWalletId || !transferData.amount) {
      setTransferMessage({ type: 'error', text: 'Please fill in all required fields' });
      return;
    }

    if (transferData.fromWalletId === transferData.toWalletId) {
      setTransferMessage({ type: 'error', text: 'Cannot transfer to the same wallet' });
      return;
    }

    const amount = parseFloat(transferData.amount);
    if (isNaN(amount) || amount <= 0) {
      setTransferMessage({ type: 'error', text: 'Amount must be a positive number' });
      return;
    }

    setTransferLoading(true);
    setTransferMessage(null);

    try {
      const response = await fetch('/api/admin/krma/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transferData),
      });

      const result = await response.json();

      if (response.ok) {
        setTransferMessage({ type: 'success', text: result.message });
        setTransferData({
          fromWalletId: '',
          toWalletId: '',
          amount: '',
          transferType: 'liquid',
          reason: ''
        });
        // Refresh wallet data
        await fetchWalletData();
      } else {
        setTransferMessage({ type: 'error', text: result.error });
      }
    } catch (_error) {
      setTransferMessage({ type: 'error', text: 'Failed to transfer KRMA' });
    } finally {
      setTransferLoading(false);
    }
  };

  const resetTransferForm = () => {
    setTransferData({
      fromWalletId: '',
      toWalletId: '',
      amount: '',
      transferType: 'liquid',
      reason: ''
    });
    setTransferMessage(null);
    setShowTransferForm(false);
  };

  const handleDestroy = async (e: React.FormEvent) => {
    e.preventDefault();
    setDestroyLoading(true);
    setDestroyMessage(null);

    try {
      const response = await fetch('/api/admin/krma/destroy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(destroyData),
      });

      const result = await response.json();

      if (response.ok) {
        setDestroyMessage({ type: 'success', text: result.message });
        resetDestroyForm();
        fetchWalletData(); // Refresh wallet data
      } else {
        setDestroyMessage({ type: 'error', text: result.error || 'Failed to destroy wallet' });
      }
    } catch (_error) {
      setDestroyMessage({ type: 'error', text: 'Network error occurred' });
    } finally {
      setDestroyLoading(false);
    }
  };

  const resetDestroyForm = () => {
    setDestroyData({
      walletId: '',
      reason: ''
    });
    setDestroyMessage(null);
    setShowDestroyForm(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h1 className="mt-6 text-3xl font-extrabold text-gray-900">
              Access Denied
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Admin access is restricted to authorized users only.
            </p>
            <div className="mt-6">
              <Link
                href="/campaigns"
                className="text-indigo-600 hover:text-indigo-500"
              >
                ← Return to Campaigns
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">KRMA Administration</h1>
              <p className="text-sm text-gray-600">
                Token distribution and wallet management
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/campaigns"
                className="text-sm text-gray-600 hover:text-indigo-700"
              >
                ← Back to Campaigns
              </Link>
              <button
                onClick={() => {
                  if (showTransferForm) {
                    resetTransferForm();
                  } else {
                    setShowTransferForm(true);
                    setTransferMessage(null);
                  }
                }}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
              >
                {showTransferForm ? 'Cancel Transfer' : 'Transfer KRMA'}
              </button>
              <button
                onClick={() => {
                  if (showDestroyForm) {
                    resetDestroyForm();
                  } else {
                    setShowDestroyForm(true);
                    setDestroyMessage(null);
                    setShowTransferForm(false); // Close transfer form
                    setTransferMessage(null);
                  }
                }}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
              >
                {showDestroyForm ? 'Cancel Destroy' : 'Destroy Wallet'}
              </button>
              <button
                onClick={fetchWalletData}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Conservation Status */}
        {conservation && (
          <div className={`mb-8 p-4 rounded-lg ${conservation.isValid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <h2 className="text-lg font-semibold mb-2">
              Conservation Status: {conservation.isValid ? '✅ VALID' : '❌ INVALID'}
            </h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="font-medium">Total in Circulation:</span>
                <br />
                {formatKrma(conservation.total)} KRMA
              </div>
              <div>
                <span className="font-medium">Expected Maximum:</span>
                <br />
                {formatKrma(conservation.expected)} KRMA
              </div>
              <div>
                <span className="font-medium">Difference:</span>
                <br />
                <span className={conservation.difference === '0' ? 'text-green-600' : 'text-red-600'}>
                  {conservation.difference === '0' ? '0' : formatKrma(conservation.difference)} KRMA
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Transfer KRMA Form */}
        {showTransferForm && (
          <div className="mb-8 p-6 bg-white rounded-lg shadow">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Transfer KRMA Between Wallets</h2>

            {transferMessage && (
              <div className={`mb-4 p-3 rounded-md ${transferMessage.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                {transferMessage.text}
              </div>
            )}

            <form onSubmit={handleTransfer} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="fromWallet" className="block text-sm font-medium text-gray-700 mb-1">
                  From Wallet *
                </label>
                <select
                  id="fromWallet"
                  value={transferData.fromWalletId}
                  onChange={(e) => setTransferData(prev => ({ ...prev, fromWalletId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                  required
                >
                  <option value="">Select source wallet...</option>
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      [{wallet.ownerType}] {getOwnerDisplay(wallet)} - {formatKrma(wallet.liquid)} liquid + {formatKrma(wallet.crystalized)} crystalized
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="toWallet" className="block text-sm font-medium text-gray-700 mb-1">
                  To Wallet *
                </label>
                <select
                  id="toWallet"
                  value={transferData.toWalletId}
                  onChange={(e) => setTransferData(prev => ({ ...prev, toWalletId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                  required
                >
                  <option value="">Select destination wallet...</option>
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      [{wallet.ownerType}] {getOwnerDisplay(wallet)} - {formatKrma(wallet.liquid)} liquid + {formatKrma(wallet.crystalized)} crystalized
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
                  Amount *
                </label>
                <input
                  type="number"
                  id="amount"
                  value={transferData.amount}
                  onChange={(e) => setTransferData(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                  placeholder="Enter KRMA amount..."
                  required
                  min="1"
                />
              </div>

              <div>
                <label htmlFor="transferType" className="block text-sm font-medium text-gray-700 mb-1">
                  Transfer Type *
                </label>
                <select
                  id="transferType"
                  value={transferData.transferType}
                  onChange={(e) => setTransferData(prev => ({ ...prev, transferType: e.target.value as 'liquid' | 'crystalized' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                >
                  <option value="liquid">Liquid KRMA</option>
                  <option value="crystalized">Crystalized KRMA</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">
                  Reason (Optional)
                </label>
                <input
                  type="text"
                  id="reason"
                  value={transferData.reason}
                  onChange={(e) => setTransferData(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                  placeholder="Enter reason for transfer..."
                />
              </div>

              <div className="md:col-span-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={resetTransferForm}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                  disabled={transferLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  disabled={transferLoading}
                >
                  {transferLoading ? 'Transferring...' : 'Transfer KRMA'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Destroy Wallet Form */}
        {showDestroyForm && (
          <div className="mb-8 p-6 bg-white rounded-lg shadow border border-red-200">
            <h2 className="text-lg font-semibold text-red-900 mb-4">⚠️ Destroy Wallet</h2>
            <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200">
              <p className="text-red-800 text-sm">
                <strong>WARNING:</strong> This action is irreversible! It will:
              </p>
              <ul className="text-red-700 text-sm mt-2 ml-4 list-disc">
                <li>Delete the wallet and return all KRMA to Terminal3</li>
                <li>Delete the associated user account (if applicable)</li>
                <li>Remove all user sessions and data</li>
                <li>This cannot be undone!</li>
              </ul>
            </div>

            {destroyMessage && (
              <div className={`mb-4 p-3 rounded-md ${destroyMessage.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                {destroyMessage.text}
              </div>
            )}

            <form onSubmit={handleDestroy} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label htmlFor="walletId" className="block text-sm font-medium text-gray-700 mb-1">
                  Wallet to Destroy *
                </label>
                <select
                  id="walletId"
                  value={destroyData.walletId}
                  onChange={(e) => setDestroyData(prev => ({ ...prev, walletId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900"
                  required
                >
                  <option value="">Select wallet to destroy...</option>
                  {wallets
                    .filter(wallet => wallet.ownerType !== 'TERMINAL') // Don't allow destroying system wallets
                    .map(wallet => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.ownerType} | {wallet.owner?.name || wallet.ownerRef} | {formatKrma(wallet.total)} KRMA
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="destroyReason" className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Destruction *
                </label>
                <input
                  type="text"
                  id="destroyReason"
                  value={destroyData.reason}
                  onChange={(e) => setDestroyData(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900"
                  placeholder="Enter reason for wallet destruction..."
                  required
                />
              </div>

              <div className="md:col-span-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={resetDestroyForm}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                  disabled={destroyLoading}
                >
                  {destroyLoading ? 'Destroying...' : 'Destroy Wallet'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Summary by Holder Type */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Distribution by Holder Type</h2>
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Holder Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Wallets
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Liquid KRMA
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Crystalized
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total KRMA
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    % of Total
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {summaryByType.map((summary) => (
                  <tr key={summary.ownerType}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {summary.ownerType}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {summary.walletCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatKrma(summary.liquid)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatKrma(summary.crystalized)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatKrma(summary.total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {conservation ? ((BigInt(summary.total) * BigInt(10000)) / BigInt(conservation.total) / BigInt(100)).toString() + '%' : '0%'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Individual Wallets */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Individual Wallets</h2>
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Liquid KRMA
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Crystalized
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    % of Total
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {wallets.map((wallet) => (
                  <tr key={wallet.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>
                        <div className="font-medium">{getOwnerDisplay(wallet)}</div>
                        {wallet.owner?.role && (
                          <div className="text-xs text-gray-500">Role: {wallet.owner.role}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        wallet.ownerType === 'GM' ? 'bg-blue-100 text-blue-800' :
                        wallet.ownerType === 'PLAYER' ? 'bg-green-100 text-green-800' :
                        wallet.ownerType === 'WATCHER' ? 'bg-gray-100 text-gray-800' :
                        wallet.ownerType === 'TERMINAL' ? 'bg-red-100 text-red-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {wallet.ownerType}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatKrma(wallet.liquid)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatKrma(wallet.crystalized)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatKrma(wallet.total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {conservation ? ((BigInt(wallet.total) * BigInt(10000)) / BigInt(conservation.total) / BigInt(100)).toString() + '%' : '0%'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {wallets.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No wallets found
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}