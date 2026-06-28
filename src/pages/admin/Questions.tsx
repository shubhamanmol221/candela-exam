import React, { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { getAssessments, getQuestions, createQuestion, uploadQuestions } from '../../services/api';
import { Assessment, Question, QuestionUploadItem } from '../../types';

const uploadExample = JSON.stringify(
  [
    {
      title: 'Sum of two numbers',
      problem_statement: 'Read two integers and print their sum.',
      input_format: 'Two space-separated integers.',
      output_format: 'One integer: the sum.',
      constraints: '1 <= a, b <= 1000',
      marks: 10,
      test_cases: [
        {
          input_data: '2 3',
          expected_output: '5',
          explanation: '2 plus 3 equals 5.',
          is_hidden: false,
        },
        {
          input_data: '10 15',
          expected_output: '25',
          explanation: 'Hidden case used for final scoring.',
          is_hidden: true,
        },
      ],
    },
  ],
  null,
  2
);

const Questions: React.FC = () => {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState(assessmentId || '');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [title, setTitle] = useState('');
  const [problemStatement, setProblemStatement] = useState('');
  const [inputFormat, setInputFormat] = useState('');
  const [outputFormat, setOutputFormat] = useState('');
  const [constraints, setConstraints] = useState('');
  const [marks, setMarks] = useState(10);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadAssessments = async () => {
    try {
      const res = await getAssessments();
      setAssessments(res.data || []);
      if (res.data?.length && !selectedAssessmentId) {
        setSelectedAssessmentId(assessmentId || res.data[0].id);
      }
    } catch {
      setMessage('Failed to load assessments.');
    }
  };

  const normalizeUploadPayload = (parsed: unknown): QuestionUploadItem[] => {
    const questions = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { questions?: unknown }).questions)
        ? (parsed as { questions: unknown[] }).questions
        : null;

    if (!questions) {
      throw new Error('Upload file must contain an array or an object with a questions array.');
    }

    questions.forEach((question, index) => {
      if (typeof question !== 'object' || question === null || !('title' in question)) {
        throw new Error(`Question ${index + 1} is missing a title.`);
      }
    });

    return questions as QuestionUploadItem[];
  };

  const loadQuestions = async (assessmentId: string) => {
    if (!assessmentId) {
      setQuestions([]);
      return;
    }

    try {
      const res = await getQuestions(assessmentId);
      setQuestions(res.data || []);
    } catch {
      setMessage('Failed to load questions.');
    }
  };

  useEffect(() => {
    loadAssessments();
  }, []);

  useEffect(() => {
    if (selectedAssessmentId) {
      loadQuestions(selectedAssessmentId);
    }
  }, [selectedAssessmentId]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      await createQuestion({
        assessment_id: selectedAssessmentId,
        title,
        problem_statement: problemStatement,
        input_format: inputFormat,
        output_format: outputFormat,
        constraints,
        marks,
      });

      setTitle('');
      setProblemStatement('');
      setInputFormat('');
      setOutputFormat('');
      setConstraints('');
      setMarks(10);
      await loadQuestions(selectedAssessmentId);
      setMessage('Question created successfully.');
    } catch {
      setMessage('Failed to create question.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !selectedAssessmentId) {
      return;
    }

    setMessage('');
    setUploading(true);

    try {
      const raw = await file.text();
      const questionsToUpload = normalizeUploadPayload(JSON.parse(raw));
      const res = await uploadQuestions({
        assessment_id: selectedAssessmentId,
        questions: questionsToUpload,
      });

      await loadQuestions(selectedAssessmentId);
      setMessage(
        `Uploaded ${res.data.question_count || questionsToUpload.length} question(s) with ${res.data.test_case_count || 0} test case(s).`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to upload questions.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <h1 className="text-3xl font-bold text-slate-800 mb-6">Questions</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <section className="bg-white rounded-lg shadow p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">Assessment</label>
            <select
              value={selectedAssessmentId}
              onChange={(e) => setSelectedAssessmentId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {assessments.map((assessment) => (
                <option key={assessment.id} value={assessment.id}>
                  {assessment.title}
                </option>
              ))}
            </select>
          </div>

          <h2 className="text-xl font-semibold mb-4">Create Question</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Problem Statement</label>
              <textarea
                value={problemStatement}
                onChange={(e) => setProblemStatement(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Input Format</label>
                <input
                  value={inputFormat}
                  onChange={(e) => setInputFormat(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Output Format</label>
                <input
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Constraints</label>
              <textarea
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Marks</label>
              <input
                type="number"
                min={1}
                value={marks}
                onChange={(e) => setMarks(Number(e.target.value))}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !selectedAssessmentId}
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? 'Creating...' : 'Create Question'}
            </button>
          </form>
          {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
        </section>

        <div className="space-y-6">
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Upload Questions</h2>
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              <Upload size={16} />
              {uploading ? 'Uploading...' : 'Upload JSON'}
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleUpload}
                disabled={uploading || !selectedAssessmentId}
                className="hidden"
              />
            </label>
            <p className="mt-4 text-sm font-medium text-slate-700">JSON format</p>
            <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
              {uploadExample}
            </pre>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Questions</h2>
          {questions.length === 0 ? (
            <p className="text-slate-500">No questions found for this assessment.</p>
          ) : (
            <div className="space-y-4">
              {questions.map((question) => (
                <div key={question.id} className="rounded-lg border border-slate-200 p-4">
                  <p className="font-semibold text-slate-900">{question.title}</p>
                  <p className="mt-1 text-sm text-slate-600">Marks: {question.marks}</p>
                </div>
              ))}
            </div>
          )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default Questions;
