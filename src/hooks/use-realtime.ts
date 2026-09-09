import { useCallback, useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export function useRealtime(tablas: string[], onCambio: () => void) {
  const onCambioRef = useRef(onCambio);
  useEffect(() => {
    onCambioRef.current = onCambio;
  }, [onCambio]);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dispararCambio = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onCambioRef.current();
    }, 400);
  }, []);

  const tablasKey = tablas.join(",");

  useEffect(() => {
    if (!tablasKey) return;

    let activo = true;
    let canalActual: RealtimeChannel | null = null;
    let timerReconexion: ReturnType<typeof setTimeout> | null = null;

    const listaTablas = tablasKey.split(",").filter(Boolean);

    function suscribir() {
      if (!activo) return;

      const canalId = `rt-${Math.random().toString(36).slice(2, 9)}`;
      const canal = supabase.channel(canalId);

      for (const tabla of listaTablas) {
        canal.on(
          "postgres_changes",
          { event: "*", schema: "public", table: tabla },
          () => {
            dispararCambio();
          }
        );
      }

      canal.subscribe((status, err) => {
        if (!activo) return;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`Canal Realtime caído (${status}). Reconectando en 3s...`, err);
          if (canalActual) {
            supabase.removeChannel(canalActual);
            canalActual = null;
          }
          if (timerReconexion) {
            clearTimeout(timerReconexion);
          }
          timerReconexion = setTimeout(() => {
            if (activo) suscribir();
          }, 3000);
        }
      });

      canalActual = canal;
    }

    suscribir();

    return () => {
      activo = false;
      if (timerReconexion) clearTimeout(timerReconexion);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (canalActual) {
        supabase.removeChannel(canalActual);
      }
    };
  }, [tablasKey, dispararCambio]);
}
