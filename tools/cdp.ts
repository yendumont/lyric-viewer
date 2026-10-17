// Dev helper: talks to the viewer's window over the Chrome debugger (start the app with --debug).
//   bun tools/cdp.ts eval "<expression>"      prints the value
//   bun tools/cdp.ts shot <file.png>          saves a screenshot
const targets: any[] = await (await fetch("http://127.0.0.1:9333/json")).json();
const target = targets.find((t) => t.type === "page" && t.url.startsWith("http://127.0.0.1:3838")) ?? targets.find((t) => t.type === "page");
if (!target) throw new Error("no page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const pending = new Map<number, (v: any) => void>();
ws.onmessage = (event) => { const m = JSON.parse(String(event.data)); const waiting = pending.get(m.id); if (typeof waiting === "function") waiting(m); };
const call = (method: string, params: any = {}) => new Promise<any>((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })); });
const [, , mode, arg] = process.argv;
if (mode === "eval") {
  const r = await call("Runtime.evaluate", { expression: arg, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails ?? r.result));
} else if (mode === "hover") {
  const [x, y] = arg.split(",").map(Number);
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  console.log("hovered", x, y);
} else if (mode === "size") {
  const [w, h] = arg.split(",").map(Number);
  await call("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  console.log("sized", w, h);
} else if (mode === "shot") {
  const r = await call("Page.captureScreenshot", { format: "png" });
  await Bun.write(arg, Buffer.from(r.result.data, "base64"));
  console.log("saved", arg);
}
ws.close();
process.exit(0);
