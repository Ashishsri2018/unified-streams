const port = process.env.PORT || 7000;
const url = `http://127.0.0.1:${port}/health`;

const controller = new AbortController();
const timer = setTimeout(() => {
  controller.abort();
}, 5000);

try {
  const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
  process.exit(res.ok ? 0 : 1);
} catch {
  process.exit(1);
} finally {
  clearTimeout(timer);
}
