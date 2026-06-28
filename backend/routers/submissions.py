import os
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from threading import Lock

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from database import db, now_iso, serialize_doc, serialize_many, with_ids
from schemas import RunCodeRequest, SubmitCodeRequest
from executor.code_runner import execute_code

router = APIRouter()

RUN_RATE_LIMIT_MAX = int(os.getenv("RUN_RATE_LIMIT_MAX", "6"))
RUN_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RUN_RATE_LIMIT_WINDOW_SECONDS", "60"))
SUBMIT_RATE_LIMIT_MAX = int(os.getenv("SUBMIT_RATE_LIMIT_MAX", "3"))
SUBMIT_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("SUBMIT_RATE_LIMIT_WINDOW_SECONDS", "60"))
SUBMIT_GRACE_SECONDS = int(os.getenv("SUBMIT_GRACE_SECONDS", "15"))
MAX_CODE_CHARS = int(os.getenv("MAX_CODE_CHARS", "50000"))
MAX_RUN_INPUT_CHARS = int(os.getenv("MAX_RUN_INPUT_CHARS", "10000"))
run_attempts = defaultdict(deque)
submit_attempts = defaultdict(deque)
run_rate_limit_lock = Lock()
submit_rate_limit_lock = Lock()

def validate_code_size(code: str) -> None:
    if len(code) > MAX_CODE_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"Code is too large. Limit is {MAX_CODE_CHARS} characters.",
        )

def validate_run_input_size(input_data: str) -> None:
    if len(input_data) > MAX_RUN_INPUT_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"Run input is too large. Limit is {MAX_RUN_INPUT_CHARS} characters.",
        )

def parse_iso_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)

def ensure_assessment_open(candidate_id: str, assessment_id: str, grace_seconds: int = 0) -> None:
    assessment = serialize_doc(db.assessments.find_one({"id": assessment_id}, {"duration": 1}))
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    start_record = serialize_doc(
        db.candidate_assessments.find_one(
            {"candidate_id": candidate_id, "assessment_id": assessment_id},
            {"started_at": 1, "created_at": 1, "finished_at": 1},
        )
    )
    if not start_record:
        raise HTTPException(status_code=403, detail="Assessment has not been started for this candidate")
    if start_record.get("finished_at"):
        raise HTTPException(status_code=403, detail="This assessment has already been ended")

    duration_seconds = max(0, int(assessment.get("duration") or 0) * 60)
    if duration_seconds <= 0:
        return

    started_at = start_record.get("started_at") or start_record.get("created_at")
    try:
        started_time = parse_iso_datetime(started_at)
    except Exception:
        raise HTTPException(status_code=500, detail="Assessment start time is invalid")

    elapsed_seconds = (datetime.now(timezone.utc) - started_time).total_seconds()
    if elapsed_seconds > duration_seconds + grace_seconds:
        raise HTTPException(status_code=403, detail="Assessment time has ended")

def run_limit_key(request: Request, body: RunCodeRequest) -> str:
    client_host = request.client.host if request.client else "unknown"
    candidate_key = body.candidate_id.strip() or client_host
    question_key = body.question_id.strip() or "unknown-question"
    return f"{candidate_key}:{question_key}:{body.language}"

def check_run_rate_limit(request: Request, body: RunCodeRequest) -> int:
    now = time.monotonic()
    cutoff = now - RUN_RATE_LIMIT_WINDOW_SECONDS
    key = run_limit_key(request, body)

    with run_rate_limit_lock:
        attempts = run_attempts[key]
        while attempts and attempts[0] <= cutoff:
            attempts.popleft()

        if len(attempts) >= RUN_RATE_LIMIT_MAX:
            return max(1, int(RUN_RATE_LIMIT_WINDOW_SECONDS - (now - attempts[0])))

        attempts.append(now)
        return 0

def submit_limit_key(body: SubmitCodeRequest) -> str:
    return f"{body.candidate_id.strip()}:{body.assessment_id.strip()}:{body.question_id.strip()}:{body.language}"

def check_submit_rate_limit(body: SubmitCodeRequest) -> int:
    now = time.monotonic()
    cutoff = now - SUBMIT_RATE_LIMIT_WINDOW_SECONDS
    key = submit_limit_key(body)

    with submit_rate_limit_lock:
        attempts = submit_attempts[key]
        while attempts and attempts[0] <= cutoff:
            attempts.popleft()

        if len(attempts) >= SUBMIT_RATE_LIMIT_MAX:
            return max(1, int(SUBMIT_RATE_LIMIT_WINDOW_SECONDS - (now - attempts[0])))

        attempts.append(now)
        return 0

@router.post("/run")
def run_code(request: Request, body: RunCodeRequest):
    validate_code_size(body.code)
    validate_run_input_size(body.input_data)

    if body.candidate_id.strip() and body.question_id.strip():
        question = serialize_doc(db.questions.find_one({"id": body.question_id}, {"assessment_id": 1}))
        if question and question.get("assessment_id"):
            ensure_assessment_open(body.candidate_id, question["assessment_id"])

    retry_after = check_run_rate_limit(request, body)
    if retry_after:
        return JSONResponse(
            status_code=429,
            headers={"Retry-After": str(retry_after)},
            content={
                "output": "",
                "error": f"Run limit reached. Please wait {retry_after} second(s) before running again.",
                "execution_time": 0,
                "passed": False,
                "retry_after": retry_after,
            },
        )

    try:
        output, exec_time, error = execute_code(body.language, body.code, body.input_data)
        return {
            "output": output,
            "error": error,
            "execution_time": exec_time,
            "passed": not bool(error),
        }
    except HTTPException:
        raise
    except Exception as e:
        return {"output": "", "error": str(e), "execution_time": 0, "passed": False}

@router.post("/submit")
def submit_code(body: SubmitCodeRequest):
    try:
        validate_code_size(body.code)

        missing_fields = [
            field
            for field in ["candidate_id", "question_id", "assessment_id", "language"]
            if not getattr(body, field).strip()
        ]
        if missing_fields:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required submit field(s): {', '.join(missing_fields)}",
            )

        retry_after = check_submit_rate_limit(body)
        if retry_after:
            return JSONResponse(
                status_code=429,
                headers={"Retry-After": str(retry_after)},
                content={
                    "detail": f"Submit limit reached. Please wait {retry_after} second(s) before submitting again.",
                    "retry_after": retry_after,
                },
            )

        test_cases = serialize_many(db.test_cases.find({"question_id": body.question_id}).sort("created_at", 1))

        if not test_cases:
            raise HTTPException(status_code=400, detail="No test cases found")

        question = serialize_doc(db.questions.find_one({"id": body.question_id}, {"marks": 1, "assessment_id": 1}))
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")
        if question.get("assessment_id") != body.assessment_id:
            raise HTTPException(status_code=400, detail="Question does not belong to this assessment")
        ensure_assessment_open(body.candidate_id, body.assessment_id, SUBMIT_GRACE_SECONDS)

        marks = question["marks"]

        passed = 0
        failed = 0
        results = []

        for tc in test_cases:
            output, exec_time, error = execute_code(body.language, body.code, tc["input_data"])
            actual = output.strip()
            expected = tc["expected_output"].strip()
            is_pass = (actual == expected) and not error

            if is_pass:
                passed += 1
            else:
                failed += 1

            results.append({
                "test_case_id": tc["id"],
                "is_hidden": tc["is_hidden"],
                "passed": is_pass,
                "actual_output": actual if not tc["is_hidden"] else None,
                "expected_output": expected if not tc["is_hidden"] else None,
                "error": error if not tc["is_hidden"] else None,
                "execution_time": exec_time,
            })

        total = len(test_cases)
        score = int(round((passed / total) * marks)) if total > 0 else 0

        submission_data = {
            "candidate_id": body.candidate_id,
            "question_id": body.question_id,
            "assessment_id": body.assessment_id,
            "language": body.language,
            "code": body.code,
            "score": score,
            "passed_count": passed,
            "failed_count": failed,
            "submitted_at": now_iso(),
            "created_at": now_iso(),
        }

        submission_doc = with_ids(submission_data)
        db.submissions.insert_one(submission_doc)

        return {
            "score": score,
            "passed_count": passed,
            "failed_count": failed,
            "total_test_cases": total,
            "marks": marks,
            "results": results,
            "submission": serialize_doc(submission_doc),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
