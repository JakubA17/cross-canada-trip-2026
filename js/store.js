/* store.js — tiny localStorage-backed persistence for saved spots & prefs.
   No server, no accounts — everything lives on-device so it survives
   fully offline, home-screen-installed use. */
(function (global) {
  'use strict';

  const KEY_SAVED = 'c2c_saved_spots_v1';
  const KEY_PREFS = 'c2c_prefs_v1';
  const KEY_NOTES = 'c2c_day_notes_v1';

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  const Store = {
    getSaved() { return read(KEY_SAVED, []); },

    isSaved(id) { return this.getSaved().some((s) => s.id === id); },

    toggleSaved(spot) {
      const list = this.getSaved();
      const idx = list.findIndex((s) => s.id === spot.id);
      if (idx >= 0) {
        list.splice(idx, 1);
        write(KEY_SAVED, list);
        return false;
      }
      list.push({ ...spot, savedAt: Date.now() });
      write(KEY_SAVED, list);
      return true;
    },

    removeSaved(id) {
      write(KEY_SAVED, this.getSaved().filter((s) => s.id !== id));
    },

    // ---- one-time migration for older saved-spot ids ------------------------
    // Older builds computed a saved spot's id from its position in a "nearest
    // 4 right now" list, which drifted as GPS moved and diverged from the
    // Areas directory's stable, name-based id for the very same physical
    // place. Given a function that derives today's stable id from a spot's
    // own (zoneId, category, name), rewrite ids in place and merge any
    // duplicates that result (two old ids that both pointed at one real
    // place). No-ops once everything's already on the new scheme.
    migrateSavedIds(deriveId) {
      const list = this.getSaved();
      if (!list.length) return;
      const merged = new Map();
      let changed = false;
      list.forEach((s) => {
        let id = s.id;
        if (s.zoneId && s.category && s.name) {
          const newId = deriveId(s.zoneId, s);
          if (newId && newId !== id) { id = newId; changed = true; }
        }
        const existing = merged.get(id);
        if (!existing || (s.savedAt || 0) > (existing.savedAt || 0)) {
          if (existing) changed = true;
          merged.set(id, { ...s, id });
        } else {
          changed = true; // dropping an older duplicate of the same place
        }
      });
      if (changed) write(KEY_SAVED, Array.from(merged.values()));
    },

    getPrefs() {
      return read(KEY_PREFS, {
        units: 'km', selectedDayIndex: null, lastWeatherFetch: null,
        autoSyncAllWeather: true, lastFullWeatherSync: null,
        themeMode: 'auto', // 'auto' | 'light' | 'dark'
      });
    },
    setPrefs(patch) {
      const cur = this.getPrefs();
      const next = { ...cur, ...patch };
      write(KEY_PREFS, next);
      return next;
    },

    // ---- per-day journal notes (dayId -> free text), offline, on-device ----
    getNotes() { return read(KEY_NOTES, {}); },
    getNote(dayId) { return this.getNotes()[dayId] || ''; },
    setNote(dayId, text) {
      const all = this.getNotes();
      if (text && text.trim()) all[dayId] = text; else delete all[dayId];
      write(KEY_NOTES, all);
    },

    // ---- backup / export everything kept on-device --------------------------
    exportAll() {
      return {
        exportedAt: new Date().toISOString(),
        app: 'Coast2Coast',
        saved: this.getSaved(),
        notes: this.getNotes(),
        prefs: this.getPrefs(),
      };
    },
  };

  global.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
