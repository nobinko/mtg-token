// Called only after the user explicitly chooses to erase this device's saves.
// Clear-Site-Data on the logout response also clears the HTTP cache on browsers
// that support it; explicit deletion covers browsers without that header.
export async function clearDeviceData({ indexedDB = globalThis.indexedDB, localStorage = globalThis.localStorage, sessionStorage = globalThis.sessionStorage } = {}) {
  if (indexedDB) {
    for (const name of ["mtg-token-personal-tournaments", "mtg-token-finder.goldfish"]) {
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = resolve;
        request.onerror = () => reject(new Error("保存データを削除できませんでした。ブラウザーの設定を確認して再試行してください。"));
        request.onblocked = () => reject(new Error("別のタブで開いているこのアプリを閉じて、もう一度「保存データも消す」を選んでください。"));
      });
    }
  }
  for (const storage of [localStorage, sessionStorage]) {
    if (!storage) continue;
    for (let index = storage.length - 1; index >= 0; index--) {
      const key = storage.key(index);
      if (key?.startsWith("mtg-token-finder.")) storage.removeItem(key);
    }
  }
}
