const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Časová razítka pokusů podle klíče, držená v paměti. Backend je jediný PM2 proces,
 * takže sdílené úložiště (Redis) nepotřebujeme – a restart limity vynuluje, což
 * nevadí: jde o minuty, ne o trvalý zákaz.
 *
 * `maxKeys` je pojistka proti růstu paměti, ne bezpečnostní prvek. Když se strop
 * vyčerpá, vyhodí se nejdéle nepoužitý klíč; při běžném provozu se tam ale nikdy
 * nedostaneme, protože úklid mezitím prošlé záznamy zahodí.
 */
function createAttemptLog({ windowMs, maxKeys = 20000 }) {
  const entries = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, times] of entries) {
      const alive = times.filter((t) => now - t < windowMs);
      if (alive.length === 0) entries.delete(key);
      else entries.set(key, alive);
    }
  }, SWEEP_INTERVAL_MS).unref();

  const hits = (key, now = Date.now()) => (entries.get(key) || []).filter((t) => now - t < windowMs);

  return {
    /** Pokusy uvnitř okna, od nejstaršího. */
    hits,

    add(key, now = Date.now()) {
      const times = hits(key, now);
      times.push(now);
      // Smazat a vložit znovu, ať se klíč posune na konec pořadí – jinak by
      // `set` nechal aktivní klíč na původním místě a vyhazovalo by se právě to,
      // co se používá.
      entries.delete(key);
      if (entries.size >= maxKeys) entries.delete(entries.keys().next().value);
      entries.set(key, times);
      return times;
    },

    clear(key) {
      entries.delete(key);
    },

    /** Za kolik sekund nejstarší pokus vypadne z okna (pro hlavičku Retry-After). */
    retryAfter(key, now = Date.now()) {
      const times = hits(key, now);
      if (times.length === 0) return 0;
      return Math.max(1, Math.ceil((windowMs - (now - times[0])) / 1000));
    },
  };
}

module.exports = { createAttemptLog };
