"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button, EmptyState, Select, Skeleton } from "@pgrs/ui";
import type { Category, ListProductsQuery, Paginated, ProductCard as ProductCardData } from "@pgrs/contracts";
import { api, unwrap } from "@/lib/api";
import { useUIStore } from "@/store/ui";
import { ProductCard } from "./product-card";

const PAGE_SIZE = 20;

/** Compact page list: all numbers when few pages, otherwise first/last + a window around current. */
function pageList(page: number, pageCount: number): Array<number | "…"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const out: Array<number | "…"> = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pageCount - 1, page + 1);
  if (from > 2) out.push("…");
  for (let n = from; n <= to; n++) out.push(n);
  if (to < pageCount - 1) out.push("…");
  out.push(pageCount);
  return out;
}

/** Shared catalog browser: filters, sort, and numbered pagination kept in the URL. */
export function CatalogBrowser({
  title,
  subtitle,
  baseQuery,
}: {
  title: string;
  subtitle?: string;
  baseQuery: { categorySlug?: string; q?: string };
}) {
  const lang = useUIStore((s) => s.lang);
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const gridRef = useRef<HTMLDivElement>(null);

  const [sort, setSort] = useState<ListProductsQuery["sort"]>("popular");
  const [inStock, setInStock] = useState(false);
  const [freshOnly, setFreshOnly] = useState(searchParams.get("fresh") === "1");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const filters = {
    ...baseQuery,
    sort,
    ...(inStock ? { inStock: true } : {}),
    ...(freshOnly ? { freshToday: true } : {}),
  };

  function goToPage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete("page");
    else params.set("page", String(next));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function resetToFirstPage() {
    if (page > 1) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }

  const catalog = useQuery({
    queryKey: ["products", filters, page],
    queryFn: () =>
      unwrap<Paginated<ProductCardData>>(
        api.api.catalog.products.$get({ query: { ...filters, page, pageSize: PAGE_SIZE } }),
      ),
    placeholderData: keepPreviousData,
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => unwrap<Category[]>(api.api.catalog.categories.$get()),
  });
  const items = catalog.data?.items ?? [];
  const pageCount = catalog.data?.pageCount ?? 1;
  const isLoading = catalog.isLoading || catalog.isPlaceholderData;

  return (
    <div className="container-page space-y-5 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </header>

      <nav aria-label="Shop categories" className="flex gap-2 overflow-x-auto pb-2">
        {[{ slug: "", nameEn: "All items", nameMl: "എല്ലാ ഇനങ്ങളും" }, ...(categories.data ?? [])].map(
          (c) => (
            <Link
              key={c.slug}
              href={c.slug ? `/category/${c.slug}` : "/shop"}
              aria-current={c.slug === (baseQuery.categorySlug ?? "") ? "page" : undefined}
              className={`flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-bold ${c.slug === (baseQuery.categorySlug ?? "") ? "border-primary bg-primary text-white" : "border-line bg-white text-ink"}`}
            >
              {lang === "en" ? c.nameEn : c.nameMl}
            </Link>
          ),
        )}
      </nav>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          {t("Filters", "ഫിൽട്ടറുകൾ")}
        </span>
        <button
          type="button"
          aria-pressed={inStock}
          onClick={() => {
            setInStock((v) => !v);
            resetToFirstPage();
          }}
          className={
            inStock
              ? "min-h-11 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white"
              : "min-h-11 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:border-primary-300"
          }
        >
          {t("In stock", "ലഭ്യമുള്ളത്")}
        </button>
        <button
          type="button"
          aria-pressed={freshOnly}
          onClick={() => {
            setFreshOnly((v) => !v);
            resetToFirstPage();
          }}
          className={
            freshOnly
              ? "min-h-11 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white"
              : "min-h-11 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:border-primary-300"
          }
        >
          🌱 {t("Fresh today", "ഇന്നത്തെ പുത്തൻ")}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="sort" className="text-xs font-bold text-muted">
            {t("Sort", "ക്രമം")}
          </label>
          <Select
            id="sort"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as ListProductsQuery["sort"]);
              resetToFirstPage();
            }}
            className="w-40 py-1.5 text-xs"
          >
            <option value="popular">{t("Popular", "പ്രിയപ്പെട്ടത്")}</option>
            <option value="price_asc">{t("Price: low to high", "വില: കുറഞ്ഞത് മുതൽ")}</option>
            <option value="price_desc">{t("Price: high to low", "വില: കൂടിയത് മുതൽ")}</option>
            <option value="name_asc">{t("Name A–Z", "പേര് A–Z")}</option>
            <option value="name_desc">{t("Name Z–A", "പേര് Z–A")}</option>
          </Select>
        </div>
      </div>

      {catalog.error ? (
        <div role="alert" className="rounded-xl border border-line bg-white p-4 text-sm">
          <p>{catalog.error.message}</p>
          <Button variant="outline" onClick={() => catalog.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={t("Nothing found", "ഒന്നും കിട്ടിയില്ല")}
          description={t(
            "Try clearing filters or searching for something else.",
            "ഫിൽട്ടറുകൾ മാറ്റി വീണ്ടും ശ്രമിക്കുക.",
          )}
          action={
            <Button variant="outline" onClick={() => router.push("/")}>
              {t("Go home", "ഹോം")}
            </Button>
          }
        />
      ) : (
        <div ref={gridRef} className="grid scroll-mt-20 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      {pageCount > 1 ? (
        <nav
          aria-label={t("Pagination", "താളുകൾ")}
          className="flex flex-wrap items-center justify-center gap-1.5 pt-2"
        >
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            aria-label={t("Previous page", "മുൻപത്തെ താൾ")}
            className="min-h-11"
          >
            ‹ {t("Prev", "മുൻ")}
          </Button>
          {pageList(page, pageCount).map((n, i) =>
            n === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-sm text-muted" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => goToPage(n)}
                aria-current={n === page ? "page" : undefined}
                aria-label={t(`Page ${n}`, `താൾ ${n}`)}
                className={`min-h-11 min-w-11 rounded-full px-3 text-sm font-bold ${
                  n === page
                    ? "border border-primary bg-primary text-white"
                    : "border border-line bg-white text-ink hover:border-primary-300"
                }`}
              >
                {n}
              </button>
            ),
          )}
          <Button
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => goToPage(page + 1)}
            aria-label={t("Next page", "അടുത്ത താൾ")}
            className="min-h-11"
          >
            {t("Next", "അടുത്തത്")} ›
          </Button>
          <p className="w-full pt-1 text-center text-xs text-muted">
            {t(`Page ${page} of ${pageCount}`, `${pageCount} താളുകളിൽ ${page}`)}
          </p>
        </nav>
      ) : null}
    </div>
  );
}
