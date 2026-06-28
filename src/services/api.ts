import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const adminLogin = (username: string, password: string) =>
  api.post('/admin/login', { username, password });

export const getAssessments = () => api.get('/assessments');
export const getAssessment = (id: string) => api.get(`/assessments/${id}`);
export const createAssessment = (data: { title: string; description: string; duration: number; type: string }) =>
  api.post('/assessments', data);
export const updateAssessment = (id: string, data: Partial<{ title: string; description: string; duration: number }>) =>
  api.put(`/assessments/${id}`, data);
export const deleteAssessment = (id: string) => api.delete(`/assessments/${id}`);

export const getQuestions = (assessmentId: string) => api.get(`/questions/${assessmentId}`);
export const createQuestion = (data: object) => api.post('/questions', data);
export const uploadQuestions = (data: object) => api.post('/questions/bulk', data);
export const updateQuestion = (id: string, data: object) => api.put(`/questions/${id}`, data);
export const deleteQuestion = (id: string) => api.delete(`/questions/${id}`);

export const getTestCases = (questionId: string) => api.get(`/testcases/${questionId}`);
export const createTestCase = (data: object) => api.post('/testcases', data);
export const updateTestCase = (id: string, data: object) => api.put(`/testcases/${id}`, data);
export const deleteTestCase = (id: string) => api.delete(`/testcases/${id}`);

export const getResults = () => api.get('/results');

export const candidateLogin = (name: string, email: string, resumePassword?: string) =>
  api.post('/candidate/login', { name, email, resume_password: resumePassword || undefined });
export const getCandidateAssessment = (assessmentId: string) =>
  api.get(`/candidate/assessment/${assessmentId}`);
export const startAssessment = (assessmentId: string, candidateId: string) =>
  api.post(`/candidate/start/${assessmentId}?candidate_id=${candidateId}`);
export const recordFullscreenExit = (assessmentId: string, candidateId: string, count: number) =>
  api.post(`/candidate/fullscreen-exit/${assessmentId}?candidate_id=${candidateId}&count=${count}`);
export const recordTabSwitch = (assessmentId: string, candidateId: string, count: number) =>
  api.post(`/candidate/tab-switch/${assessmentId}?candidate_id=${candidateId}&count=${count}`);
export const banCandidate = (assessmentId: string, candidateId: string) =>
  api.post(`/candidate/ban/${assessmentId}?candidate_id=${candidateId}`);
export const endAssessment = (assessmentId: string, candidateId: string) =>
  api.post(`/candidate/end/${assessmentId}?candidate_id=${candidateId}`);

export const runCode = (data: {
  code: string;
  language: string;
  input_data: string;
  candidate_id?: string;
  question_id?: string;
}) =>
  api.post('/run', data);
export const submitCode = (data: {
  candidate_id: string;
  question_id: string;
  assessment_id: string;
  language: string;
  code: string;
}) => api.post('/submit', data);

export const getMCQQuestions = (assessmentId: string) => api.get(`/mcq/questions/${assessmentId}`);
export const uploadMCQQuestions = (data: { assessment_id: string; questions: object[] }) => api.post('/mcq/questions/bulk', data);
export const createMCQQuestion = (data: object) => api.post('/mcq/questions', data);
export const updateMCQQuestion = (id: string, data: object) => api.put(`/mcq/questions/${id}`, data);
export const deleteMCQQuestion = (id: string) => api.delete(`/mcq/questions/${id}`);
export const getCandidateMCQAssessment = (assessmentId: string) => api.get(`/candidate/mcq/${assessmentId}`);
export const submitMCQ = (data: { candidate_id: string; assessment_id: string; answers: Record<string, number> }) =>
  api.post('/mcq/submit', data);
export const getMCQResults = (assessmentId: string) => api.get(`/mcq/results/${assessmentId}`);
export const getAllMCQResults = () => api.get('/mcq/results');

export default api;
