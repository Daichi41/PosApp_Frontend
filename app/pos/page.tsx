'use client';

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/libs/api";
import {
  calculateCartTotals,
  CartItem,
  CartTotals,
  clearCartItems,
  readCartItems,
  subscribeCart,
} from "@/store/useCart";
import { getAccessToken } from "@/store/useAuth";

type PaymentMethod = "cash" | "card" | "qr" | "other";

interface OrderCreateItem {
  product_id: number;
  quantity: number;
}
interface OrderCreatePayment {
  method: PaymentMethod;
  amount: string;
  transaction_id?: string | null;
}

interface OrderCreateRequest {
  items: OrderCreateItem[];
  payments?: OrderCreatePayment[];
  memo?: string | null;
}

interface OrderRead {
  order_no: string;
  total: string;
  paid_amount: string;
  change_amount: string;
}

const paymentMethodOptions = [
  { value: "cash", label: "現金" },
  { value: "card", label: "カード" },
  { value: "qr", label: "QR" },
  { value: "other", label: "その他" },
] as const;

const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatCurrency(value: number | string): string {
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return formatCurrency(numeric);
    }
    return value;
  }

  if (!Number.isFinite(value)) {
    return currencyFormatter.format(0);
  }

  return currencyFormatter.format(value);
}

function parseMoney(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/,/g, "");
  if (!/^-?\d*(\.\d{0,2})?$/.test(normalized) || normalized === "-" || normalized === "." || normalized === "-.") {
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : null;
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.round(numeric * 100) / 100;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
export default function PosPage(): JSX.Element {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [receivedAmount, setReceivedAmount] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [orderResult, setOrderResult] = useState<OrderRead | null>(null);

  useEffect(() => {
    setCartItems(readCartItems());
    const unsubscribe = subscribeCart(setCartItems);
    return unsubscribe;
  }, []);

  const totals = useMemo<CartTotals>(() => calculateCartTotals(cartItems), [cartItems]);
  const parsedReceivedAmount = useMemo<number | null>(() => parseMoney(receivedAmount), [receivedAmount]);
  const computedChange = useMemo(() => {
    if (parsedReceivedAmount === null) {
      return 0;
    }
    const diff = parsedReceivedAmount - totals.total;
    return diff > 0 ? roundCurrency(diff) : 0;
  }, [parsedReceivedAmount, totals.total]);

  const shortage = useMemo(() => {
    if (parsedReceivedAmount === null) {
      return 0;
    }
    if (parsedReceivedAmount >= totals.total) {
      return 0;
    }
    return roundCurrency(totals.total - parsedReceivedAmount);
  }, [parsedReceivedAmount, totals.total]);

  useEffect(() => {
    if (paymentMethod !== "cash" && cartItems.length > 0 && !receivedAmount) {
      setReceivedAmount(totals.total.toFixed(2));
    }
  }, [paymentMethod, cartItems.length, totals.total, receivedAmount]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setOrderResult(null);

    if (!cartItems.length) {
      setErrorMessage("カートに商品がありません。");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setErrorMessage("認証情報が見つかりません。ログインし直してください。");
      return;
    }

    if (parsedReceivedAmount === null) {
      setErrorMessage("受領金額を入力してください。");
      return;
    }

    if (parsedReceivedAmount <= 0) {
      setErrorMessage("受領金額は0より大きい値にしてください。");
      return;
    }

    const payload: OrderCreateRequest = {
      items: cartItems.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
      })),
      payments: [
        {
          method: paymentMethod,
          amount: parsedReceivedAmount.toFixed(2),
        },
      ],
    };

    const trimmedMemo = memo.trim();
    if (trimmedMemo) {
      payload.memo = trimmedMemo;
    }

    setIsSubmitting(true);
    try {
      const response = await apiFetch<OrderRead>("/orders", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setOrderResult(response);
      clearCartItems();
      setCartItems([]);
      setReceivedAmount("");
      setMemo("");
    } catch (error) {
      if (error instanceof ApiError) {
        const detail = typeof error.body === "string" ? error.body : (error.body as { detail?: string })?.detail;
        setErrorMessage(detail ?? "会計処理に失敗しました。");
      } else {
        setErrorMessage("予期せぬエラーが発生しました。");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearCart = () => {
    clearCartItems();
    setCartItems([]);
  };
  return (
    <main className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4">
        <header>
          <h1 className="text-2xl font-semibold">POS 会計</h1>
          <p className="text-sm text-slate-600">カート内容を確認し、支払情報を入力して会計を完了します。</p>
        </header>

        <section className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-4 py-3">商品名</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">数量</th>
                <th className="px-4 py-3 text-right">単価</th>
                <th className="px-4 py-3 text-right">小計</th>
              </tr>
            </thead>
            <tbody>
              {cartItems.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                    カートに商品がありません。
                  </td>
                </tr>
              ) : (
                cartItems.map((item) => {
                  const lineSubtotal = roundCurrency(item.unitPrice * item.quantity);
                  const lineTax = roundCurrency(lineSubtotal * ((item.taxRate ?? 0) / 100));
                  const lineTotal = roundCurrency(lineSubtotal + lineTax);
                  return (
                    <tr key={item.productId} className="border-t border-slate-100">
                      <td className="px-4 py-3">{item.name}</td>
                      <td className="px-4 py-3 text-slate-500">{item.sku ?? "-"}</td>
                      <td className="px-4 py-3 text-right">{item.quantity}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(lineTotal)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>

        <section className="grid gap-4 rounded border border-slate-200 bg-white p-4 text-sm md:grid-cols-3">
          <div>
            <span className="text-slate-500">小計</span>
            <div className="text-lg font-medium">{formatCurrency(totals.subtotal)}</div>
          </div>
          <div>
            <span className="text-slate-500">消費税</span>
            <div className="text-lg font-medium">{formatCurrency(totals.tax)}</div>
          </div>
          <div>
            <span className="text-slate-500">合計（税込）</span>
            <div className="text-xl font-semibold">{formatCurrency(totals.total)}</div>
          </div>
        </section>

        <form className="grid gap-6 rounded border border-slate-200 bg-white p-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">支払方法</span>
              <select
                className="rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
              >
                {paymentMethodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-medium">受領金額</span>
              <input
                type="text"
                inputMode="decimal"
                className="rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="0.00"
                value={receivedAmount}
                onChange={(event) => setReceivedAmount(event.target.value)}
              />
              <span className="text-xs text-slate-500">カンマなしで半角数字を入力してください。</span>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-medium">釣銭</span>
              <input
                type="text"
                readOnly
                className="rounded border border-slate-300 bg-slate-100 px-3 py-2 text-slate-700"
                value={computedChange ? computedChange.toFixed(2) : "0.00"}
                aria-readonly="true"
              />
              <span className="text-xs text-slate-500">受領金額から自動計算されます。</span>
            </label>
          </div>

          <label className="grid gap-1 text-sm">
            <span className="font-medium">メモ（任意）</span>
            <textarea
              className="min-h-[80px] rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
            />
          </label>

          {shortage > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              受領金額が不足しています。差額 {formatCurrency(shortage)} を受け取ってください。
            </div>
          )}

          {errorMessage && (
            <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {errorMessage}
            </div>
          )}

          {orderResult && (
            <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
              <div className="font-semibold">会計が完了しました。</div>
              <div>
                伝票番号: <span className="font-mono">{orderResult.order_no}</span>
              </div>
              <div>合計: {formatCurrency(orderResult.total)}</div>
              <div>お釣り: {formatCurrency(orderResult.change_amount)}</div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleClearCart}
              disabled={!cartItems.length || isSubmitting}
            >
              カートを空にする
            </button>
            <button
              type="submit"
              className="rounded bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              disabled={!cartItems.length || isSubmitting}
            >
              {isSubmitting ? "会計処理中..." : "会計を確定"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
