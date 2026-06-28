import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Maximize, Send } from 'lucide-react';
import { banCandidate, getCandidateMCQAssessment, recordFullscreenExit, recordTabSwitch, startAssessment, submitMCQ } from '../../services/api';
import { useCandidate } from '../../contexts/AuthContext';
import { MCQQuestion } from '../../types';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];
const MAX_VIOLATIONS = 4;

const formatTime = (seconds: number) => {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
};

const MCQPage: React.FC = () => {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const { candidate } = useCandidate();
  const navigate = useNavigate();

  const fullscreenEnteredRef = useRef(false);
  const tabSwitchDebounceRef = useRef(false);
  const banTriggeredRef = useRef(false);
  const autoSubmitStartedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [assessment, setAssessment] = useState<any>(null);
  const [questions, setQuestions] = useState<MCQQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [assessmentEnded, setAssessmentEnded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenExitCount, setFullscreenExitCount] = useState(0);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [violationWarning, setViolationWarning] = useState('');
  const [isBanned, setIsBanned] = useState(false);
  const [showFullscreenLock, setShowFullscreenLock] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const totalViolations = fullscreenExitCount + tabSwitchCount;

  const enterFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      fullscreenEnteredRef.current = true;
      setIsFullscreen(true);
      return;
    }
    try {
      await document.documentElement.requestFullscreen();
      fullscreenEnteredRef.current = true;
      setIsFullscreen(true);
    } catch {
      setViolationWarning('Could not start fullscreen automatically. Click "Enter Fullscreen" to continue.');
    }
  }, []);

  useEffect(() => {
    if (!candidate) { navigate('/'); return; }
    if (!assessmentId) { setError('Invalid assessment ID'); setLoading(false); return; }

    let cancelled = false;
    Promise.all([
      startAssessment(assessmentId, candidate.id),
      getCandidateMCQAssessment(assessmentId),
    ]).then(([startRes, assessRes]) => {
      if (cancelled) return;
      const startedTime = startRes?.data?.started_at || startRes?.data?.created_at || '';
      if (!startedTime) throw new Error('Could not start the assessment timer.');
      setStartedAt(startedTime);
      setFullscreenExitCount(Number(startRes?.data?.fullscreen_exit_count || 0));
      const savedTabSwitch = Number(startRes?.data?.tab_switch_count || 0);
      setTabSwitchCount(savedTabSwitch);
      if (startRes?.data?.is_banned) {
        setIsBanned(true);
      } else if (Number(startRes?.data?.fullscreen_exit_count || 0) + savedTabSwitch >= MAX_VIOLATIONS) {
        banTriggeredRef.current = true;
      }
      if (startRes?.data?.finished_at) {
        setAssessmentEnded(true);
      }
      setAssessment(assessRes.data);
      setQuestions(assessRes.data.questions || []);
    }).catch((e) => {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load assessment.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [candidate, navigate, assessmentId]);

  useEffect(() => {
    if (assessment && !assessmentEnded) enterFullscreen();
  }, [assessment, assessmentEnded, enterFullscreen]);

  useEffect(() => {
    const handleFSChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (active) { fullscreenEnteredRef.current = true; setViolationWarning(''); return; }
      if (fullscreenEnteredRef.current && assessment && !assessmentEnded && !isBanned) {
        setFullscreenExitCount((c) => {
          const next = c + 1;
          setViolationWarning(`Fullscreen exit detected. Violations: ${next + tabSwitchCount}/${MAX_VIOLATIONS}`);
          setShowFullscreenLock(true);
          if (candidate?.id && assessmentId) {
            recordFullscreenExit(assessmentId, candidate.id, next).catch(() => {});
          }
          return next;
        });
      }
    };
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, [assessment, assessmentEnded, isBanned, assessmentId, candidate?.id, tabSwitchCount]);

  useEffect(() => {
    if (!document.fullscreenElement) setShowFullscreenLock(isFullscreen ? false : fullscreenExitCount > 0);
  }, [isFullscreen, fullscreenExitCount]);

  useEffect(() => {
    if (!assessment || assessmentEnded || isBanned) return;
    const recordSwitch = () => {
      if (tabSwitchDebounceRef.current) return;
      tabSwitchDebounceRef.current = true;
      setTimeout(() => { tabSwitchDebounceRef.current = false; }, 1000);
      setTabSwitchCount((c) => {
        const next = c + 1;
        setViolationWarning(`Tab/window switch detected. Violations: ${fullscreenExitCount + next}/${MAX_VIOLATIONS}`);
        if (candidate?.id && assessmentId) {
          recordTabSwitch(assessmentId, candidate.id, next).catch(() => {});
        }
        return next;
      });
    };
    const onHidden = () => { if (document.hidden) recordSwitch(); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('blur', recordSwitch);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('blur', recordSwitch);
    };
  }, [assessment, assessmentEnded, isBanned, assessmentId, candidate?.id, fullscreenExitCount]);

  useEffect(() => {
    if (totalViolations >= MAX_VIOLATIONS && !isBanned && !banTriggeredRef.current && assessment && !assessmentEnded) {
      banTriggeredRef.current = true;
      setIsBanned(true);
      if (candidate?.id && assessmentId) {
        banCandidate(assessmentId, candidate.id).catch(() => {});
      }
    }
  }, [totalViolations, isBanned, assessment, assessmentEnded, candidate?.id, assessmentId]);

  useEffect(() => {
    if (!assessment || assessmentEnded) return;
    const blockDevTools = (e: KeyboardEvent) => {
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I','J','C'].includes(e.key.toUpperCase())) || (e.ctrlKey && e.key.toUpperCase() === 'U')) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    document.addEventListener('keydown', blockDevTools, true);
    return () => document.removeEventListener('keydown', blockDevTools, true);
  }, [assessment, assessmentEnded]);

  useEffect(() => {
    if (!assessment || assessmentEnded) return;
    const block = (e: Event) => e.preventDefault();
    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('paste', block);
    document.addEventListener('contextmenu', block);
    return () => {
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('paste', block);
      document.removeEventListener('contextmenu', block);
    };
  }, [assessment, assessmentEnded]);

  useEffect(() => {
    if (!assessment || !startedAt) return;
    const durationSecs = Math.max(0, Number(assessment.duration || 0) * 60);
    const startedTime = new Date(startedAt).getTime();
    if (!durationSecs || Number.isNaN(startedTime)) { setTimeRemaining(null); return; }
    let intervalId: number;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedTime) / 1000);
      const rem = Math.max(0, durationSecs - elapsed);
      setTimeRemaining(rem);
      if (rem <= 0) { setAssessmentEnded(true); clearInterval(intervalId); }
    };
    tick();
    intervalId = window.setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [assessment, startedAt]);

  useEffect(() => {
    if (assessmentEnded) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      if (!submitted && !autoSubmitStartedRef.current && questions.length > 0 && candidate?.id && assessmentId) {
        autoSubmitStartedRef.current = true;
        handleSubmit(true);
      }
    }
  }, [assessmentEnded]);

  const handleSubmit = async (isAuto = false) => {
    if (submitted || submitting) return;
    if (!candidate?.id || !assessmentId) return;
    if (!isAuto) { setShowSubmitConfirm(true); return; }
    setSubmitting(true);
    try {
      await submitMCQ({ candidate_id: candidate.id, assessment_id: assessmentId, answers });
      setSubmitted(true);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !candidate) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-400" size={32} />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-10">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
              <CheckCircle2 size={32} className="text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Test Ended</h1>
            <p className="mt-3 text-slate-400">{assessment?.title}</p>
            <p className="mt-6 text-lg font-semibold text-emerald-400">Thank you for participating!</p>
            <p className="mt-2 text-sm text-slate-500">Your answers have been recorded. You may close this window.</p>
          </div>
        </div>
      </div>
    );
  }

  const timerDanger = timeRemaining !== null && timeRemaining <= 60;
  const timerWarning = timeRemaining !== null && timeRemaining > 60 && timeRemaining <= 300;

  return (
    <div className="relative min-h-screen bg-slate-900 text-white">
      <div className={`flex h-screen flex-col overflow-hidden transition ${(showFullscreenLock && !isFullscreen && fullscreenExitCount > 0) ? 'pointer-events-none select-none blur-sm' : ''}`}>
        <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <img src="/candela-logo.png" alt="Candela" className="h-8 w-8 rounded-lg object-contain" />
            <div>
              <p className="font-semibold text-sm">Candela MCQ Assessment</p>
              <p className="text-xs text-slate-400">{candidate.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isFullscreen && !assessmentEnded && (
              <button type="button" onClick={enterFullscreen} className="inline-flex items-center gap-2 rounded border border-amber-500/60 bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/25">
                <Maximize size={14} /> Enter fullscreen
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={submitting || assessmentEnded}
              className="inline-flex items-center gap-2 rounded border border-red-500/60 bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Submit All
            </button>
            <div className={['flex items-center gap-2 rounded border px-3 py-2 font-mono text-sm font-semibold', timerDanger ? 'border-red-500/60 bg-red-500/15 text-red-200' : timerWarning ? 'border-amber-500/60 bg-amber-500/15 text-amber-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'].join(' ')}>
              <Clock size={15} />
              <span>{assessmentEnded ? 'Time ended' : timeRemaining === null ? '--:--' : formatTime(timeRemaining)}</span>
            </div>
          </div>
        </header>

        {violationWarning && !isBanned && !assessmentEnded && (
          <div className={`border-b px-4 py-2 text-sm ${totalViolations >= MAX_VIOLATIONS - 1 ? 'border-red-500/40 bg-red-500/10 text-red-100' : 'border-amber-500/40 bg-amber-500/10 text-amber-100'}`}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} />
              <span>{violationWarning}</span>
              <span className="font-semibold ml-1">{Math.max(0, MAX_VIOLATIONS - totalViolations)} remaining before ban</span>
            </div>
          </div>
        )}

        {error && (
          <div className="border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-100">{error}</div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl space-y-6">
            {questions.length === 0 ? (
              <p className="text-center text-slate-400">No questions found for this assessment.</p>
            ) : (
              questions.map((q, qi) => (
                <div key={q.id} className="rounded-xl border border-slate-700 bg-slate-800 p-6">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <p className="font-semibold leading-relaxed select-none">
                      <span className="text-blue-400 mr-2">Q{qi + 1}.</span>
                      {q.question_text}
                    </p>
                    <span className="shrink-0 rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-300">{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {q.options.map((opt, oi) => {
                      const selected = answers[q.id] === oi;
                      return (
                        <button
                          key={oi}
                          type="button"
                          disabled={assessmentEnded}
                          onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: oi }))}
                          className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition select-none ${
                            selected
                              ? 'border-blue-500 bg-blue-600/20 text-blue-100'
                              : 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/50 text-slate-200'
                          } disabled:cursor-not-allowed`}
                        >
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${selected ? 'border-blue-400 bg-blue-500 text-white' : 'border-slate-500 text-slate-400'}`}>
                            {OPTION_LABELS[oi]}
                          </span>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white">Submit Assessment?</h2>
            <p className="mt-2 text-sm text-slate-300">You cannot change your answers after submitting.</p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 rounded border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setShowSubmitConfirm(false); handleSubmit(true); }}
                className="flex-1 rounded border border-red-500/60 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/25"
              >
                Submit All
              </button>
            </div>
          </div>
        </div>
      )}

      {isBanned && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 px-4">
          <div className="w-full max-w-md rounded-lg border border-red-500/40 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-200">
              <AlertTriangle size={24} />
            </div>
            <h2 className="text-lg font-bold text-white">Assessment Terminated</h2>
            <p className="mt-3 text-sm text-slate-300">
              You have been removed due to repeated violations ({totalViolations} of {MAX_VIOLATIONS}).
            </p>
            <p className="mt-2 text-sm text-slate-400">Contact your administrator. Re-entry requires a special password.</p>
          </div>
        </div>
      )}

      {!isFullscreen && fullscreenExitCount > 0 && !isBanned && assessment && !assessmentEnded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-md rounded-lg border border-amber-400/40 bg-slate-900 p-6 text-center shadow-2xl">
            <AlertTriangle size={24} className="mx-auto mb-4 text-amber-300" />
            <h2 className="text-lg font-bold text-white">Return to Fullscreen</h2>
            <p className="mt-3 text-sm text-slate-300">The assessment is blurred until you re-enter fullscreen.</p>
            <p className="mt-2 text-sm font-semibold text-amber-200">Violations: {totalViolations}/{MAX_VIOLATIONS}</p>
            <button type="button" onClick={enterFullscreen} className="mt-5 w-full rounded bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400">
              <Maximize size={15} className="inline mr-2" />Enter Fullscreen
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MCQPage;
