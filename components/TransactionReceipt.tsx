import React, { forwardRef } from 'react';
import type { FinancialRequest } from '../types';

interface TransactionReceiptProps {
  request: FinancialRequest;
  userName: string;
  userPhone?: string;
}

const TransactionReceipt = forwardRef<HTMLDivElement, TransactionReceiptProps>(({ request, userName, userPhone }, ref) => {
  const isDeposit = request.type === 'DEPOSIT';

  return (
    <div ref={ref} className="bg-white p-10 w-[420px] text-slate-900 font-sans relative overflow-hidden shadow-2xl">
      {/* Decorative Top Border */}
      <div className={`absolute top-0 left-0 right-0 h-5 ${isDeposit ? 'bg-gradient-to-r from-green-500 to-green-600' : 'bg-gradient-to-r from-red-500 to-red-600'}`}></div>

      {/* Header */}
      <div className="text-center mb-10 mt-6">
        <div className="flex justify-center mb-5">
          <img src="/icons/laddea.png" alt="Ludo Master" className="h-24 w-auto" />
        </div>
        <h1 className="text-3xl font-black uppercase tracking-wider mb-2 text-slate-900">Transaction Receipt</h1>
        <p className="text-slate-600 text-sm font-semibold">Somali Ludo</p>
      </div>

      {/* Amount Section */}
      <div className={`bg-gradient-to-br ${isDeposit ? 'from-green-50 to-emerald-50' : 'from-red-50 to-rose-50'} rounded-2xl p-8 mb-10 border-2 ${isDeposit ? 'border-green-200' : 'border-red-200'} text-center shadow-inner`}>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-3">Total Amount</p>
        <p className={`text-5xl font-black ${isDeposit ? 'text-green-700' : 'text-red-700'} drop-shadow-sm`}>
          ${request.amount.toFixed(2)}
        </p>
      </div>

      {/* Details List */}
      <div className="space-y-5 mb-10">
        <div className="flex justify-between items-center py-3 border-b-2 border-slate-200">
          <span className="text-slate-600 text-sm font-semibold">Transaction Type</span>
          <span className={`font-bold text-sm px-3 py-1.5 rounded-lg shadow-sm ${isDeposit ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-red-100 text-red-800 border border-red-300'}`}>
            {isDeposit ? 'Lacag-Dhigasho' : 'Lacag-Labixid'}
          </span>
        </div>
        <div className="flex justify-between items-center py-3 border-b-2 border-slate-200">
          <span className="text-slate-600 text-sm font-semibold">Transaction ID</span>
          <span className="font-mono font-bold text-slate-800 text-sm bg-slate-100 px-3 py-1 rounded border border-slate-300">
            #{request.shortId ? request.shortId : (request.id || 'PENDING').slice(-6)}
          </span>
        </div>
        <div className="flex justify-between items-center py-3 border-b-2 border-slate-200">
          <span className="text-slate-600 text-sm font-semibold">Date</span>
          <span className="font-bold text-slate-800 text-sm">
            {new Date(request.timestamp).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })} {new Date(request.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="flex justify-between items-center py-3 border-b-2 border-slate-200">
          <span className="text-slate-600 text-sm font-semibold">Name</span>
          <span className="font-bold text-slate-800 text-sm">{userName}</span>
        </div>

        {userPhone && (
          <div className="flex justify-between items-center py-3 border-b-2 border-slate-200">
            <span className="text-slate-600 text-sm font-semibold">Phone</span>
            <span className="font-bold text-slate-800 text-sm">{userPhone}</span>
          </div>
        )}

        <div className="flex justify-between items-center py-3 border-b-2 border-slate-200">
          <span className="text-slate-600 text-sm font-semibold">Status</span>
          <span className="font-bold text-xs px-3 py-1.5 rounded-full shadow-sm bg-green-100 text-green-800 border border-green-300">
            APPROVED
          </span>
        </div>

        {request.approverName && (
          <div className="flex justify-between items-center py-3 border-b-2 border-slate-200">
            <span className="text-slate-600 text-sm font-semibold">Approved By</span>
            <span className="font-bold text-slate-800 text-sm capitalize">{request.approverName}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center border-t-2 border-dashed border-slate-300 pt-8">
        <p className="text-sm text-slate-500 mb-2 font-medium">Thank you for playing with us!</p>
        <p className="text-xs text-slate-400">Generated automatically by Ludo Master System</p>
      </div>

      {/* Watermark */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.02] pointer-events-none">
        <div className="text-[120px] font-black rotate-45 text-slate-900">LUDO</div>
      </div>
    </div>
  );
});

TransactionReceipt.displayName = 'TransactionReceipt';

export default TransactionReceipt;

