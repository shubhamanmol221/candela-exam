import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, FileQuestion, BarChart3, ArrowRight } from 'lucide-react';

const actions = [
  {
    title: 'Create Assessment',
    description: 'Set up a test title, description, and duration.',
    href: '/admin/assessments',
    icon: ClipboardList,
    cta: 'Open assessments',
  },
  {
    title: 'Upload Questions',
    description: 'Add questions and test cases after choosing an assessment.',
    href: '/admin/assessments',
    icon: FileQuestion,
    cta: 'Choose assessment',
  },
  {
    title: 'View Results',
    description: 'Review candidate scores after submissions come in.',
    href: '/admin/results',
    icon: BarChart3,
    cta: 'Open results',
  },
];

const Dashboard: React.FC = () => (
  <div className="min-h-screen bg-slate-50 p-8">
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-2 text-sm text-slate-600">Build a coding test, add questions, then share the assessment ID with students.</p>
        </div>
        <Link
          to="/admin/assessments"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <ClipboardList size={16} />
          New Assessment
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.title}
              to={action.href}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <Icon size={20} />
              </div>
              <h2 className="font-semibold text-slate-900">{action.title}</h2>
              <p className="mt-2 min-h-10 text-sm text-slate-600">{action.description}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-blue-700">
                {action.cta}
                <ArrowRight size={14} />
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-900">Student Flow</h2>
        <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
          <p>1. Create an assessment and copy its ID.</p>
          <p>2. Upload questions with sample and hidden test cases.</p>
          <p>3. Students log in and enter that assessment ID.</p>
        </div>
      </div>
    </div>
  </div>
);

export default Dashboard;
