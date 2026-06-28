export interface Admin {
  id: string;
  username: string;
}

export interface Assessment {
  id: string;
  title: string;
  description: string;
  duration: number;
  type: 'coding' | 'mcq';
  created_at: string;
}

export interface MCQQuestion {
  id: string;
  assessment_id: string;
  question_text: string;
  options: string[];
  correct_option?: number;
  marks: number;
  created_at?: string;
}

export interface MCQResult {
  question_id: string;
  question_text: string;
  selected_option: number | null;
  correct_option: number;
  is_correct: boolean;
  marks: number;
  earned: number;
}

export interface MCQSubmitResponse {
  score: number;
  total_marks: number;
  percentage: number;
  results: MCQResult[];
  submission_id: string;
}

export interface Question {
  id: string;
  assessment_id: string;
  title: string;
  problem_statement: string;
  input_format: string;
  output_format: string;
  constraints: string;
  marks: number;
  created_at: string;
  sample_test_cases?: TestCase[];
}

export interface TestCase {
  id: string;
  question_id: string;
  input_data: string;
  expected_output: string;
  explanation?: string;
  is_hidden: boolean;
  created_at?: string;
}

export interface QuestionUploadItem {
  title: string;
  problem_statement?: string;
  input_format?: string;
  output_format?: string;
  constraints?: string;
  marks?: number;
  test_cases?: Array<{
    input_data?: string;
    expected_output?: string;
    explanation?: string;
    is_hidden?: boolean;
  }>;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface Submission {
  id: string;
  candidate_id: string;
  question_id: string;
  assessment_id?: string;
  language: string;
  code: string;
  score: number;
  passed_count: number;
  failed_count: number;
  submitted_at: string;
}

export interface QuestionAttempt {
  submission_id: string | null;
  question_id: string;
  question_title: string;
  language: string;
  code: string;
  score: number;
  marks: number;
  passed_count: number;
  failed_count: number;
  submitted_at?: string | null;
}

export interface QuestionResult extends QuestionAttempt {
  attempt_count: number;
  scoring_policy?: string;
  attempts: QuestionAttempt[];
}

export interface ResultEntry {
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  assessment_id: string;
  assessment_title: string;
  fullscreen_exit_count: number;
  tab_switch_count: number;
  is_banned: boolean;
  total_score: number;
  total_marks: number;
  percentage: number;
  rank: number;
  question_results: QuestionResult[];
}

export interface ResultStats {
  total_candidates: number;
  average_score: number;
  highest_score: number;
  lowest_score: number;
}

export interface TestCaseResult {
  test_case_id: string;
  is_hidden: boolean;
  passed: boolean;
  actual_output: string | null;
  expected_output: string | null;
  error: string | null;
  execution_time: number;
}

export interface SubmitResponse {
  score: number;
  passed_count: number;
  failed_count: number;
  total_test_cases: number;
  marks: number;
  results: TestCaseResult[];
  submission: Submission | null;
}
