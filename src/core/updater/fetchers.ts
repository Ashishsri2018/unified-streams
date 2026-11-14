export interface RemoteHead {
  sha: string;
  etag?: string;
}

interface CodebergBranchResponse {
  name?: string;
  commit?: {
    id?: string;
  };
  sha?: string;
}

interface CodebergCommitItem {
  sha?: string;
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
  const branchUrl = `https://codeberg.org/api/v1/repos/${repo}/branches/${encodeURIComponent(branch)}`;
  const headers: Record<string, string> = {
    'accept': 'application/json',
    'user-agent': 'unified-streams-updater',
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const branchRes = await fetch(branchUrl, { headers, signal: controller.signal });
    if (branchRes.ok) {
      const json = (await branchRes.json()) as CodebergBranchResponse;
      const sha = json.commit?.id || json.sha;
      if (sha) {
        return {
          sha,
          etag: branchRes.headers.get('etag') || undefined,
        };
      }
    }

    // Fallback: query commits with sha=branch
    const commitsUrl = `https://codeberg.org/api/v1/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&limit=1`;
    const commitsRes = await fetch(commitsUrl, { headers, signal: controller.signal });
    if (!commitsRes.ok) return null;
    const commitsJson = (await commitsRes.json()) as CodebergCommitItem[];
    if (Array.isArray(commitsJson) && commitsJson.length > 0 && commitsJson[0]?.sha) {
      return {
        sha: commitsJson[0].sha,
        etag: commitsRes.headers.get('etag') || undefined,
      };
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
