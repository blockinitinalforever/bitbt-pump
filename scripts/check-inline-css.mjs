import fs from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";

async function check(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await check(file);
    else if (entry.name.endsWith(".html")) {
      const html = await fs.readFile(file, "utf8");
      let index = 0;
      for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
        postcss.parse(match[1], { from: `${file}#style-${++index}` });
      }
    }
  }
}
await check(path.resolve("public/launchpad"));
console.log("All Launchpad inline styles parse successfully.");
