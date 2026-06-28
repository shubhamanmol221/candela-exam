import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import { getMCQQuestions, createMCQQuestion, deleteMCQQuestion, getAssessment, uploadMCQQuestions } from '../../services/api';
import { MCQQuestion } from '../../types';

const uploadExample = JSON.stringify(
  [
    {
      question_text: 'What is the output of print(2 + 3)?',
      options: ['2', '3', '5', '23'],
      correct_option: 2,
      marks: 1,
    },
    {
      question_text: 'Which data structure uses LIFO?',
      options: ['Queue', 'Stack', 'Array', 'Tree'],
      correct_option: 1,
      marks: 2,
    },
  ],
  null,
  2
);

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

const MCQQuestions: React.FC = () => {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const [questions, setQuestions] = useState<MCQQuestion[]>([]);
  const [assessmentTitle, setAssessmentTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctOption, setCorrectOption] = useState(0);
  const [marks, setMarks] = useState(1);

  const load = async () => {
    if (!assessmentId) return;
    setLoading(true);
    try {
      const [aRes, qRes] = await Promise.all([
        getAssessment(assessmentId),
        getMCQQuestions(assessmentId),
      ]);
      setAssessmentTitle(aRes.data.title || assessmentId);
      setQuestions(Array.isArray(qRes.data) ? qRes.data : []);
    } catch {
      setMessage('Failed to load questions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [assessmentId]);

  const handleOptionChange = (index: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (options.some((o) => !o.trim())) {
      setMessage('All 4 options must be filled in.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      await createMCQQuestion({
        assessment_id: assessmentId,
        question_text: questionText,
        options: options.map((o) => o.trim()),
        correct_option: correctOption,
        marks,
      });
      setQuestionText('');
      setOptions(['', '', '', '']);
      setCorrectOption(0);
      setMarks(1);
      await load();
      setMessage('Question created successfully.');
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setMessage(typeof detail === 'string' ? detail : 'Failed to create question.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !assessmentId) return;
    setMessage('');
    setUploading(true);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const qs = Array.isArray(parsed) ? parsed : parsed.questions;
      if (!Array.isArray(qs) || !qs.length) throw new Error('JSON must be an array of questions.');
      const res = await uploadMCQQuestions({ assessment_id: assessmentId, questions: qs });
      await load();
      setMessage(`Uploaded ${res.data.count} question(s).`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setMessage(detail || (err instanceof Error ? err.message : 'Failed to upload questions.'));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this question?')) return;
    try {
      await deleteMCQQuestion(id);
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      setMessage('Question deleted.');
    } catch {
      setMessage('Failed to delete question.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/admin/assessments"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft size={14} />
          Back
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">MCQ Questions</h1>
          {assessmentTitle && <p className="text-sm text-slate-500">{assessmentTitle}</p>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Create Question</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Question Text *</label>
              <textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                required
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Enter the question..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Options * (select the correct answer)</label>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct"
                      checked={correctOption === i}
                      onChange={() => setCorrectOption(i)}
                      className="accent-purple-600"
                    />
                    <span className="w-5 text-xs font-bold text-slate-500">{OPTION_LABELS[i]}</span>
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => handleOptionChange(i, e.target.value)}
                      required
                      placeholder={`Option ${OPTION_LABELS[i]}`}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">Click the radio button to mark the correct answer.</p>
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
              disabled={saving || !assessmentId}
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? 'Creating...' : 'Create Question'}
            </button>
          </form>
          {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
        </section>

        <div className="space-y-6">
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Upload Questions</h2>
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700">
              <Upload size={16} />
              {uploading ? 'Uploading...' : 'Upload JSON'}
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleUpload}
                disabled={uploading || !assessmentId}
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
            {loading ? (
              <div className="flex h-20 items-center justify-center">
                <Loader2 className="animate-spin text-purple-600" size={24} />
              </div>
            ) : questions.length === 0 ? (
              <p className="text-slate-500">No questions found for this assessment.</p>
            ) : (
              <div className="space-y-4">
                {questions.map((q, qi) => (
                  <div key={q.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <p className="font-semibold text-slate-900">Q{qi + 1}. {q.question_text}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">
                          {q.marks} mark{q.marks !== 1 ? 's' : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDelete(q.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-red-200 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {q.options.map((opt, oi) => (
                        <div
                          key={oi}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                            oi === q.correct_option
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                              : 'border-slate-200 text-slate-700'
                          }`}
                        >
                          {oi === q.correct_option && <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />}
                          <span className="font-semibold mr-1">{OPTION_LABELS[oi]}.</span>
                          {opt}
                        </div>
                      ))}
                    </div>
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

export default MCQQuestions;
