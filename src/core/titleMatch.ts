export function normalizeMetadataTitle(value: string): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\b(?:the|a|an)\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function scoreTitleCandidate(
  candidate: string,
  expected: string,
  candidateYear?: number,
  expectedYear?: number,
): number {
  const a = normalizeMetadataTitle(candidate);
  const b = normalizeMetadataTitle(expected);
  if (!a || !b) return 0;

  let score = 0;
  if (a === b) score += 100;
  else if (a.startsWith(b) || b.startsWith(a)) score += 60;
  else if (a.includes(b) || b.includes(a)) score += 40;

  const aTokens = new Set(a.split(' ').filter(Boolean));
  const bTokens = new Set(b.split(' ').filter(Boolean));
  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }
  const union = aTokens.size + bTokens.size - intersection;
  if (union > 0) score += Math.round((intersection / union) * 40);

  if (expectedYear !== undefined && candidateYear !== undefined) {
    score += Math.abs(expectedYear - candidateYear) <= 1 ? 20 : -50;
  }
  return score;
}
