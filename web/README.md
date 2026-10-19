# LendLite — web

The Next.js frontend for LendLite. See the [root README](../README.md) for setup, architecture and the live demo.

```bash
npm install
npm run dev        # http://localhost:3000 (expects the API on http://localhost:4001)
```

`NEXT_PUBLIC_API_URL` (default `http://localhost:4001/api/v1`) is inlined into the browser bundle at build time.
