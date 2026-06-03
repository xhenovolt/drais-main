/**
 * Empty preload. DRAIS runs as a normal web app inside the
 * BrowserWindow — there is no IPC surface to expose. Keeping the
 * preload script registered (rather than dropping it) lets us turn
 * sandbox + contextIsolation on without warnings, and gives us a
 * single place to add `contextBridge.exposeInMainWorld(...)` later
 * if we ever need a native shell capability (file picker for an
 * import, printer dialog, etc.).
 */
