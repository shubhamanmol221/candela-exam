import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, FileQuestion, ListChecks } from 'lucide-react';
import { getAssessments, createAssessment } from '../../services/api';
import { Assessment } from '../../types';

const Assessments: React.FC = () => {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(60);
  const [type, setType] = useState<'coding' | 'mcq'>('coding');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const loadAssessments = async () => {
    try {
      const res = await getAssessments();
      setAssessments(res.data || []);
    } catch {
      setMessage('Failed to load assessments.');
    }
  };

  useEffect(() => {
    loadAssessments();
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      await createAssessment({ title, description, duration, type });
      setTitle('');
      setDescription('');
      setDuration(60);
      setType('coding');
      await loadAssessments();
      setMessage('Assessment created successfully.');
    } catch {
      setMessage('Failed to create assessment.');
    } finally {
      setLoading(false);
    }
  };

  const copyAssessmentId = async (assessmentId: string) => {
    try {
      await navigator.clipboard.writeText(assessmentId);
      setMessage('Assessment ID copied.');
    } catch {
      setMessage(`Assessment ID: ${assessmentId}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <h1 className="text-3xl font-bold text-slate-800 mb-6">Assessments</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Create New Assessment</h2>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                rows={4}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Assessment Type</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="coding" checked={type === 'coding'} onChange={() => setType('coding')} />
                  <span className="text-sm text-slate-700">Coding</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="mcq" checked={type === 'mcq'} onChange={() => setType('mcq')} />
                  <span className="text-sm text-slate-700">MCQ</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Duration (minutes)</label>
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? 'Creating...' : 'Create Assessment'}
            </button>
          </form>
          {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
        </section>

        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Assessments</h2>
          <div className="space-y-4">
            {assessments.length === 0 ? (
              <p className="text-slate-500">No assessments found.</p>
            ) : (
              assessments.map((assessment) => (
                <div key={assessment.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{assessment.title}</p>
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${assessment.type === 'mcq' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {assessment.type === 'mcq' ? 'MCQ' : 'Coding'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{assessment.description || 'No description'}</p>
                  <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">Duration: {assessment.duration} min</p>
                  <p className="mt-2 break-all rounded bg-slate-50 px-2 py-1 font-mono text-xs text-slate-600">
                    {assessment.id}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {assessment.type === 'mcq' ? (
                      <Link
                        to={`/admin/assessments/${assessment.id}/mcq-questions`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
                      >
                        <ListChecks size={14} />
                        Manage MCQ Questions
                      </Link>
                    ) : (
                      <Link
                        to={`/admin/assessments/${assessment.id}/questions`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        <FileQuestion size={14} />
                        Manage Questions
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => copyAssessmentId(assessment.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Copy size={14} />
                      Copy ID
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Assessments;
