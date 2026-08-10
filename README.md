# AIrobo

Deterministic robot simulation with a 2D playground and Blockly command programming.

## Run locally

Install dependencies once:

```sh
npm install
```

Start the local HTTP server:

```sh
npm start
```

Then open [http://127.0.0.1:4173/](http://127.0.0.1:4173/).

> **Important:** Do not open `index.html` directly with `file://`. The playground uses browser modules and the official Blockly package, which must be loaded through the local HTTP server. An accidental direct-file opening redirects to the localhost URL, but `npm start` must already be running.

Run the complete automated test suite with:

```sh
npm test
```
