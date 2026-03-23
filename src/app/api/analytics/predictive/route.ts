import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * GET /api/analytics/predictive
 * AI-Powered Predictive Analytics for Academic Performance
 * Analyzes trends, identifies best/worst subjects, and provides 1-5 year projections
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // school_id derived from session below
  const scope = searchParams.get('scope') || 'school'; // school, class, student
  const scopeId = searchParams.get('scope_id'); // class_id or student_id
  const analysisType = searchParams.get('analysis_type') || 'comprehensive'; // comprehensive, subjects, projections

  let connection;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    connection = await getConnection();

    let analytics: any = {
      scope,
      timestamp: new Date().toISOString(),
    };

    // ===== SUBJECT PERFORMANCE ANALYSIS =====
    if (analysisType === 'comprehensive' || analysisType === 'subjects') {
      analytics.subjectAnalysis = await analyzeSubjectPerformance(
        connection,
        schoolId,
        scope,
        scopeId
      );
    }

    // ===== PREDICTIVE PROJECTIONS =====
    if (analysisType === 'comprehensive' || analysisType === 'projections') {
      analytics.projections = await generateAcademicProjections(
        connection,
        schoolId,
        scope,
        scopeId
      );
    }

    // ===== PERFORMANCE INSIGHTS =====
    if (analysisType === 'comprehensive' || analysisType === 'insights') {
      analytics.insights = await generatePerformanceInsights(
        connection,
        schoolId,
        scope,
        scopeId
      );
    }

    return NextResponse.json({
      success: true,
      data: analytics,
    });
  } catch (error: any) {
    console.error('Error in predictive analytics:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Analyze subject performance across different scopes
 */
async function analyzeSubjectPerformance(
  connection: any,
  schoolId: number,
  scope: string,
  scopeId: string | null
) {
  let whereClause = 'WHERE s.school_id = ?';
  const params: any[] = [schoolId];

  if (scope === 'class' && scopeId) {
    whereClause += ' AND cr.class_id = ?';
    params.push(scopeId);
  } else if (scope === 'student' && scopeId) {
    whereClause += ' AND cr.student_id = ?';
    params.push(scopeId);
  }

  // Get subject performance over multiple terms
  const [subjectData] = await connection.execute(
    `SELECT 
      subj.id as subject_id,
      subj.name as subject_name,
      subj.code as subject_code,
      subj.subject_type,
      
      -- Overall statistics
      COUNT(DISTINCT cr.student_id) as student_count,
      COUNT(cr.id) as total_assessments,
      AVG(cr.score) as avg_score,
      MIN(cr.score) as min_score,
      MAX(cr.score) as max_score,
      STDDEV(cr.score) as score_stddev,
      
      -- Grade distribution
      SUM(CASE WHEN cr.score >= 80 THEN 1 ELSE 0 END) as distinctions,
      SUM(CASE WHEN cr.score >= 60 AND cr.score < 80 THEN 1 ELSE 0 END) as credits,
      SUM(CASE WHEN cr.score >= 50 AND cr.score < 60 THEN 1 ELSE 0 END) as passes,
      SUM(CASE WHEN cr.score < 50 THEN 1 ELSE 0 END) as failures,
      
      -- Term-over-term trend (extract term number from term name)
      AVG(CASE WHEN t.name LIKE '%1%' OR t.name = 'Term 1' THEN cr.score END) as term1_avg,
      AVG(CASE WHEN t.name LIKE '%2%' OR t.name = 'Term 2' THEN cr.score END) as term2_avg,
      AVG(CASE WHEN t.name LIKE '%3%' OR t.name = 'Term 3' THEN cr.score END) as term3_avg,
      
      -- Teacher info from class_subjects table (correct schema alignment)
      CONCAT(COALESCE(teacher_p.first_name, ''), ' ', COALESCE(teacher_p.last_name, '')) as teacher_name
      
    FROM class_results cr
    INNER JOIN subjects subj ON cr.subject_id = subj.id
    INNER JOIN students s ON cr.student_id = s.id AND s.deleted_at IS NULL
    INNER JOIN terms t ON cr.term_id = t.id
    LEFT JOIN class_subjects cs ON cr.class_id = cs.class_id AND cr.subject_id = cs.subject_id
    LEFT JOIN staff teacher_staff ON cs.teacher_id = teacher_staff.id
    LEFT JOIN people teacher_p ON teacher_staff.person_id = teacher_p.id
    ${whereClause}
    GROUP BY subj.id, subj.name, subj.code, subj.subject_type, teacher_p.first_name, teacher_p.last_name
    ORDER BY avg_score DESC`,
    params
  );

  const subjects = (subjectData as any[]).map((subject) => {
    // Calculate trend direction
    const trend = calculateTrend(subject.term1_avg, subject.term2_avg, subject.term3_avg);
    
    // Calculate performance rating
    const avgScore = subject.avg_score || 0;
    const performanceRating = getPerformanceRating(avgScore);
    
    // Identify issues
    const issues = identifySubjectIssues(subject);
    
    // Calculate improvement potential
    const improvementPotential = calculateImprovementPotential(subject);

    return {
      ...subject,
      trend,
      performanceRating,
      issues,
      improvementPotential,
      passRate: ((subject.total_assessments - subject.failures) / subject.total_assessments * 100).toFixed(2),
      failureRate: ((subject.failures / subject.total_assessments) * 100).toFixed(2),
    };
  });

  // Sort subjects by category
  const theology = subjects.filter(s => s.subject_type === 'tahfiz' || s.subject_code?.includes('ISLAM'));
  const secular = subjects.filter(s => s.subject_type !== 'tahfiz' && !s.subject_code?.includes('ISLAM'));

  // Identify best and worst
  const bestSubjects = [...subjects].sort((a, b) => b.avg_score - a.avg_score).slice(0, 5);
  const worstSubjects = [...subjects].sort((a, b) => a.avg_score - b.avg_score).slice(0, 5);

  return {
    overall: subjects,
    theology,
    secular,
    bestSubjects,
    worstSubjects,
    summary: {
      totalSubjects: subjects.length,
      avgSchoolScore: (subjects.reduce((sum, s) => sum + (s.avg_score || 0), 0) / subjects.length).toFixed(2),
      improving: subjects.filter(s => s.trend === 'improving').length,
      declining: subjects.filter(s => s.trend === 'declining').length,
      stable: subjects.filter(s => s.trend === 'stable').length,
    },
  };
}

/**
 * Generate 1-year and 5-year academic projections
 */
async function generateAcademicProjections(
  connection: any,
  schoolId: number,
  scope: string,
  scopeId: string | null
) {
  let whereClause = 'WHERE s.school_id = ?';
  const params: any[] = [schoolId];

  if (scope === 'class' && scopeId) {
    whereClause += ' AND cr.class_id = ?';
    params.push(scopeId);
  } else if (scope === 'student' && scopeId) {
    whereClause += ' AND cr.student_id = ?';
    params.push(scopeId);
  }

  // Get historical performance data
  const [historicalData] = await connection.execute(
    `SELECT 
      t.name as term_name,
      ay.name as academic_year,
      AVG(cr.score) as avg_score,
      COUNT(DISTINCT cr.student_id) as student_count,
      subj.subject_type,
      
      -- Division distribution
      SUM(CASE WHEN cr.score >= 80 THEN 1 ELSE 0 END) as distinctions,
      SUM(CASE WHEN cr.score >= 60 THEN 1 ELSE 0 END) as credits
      
    FROM class_results cr
    INNER JOIN students s ON cr.student_id = s.id AND s.deleted_at IS NULL
    INNER JOIN terms t ON cr.term_id = t.id
    INNER JOIN academic_years ay ON t.academic_year_id = ay.id
    INNER JOIN subjects subj ON cr.subject_id = subj.id
    ${whereClause}
    GROUP BY t.id, t.name, ay.name, subj.subject_type
    ORDER BY ay.name DESC, t.name DESC
    LIMIT 12`,
    params
  );

  // Calculate growth rate and project forward
  const recentData = (historicalData as any[]).slice(0, 6);
  const avgGrowthRate = calculateGrowthRate(recentData);

  // 1-Year Projection
  const oneYearProjection = projectPerformance(recentData[0]?.avg_score || 50, avgGrowthRate, 3);

  // 5-Year Projection
  const fiveYearProjection = projectPerformance(recentData[0]?.avg_score || 50, avgGrowthRate * 0.8, 15);

  // Department-specific projections
  const theologyProjection = await projectDepartmentPerformance(connection, schoolId, 'tahfiz', recentData);
  const secularProjection = await projectDepartmentPerformance(connection, schoolId, 'regular', recentData);

  return {
    oneYear: oneYearProjection,
    fiveYear: fiveYearProjection,
    theology: theologyProjection,
    secular: secularProjection,
    growthRate: avgGrowthRate,
    confidence: calculateProjectionConfidence(recentData),
  };
}

/**
 * Generate actionable performance insights
 */
async function generatePerformanceInsights(
  connection: any,
  schoolId: number,
  scope: string,
  scopeId: string | null
) {
  const insights: any[] = [];

  // Get recent performance trends
  const subjectAnalysis = await analyzeSubjectPerformance(connection, schoolId, scope, scopeId);

  // Generate insights
  if (subjectAnalysis.worstSubjects.length > 0) {
    const worst = subjectAnalysis.worstSubjects[0];
    insights.push({
      type: 'performance_risk',
      severity: 'high',
      title: `Critical: ${worst.subject_name} Performance Below 50%`,
      description: `Average score of ${worst.avg_score?.toFixed(2)}% with ${worst.failureRate}% failure rate`,
      recommendation: `Immediate intervention required: ${worst.issues.join(', ')}`,
      affectedCount: worst.student_count,
      confidenceScore: 0.92,
    });
  }

  if (subjectAnalysis.summary.declining > 0) {
    insights.push({
      type: 'trend_alert',
      severity: 'medium',
      title: `${subjectAnalysis.summary.declining} Subject(s) Showing Declining Trends`,
      description: 'Performance dropping compared to previous terms',
      recommendation: 'Review teaching methods, increase practice sessions, and provide remedial support',
      confidenceScore: 0.85,
    });
  }

  if (subjectAnalysis.bestSubjects.length > 0) {
    const best = subjectAnalysis.bestSubjects[0];
    insights.push({
      type: 'improvement',
      severity: 'positive',
      title: `Excellent Performance in ${best.subject_name}`,
      description: `Avg score ${best.avg_score?.toFixed(2)}% with ${best.passRate}% pass rate`,
      recommendation: `Replicate teaching strategies from ${best.teacher_name} to other subjects`,
      confidenceScore: 0.90,
    });
  }

  return insights;
}

// ===== HELPER FUNCTIONS =====

function calculateTrend(term1?: number, term2?: number, term3?: number): string {
  const scores = [term1, term2, term3].filter(s => s !== null && s !== undefined) as number[];
  if (scores.length < 2) return 'insufficient_data';

  const recent = scores[scores.length - 1];
  const previous = scores[scores.length - 2];
  const diff = recent - previous;

  if (diff > 3) return 'improving';
  if (diff < -3) return 'declining';
  return 'stable';
}

function getPerformanceRating(avgScore: number): string {
  if (avgScore >= 80) return 'excellent';
  if (avgScore >= 70) return 'very_good';
  if (avgScore >= 60) return 'good';
  if (avgScore >= 50) return 'satisfactory';
  return 'needs_improvement';
}

function identifySubjectIssues(subject: any): string[] {
  const issues: string[] = [];
  
  if (subject.avg_score < 50) issues.push('Low average score');
  if (subject.failureRate > 40) issues.push('High failure rate');
  if (subject.score_stddev > 20) issues.push('Inconsistent performance');
  if (subject.trend === 'declining') issues.push('Declining trend');
  
  return issues;
}

function calculateImprovementPotential(subject: any): number {
  // Score 0-100 indicating how much room for improvement
  const currentScore = subject.avg_score || 0;
  const consistency = 100 - (subject.score_stddev || 10);
  const trendBonus = subject.trend === 'improving' ? 10 : 0;
  
  return Math.min(100, (100 - currentScore) * 0.6 + consistency * 0.3 + trendBonus);
}

function calculateGrowthRate(data: any[]): number {
  if (data.length < 2) return 0;
  
  const recent = data[0]?.avg_score || 0;
  const oldest = data[data.length - 1]?.avg_score || 0;
  
  return ((recent - oldest) / oldest) * 100 / data.length;
}

function projectPerformance(currentScore: number, growthRate: number, terms: number): any {
  const projectedScores: any[] = [];
  let score = currentScore;
  
  for (let i = 1; i <= terms; i++) {
    score = Math.min(100, Math.max(0, score * (1 + growthRate / 100)));
    projectedScores.push({
      term: i,
      projectedScore: score.toFixed(2),
      confidence: Math.max(0.3, 1 - (i * 0.1)), // Confidence decreases over time
    });
  }
  
  return {
    projectedScores,
    finalScore: projectedScores[projectedScores.length - 1]?.projectedScore,
  };
}

async function projectDepartmentPerformance(
  connection: any,
  schoolId: number,
  subjectType: string,
  historicalData: any[]
): Promise<any> {
  const departmentData = historicalData.filter(d => d.subject_type === subjectType);
  const currentAvg = departmentData[0]?.avg_score || 50;
  const growthRate = calculateGrowthRate(departmentData);
  
  return {
    current: currentAvg,
    oneYear: projectPerformance(currentAvg, growthRate, 3),
    fiveYear: projectPerformance(currentAvg, growthRate * 0.8, 15),
    growthRate,
  };
}

function calculateProjectionConfidence(data: any[]): number {
  if (data.length < 3) return 0.5;
  if (data.length < 6) return 0.7;
  return 0.85;
}
