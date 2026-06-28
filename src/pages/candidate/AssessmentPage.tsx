import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { banCandidate, endAssessment, getCandidateAssessment, recordFullscreenExit, recordTabSwitch, runCode, startAssessment, submitCode } from '../../services/api';
import { useCandidate } from '../../contexts/AuthContext';
import { AlertTriangle, ArrowLeft, Clock, Play, Send, Loader2, Terminal, Copy, RotateCcw, Braces, Square, Maximize } from 'lucide-react';
import { Question, TestCase } from '../../types';

const LANGUAGES = [
  { value: 'python', label: 'Python 3' },
  { value: 'javascript', label: 'JavaScript (Node)' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
];

const PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
};

const CLOSING_PAIRS = new Set(Object.values(PAIRS));
const TAB_SIZE_BY_LANGUAGE: Record<string, number> = {
  python: 4,
  javascript: 2,
  cpp: 4,
  java: 4,
};

const indentForLanguage = (currentLanguage: string) => ' '.repeat(TAB_SIZE_BY_LANGUAGE[currentLanguage] || 4);

const normalizeIndentation = (code: string, currentLanguage: string) =>
  code.replace(/\t/g, indentForLanguage(currentLanguage));

const PYTHON_DEDENT_PREFIXES = ['elif', 'else', 'except', 'finally'];
const PYTHON_FLOW_ENDERS = new Set(['break', 'continue', 'pass', 'raise', 'return']);

const getLineStart = (code: string, position: number) => code.lastIndexOf('\n', Math.max(0, position - 1)) + 1;

const getLineEnd = (code: string, position: number) => {
  const lineEnd = code.indexOf('\n', position);
  return lineEnd === -1 ? code.length : lineEnd;
};

const getIndentText = (line: string) => line.match(/^\s*/)?.[0] || '';

const removeOneIndentLevel = (indentText: string, indentTextToRemove: string) => {
  if (indentText.endsWith(indentTextToRemove)) {
    return indentText.slice(0, -indentTextToRemove.length);
  }

  return indentText.replace(/ {1,4}$/, '');
};

const stripPythonInlineComment = (line: string) => {
  let quote: string | null = null;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previousChar = line[index - 1];

    if ((char === '"' || char === "'") && previousChar !== '\\') {
      quote = quote === char ? null : quote || char;
    }

    if (char === '#' && !quote) {
      return line.slice(0, index);
    }
  }

  return line;
};

const shouldPythonDedentCurrentLine = (lineBeforeCursor: string) => {
  const trimmed = lineBeforeCursor.trimStart();
  return PYTHON_DEDENT_PREFIXES.some((keyword) => trimmed === keyword || trimmed.startsWith(`${keyword} `));
};

const shouldPythonDedentAfterEnter = (lineBeforeCursor: string) => {
  const codeOnly = stripPythonInlineComment(lineBeforeCursor).trim();
  const firstWord = codeOnly.match(/^[A-Za-z_]\w*/)?.[0];
  return Boolean(firstWord && PYTHON_FLOW_ENDERS.has(firstWord) && !codeOnly.endsWith(':'));
};

const MAX_VIOLATIONS = 4;

const MAX_CODE_CHARS = 50_000;
const MAX_RUN_INPUT_CHARS = 10_000;
const RUN_COOLDOWN_MS = 5_000;
const SUBMIT_COOLDOWN_MS = 10_000;
const CODE_DRAFT_PREFIX = 'candidate_code_draft';

const draftStorageKey = (candidateId: string, assessmentId: string, questionId: string, currentLanguage: string) =>
  `${CODE_DRAFT_PREFIX}:${candidateId}:${assessmentId}:${questionId}:${currentLanguage}`;

const getStoredDraft = (candidateId: string, assessmentId: string, questionId: string, currentLanguage: string) => {
  try {
    return localStorage.getItem(draftStorageKey(candidateId, assessmentId, questionId, currentLanguage));
  } catch {
    return null;
  }
};

const saveStoredDraft = (candidateId: string, assessmentId: string, questionId: string, currentLanguage: string, code: string) => {
  try {
    localStorage.setItem(draftStorageKey(candidateId, assessmentId, questionId, currentLanguage), code);
  } catch {
    // Ignore storage failures so typing and submitting continue to work.
  }
};

const cooldownSecondsLeft = (lastActionAt: number, cooldownMs: number) => {
  if (!lastActionAt) {
    return 0;
  }

  const remainingMs = cooldownMs - (Date.now() - lastActionAt);
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
};

const KEYWORDS: Record<string, Set<string>> = {
  python: new Set([
    'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else',
    'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
    'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'True', 'try',
    'while', 'with', 'yield',
  ]),
  javascript: new Set([
    'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default',
    'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'function',
    'if', 'import', 'in', 'let', 'new', 'null', 'return', 'switch', 'this', 'throw',
    'true', 'try', 'typeof', 'undefined', 'var', 'while',
  ]),
  cpp: new Set([
    'auto', 'bool', 'break', 'case', 'char', 'class', 'const', 'continue', 'default',
    'double', 'else', 'false', 'float', 'for', 'if', 'include', 'int', 'long', 'namespace',
    'return', 'short', 'signed', 'sizeof', 'static', 'string', 'struct', 'switch',
    'true', 'typedef', 'using', 'vector', 'void', 'while',
  ]),
  java: new Set([
    'abstract', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'continue',
    'default', 'double', 'else', 'extends', 'false', 'final', 'finally', 'float', 'for',
    'if', 'import', 'int', 'long', 'new', 'null', 'private', 'protected', 'public',
    'return', 'static', 'String', 'super', 'switch', 'this', 'throw', 'throws', 'true',
    'try', 'void', 'while',
  ]),
};

const BUILT_INS: Record<string, Set<string>> = {
  python: new Set(['dict', 'enumerate', 'float', 'input', 'int', 'len', 'list', 'map', 'max', 'min', 'print', 'range', 'set', 'sorted', 'str', 'sum', 'tuple']),
  javascript: new Set(['Array', 'BigInt', 'Boolean', 'console', 'Error', 'JSON', 'Math', 'Number', 'Object', 'parseInt', 'Promise', 'Set', 'String']),
  cpp: new Set(['cin', 'cout', 'endl', 'map', 'pair', 'priority_queue', 'queue', 'set', 'sort', 'stack', 'std', 'unordered_map']),
  java: new Set(['ArrayList', 'Arrays', 'HashMap', 'HashSet', 'List', 'Map', 'Math', 'Scanner', 'Set', 'System']),
};

const STARTER_CODE: Record<string, string> = {
  python: [
    'import sys',
    '',
    'def solve():',
    '    data = sys.stdin.read().strip().split()',
    '    # Write your solution here',
    '',
    'if __name__ == "__main__":',
    '    solve()',
    '',
  ].join('\n'),
  javascript: [
    "const fs = require('fs');",
    "const input = fs.readFileSync(0, 'utf8').trim().split(/\\s+/);",
    '',
    'function solve() {',
    '  // Write your solution here',
    '}',
    '',
    'solve();',
    '',
  ].join('\n'),
  cpp: [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    '',
    'int main() {',
    '    ios::sync_with_stdio(false);',
    '    cin.tie(nullptr);',
    '',
    '    // Write your solution here',
    '    return 0;',
    '}',
    '',
  ].join('\n'),
  java: [
    'import java.io.*;',
    'import java.util.*;',
    '',
    'public class Main {',
    '    public static void main(String[] args) throws Exception {',
    '        Scanner sc = new Scanner(System.in);',
    '        // Write your solution here',
    '    }',
    '}',
    '',
  ].join('\n'),
};

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

const tokenClass = (token: string, currentLanguage: string) => {
  if (KEYWORDS[currentLanguage]?.has(token)) {
    return 'text-violet-300';
  }

  if (BUILT_INS[currentLanguage]?.has(token)) {
    return 'text-sky-300';
  }

  if (/^\d/.test(token)) {
    return 'text-amber-300';
  }

  if (/^[{}()[\];,.+\-*/%=<>:!&|]+$/.test(token)) {
    return 'text-slate-400';
  }

  return 'text-slate-100';
};

const highlightPlainCode = (code: string, currentLanguage: string, keyPrefix: string): React.ReactNode[] => {
  const tokens = code.split(/([A-Za-z_]\w*|\d+(?:\.\d+)?|==|!=|<=|>=|&&|\|\||[{}()[\];,.+\-*/%=<>:!&|]+)/g);

  return tokens.map((token, index) => (
    <span key={`${keyPrefix}-token-${index}`} className={tokenClass(token, currentLanguage)}>
      {token}
    </span>
  ));
};

const highlightCodeLine = (line: string, currentLanguage: string, lineIndex: number): React.ReactNode[] => {
  const commentMarker = currentLanguage === 'python' ? '#' : '//';
  const commentIndex = line.indexOf(commentMarker);
  const codePart = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
  const commentPart = commentIndex >= 0 ? line.slice(commentIndex) : '';
  const pieces: React.ReactNode[] = [];
  let cursor = 0;
  let pieceIndex = 0;

  while (cursor < codePart.length) {
    const char = codePart[cursor];

    if (char === '"' || char === "'" || (currentLanguage === 'javascript' && char === '`')) {
      const quote = char;
      let end = cursor + 1;
      while (end < codePart.length) {
        if (codePart[end] === '\\') {
          end += 2;
          continue;
        }
        if (codePart[end] === quote) {
          end += 1;
          break;
        }
        end += 1;
      }

      pieces.push(
        <span key={`line-${lineIndex}-string-${pieceIndex}`} className="text-emerald-300">
          {codePart.slice(cursor, end)}
        </span>
      );
      cursor = end;
      pieceIndex += 1;
      continue;
    }

    let nextString = codePart.length;
    for (const quote of currentLanguage === 'javascript' ? ['"', "'", '`'] : ['"', "'"]) {
      const quoteIndex = codePart.indexOf(quote, cursor);
      if (quoteIndex >= 0) {
        nextString = Math.min(nextString, quoteIndex);
      }
    }

    pieces.push(...highlightPlainCode(codePart.slice(cursor, nextString), currentLanguage, `line-${lineIndex}-${pieceIndex}`));
    cursor = nextString;
    pieceIndex += 1;
  }

  if (commentPart) {
    pieces.push(
      <span key={`line-${lineIndex}-comment`} className="text-slate-500">
        {commentPart}
      </span>
    );
  }

  return pieces;
};

const AssessmentPage: React.FC = () => {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const { candidate } = useCandidate();
  const navigate = useNavigate();
  const lineNumberRef = useRef<HTMLDivElement>(null);
  const syntaxHighlightRef = useRef<HTMLPreElement>(null);
  const autoSubmitStartedRef = useRef(false);
  const fullscreenEnteredRef = useRef(false);
  const endingTestRef = useRef(false);
  const tabSwitchDebounceRef = useRef(false);
  const banTriggeredRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState('python');
  const [codeByQuestion, setCodeByQuestion] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [autoSubmitting, setAutoSubmitting] = useState(false);
  const [output, setOutput] = useState<string>('');
  const [assessment, setAssessment] = useState<any>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>('');
  const [sampleInput, setSampleInput] = useState('');
  const [submittedQuestions, setSubmittedQuestions] = useState<Record<string, number>>({});
  const [startedAt, setStartedAt] = useState<string>('');
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [assessmentEnded, setAssessmentEnded] = useState(false);
  const [endingTest, setEndingTest] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenExitCount, setFullscreenExitCount] = useState(0);
  const [fullscreenWarning, setFullscreenWarning] = useState('');
  const [lastRunAt, setLastRunAt] = useState(0);
  const [lastSubmitAt, setLastSubmitAt] = useState(0);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [tabSwitchWarning, setTabSwitchWarning] = useState('');
  const [isBanned, setIsBanned] = useState(false);

  const questions: Question[] = assessment?.questions || [];
  const selectedQuestion = questions.find((q) => q.id === selectedQuestionId) || questions[0] || null;
  const editorKey = selectedQuestion ? `${selectedQuestion.id}:${language}` : '';
  const indent = indentForLanguage(language);
  const tabSize = TAB_SIZE_BY_LANGUAGE[language] || 4;
  const selectedCode = editorKey ? codeByQuestion[editorKey] ?? STARTER_CODE[language] ?? '' : '';
  const lineNumbers = selectedCode.split('\n').map((_, index) => index + 1);
  const sampleTestCases: TestCase[] = selectedQuestion?.sample_test_cases || [];

  const enterFullscreen = useCallback(async () => {
    if (!document.fullscreenEnabled) {
      setFullscreenWarning('Fullscreen mode is not supported in this browser.');
      return;
    }

    if (document.fullscreenElement) {
      fullscreenEnteredRef.current = true;
      setIsFullscreen(true);
      setFullscreenWarning('');
      return;
    }

    try {
      await document.documentElement.requestFullscreen();
      fullscreenEnteredRef.current = true;
      setIsFullscreen(true);
      setFullscreenWarning('');
    } catch {
      setFullscreenWarning('Fullscreen could not start automatically. Use Enter fullscreen to continue in fullscreen mode.');
    }
  }, []);

  useEffect(() => {
    if (!candidate) {
      navigate('/');
      return;
    }

    if (!assessmentId) {
      setError('Invalid assessment ID');
      setLoading(false);
      return;
    }

    let cancelled = false;

    Promise.all([
      startAssessment(assessmentId, candidate.id),
      getCandidateAssessment(assessmentId),
    ])
      .then(([startRes, assessmentRes]) => {
        if (cancelled) {
          return;
        }

        const data = assessmentRes.data;
        const assessmentStart = startRes?.data?.started_at || startRes?.data?.created_at || '';
        if (!assessmentStart) {
          throw new Error('Could not start the assessment timer. Please try again.');
        }

        setStartedAt(assessmentStart);
        const savedFullscreenExitCount = Number(startRes?.data?.fullscreen_exit_count || 0);
        const savedTabSwitchCount = Number(startRes?.data?.tab_switch_count || 0);
        setFullscreenExitCount(savedFullscreenExitCount);
        setTabSwitchCount(savedTabSwitchCount);
        if (startRes?.data?.is_banned) {
          setIsBanned(true);
        } else if (savedFullscreenExitCount + savedTabSwitchCount >= MAX_VIOLATIONS) {
          banTriggeredRef.current = true;
        }
        setAssessment(data);
        const questionList = data.questions || [];
        if (questionList.length) {
          const nextCodeByQuestion: Record<string, string> = {};
          questionList.forEach((question: Question) => {
            LANGUAGES.forEach((item) => {
              const key = `${question.id}:${item.value}`;
              nextCodeByQuestion[key] =
                getStoredDraft(candidate.id, assessmentId, question.id, item.value) ??
                STARTER_CODE[item.value] ??
                '';
            });
          });
          setCodeByQuestion(nextCodeByQuestion);
          setSelectedQuestionId(questionList[0].id);
        }
      })
      .catch((loadError) => {
        const detail = loadError?.response?.data?.detail;
        setError(detail || loadError?.message || `Failed to load assessment ${assessmentId}. Please check the assessment ID.`);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [candidate, navigate, assessmentId]);

  useEffect(() => {
    if (!assessment || assessmentEnded) {
      return;
    }

    enterFullscreen();
  }, [assessment, assessmentEnded, enterFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);

      if (active) {
        fullscreenEnteredRef.current = true;
        setFullscreenWarning('');
        return;
      }

      if (fullscreenEnteredRef.current && assessment && !assessmentEnded && !endingTestRef.current) {
        setFullscreenExitCount((current) => {
          const nextCount = current + 1;
          setFullscreenWarning(`Warning: you exited fullscreen mode ${nextCount} time${nextCount === 1 ? '' : 's'}.`);
          if (candidate?.id && assessmentId) {
            recordFullscreenExit(assessmentId, candidate.id, nextCount).catch(() => {
              setFullscreenWarning(
                `Warning: you exited fullscreen mode ${nextCount} time${nextCount === 1 ? '' : 's'}. Could not save the exit count.`
              );
            });
          }
          return nextCount;
        });
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [assessment, assessmentEnded, assessmentId, candidate?.id]);

  useEffect(() => {
    if (!assessment || assessmentEnded) return;

    const recordSwitch = () => {
      if (tabSwitchDebounceRef.current) return;
      tabSwitchDebounceRef.current = true;
      setTimeout(() => { tabSwitchDebounceRef.current = false; }, 1000);

      setTabSwitchCount((current) => {
        const next = current + 1;
        setTabSwitchWarning(`Warning: you switched away from the exam ${next} time${next === 1 ? '' : 's'}.`);
        if (candidate?.id && assessmentId) {
          recordTabSwitch(assessmentId, candidate.id, next).catch(() => {});
        }
        return next;
      });
    };

    const handleVisibilityChange = () => { if (document.hidden) recordSwitch(); };
    const handleBlur = () => recordSwitch();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [assessment, assessmentEnded, assessmentId, candidate?.id]);

  useEffect(() => {
    const totalViolations = fullscreenExitCount + tabSwitchCount;
    if (totalViolations >= MAX_VIOLATIONS && !isBanned && !banTriggeredRef.current && assessment && !assessmentEnded) {
      banTriggeredRef.current = true;
      setIsBanned(true);
      if (candidate?.id && assessmentId) {
        banCandidate(assessmentId, candidate.id).catch(() => {});
      }
    }
  }, [fullscreenExitCount, tabSwitchCount, isBanned, assessment, assessmentEnded, candidate?.id, assessmentId]);

  useEffect(() => {
    if (!assessment || assessmentEnded) return;
    const blockDevTools = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) ||
        (e.ctrlKey && e.key.toUpperCase() === 'U')
      ) {
        e.preventDefault();
        e.stopPropagation();
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
    if (!assessment || !startedAt) {
      return;
    }

    const durationSeconds = Math.max(0, Number(assessment.duration || 0) * 60);
    const startedTime = new Date(startedAt).getTime();

    if (!durationSeconds || Number.isNaN(startedTime)) {
      setTimeRemaining(null);
      return;
    }

    let intervalId: number | undefined;

    const updateTimer = () => {
      const elapsedSeconds = Math.floor((Date.now() - startedTime) / 1000);
      const nextRemaining = Math.max(0, durationSeconds - elapsedSeconds);

      setTimeRemaining(nextRemaining);
      if (nextRemaining <= 0) {
        setAssessmentEnded(true);
        if (intervalId !== undefined) {
          window.clearInterval(intervalId);
        }
      }
    };

    updateTimer();
    intervalId = window.setInterval(updateTimer, 1000);

    return () => window.clearInterval(intervalId);
  }, [assessment, startedAt]);

  useEffect(() => {
    if (!selectedQuestion) {
      setSampleInput('');
      return;
    }

    setCodeByQuestion((current) => {
      if (Object.prototype.hasOwnProperty.call(current, editorKey)) {
        return current;
      }

      const storedDraft =
        candidate?.id && assessmentId
          ? getStoredDraft(candidate.id, assessmentId, selectedQuestion.id, language)
          : null;

      return {
        ...current,
        [editorKey]: storedDraft ?? STARTER_CODE[language] ?? '',
      };
    });
    setSampleInput(sampleTestCases[0]?.input_data || '');
    setOutput('');
  }, [assessmentId, candidate?.id, selectedQuestionId, selectedQuestion?.id, language]);

  const updateSelectedCode = (nextCode: string) => {
    if (!editorKey) {
      return;
    }

    const normalizedCode = normalizeIndentation(nextCode, language);
    if (normalizedCode.length > MAX_CODE_CHARS) {
      setOutput(`Code is too large. Limit is ${MAX_CODE_CHARS.toLocaleString()} characters.`);
      return;
    }

    if (candidate?.id && assessmentId && selectedQuestion?.id) {
      saveStoredDraft(candidate.id, assessmentId, selectedQuestion.id, language, normalizedCode);
    }

    setCodeByQuestion((current) => ({
      ...current,
      [editorKey]: normalizedCode,
    }));
  };

  const updateSampleInput = (nextInput: string) => {
    if (nextInput.length > MAX_RUN_INPUT_CHARS) {
      setOutput(`Run input is too large. Limit is ${MAX_RUN_INPUT_CHARS.toLocaleString()} characters.`);
      return;
    }

    setSampleInput(nextInput);
  };

  const handleCodeKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const target = event.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;

    const setCodeAndCursor = (nextCode: string, cursorStart: number, cursorEnd = cursorStart) => {
      updateSelectedCode(nextCode);
      requestAnimationFrame(() => {
        target.selectionStart = cursorStart;
        target.selectionEnd = cursorEnd;
      });
    };

    if (event.key === 'Tab') {
      event.preventDefault();

      const lineStart = getLineStart(selectedCode, start);
      const selectionEnd = getLineEnd(selectedCode, end);
      const selectedBlock = selectedCode.slice(lineStart, selectionEnd);
      const isMultiLineSelection = start !== end && selectedCode.slice(start, end).includes('\n');

      if (event.shiftKey) {
        const outdentPattern = new RegExp(`^( {1,${indent.length}}|\\t)`, 'gm');
        const outdentedBlock = selectedBlock.replace(outdentPattern, '');
        const beforeCursorBlock = selectedCode.slice(lineStart, start);
        const removedBeforeCursor = beforeCursorBlock.length - beforeCursorBlock.replace(outdentPattern, '').length;
        const removedInSelection = selectedBlock.length - outdentedBlock.length;
        const nextCode = `${selectedCode.slice(0, lineStart)}${outdentedBlock}${selectedCode.slice(selectionEnd)}`;
        setCodeAndCursor(nextCode, Math.max(lineStart, start - removedBeforeCursor), Math.max(lineStart, end - removedInSelection));
        return;
      }

      if (isMultiLineSelection) {
        const indentedBlock = selectedBlock.replace(/^/gm, indent);
        const nextCode = `${selectedCode.slice(0, lineStart)}${indentedBlock}${selectedCode.slice(selectionEnd)}`;
        setCodeAndCursor(nextCode, start + indent.length, end + (indentedBlock.length - selectedBlock.length));
        return;
      }

      const nextCode = `${selectedCode.slice(0, start)}${indent}${selectedCode.slice(end)}`;
      setCodeAndCursor(nextCode, start + indent.length);
      return;
    }

    if (event.key === 'Home' && !event.shiftKey) {
      const lineStart = getLineStart(selectedCode, start);
      const currentLineEnd = getLineEnd(selectedCode, start);
      const lineText = selectedCode.slice(lineStart, currentLineEnd);
      const firstCodeColumn = lineText.search(/\S/);

      if (firstCodeColumn > 0) {
        event.preventDefault();
        const smartHome = lineStart + firstCodeColumn;
        const nextCursor = start === smartHome ? lineStart : smartHome;
        setCodeAndCursor(selectedCode, nextCursor);
        return;
      }
    }

    if (event.key === 'Enter') {
      event.preventDefault();

      const lineStart = getLineStart(selectedCode, start);
      const currentLine = selectedCode.slice(lineStart, start);
      const currentIndent = getIndentText(currentLine);
      const trimmedLine = currentLine.trimEnd();
      const nextChar = selectedCode[end] || '';
      const addsBlockIndent =
        (language === 'python' && trimmedLine.endsWith(':')) ||
        (language !== 'python' && /[({\[]$/.test(trimmedLine));
      const shouldDedentNextLine = language === 'python' && shouldPythonDedentAfterEnter(currentLine);

      const baseIndent = shouldDedentNextLine ? removeOneIndentLevel(currentIndent, indent) : currentIndent;
      const nextIndent = `${baseIndent}${addsBlockIndent ? indent : ''}`;

      if (addsBlockIndent && ['}', ']', ')'].includes(nextChar)) {
        const insertion = `\n${nextIndent}\n${currentIndent}`;
        setCodeAndCursor(
          `${selectedCode.slice(0, start)}${insertion}${selectedCode.slice(end)}`,
          start + 1 + nextIndent.length
        );
        return;
      }

      const insertion = `\n${nextIndent}`;
      setCodeAndCursor(`${selectedCode.slice(0, start)}${insertion}${selectedCode.slice(end)}`, start + insertion.length);
      return;
    }

    if (language === 'python' && event.key === ':' && start === end) {
      const lineStart = getLineStart(selectedCode, start);
      const currentLine = selectedCode.slice(lineStart, start);
      const currentIndent = getIndentText(currentLine);

      if (currentIndent && shouldPythonDedentCurrentLine(currentLine)) {
        event.preventDefault();
        const nextIndent = removeOneIndentLevel(currentIndent, indent);
        const currentLineWithoutIndent = currentLine.slice(currentIndent.length);
        const nextLine = `${nextIndent}${currentLineWithoutIndent}:`;
        const nextCode = `${selectedCode.slice(0, lineStart)}${nextLine}${selectedCode.slice(end)}`;
        setCodeAndCursor(nextCode, lineStart + nextLine.length);
        return;
      }
    }

    if (event.key === 'Backspace' && start === end && start > 0) {
      const lineStart = getLineStart(selectedCode, start);
      const beforeCursorOnLine = selectedCode.slice(lineStart, start);

      if (/^ +$/.test(beforeCursorOnLine)) {
        const removableSpaces = beforeCursorOnLine.length % indent.length || indent.length;
        const removeStart = Math.max(lineStart, start - removableSpaces);
        event.preventDefault();
        setCodeAndCursor(`${selectedCode.slice(0, removeStart)}${selectedCode.slice(start)}`, removeStart);
        return;
      }

      const previousChar = selectedCode[start - 1];
      const nextChar = selectedCode[start];

      if (PAIRS[previousChar] === nextChar) {
        event.preventDefault();
        setCodeAndCursor(`${selectedCode.slice(0, start - 1)}${selectedCode.slice(start + 1)}`, start - 1);
      }
      return;
    }

    if (CLOSING_PAIRS.has(event.key) && start === end && selectedCode[start] === event.key) {
      event.preventDefault();
      setCodeAndCursor(selectedCode, start + 1);
      return;
    }

    if (PAIRS[event.key]) {
      event.preventDefault();

      const closeChar = PAIRS[event.key];
      const selectedText = selectedCode.slice(start, end);
      const insertion = `${event.key}${selectedText}${closeChar}`;
      const cursorStart = start + 1;
      const cursorEnd = selectedText ? cursorStart + selectedText.length : cursorStart;

      setCodeAndCursor(`${selectedCode.slice(0, start)}${insertion}${selectedCode.slice(end)}`, cursorStart, cursorEnd);
      return;
    }

  };

  const handleCodePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!editorKey) {
      return;
    }

    const pastedText = event.clipboardData.getData('text');
    if (!pastedText.includes('\t')) {
      return;
    }

    event.preventDefault();
    const target = event.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const normalizedText = normalizeIndentation(pastedText, language);
    const nextCode = `${selectedCode.slice(0, start)}${normalizedText}${selectedCode.slice(end)}`;

    updateSelectedCode(nextCode);
    requestAnimationFrame(() => {
      const nextCursor = start + normalizedText.length;
      target.selectionStart = nextCursor;
      target.selectionEnd = nextCursor;
    });
  };

  const resetStarterCode = () => {
    if (!editorKey) {
      return;
    }

    const starterCode = STARTER_CODE[language] || '';
    if (candidate?.id && assessmentId && selectedQuestion?.id) {
      saveStoredDraft(candidate.id, assessmentId, selectedQuestion.id, language, starterCode);
    }

    setCodeByQuestion((current) => ({
      ...current,
      [editorKey]: starterCode,
    }));
    setOutput('');
  };

  const copyCode = async () => {
    if (!selectedCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedCode);
      setOutput('Code copied.');
    } catch {
      setOutput('Could not copy code.');
    }
  };

  const syncLineNumberScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    if (lineNumberRef.current) {
      lineNumberRef.current.scrollTop = event.currentTarget.scrollTop;
    }
    if (syntaxHighlightRef.current) {
      syntaxHighlightRef.current.scrollTop = event.currentTarget.scrollTop;
      syntaxHighlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
  };

  const submitQuestion = useCallback(async (questionId: string, code: string, submitLanguage: string) => {
    if (!candidate?.id || !assessmentId) {
      throw new Error('Candidate session or assessment ID is missing.');
    }

    const res = await submitCode({
      candidate_id: candidate.id,
      question_id: questionId,
      assessment_id: assessmentId,
      language: submitLanguage,
      code,
    });

    setSubmittedQuestions((current) => ({
      ...current,
      [questionId]: res.data.score,
    }));

    return res.data;
  }, [assessmentId, candidate?.id]);

  const autoSubmitRemaining = useCallback(async () => {
    if (autoSubmitStartedRef.current || !questions.length) {
      return;
    }

    autoSubmitStartedRef.current = true;
    setAutoSubmitting(true);
    setRunning(true);
    setOutput('Time is up. Auto-submitting remaining question(s)...');

    let submittedCount = 0;
    let failedCount = 0;

    for (const question of questions) {
      if (submittedQuestions[question.id] !== undefined) {
        continue;
      }

      const questionCode =
        codeByQuestion[`${question.id}:${language}`] ??
        (candidate?.id && assessmentId ? getStoredDraft(candidate.id, assessmentId, question.id, language) : null) ??
        STARTER_CODE[language] ??
        '';

      try {
        await submitQuestion(question.id, questionCode, language);
        submittedCount += 1;
      } catch {
        failedCount += 1;
      }
    }

    setOutput(
      failedCount
        ? `Time ended. Auto-submitted ${submittedCount} question(s). ${failedCount} question(s) could not be submitted.`
        : `Time ended. Auto-submitted ${submittedCount} remaining question(s).`
    );
    setAutoSubmitting(false);
    setRunning(false);
  }, [assessmentId, candidate?.id, codeByQuestion, language, questions, submitQuestion, submittedQuestions]);

  useEffect(() => {
    if (assessmentEnded) {
      autoSubmitRemaining();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  }, [assessmentEnded, autoSubmitRemaining]);

  const handleRun = async () => {
    if (assessmentEnded) {
      setOutput('Time has ended. Code can no longer be run.');
      return;
    }

    if (!selectedQuestion) {
      setOutput('No question selected to run.');
      return;
    }

    if (!candidate?.id) {
      setOutput('Candidate session is missing. Please go back to login and start again.');
      return;
    }

    if (selectedCode.length > MAX_CODE_CHARS) {
      setOutput(`Code is too large. Limit is ${MAX_CODE_CHARS.toLocaleString()} characters.`);
      return;
    }

    if (sampleInput.length > MAX_RUN_INPUT_CHARS) {
      setOutput(`Run input is too large. Limit is ${MAX_RUN_INPUT_CHARS.toLocaleString()} characters.`);
      return;
    }

    const waitSeconds = cooldownSecondsLeft(lastRunAt, RUN_COOLDOWN_MS);
    if (waitSeconds) {
      setOutput(`Please wait ${waitSeconds} second(s) before running again.`);
      return;
    }

    setRunning(true);
    setLastRunAt(Date.now());
    setOutput('');
    try {
      const res = await runCode({
        code: selectedCode,
        language,
        input_data: sampleInput,
        candidate_id: candidate.id,
        question_id: selectedQuestion.id,
      });
      setOutput(res.data.error || res.data.output || '(no output)');
    } catch (runError: any) {
      const detail = runError?.response?.data?.error || runError?.response?.data?.detail;
      setOutput(typeof detail === 'string' ? detail : 'Failed to run code');
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (assessmentEnded) {
      setOutput('Time has ended. Final auto-submit is already being processed.');
      return;
    }

    if (!selectedQuestionId) {
      setOutput('No question selected to submit.');
      return;
    }

    if (!candidate?.id) {
      setOutput('Candidate session is missing. Please go back to login and start again.');
      return;
    }

    if (!assessmentId) {
      setOutput('Assessment ID is missing. Please go back to login and start again.');
      return;
    }

    if (selectedCode.length > MAX_CODE_CHARS) {
      setOutput(`Code is too large. Limit is ${MAX_CODE_CHARS.toLocaleString()} characters.`);
      return;
    }

    const waitSeconds = cooldownSecondsLeft(lastSubmitAt, SUBMIT_COOLDOWN_MS);
    if (waitSeconds) {
      setOutput(`Please wait ${waitSeconds} second(s) before submitting again.`);
      return;
    }

    setRunning(true);
    setLastSubmitAt(Date.now());
    try {
      const data = await submitQuestion(selectedQuestionId, selectedCode, language);
      setOutput(
        `Submitted. Score: ${data.score}/${data.marks}. Passed ${data.passed_count}/${data.total_test_cases} test case(s).`
      );
    } catch (submitError: any) {
      const detail = submitError?.response?.data?.detail;
      setOutput(
        typeof detail === 'string'
          ? detail
          : detail
            ? JSON.stringify(detail, null, 2)
            : 'Failed to submit'
      );
    } finally {
      setRunning(false);
    }
  };

  const handleEndTest = async () => {
    if (assessmentEnded || endingTest) {
      return;
    }

    if (!candidate?.id || !assessmentId) {
      setOutput('Candidate session or assessment ID is missing.');
      return;
    }

    setShowEndConfirm(true);
  };

  const confirmEndTest = async () => {
    if (!assessmentId || !candidate?.id) return;
    setShowEndConfirm(false);
    endingTestRef.current = true;
    setEndingTest(true);
    setRunning(true);
    try {
      await autoSubmitRemaining();
      await endAssessment(assessmentId, candidate.id);
      setAssessmentEnded(true);
      setTimeRemaining(0);
      setOutput('Test ended. You cannot reopen or continue this assessment.');
    } catch (endError: any) {
      const detail = endError?.response?.data?.detail;
      setOutput(typeof detail === 'string' ? detail : 'Failed to end test.');
    } finally {
      endingTestRef.current = false;
      setEndingTest(false);
      setRunning(false);
    }
  };

  if (loading || !candidate) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  const timerDanger = timeRemaining !== null && timeRemaining <= 60;
  const timerWarning = timeRemaining !== null && timeRemaining > 60 && timeRemaining <= 300;
  const timerLabel = timeRemaining === null ? '--:--' : formatTime(timeRemaining);
  const showFullscreenLock = Boolean(assessment && !assessmentEnded && !endingTest && !isFullscreen && fullscreenExitCount > 0);

  if (assessmentEnded && !autoSubmitting && !isBanned) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-10">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
              <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white">Test Ended</h1>
            <p className="mt-3 text-slate-400">{assessment?.title}</p>
            <p className="mt-6 text-lg font-semibold text-emerald-400">Thank you for participating!</p>
            <p className="mt-2 text-sm text-slate-500">Your submissions have been recorded. You may close this window.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-900 text-white">
      <div className={`flex min-h-screen flex-col transition ${showFullscreenLock ? 'pointer-events-none select-none blur-sm' : ''}`}>
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/candela-logo.png" alt="Candela" className="h-8 w-8 rounded-lg object-contain" />
          <div>
            <p className="font-semibold text-sm">Candela Coding Assessment</p>
            <p className="text-xs text-slate-400">{candidate.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isFullscreen && !assessmentEnded && (
            <button
              type="button"
              onClick={enterFullscreen}
              disabled={!assessment}
              className="inline-flex items-center gap-2 rounded border border-amber-500/60 bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Maximize size={14} />
              Enter fullscreen
            </button>
          )}
          <button
            type="button"
            onClick={handleEndTest}
            disabled={running || assessmentEnded || !assessment}
            className="inline-flex items-center gap-2 rounded border border-red-500/60 bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {endingTest ? <Loader2 size={15} className="animate-spin" /> : <Square size={14} />}
            End Test
          </button>
          <div
            className={[
              'flex items-center gap-2 rounded border px-3 py-2 font-mono text-sm font-semibold',
              timerDanger
                ? 'border-red-500/60 bg-red-500/15 text-red-200'
                : timerWarning
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
            ].join(' ')}
          >
            {autoSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Clock size={15} />}
            <span>{assessmentEnded ? 'Time ended' : timerLabel}</span>
          </div>
        </div>
      </header>

      {assessment && !assessmentEnded && !isBanned && (fullscreenExitCount + tabSwitchCount > 0) && (
        <div className={`border-b px-4 py-2 text-sm ${fullscreenExitCount + tabSwitchCount >= MAX_VIOLATIONS - 1 ? 'border-red-500/40 bg-red-500/10 text-red-100' : 'border-amber-500/40 bg-amber-500/10 text-amber-100'}`}>
          <div className="flex flex-wrap items-center gap-3">
            <AlertTriangle size={15} />
            <span>{tabSwitchWarning || fullscreenWarning}</span>
            <span className="font-semibold">
              Violations: {fullscreenExitCount + tabSwitchCount}/{MAX_VIOLATIONS} — {Math.max(0, MAX_VIOLATIONS - fullscreenExitCount - tabSwitchCount)} remaining before ban
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="max-h-[42vh] overflow-y-auto border-b border-slate-700 bg-slate-800 p-5 lg:max-h-none lg:w-2/5 lg:min-w-[360px] lg:border-b-0 lg:border-r">
          <h2 className="font-bold text-lg mb-4">{assessment?.title || 'Assessment Details'}</h2>
          {error && <p className="text-red-400">{error}</p>}
          {!assessment ? (
            <div className="mt-4 space-y-4">
              <p className="text-slate-300 text-sm leading-relaxed">
                The code editor unlocks after a valid assessment with at least one question loads.
              </p>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="inline-flex items-center gap-2 rounded bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600"
              >
                <ArrowLeft size={14} />
                Back to login
              </button>
            </div>
          ) : (
            <>
              <div className="text-slate-300 text-sm leading-relaxed mb-4">
                <p>
                  <span className="font-semibold">Assessment ID:</span>{' '}
                  <code className="bg-slate-700 px-2 py-1 rounded">{assessmentId}</code>
                </p>
                <p className="mt-3">
                  <span className="font-semibold">Description:</span>{' '}
                  {assessment.description || 'No description available.'}
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold text-slate-200 mb-2">Select Question</label>
                <select
                  value={selectedQuestionId}
                  onChange={(e) => setSelectedQuestionId(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white"
                >
                  {questions.map((q) => (
                    <option key={q.id} value={q.id}>
                      {submittedQuestions[q.id] !== undefined ? '[submitted] ' : ''}
                      {q.title || q.id}
                    </option>
                  ))}
                </select>
              </div>

              {selectedQuestion ? (
                <div className="text-slate-300 text-sm leading-relaxed">
                  <div className="mb-4 rounded border border-slate-700 bg-slate-900/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-slate-100">{selectedQuestion.title}</p>
                      <span className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-200">
                        {selectedQuestion.marks} marks
                      </span>
                    </div>
                  {submittedQuestions[selectedQuestion.id] !== undefined && (
                      <p className="mt-2 text-xs text-emerald-300">
                        Submitted score: {submittedQuestions[selectedQuestion.id]}/{selectedQuestion.marks}
                      </p>
                    )}
                    {assessmentEnded && (
                      <p className="mt-2 text-xs text-red-300">
                        Time ended. Final submissions are locked.
                      </p>
                    )}
                  </div>

                  <div className="space-y-4">
                    <section>
                      <p className="mb-1 font-semibold text-slate-100">Problem</p>
                      <p className="whitespace-pre-wrap select-none">{selectedQuestion.problem_statement || 'No problem statement provided.'}</p>
                    </section>
                    {selectedQuestion.input_format && (
                      <section>
                        <p className="mb-1 font-semibold text-slate-100">Input Format</p>
                        <p className="whitespace-pre-wrap">{selectedQuestion.input_format}</p>
                      </section>
                    )}
                    {selectedQuestion.output_format && (
                      <section>
                        <p className="mb-1 font-semibold text-slate-100">Output Format</p>
                        <p className="whitespace-pre-wrap">{selectedQuestion.output_format}</p>
                      </section>
                    )}
                    {selectedQuestion.constraints && (
                      <section>
                        <p className="mb-1 font-semibold text-slate-100">Constraints</p>
                        <p className="whitespace-pre-wrap">{selectedQuestion.constraints}</p>
                      </section>
                    )}
                    {sampleTestCases.length > 0 && (
                      <section>
                        <p className="mb-2 font-semibold text-slate-100">Sample Tests</p>
                        <div className="space-y-2">
                          {sampleTestCases.map((testCase, index) => (
                            <button
                              key={testCase.id}
                              type="button"
                              onClick={() => updateSampleInput(testCase.input_data)}
                              disabled={assessmentEnded}
                              className="block w-full rounded border border-slate-700 bg-slate-900/50 p-3 text-left hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <span className="text-xs font-semibold text-slate-400">Sample {index + 1}</span>
                              <pre className="mt-2 overflow-auto text-xs text-slate-200">Input: {testCase.input_data || '(empty)'}</pre>
                              <pre className="mt-1 overflow-auto text-xs text-emerald-300">
                                Expected: {testCase.expected_output || '(empty)'}
                              </pre>
                              <div className="mt-2 rounded bg-slate-800/70 px-3 py-2">
                                <p className="text-xs font-semibold text-slate-300">Explanation</p>
                                <p className="mt-1 whitespace-pre-wrap text-xs text-slate-400">
                                  {testCase.explanation || '(empty)'}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-slate-300 text-sm leading-relaxed">
                  This assessment has no questions yet. Ask the admin to upload questions before starting.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300">
                <Braces size={14} className="text-blue-300" />
                {selectedQuestion ? `${lineNumbers.length} lines` : 'Editor'}
              </div>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={assessmentEnded}
                className="bg-slate-700 border border-slate-600 text-white text-sm rounded px-2 py-1"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
              <div className="rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-300">
                Spaces: {tabSize}
              </div>
              <div className="rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-300">
                Code: {selectedCode.length.toLocaleString()}/{MAX_CODE_CHARS.toLocaleString()}
              </div>
              <button
                type="button"
                onClick={copyCode}
                disabled={!selectedQuestion}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                title="Copy code"
                aria-label="Copy code"
              >
                <Copy size={14} />
              </button>
              <button
                type="button"
                onClick={resetStarterCode}
                disabled={!selectedQuestion || assessmentEnded}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                title="Reset starter code"
                aria-label="Reset starter code"
              >
                <RotateCcw size={14} />
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRun}
                disabled={running || !selectedQuestion || assessmentEnded}
                className="flex items-center gap-1.5 rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Run
              </button>
              <button
                onClick={handleSubmit}
                disabled={running || !selectedQuestion || assessmentEnded}
                className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {running ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Submit
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 bg-slate-950">
            <div className="flex h-full overflow-hidden">
              <div
                ref={lineNumberRef}
                className="select-none overflow-hidden border-r border-slate-800 bg-slate-950 px-3 py-3 text-right font-mono text-sm leading-6 text-slate-500"
              >
                {lineNumbers.map((number) => (
                  <div key={number}>{number}</div>
                ))}
              </div>
              <div className="relative min-w-0 flex-1 bg-slate-950">
                <pre
                  ref={syntaxHighlightRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 overflow-hidden px-4 py-3 font-mono text-sm leading-6"
                >
                  {selectedCode.split('\n').map((line, index) => (
                    <div key={`highlight-line-${index}`} className="min-h-6 whitespace-pre">
                      {line ? highlightCodeLine(line, language, index) : '\u00a0'}
                    </div>
                  ))}
                </pre>
                <textarea
                  value={selectedCode}
                  onChange={(e) => updateSelectedCode(e.target.value)}
                  onKeyDown={handleCodeKeyDown}
                  onPaste={handleCodePaste}
                  onScroll={syncLineNumberScroll}
                  disabled={!selectedQuestion || assessmentEnded}
                  style={{ tabSize }}
                  className="absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent px-4 py-3 font-mono text-sm leading-6 text-transparent caret-blue-300 outline-none selection:bg-blue-500/30 placeholder:text-slate-500 disabled:cursor-not-allowed"
                  placeholder={selectedQuestion ? 'Write your code here...' : 'Load an assessment question before writing code.'}
                  spellCheck="false"
                  autoCapitalize="off"
                  autoComplete="off"
                  autoCorrect="off"
                />
              </div>
            </div>
          </div>

          <div className="grid h-64 grid-cols-1 border-t border-slate-700 bg-slate-800 md:h-52 md:grid-cols-2">
            <div className="min-h-0 border-b border-slate-700 p-3 md:border-b-0 md:border-r">
              <label className="mb-2 block text-xs font-medium text-slate-400">Run input</label>
              <textarea
                value={sampleInput}
                onChange={(e) => updateSampleInput(e.target.value)}
                disabled={!selectedQuestion || assessmentEnded}
                className="h-[calc(100%-1.5rem)] w-full resize-none rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs leading-5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:text-slate-500"
                placeholder={`Input for Run (${MAX_RUN_INPUT_CHARS.toLocaleString()} character limit)`}
                spellCheck="false"
              />
            </div>
            <div className="min-h-0 p-3">
              <div className="mb-2 flex items-center gap-2 text-slate-400">
                <Terminal size={13} />
                <span className="text-xs font-medium">Output</span>
              </div>
              <pre className="h-[calc(100%-1.5rem)] overflow-auto rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs leading-5 text-emerald-300">
                {output || '(no output)'}
              </pre>
            </div>
          </div>
        </div>
      </div>
      </div>

      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white">End Test?</h2>
            <p className="mt-2 text-sm text-slate-300">You will not be able to reopen it, even if time remains.</p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 rounded border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmEndTest}
                className="flex-1 rounded border border-red-500/60 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/25"
              >
                End Test
              </button>
            </div>
          </div>
        </div>
      )}

      {isBanned && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 px-4">
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-md rounded-lg border border-red-500/40 bg-slate-900 p-6 text-center shadow-2xl"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-200">
              <AlertTriangle size={24} />
            </div>
            <h2 className="text-lg font-bold text-white">Assessment Terminated</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              You have been removed from this assessment due to repeated violations ({fullscreenExitCount + tabSwitchCount} of {MAX_VIOLATIONS}).
            </p>
            <p className="mt-3 text-sm text-slate-400">
              Contact your administrator if you believe this was a mistake. Re-entry requires a special password.
            </p>
          </div>
        </div>
      )}

      {showFullscreenLock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="fullscreen-lock-title"
            className="w-full max-w-md rounded-lg border border-amber-400/40 bg-slate-900 p-6 text-center shadow-2xl"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-200">
              <AlertTriangle size={24} />
            </div>
            <h2 id="fullscreen-lock-title" className="text-lg font-bold text-white">
              Return to fullscreen
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              You exited fullscreen mode. The assessment screen will remain blurred until fullscreen mode is restored.
            </p>
            <p className="mt-3 text-sm font-semibold text-amber-100">
              Exit count: {fullscreenExitCount}
            </p>
            <button
              type="button"
              onClick={enterFullscreen}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400"
            >
              <Maximize size={16} />
              Enter fullscreen
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssessmentPage;
