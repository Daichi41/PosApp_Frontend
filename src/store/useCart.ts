export interface CartItem {
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  sku?: string;
  taxRate?: number;
}

export interface CartTotals {
  subtotal: number;
  tax: number;
  total: number;
}

const CART_STORAGE_KEY = "pos.cart";
const CART_EVENT = "pos-cart-changed";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sanitizeCartItem(input: unknown): CartItem | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const raw = input as Record<string, unknown>;
  const productId = Number(raw.productId ?? raw.product_id);
  const quantity = Number(raw.quantity);
  const unitPrice = Number(raw.unitPrice ?? raw.unit_price ?? raw.price);
  const nameValue = raw.name ?? raw.productName;
  const skuValue = raw.sku ?? raw.productSku;
  const taxRateRaw = raw.taxRate ?? raw.tax_rate;

  if (!Number.isInteger(productId) || productId <= 0) {
    return null;
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  if (!Number.isFinite(unitPrice)) {
    return null;
  }

  const name = typeof nameValue === "string" ? nameValue : "";
  const sku = typeof skuValue === "string" ? skuValue : undefined;
  const taxRate =
    taxRateRaw !== undefined && Number.isFinite(Number(taxRateRaw))
      ? Number(taxRateRaw)
      : undefined;

  return {
    productId,
    name,
    quantity,
    unitPrice,
    sku,
    taxRate,
  };
}

function emitCartChange(items: CartItem[]): void {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new CustomEvent<CartItem[]>(CART_EVENT, { detail: items }));
}

export function readCartItems(): CartItem[] {
  if (!isBrowser()) {
    return [];
  }

  const rawValue = window.localStorage.getItem(CART_STORAGE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => sanitizeCartItem(item))
      .filter((item): item is CartItem => Boolean(item));
  } catch {
    return [];
  }
}

export function writeCartItems(items: CartItem[]): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  emitCartChange(items);
}

export function clearCartItems(): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(CART_STORAGE_KEY);
  emitCartChange([]);
}

export function subscribeCart(callback: (items: CartItem[]) => void): () => void {
  if (!isBrowser()) {
    return () => undefined;
  }

  const handleCustom: EventListener = (event) => {
    const detail = (event as CustomEvent<CartItem[]>).detail;
    callback(detail ?? readCartItems());
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === CART_STORAGE_KEY) {
      callback(readCartItems());
    }
  };

  window.addEventListener(CART_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(CART_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
}

export function calculateCartTotals(items: CartItem[]): CartTotals {
  return items.reduce(
    (accumulator, item) => {
      const lineSubtotal = roundCurrency(item.unitPrice * item.quantity);
      const lineTax = roundCurrency(lineSubtotal * ((item.taxRate ?? 0) / 100));
      return {
        subtotal: roundCurrency(accumulator.subtotal + lineSubtotal),
        tax: roundCurrency(accumulator.tax + lineTax),
        total: roundCurrency(accumulator.total + lineSubtotal + lineTax),
      };
    },
    { subtotal: 0, tax: 0, total: 0 },
  );
}

declare global {
  interface WindowEventMap {
    "pos-cart-changed": CustomEvent<CartItem[]>;
  }
}
