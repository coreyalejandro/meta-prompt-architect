export interface DiffChange {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
}

/**
 * Computes a line-by-line diff between two strings using the Longest Common Subsequence (LCS) algorithm.
 * Includes a safety optimization for very large inputs to prevent UI lockups.
 */
export function computeLineDiff(oldStr: string, newStr: string): DiffChange[] {
  // Normalize newlines and split
  const oldLines = (oldStr || '').replace(/\r\n/g, '\n').split('\n');
  const newLines = (newStr || '').replace(/\r\n/g, '\n').split('\n');

  const n = oldLines.length;
  const m = newLines.length;

  // Safety optimization: if the grid size is massive, do a faster heuristic diff
  if (n * m > 40000) {
    const result: DiffChange[] = [];
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);

    oldLines.forEach(line => {
      if (newSet.has(line)) {
        result.push({ type: 'unchanged', value: line });
      } else {
        result.push({ type: 'removed', value: line });
      }
    });

    newLines.forEach(line => {
      if (!oldSet.has(line)) {
        result.push({ type: 'added', value: line });
      }
    });

    return result;
  }

  // DP LCS for lines
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffChange[] = [];
  let i = n, j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'unchanged', value: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', value: newLines[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i - 1][j] > dp[i][j - 1])) {
      result.unshift({ type: 'removed', value: oldLines[i - 1] });
      i--;
    }
  }

  return result;
}

/**
 * Computes a word-by-word diff inside a line or for shorter strings.
 */
export function computeWordDiff(oldStr: string, newStr: string): DiffChange[] {
  // Simple word split, keeping punctuation attached for visual cleanliness
  const oldWords = (oldStr || '').split(/(\s+)/);
  const newWords = (newStr || '').split(/(\s+)/);

  const n = oldWords.length;
  const m = newWords.length;

  if (n * m > 10000) {
    // Basic word-by-word fallback if too large
    return [
      { type: 'removed', value: oldStr },
      { type: 'added', value: newStr }
    ];
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffChange[] = [];
  let i = n, j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      result.unshift({ type: 'unchanged', value: oldWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', value: newWords[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i - 1][j] > dp[i][j - 1])) {
      result.unshift({ type: 'removed', value: oldWords[i - 1] });
      i--;
    }
  }

  return result;
}
