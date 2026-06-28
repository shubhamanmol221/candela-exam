import React, { useEffect, useMemo, useState } from 'react';
import { Award, BarChart3, Code2, Loader2, RefreshCw, Search, Users, ListChecks, CheckCircle2, XCircle } from 'lucide-react';
import { getResults, getAllMCQResults, getMCQQuestions } from '../../services/api';
import { ResultEntry, ResultStats } from '../../types';

const emptyStats: ResultStats = {
  total_candidates: 0,
  average_score: 0,
  highest_score: 0,
  lowest_score: 0,
};

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

const MCQResultsPanel: React.FC<{ results: any[]; loading: boolean }> = ({ results, loading }) => {
  const [query, setQuery] = useState('');
  const [assessmentFilter, setAssessmentFilter] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [questionMap, setQuestionMap] = useState<Record<string, any[]>>({});
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  const rankedResults = useMemo(() => {
    return [...results]
      .sort((a, b) => {
        const aPct = a.total_marks ? a.score / a.total_marks : 0;
        const bPct = b.total_marks ? b.score / b.total_marks : 0;
        return bPct - aPct;
      })
      .map((r, i) => ({
        ...r,
        rank: i + 1,
        pct: r.total_marks ? Math.round((r.score / r.total_marks) * 100) : 0,
      }));
  }, [results]);

  const stats = useMemo(() => {
    if (!rankedResults.length) return { candidates: 0, avg: 0, highest: 0, lowest: 0 };
    const pcts = rankedResults.map((r) => r.pct);
    return {
      candidates: rankedResults.length,
      avg: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
      highest: Math.max(...pcts),
      lowest: Math.min(...pcts),
    };
  }, [rankedResults]);

  const assessments = useMemo(() => {
    const map = new Map<string, string>();
    results.forEach((r) => map.set(r.assessment_id, r.assessment_title));
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [results]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rankedResults.filter((r) => {
      const matchAssessment = assessmentFilter === 'all' || r.assessment_id === assessmentFilter;
      const matchQuery =
        !q ||
        r.candidate_name?.toLowerCase().includes(q) ||
        r.candidate_email?.toLowerCase().includes(q) ||
        r.assessment_title?.toLowerCase().includes(q);
      return matchAssessment && matchQuery;
    });
  }, [rankedResults, query, assessmentFilter]);

  const selectedResult = filtered.find((r) => r.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    if (!selectedResult) return;
    const aid = selectedResult.assessment_id;
    if (questionMap[aid] !== undefined) return;
    setLoadingQuestions(true);
    getMCQQuestions(aid)
      .then((res) => setQuestionMap((prev) => ({ ...prev, [aid]: Array.isArray(res.data) ? res.data : [] })))
      .catch(() => setQuestionMap((prev) => ({ ...prev, [aid]: [] })))
      .finally(() => setLoadingQuestions(false));
  }, [selectedResult?.assessment_id]);

  const questions: any[] = selectedResult ? (questionMap[selectedResult.assessment_id] ?? []) : [];

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-slate-200 bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <MCQStatCard icon={Users} label="Candidates" value={`${stats.candidates}`} />
        <MCQStatCard icon={BarChart3} label="Average" value={`${stats.avg}%`} />
        <MCQStatCard icon={Award} label="Highest" value={`${stats.highest}%`} />
        <MCQStatCard icon={ListChecks} label="Lowest" value={`${stats.lowest}%`} />
      </div>

      <div className="mb-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_260px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search candidate, email, or assessment"
            className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </label>
        <select
          value={assessmentFilter}
          onChange={(e) => setAssessmentFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="all">All assessments</option>
          {assessments.map((a) => (
            <option key={a.id} value={a.id}>{a.title}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
          {results.length === 0
            ? 'No MCQ submissions yet. Ask a candidate to complete an MCQ assessment.'
            : 'No results match your search.'}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Candidate</th>
                    <th className="px-4 py-3">Assessment</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Percent</th>
                    <th className="px-4 py-3">Violations</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => {
                    const active = selectedResult?.id === r.id;
                    const violations = (r.fullscreen_exit_count ?? 0) + (r.tab_switch_count ?? 0);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        className={`cursor-pointer transition ${active ? 'bg-purple-50' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-4 py-3 font-semibold text-slate-900">#{r.rank}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{r.candidate_name}</p>
                          <p className="text-xs text-slate-500">{r.candidate_email}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{r.assessment_title}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{r.score}/{r.total_marks}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded px-2 py-1 text-xs font-semibold ${r.pct >= 60 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                            {r.pct}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded px-2 py-1 text-xs font-semibold ${violations > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                            {violations}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {r.is_banned ? (
                            <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">Banned</span>
                          ) : (
                            <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">OK</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {selectedResult && (
            <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5">
                <p className="text-xs uppercase tracking-wide text-slate-500">Selected Submission</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{selectedResult.candidate_name}</h2>
                <p className="text-sm text-slate-600">{selectedResult.assessment_title}</p>
              </div>

              <div className="mb-5 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                <Metric label="Score" value={`${selectedResult.score}/${selectedResult.total_marks}`} />
                <Metric label="Percent" value={`${selectedResult.pct}%`} />
                <Metric label="Fullscreen Exits" value={`${selectedResult.fullscreen_exit_count ?? 0}`} />
                <Metric label="Tab Switches" value={`${selectedResult.tab_switch_count ?? 0}`} />
                {selectedResult.is_banned && (
                  <div className="col-span-4 rounded-lg bg-red-50 px-3 py-2 text-center text-xs font-semibold text-red-700">
                    BANNED — exceeded violation limit
                  </div>
                )}
              </div>

              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Per-question breakdown</p>
              {loadingQuestions ? (
                <div className="flex h-20 items-center justify-center">
                  <Loader2 className="animate-spin text-purple-600" size={20} />
                </div>
              ) : questions.length === 0 ? (
                <p className="text-sm text-slate-500">Question details unavailable.</p>
              ) : (
                <div className="space-y-3">
                  {questions.map((q: any, qi: number) => {
                    const selected = selectedResult.answers?.[q.id];
                    const isCorrect = selected !== undefined && selected !== null && Number(selected) === q.correct_option;
                    const notAnswered = selected === undefined || selected === null;
                    return (
                      <div key={q.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">Q{qi + 1}. {q.question_text}</p>
                          <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${isCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                            {isCorrect ? q.marks : 0}/{q.marks}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {q.options.map((opt: string, oi: number) => {
                            const isSelected = !notAnswered && Number(selected) === oi;
                            const isCorrectOpt = oi === q.correct_option;
                            return (
                              <div
                                key={oi}
                                className={`flex items-center gap-1.5 rounded border px-2 py-1.5 text-xs ${
                                  isCorrectOpt
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                    : isSelected
                                    ? 'border-red-300 bg-red-50 text-red-700'
                                    : 'border-slate-200 text-slate-600'
                                }`}
                              >
                                {isCorrectOpt ? (
                                  <CheckCircle2 size={11} className="text-emerald-600 shrink-0" />
                                ) : isSelected ? (
                                  <XCircle size={11} className="text-red-500 shrink-0" />
                                ) : null}
                                <span className="font-semibold">{OPTION_LABELS[oi]}.</span>
                                <span className="truncate">{opt}</span>
                              </div>
                            );
                          })}
                        </div>
                        {notAnswered && (
                          <p className="mt-1.5 text-xs font-semibold text-amber-600">Not answered</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="mt-4 text-xs text-slate-400">Submitted {formatDate(selectedResult.submitted_at)}</p>
            </aside>
          )}
        </div>
      )}
    </>
  );
};

const Results: React.FC = () => {
  const [tab, setTab] = useState<'coding' | 'mcq'>('coding');
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [stats, setStats] = useState<ResultStats>(emptyStats);
  const [mcqResults, setMcqResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [assessmentId, setAssessmentId] = useState('all');
  const [selectedKey, setSelectedKey] = useState('');

  const loadResults = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [codingRes, mcqRes] = await Promise.all([getResults(), getAllMCQResults()]);
      const nextResults = codingRes.data?.results || [];
      setResults(nextResults);
      setStats(codingRes.data?.stats || emptyStats);
      setSelectedKey((current) => current || resultKey(nextResults[0]));
      setMcqResults(Array.isArray(mcqRes.data) ? mcqRes.data : []);
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || 'Failed to load results.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResults();
  }, []);

  const assessments = useMemo(() => {
    const byId = new Map<string, string>();
    results.forEach((result) => byId.set(result.assessment_id, result.assessment_title));
    return Array.from(byId.entries()).map(([id, title]) => ({ id, title }));
  }, [results]);

  const filteredResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return results.filter((result) => {
      const matchesAssessment = assessmentId === 'all' || result.assessment_id === assessmentId;
      const matchesQuery =
        !normalizedQuery ||
        result.candidate_name.toLowerCase().includes(normalizedQuery) ||
        result.candidate_email.toLowerCase().includes(normalizedQuery) ||
        result.assessment_title.toLowerCase().includes(normalizedQuery);
      return matchesAssessment && matchesQuery;
    });
  }, [assessmentId, query, results]);

  const selectedResult =
    filteredResults.find((result) => resultKey(result) === selectedKey) || filteredResults[0] || null;

  useEffect(() => {
    if (filteredResults.length && !filteredResults.some((result) => resultKey(result) === selectedKey)) {
      setSelectedKey(resultKey(filteredResults[0]));
    }
  }, [filteredResults, selectedKey]);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Results</h1>
            <p className="mt-2 text-sm text-slate-600">Review submitted tests, scores, and candidate code.</p>
            <div className="mt-3 flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 w-fit">
              <button
                type="button"
                onClick={() => setTab('coding')}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold transition ${tab === 'coding' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Code2 size={14} /> Coding
              </button>
              <button
                type="button"
                onClick={() => setTab('mcq')}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold transition ${tab === 'mcq' ? 'bg-white shadow text-purple-700' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <ListChecks size={14} /> MCQ
                {mcqResults.length > 0 && (
                  <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">{mcqResults.length}</span>
                )}
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={loadResults}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </div>

        {tab === 'mcq' && (
          <MCQResultsPanel results={mcqResults} loading={loading} />
        )}

        {tab === 'coding' && (<>
          <div className="mb-6 grid gap-4 md:grid-cols-4">
            <StatCard icon={Users} label="Candidates" value={stats.total_candidates} />
            <StatCard icon={BarChart3} label="Average" value={stats.average_score} />
            <StatCard icon={Award} label="Highest" value={stats.highest_score} />
            <StatCard icon={Code2} label="Lowest" value={stats.lowest_score} />
          </div>

          <div className="mb-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_260px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search candidate, email, or assessment"
                className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <select
              value={assessmentId}
              onChange={(event) => setAssessmentId(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All assessments</option>
              {assessments.map((assessment) => (
                <option key={assessment.id} value={assessment.id}>
                  {assessment.title}
                </option>
              ))}
            </select>
          </div>

          {message && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>}

          {loading ? (
            <div className="flex min-h-64 items-center justify-center rounded-lg border border-slate-200 bg-white">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
              No submissions found yet. Ask a student to submit at least one question, then refresh this page.
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Rank</th>
                        <th className="px-4 py-3">Candidate</th>
                        <th className="px-4 py-3">Assessment</th>
                        <th className="px-4 py-3">Score</th>
                        <th className="px-4 py-3">Percent</th>
                        <th className="px-4 py-3">Violations</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredResults.map((result) => {
                        const active = selectedResult && resultKey(selectedResult) === resultKey(result);
                        return (
                          <tr
                            key={resultKey(result)}
                            onClick={() => setSelectedKey(resultKey(result))}
                            className={`cursor-pointer transition ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                          >
                            <td className="px-4 py-3 font-semibold text-slate-900">#{result.rank}</td>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-900">{result.candidate_name}</p>
                              <p className="text-xs text-slate-500">{result.candidate_email}</p>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{result.assessment_title}</td>
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {result.total_score}/{result.total_marks}
                            </td>
                            <td className="px-4 py-3">
                              <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                                {result.percentage}%
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={['rounded px-2 py-1 text-xs font-semibold', (result.fullscreen_exit_count + (result.tab_switch_count ?? 0)) > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'].join(' ')}>
                                {result.fullscreen_exit_count + (result.tab_switch_count ?? 0)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {result.is_banned ? (
                                <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">Banned</span>
                              ) : (
                                <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">OK</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {selectedResult && (
                <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-5">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Selected Submission</p>
                    <h2 className="mt-1 text-xl font-bold text-slate-900">{selectedResult.candidate_name}</h2>
                    <p className="text-sm text-slate-600">{selectedResult.assessment_title}</p>
                  </div>

                  <div className="mb-5 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                    <Metric label="Score" value={`${selectedResult.total_score}/${selectedResult.total_marks}`} />
                    <Metric label="Percent" value={`${selectedResult.percentage}%`} />
                    <Metric label="Rank" value={`#${selectedResult.rank}`} />
                    <Metric label="Fullscreen Exits" value={`${selectedResult.fullscreen_exit_count}`} />
                    <Metric label="Tab Switches" value={`${selectedResult.tab_switch_count ?? 0}`} />
                    {selectedResult.is_banned && (
                      <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-center text-xs font-semibold text-red-700">
                        BANNED — exceeded violation limit
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    {selectedResult.question_results.map((question: any) => (
                      <div key={question.submission_id || question.question_id} className="rounded-lg border border-slate-200 p-4">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{question.question_title}</p>
                            {question.attempt_count > 0 ? (
                              <>
                                <p className="mt-1 text-xs text-slate-500">
                                  Scored attempt: {question.language || 'Unknown language'} · Passed {question.passed_count}, Failed {question.failed_count}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Best of {question.attempt_count} attempt{question.attempt_count === 1 ? '' : 's'} · {formatDate(question.submitted_at)}
                                </p>
                              </>
                            ) : (
                              <p className="mt-1 text-xs font-semibold text-amber-600">Not submitted</p>
                            )}
                          </div>
                          <span className="rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                            {question.score}/{question.marks}
                          </span>
                        </div>
                        <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                          {question.code || '// No code saved'}
                        </pre>
                        {question.attempts.length > 1 && (
                          <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                              View all attempts, newest first
                            </summary>
                            <div className="mt-3 space-y-3">
                              {question.attempts.map((attempt: any, index: number) => (
                                <div key={attempt.submission_id || `${attempt.question_id}-${index}`} className="rounded border border-slate-200 bg-white p-3">
                                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <span className="font-semibold text-slate-700">Attempt {question.attempts.length - index}</span>
                                    <span className="text-slate-500">{formatDate(attempt.submitted_at)}</span>
                                    <span className="rounded bg-slate-100 px-2 py-1 font-semibold text-slate-700">{attempt.score}/{attempt.marks}</span>
                                  </div>
                                  <pre className="max-h-48 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
                                    {attempt.code || '// No code saved'}
                                  </pre>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </aside>
              )}
            </div>
          )}
        </>)}
      </div>
    </div>
  );
};

const resultKey = (result?: ResultEntry) => {
  if (!result) return '';
  return `${result.candidate_id}:${result.assessment_id}`;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Time not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const StatCard: React.FC<{ icon: React.ElementType; label: string; value: number }> = ({ icon: Icon, label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <Icon className="h-5 w-5 text-blue-600" />
    </div>
    <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
  </div>
);

const MCQStatCard: React.FC<{ icon: React.ElementType; label: string; value: string }> = ({ icon: Icon, label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <Icon className="h-5 w-5 text-purple-600" />
    </div>
    <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
  </div>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg bg-slate-50 p-3">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 font-bold text-slate-900">{value}</p>
  </div>
);

export default Results;
