import { useCallback, useEffect, useState } from "react";
import {
  createBrandKit,
  deleteBrandKit,
  listBrandKits,
  ApiError,
} from "../api/client";
import type { BrandKit, BrandKitDraft } from "../shared/brand_kit";
import { BRAND_KIT_LIMIT } from "../shared/brand_kit";

export type BrandKitsState = {
  kits: BrandKit[];
  isLoading: boolean;
  /** The kit applied to generations, or `undefined` for unbranded output. */
  selected?: BrandKit;
  selectedId?: string;
  canCreateMore: boolean;
  select: (id: string | undefined) => void;
  create: (draft: BrandKitDraft) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  /** Set when the last operation failed. Cleared on the next attempt. */
  error?: ApiError;
};

export function useBrandKits(): BrandKitsState {
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();

  useEffect(() => {
    let cancelled = false;

    listBrandKits()
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        setKits(loaded);
        // Apply the first kit by default — the whole point of the app is that
        // branding happens without the user having to opt in every time.
        setSelectedId(loaded[0]?.id);
      })
      .catch((caught) => {
        if (!cancelled && caught instanceof ApiError) {
          setError(caught);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const create = useCallback(async (draft: BrandKitDraft) => {
    setError(undefined);

    try {
      const kit = await createBrandKit(draft);
      setKits((current) => [...current, kit]);
      setSelectedId(kit.id);
      return true;
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught);
      }
      return false;
    }
  }, []);

  const remove = useCallback(
    async (id: string) => {
      setError(undefined);

      try {
        await deleteBrandKit(id);
        setKits((current) => {
          const remaining = current.filter((kit) => kit.id !== id);
          if (selectedId === id) {
            setSelectedId(remaining[0]?.id);
          }
          return remaining;
        });
      } catch (caught) {
        if (caught instanceof ApiError) {
          setError(caught);
        }
      }
    },
    [selectedId],
  );

  return {
    kits,
    isLoading,
    selected: kits.find((kit) => kit.id === selectedId),
    selectedId,
    canCreateMore: kits.length < BRAND_KIT_LIMIT,
    select: setSelectedId,
    create,
    remove,
    error,
  };
}
