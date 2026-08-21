import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useIOLSession } from "@/lib/iol-context";
import { syncIOLPortfolio, type IOLSyncResult } from "@/lib/iol-sync.functions";

export interface UseIOLSyncReturn {
  syncData: IOLSyncResult | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  error: string | null;
  refetch: () => void;
  lastSynced: number | null;
}

export function useIOLSync(): UseIOLSyncReturn {
  const { accessToken, refreshToken } = useIOLSession();
  const isLoggedIn = !!accessToken;
  const syncFn = useServerFn(syncIOLPortfolio);

  const query = useQuery({
    queryKey: ["iol-sync", accessToken],
    queryFn: async () => {
      if (!accessToken) throw new Error("No hay sesión IOL activa");
      const result = await syncFn({
        data: { accessToken, refreshToken },
      });
      return result;
    },
    enabled: isLoggedIn,
    staleTime: 120_000,
    retry: 1,
  });

  return {
    syncData: query.data ?? null,
    isLoading: query.isLoading,
    isLoggedIn,
    error: query.data?.error ?? (query.error ? (query.error as Error).message : null),
    refetch: () => query.refetch(),
    lastSynced: query.dataUpdatedAt,
  };
}
