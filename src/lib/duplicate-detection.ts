/**
 * DUPLICATE DETECTION UTILITY
 * 
 * Detects potentially duplicate student records based on name similarity.
 * Uses Levenshtein distance algorithm for string matching.
 */

/**
 * Calculate Levenshtein distance between two strings
 * Returns a number where 0 = identical, higher = more different
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2[i - 1] === str1[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[len2][len1];
}

/**
 * Calculate similarity score (0-100)
 * 100 = identical, 0 = completely different
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 100;

  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  
  if (maxLength === 0) return 100;
  
  return Math.round((1 - distance / maxLength) * 100);
}

/**
 * Tokenize name for word-based comparison
 * Handles double names like "Abdul-Karim" and "Abdul Karim"
 */
function tokenizeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

/**
 * Compare two full names for duplication potential
 * Checks both exact matching and fuzzy matching
 */
export interface DuplicateMatch {
  studentId1: number;
  studentId2: number;
  firstName1: string;
  lastName1: string;
  firstName2: string;
  lastName2: string;
  admissionNo1: string;
  admissionNo2: string;
  similarity: number;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

export function checkNameDuplication(
  firstName1: string,
  lastName1: string,
  firstName2: string,
  lastName2: string
): { similar: boolean; similarity: number; reason: string } {
  // Exact match
  if (
    firstName1.toLowerCase().trim() === firstName2.toLowerCase().trim() &&
    lastName1.toLowerCase().trim() === lastName2.toLowerCase().trim()
  ) {
    return {
      similar: true,
      similarity: 100,
      reason: 'Exact name match'
    };
  }

  // Check tokenized names for partial matches
  const tokens1First = tokenizeName(firstName1);
  const tokens1Last = tokenizeName(lastName1);
  const tokens2First = tokenizeName(firstName2);
  const tokens2Last = tokenizeName(lastName2);

  // If names share same first and last name tokens (different hyphenation)
  if (
    JSON.stringify(tokens1First.sort()) === JSON.stringify(tokens2First.sort()) &&
    JSON.stringify(tokens1Last.sort()) === JSON.stringify(tokens2Last.sort())
  ) {
    return {
      similar: true,
      similarity: 95,
      reason: 'Same name with different formatting (e.g., "Abdul-Karim" vs "Abdul Karim")'
    };
  }

  // Calculate overall similarity
  const firstSim = calculateSimilarity(firstName1, firstName2);
  const lastSim = calculateSimilarity(lastName1, lastName2);
  const avgSim = Math.round((firstSim + lastSim) / 2);

  // High confidence if both names are 85%+ similar
  if (firstSim >= 85 && lastSim >= 85) {
    return {
      similar: true,
      similarity: avgSim,
      reason: `First name ${firstSim}% similar, last name ${lastSim}% similar`
    };
  }

  // Medium confidence if average is 80%+
  if (avgSim >= 80) {
    return {
      similar: true,
      similarity: avgSim,
      reason: `Average name similarity ${avgSim}%`
    };
  }

  return {
    similar: false,
    similarity: avgSim,
    reason: `Names too different (${avgSim}% similar)`
  };
}

/**
 * Find all potential duplicates within a school
 * Returns pairs of students that might be duplicates
 */
export async function findDuplicates(
  students: Array<{
    id: number;
    first_name: string;
    last_name: string;
    admission_no: string;
  }>,
  threshold: number = 80
): Promise<DuplicateMatch[]> {
  const matches: DuplicateMatch[] = [];

  // Compare each pair of students
  for (let i = 0; i < students.length; i++) {
    for (let j = i + 1; j < students.length; j++) {
      const s1 = students[i];
      const s2 = students[j];

      const result = checkNameDuplication(
        s1.first_name,
        s1.last_name,
        s2.first_name,
        s2.last_name
      );

      if (result.similar && result.similarity >= threshold) {
        // Determine confidence level
        let confidence: 'high' | 'medium' | 'low' = 'low';
        if (result.similarity >= 95) confidence = 'high';
        else if (result.similarity >= 85) confidence = 'medium';

        matches.push({
          studentId1: s1.id,
          studentId2: s2.id,
          firstName1: s1.first_name,
          lastName1: s1.last_name,
          firstName2: s2.first_name,
          lastName2: s2.last_name,
          admissionNo1: s1.admission_no,
          admissionNo2: s2.admission_no,
          similarity: result.similarity,
          reason: result.reason,
          confidence
        });
      }
    }
  }

  // Sort by similarity descending
  return matches.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Validate that a merge is safe
 * Check for data conflicts that need resolution
 */
export function validateMerge(
  student1: any,
  student2: any
): { valid: boolean; conflicts: string[] } {
  const conflicts: string[] = [];

  // Check for conflicting enrollment statuses
  if (student1.status !== student2.status) {
    conflicts.push(`Status mismatch: "${student1.status}" vs "${student2.status}"`);
  }

  // Check for different admission dates (more than 30 days apart)
  if (student1.admission_date && student2.admission_date) {
    const date1 = new Date(student1.admission_date).getTime();
    const date2 = new Date(student2.admission_date).getTime();
    const daysDiff = Math.abs(date1 - date2) / (1000 * 60 * 60 * 24);

    if (daysDiff > 30) {
      conflicts.push(`Admission dates are ${Math.round(daysDiff)} days apart`);
    }
  }

  // Warn if both have exam results (data loss possible)
  if (student1.result_count > 0 && student2.result_count > 0) {
    conflicts.push('Both students have exam results - results merge strategy needed');
  }

  return {
    valid: conflicts.length === 0,
    conflicts
  };
}
