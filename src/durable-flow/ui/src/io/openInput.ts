/** Pick a file with a plain `<input type=file>` (browsers without the File System Access API). */
export function pickFile(): Promise<{ text: string; name: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.yaml,.yml,application/json,text/yaml";
    input.style.display = "none";
    input.addEventListener("cancel", () => resolve(null));
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      try {
        resolve({ text: await file.text(), name: file.name });
      } catch (err) {
        reject(err);
      }
    });
    document.body.append(input);
    input.click();
  });
}
