# Pump browser-code protection

The production build protects browser-delivered Launchpad JavaScript after the
ordinary esbuild and Next.js builds. This is an intellectual-property friction
layer, not a security boundary: browsers must receive executable code, so no
client-side technique can make it impossible to inspect or reverse engineer.
Secrets, Owner keys, privileged signing and authorization decisions must remain
in the API or wallet.

## Build behavior

- Source maps are disabled explicitly.
- Every JavaScript file under `public/launchpad` is discovered recursively and
  obfuscated automatically, except reviewed third-party files under
  `assets/vendor`.
- First-party files use high-threshold control-flow flattening, encoded and
  shuffled string arrays, split strings, self-defending output and bounded dead
  code injection.
- The large WalletConnect vendor bundle uses a lower flattening threshold to
  preserve wallet compatibility and mobile startup performance.
- Production HTML is rejected if it contains inline JavaScript. New behavior
  must be placed in an external `.js` file, which the recursive discovery step
  then protects automatically.
- The deployment copies only protected JavaScript over the release's public
  files and rejects any `sourceMappingURL` marker. Prototype candidate and
  preview HTML files are not shipped.
- The private build manifest remains under `.next`; it is not published.

Run `npm test` and `npm run build` before deployment. The build itself fails if
new production JavaScript bypasses the protection path.
