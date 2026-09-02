/**
 * Sink logging untuk error/not-found boundary (tasks/02-app-shell-navigation
 * "Batas Error & Loading"). Sengaja hanya menerima nama rute dan identitas
 * error non-sensitif — TIDAK PERNAH nominal atau catatan transaksi ("Jangan"
 * di spec.md, dipertegas docs/11-tech-architecture.md §10).
 *
 * `console.error` adalah sink sementara. Integrasi observability sungguhan
 * (Sentry dengan scrubbing data finansial, docs/13-deployment-vercel.md §9)
 * datang di task lain — ini titik tunggal yang perlu diganti saat itu tiba,
 * supaya tidak ada pemanggilan `console.error` yang tersebar di tiap
 * boundary untuk dibersihkan belakangan.
 */
export function logRouteError(route: string, error: Error & { digest?: string }): void {
  console.error('[route-error]', {
    route,
    name: error.name,
    digest: error.digest,
  });
}

export function logRouteNotFound(route: string): void {
  console.error('[route-not-found]', { route });
}
