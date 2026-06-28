import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { candidateLogin, getAssessment } from '../../services/api';
import { useCandidate } from '../../contexts/AuthContext';
import { User, Mail, AlertCircle, Loader2, ArrowRight, Lock, Info, X, CheckCircle2, Maximize, Send, TimerReset } from 'lucide-react';

const CandidateLogin: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [assessmentId, setAssessmentId] = useState('');
  const [resumePassword, setResumePassword] = useState('');
  const [showResumePassword, setShowResumePassword] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setCandidate } = useCandidate();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmedAssessmentId = assessmentId.trim();
    if (!trimmedAssessmentId) {
      setError('Please enter an assessment ID');
      return;
    }
    setLoading(true);
    try {
      const assessmentRes = await getAssessment(trimmedAssessmentId);
      const res = await candidateLogin(name, email, showResumePassword ? resumePassword : undefined);
      setCandidate({ id: res.data.id, name: res.data.name, email: res.data.email });
      const assessmentType = assessmentRes.data?.type || 'coding';
      if (assessmentType === 'mcq') {
        navigate(`/mcq/${trimmedAssessmentId}`);
      } else {
        navigate(`/assessment/${trimmedAssessmentId}`);
      }
    } catch (loginError: any) {
      const detail = loginError?.response?.data?.detail;
      if (loginError?.response?.status === 403) {
        setShowResumePassword(true);
      }
      setError(detail || 'Assessment not found. Please check the assessment ID.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-slate-200/50 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <img
            src="/candela-logo.png"
            alt="Candela"
            className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain shadow-xl"
          />
          <h1 className="text-3xl font-bold text-slate-800">Candela Coding Assessment</h1>
          <p className="text-slate-500 mt-2">Take your coding assessment</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <div className="mb-6 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-800">Enter your details</h2>
            <button
              type="button"
              onClick={() => setShowInstructions(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              aria-label="View assessment instructions"
              title="Instructions"
            >
              <Info className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-5 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name *</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  name="candidate_name_no_autofill"
                  autoComplete="off"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required
                  className="w-full border border-slate-300 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address *</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="email"
                  name="candidate_email_no_autofill"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  required
                  className="w-full border border-slate-300 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Assessment ID *</label>
              <input
                type="text"
                name="assessment_id_no_autofill"
                autoComplete="off"
                value={assessmentId}
                onChange={(e) => setAssessmentId(e.target.value)}
                placeholder="Paste the assessment ID"
                required
                className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
              />
            </div>

            {showResumePassword && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Resume Password *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="password"
                    name="candidate_resume_password_no_autofill"
                    autoComplete="off"
                    value={resumePassword}
                    onChange={(e) => setResumePassword(e.target.value)}
                    placeholder="Enter resume password"
                    required={showResumePassword}
                    className="w-full border border-slate-300 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-all flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              {loading ? 'Starting...' : 'Start Assessment'}
            </button>
          </form>
        </div>
      </div>

      {showInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="candidate-instructions-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-2xl"
          >
            <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Before You Start</p>
                <h2 id="candidate-instructions-title" className="text-xl font-bold text-slate-900">
                  Assessment Instructions
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowInstructions(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Close instructions"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <InstructionMetric label="Questions" value="6" />
                <InstructionMetric label="Mode" value="Fullscreen" />
                <InstructionMetric label="Scoring" value="Best attempt" />
              </div>

              <div className="space-y-3">
                <InstructionItem
                  icon={CheckCircle2}
                  title="Assessment Format"
                  text="The test contains 6 coding questions. Select each question from inside the assessment page and complete as many as possible before time ends."
                />
                <InstructionItem
                  icon={Maximize}
                  title="Fullscreen Is Required"
                  text={
                    <>
                      The assessment opens in fullscreen mode. If you exit fullscreen, the screen will blur and you must re-enter fullscreen to continue. Fullscreen exits are recorded, and{' '}
                      <span className="font-bold text-red-700">more than 5 fullscreen exits may lead to termination.</span>
                    </>
                  }
                />
                <InstructionItem
                  icon={Send}
                  title="Submission Process"
                  text="Use Run to test sample input, then Submit to save an answer for the selected question. You can submit again; the admin result uses the best scored attempt for that question."
                />
                <InstructionItem
                  icon={TimerReset}
                  title="Timer And Ending"
                  text="When time ends, remaining questions are auto-submitted with the code currently present. If you click End Test, pending work is submitted and the assessment cannot be reopened."
                />
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                If you face any problems, contact admin <span className="font-bold">_dev team_</span>.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InstructionMetric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
  </div>
);

const InstructionItem: React.FC<{
  icon: React.ElementType;
  title: string;
  text: React.ReactNode;
}> = ({ icon: Icon, title, text }) => (
  <div className="flex gap-3 rounded-lg border border-slate-200 px-4 py-3">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  </div>
);

export default CandidateLogin;
