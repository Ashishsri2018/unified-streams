export interface RemoteHead {
  sha: string;
  etag?: string;
}

export async function fetchGitHubHead(
  repo: string,
  branch = 'main',
  token?: string,
  timeoutMs = 10000,
): Promise<RemoteHead | null> {
  const url = `https://api.github.com/repos/${repo}/commits/${branch}`;
  const headers: Record<string, string> = {
    'accept': 'application/vnd.github.v3+json',
    'user-agent': 'unified-streams-updater',
  };
  if (token) headers['authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { sha?: string };
    if (!json?.sha) return null;
    return {
      sha: json.sha,
      etag: res.headers.get('etag') || undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCodebergHead(
  repo: string,
  branch = 'main',
  timeoutMs = 10000,
): Promise<RemoteHead | null> {
  const url = `https://codeberg.org/api/v1/repos/${repo}/commits/${branch}`;
  const headers: Record<string, string> = {
    'accept': 'application/json',
    'user-agent': 'unified-streams-updater',
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { sha?: string };
    if (!json?.sha) return null;
    return {
      sha: json.sha,
      etag: res.headers.get('etag') || undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
