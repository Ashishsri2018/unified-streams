const port = process.env.PORT || 7000;
const url = `http://127.0.0.1:${port}/health`;

const controller = new AbortController();
const timer = setTimeout(() => {
  controller.abort();
}, 5000);

try {
  const res = await fetch(url, { signal: controller.signal });
  if (res.ok) {
    const json = await res.json();
    if (json.status !== 'error') {
      process.exit(0);
    }
  }
  process.exit(1);
} catch {
  process.exit(1);
} finally {
  clearTimeout(timer);
}
